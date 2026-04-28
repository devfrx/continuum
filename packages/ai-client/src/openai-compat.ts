import OpenAI from 'openai';
import type {
  AiChatMessage,
  AiModelInfo,
  AiProviderName,
} from '@continuum/shared';

export interface ProviderConfig {
  name: AiProviderName;
  baseUrl: string;
  apiKey: string;
  chatModel?: string;
  embedModel?: string;
}

/**
 * Wraps an OpenAI-compatible endpoint.
 * Both LM Studio (http://localhost:1234/v1) and Ollama (http://localhost:11434/v1)
 * implement /v1/models, /v1/chat/completions and /v1/embeddings.
 */
export class OpenAICompatProvider {
  readonly config: ProviderConfig;
  private client: OpenAI;
  /** Lazily-discovered fallback model ids, used when env config omits them. */
  private discoveredChatModel: string | null = null;
  private discoveredEmbedModel: string | null = null;

  constructor(config: ProviderConfig) {
    this.config = config;
    this.client = new OpenAI({
      baseURL: config.baseUrl,
      apiKey: config.apiKey || 'not-needed',
      // local providers are reachable from server-side; safe to keep defaults
    });
  }

  /** Quick reachability check: GET /v1/models. */
  async ping(timeoutMs = 2000): Promise<boolean> {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(new URL('models', this.ensureTrailingSlash(this.config.baseUrl)), {
        signal: controller.signal,
        headers: { Authorization: `Bearer ${this.config.apiKey || 'not-needed'}` },
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(t);
    }
  }

  async listModels(): Promise<AiModelInfo[]> {
    const res = await this.client.models.list();
    return res.data.map((m) => ({
      id: m.id,
      provider: this.config.name,
      object: m.object,
      ownedBy: (m as { owned_by?: string }).owned_by,
    }));
  }

  /**
   * Resolve the chat model to use. Priority:
   *   1. Explicit override from the caller.
   *   2. `chatModel` from env config.
   *   3. First model discovered via /v1/models (cached).
   *
   * The auto-discovery step is what makes LM Studio "just work" without
   * the user having to set `AI_LMSTUDIO_CHAT_MODEL` — LM Studio typically
   * exposes whatever single model is loaded, so picking the first id is
   * the right behaviour.
   */
  private async resolveChatModel(override?: string): Promise<string> {
    if (override) return override;
    if (this.config.chatModel) return this.config.chatModel;
    if (this.discoveredChatModel) return this.discoveredChatModel;
    const models = await this.listModels();
    // Heuristic: skip ids that obviously look like embedding models so a
    // mixed LM Studio install doesn't accidentally call /chat against an
    // embedding-only endpoint.
    const chat =
      models.find((m) => !/embed|embedding/i.test(m.id)) ?? models[0];
    if (!chat) {
      throw new Error(
        `Provider ${this.config.name} has no models loaded. Open the provider UI and load a chat model.`,
      );
    }
    this.discoveredChatModel = chat.id;
    return chat.id;
  }

  /** Same as `resolveChatModel`, but biased toward embedding-capable ids. */
  private async resolveEmbedModel(): Promise<string> {
    if (this.config.embedModel) return this.config.embedModel;
    if (this.discoveredEmbedModel) return this.discoveredEmbedModel;
    const models = await this.listModels();
    const embed = models.find((m) => /embed|embedding/i.test(m.id));
    if (!embed) {
      throw new Error(
        `Provider ${this.config.name} has no embedding model loaded. Load one in the provider UI.`,
      );
    }
    this.discoveredEmbedModel = embed.id;
    return embed.id;
  }

  async chat(messages: AiChatMessage[], opts: { model?: string; temperature?: number } = {}) {
    const model = await this.resolveChatModel(opts.model);
    return this.client.chat.completions.create({
      model,
      messages,
      temperature: opts.temperature ?? 0.7,
      stream: false,
    });
  }

  async chatStream(messages: AiChatMessage[], opts: { model?: string; temperature?: number } = {}) {
    const model = await this.resolveChatModel(opts.model);
    return this.client.chat.completions.create({
      model,
      messages,
      temperature: opts.temperature ?? 0.7,
      stream: true,
    });
  }

  async embed(input: string | string[]): Promise<number[][]> {
    const model = await this.resolveEmbedModel();
    const res = await this.client.embeddings.create({
      model,
      input,
      // Force float arrays — some OpenAI-compatible servers (including
      // certain LM Studio builds) default to base64-encoded embeddings,
      // which the SDK would surface as strings and silently break the
      // downstream `vec.join(',')` → pgvector pipeline (yielding all-zero
      // similarity scores).
      encoding_format: 'float',
    });
    return res.data.map((d) => {
      const e = d.embedding as unknown;
      if (Array.isArray(e)) return e as number[];
      // Defensive: decode base64 → Float32Array if a server still ignores
      // encoding_format and returns strings.
      if (typeof e === 'string') {
        const bin = atob(e);
        const buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        const f = new Float32Array(buf.buffer);
        return Array.from(f);
      }
      throw new Error(`Unexpected embedding payload type: ${typeof e}`);
    });
  }

  private ensureTrailingSlash(u: string): string {
    return u.endsWith('/') ? u : `${u}/`;
  }
}
