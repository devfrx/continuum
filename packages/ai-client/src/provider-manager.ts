import type {
  AiChatMessage,
  AiHealthResponse,
  AiProviderName,
  AiProviderStatus,
} from '@continuum/shared';
import { OpenAICompatProvider, type ProviderConfig } from './openai-compat.js';

export interface ProviderManagerOptions {
  primary: AiProviderName;
  fallback: AiProviderName;
  providers: ProviderConfig[];
}

/**
 * Manages multiple OpenAI-compatible local providers.
 * Default order: LM Studio (primary) -> Ollama (fallback).
 *
 * Strategy:
 *   - For every operation, try primary first.
 *   - On network/HTTP error or unreachable, automatically fall back.
 *   - `health()` reports both providers without throwing.
 */
export class ProviderManager {
  private readonly primary: AiProviderName;
  private readonly fallback: AiProviderName;
  private readonly providers = new Map<AiProviderName, OpenAICompatProvider>();

  constructor(opts: ProviderManagerOptions) {
    this.primary = opts.primary;
    this.fallback = opts.fallback;
    for (const p of opts.providers) {
      this.providers.set(p.name, new OpenAICompatProvider(p));
    }
    if (!this.providers.has(this.primary)) {
      throw new Error(`Primary provider "${this.primary}" not configured`);
    }
  }

  get(name: AiProviderName): OpenAICompatProvider {
    const p = this.providers.get(name);
    if (!p) throw new Error(`Provider "${name}" not configured`);
    return p;
  }

  /**
   * Try primary, then fallback. We attempt the real operation directly
   * (no upfront /v1/models ping) so that:
   *   - the actual error is surfaced (timeouts, auth, model-not-loaded,
   *     connection refused, …) instead of a generic "unreachable";
   *   - providers that allow chat/embed but disable /v1/models still
   *     work;
   *   - happy-path latency is halved (no extra round-trip).
   *
   * On failure, the per-provider error is collected so the final
   * exception message lists every attempted endpoint and its cause —
   * making local-server misconfigurations actionable from the UI.
   */
  private async withFallback<T>(op: (p: OpenAICompatProvider) => Promise<T>): Promise<T> {
    const order: AiProviderName[] = [this.primary];
    if (this.fallback !== this.primary && this.providers.has(this.fallback)) {
      order.push(this.fallback);
    }
    const failures: string[] = [];
    for (const name of order) {
      const provider = this.providers.get(name);
      if (!provider) continue;
      try {
        return await op(provider);
      } catch (err) {
        const cause = err instanceof Error ? err.message : String(err);
        failures.push(`${name} (${provider.config.baseUrl}): ${cause}`);
      }
    }
    throw new Error(
      failures.length
        ? `All AI providers failed — ${failures.join(' | ')}`
        : 'No AI providers configured',
    );
  }

  chat(messages: AiChatMessage[], opts?: { model?: string; temperature?: number }) {
    return this.withFallback((p) => p.chat(messages, opts));
  }

  chatStream(messages: AiChatMessage[], opts?: { model?: string; temperature?: number }) {
    return this.withFallback((p) => p.chatStream(messages, opts));
  }

  embed(input: string | string[]) {
    return this.withFallback((p) => p.embed(input));
  }

  async health(): Promise<AiHealthResponse> {
    const statuses: AiProviderStatus[] = [];
    for (const [name, provider] of this.providers) {
      const reachable = await provider.ping(1500);
      let models: AiProviderStatus['models'];
      let error: string | undefined;
      if (reachable) {
        try {
          models = await provider.listModels();
        } catch (e) {
          error = e instanceof Error ? e.message : String(e);
        }
      }
      statuses.push({
        name,
        baseUrl: provider.config.baseUrl,
        reachable,
        models,
        error,
      });
    }
    return {
      primary: this.primary,
      fallback: this.fallback,
      providers: statuses,
    };
  }
}
