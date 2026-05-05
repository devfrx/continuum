/**
 * Shared AI provider-health state for the renderer.
 *
 * The first call to {@link useAiHealth} kicks off a single `/api/ai/health`
 * request; subsequent calls reuse the same reactive refs. Consumers that
 * need to force a re-fetch (e.g. the Settings "Refresh providers" button)
 * call {@link AiHealthHandle.refresh}.
 *
 * Storing the state at module scope keeps Settings and the Notes search
 * sidebar perfectly in sync without a Pinia store.
 */

import { ref, computed, type Ref, type ComputedRef } from 'vue';
import { api } from '@/api';
import type { AiHealthResponse, AiProviderStatus } from '@continuum/shared';

const EMBEDDING_MODEL_RE = /embed|embedding/i;

const health: Ref<AiHealthResponse | null> = ref(null);
const loading = ref(false);
let bootstrapped = false;
let inflight: Promise<void> | null = null;

/** True when at least one reachable provider exposes an embedding model. */
function providerHasEmbedding(p: AiProviderStatus): boolean {
  if (!p.reachable) return false;
  return (p.models ?? []).some((m) => EMBEDDING_MODEL_RE.test(m.id));
}

async function fetchHealth(): Promise<void> {
  if (inflight) return inflight;
  loading.value = true;
  inflight = (async () => {
    try {
      health.value = await api.ai.health();
    } catch {
      // Leave the previous snapshot in place; consumers treat `null` as
      // "embeddings unavailable", which is the safe default.
      if (!health.value) health.value = null;
    } finally {
      loading.value = false;
      inflight = null;
    }
  })();
  return inflight;
}

export interface AiHealthHandle {
  /** Latest health snapshot, or `null` until the first fetch resolves. */
  health: Ref<AiHealthResponse | null>;
  /** True while a fetch is in flight. */
  loading: Ref<boolean>;
  /** Reactive: any reachable provider has an embedding model loaded. */
  embeddingsAvailable: ComputedRef<boolean>;
  /** Force a refresh; resolves once the new snapshot is applied. */
  refresh: () => Promise<void>;
}

/**
 * Access the shared AI health state. The first invocation triggers one
 * lazy fetch; later calls return the same refs without extra requests.
 */
export function useAiHealth(): AiHealthHandle {
  if (!bootstrapped) {
    bootstrapped = true;
    void fetchHealth();
  }

  const embeddingsAvailable = computed<boolean>(() =>
    (health.value?.providers ?? []).some(providerHasEmbedding),
  );

  return {
    health,
    loading,
    embeddingsAvailable,
    refresh: fetchHealth,
  };
}
