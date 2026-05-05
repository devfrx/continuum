<script setup lang="ts">
/**
 * Provider status panel — read-only summary of the currently-configured AI
 * runtimes (LM Studio, Ollama, …). Originally lived in the standalone "AI"
 * view; surfaced inside Settings now that the dedicated view is gone.
 *
 * Receives the shared health snapshot from {@link useAiHealth} so all
 * consumers stay in sync after a refresh.
 */
import { computed } from 'vue';
import type { AiHealthResponse } from '@continuum/shared';
import { UiCard, UiBadge, UiChip, UiSection, UiEmpty } from '@/components/ui';

const props = defineProps<{
  health: AiHealthResponse | null;
  loading: boolean;
}>();

const reachableCount = computed<number>(
  () => (props.health?.providers ?? []).filter((p) => p.reachable).length,
);
const totalCount = computed<number>(() => props.health?.providers.length ?? 0);
</script>

<template>
  <div class="prov-panel">
    <p class="prov-panel__sub">
      {{ reachableCount }} of {{ totalCount }} providers online ·
      primary <strong>{{ health?.primary ?? '—' }}</strong> · fallback
      <strong>{{ health?.fallback ?? '—' }}</strong>
    </p>

    <div v-if="!health && !loading">
      <UiEmpty title="No data yet" description="Click refresh to query providers." />
    </div>
    <div v-else class="prov-panel__grid">
      <UiCard v-for="p in health?.providers ?? []" :key="p.name" as="article">
        <template #header>
          <div class="prov__head">
            <span class="prov__name">{{ p.name }}</span>
            <UiBadge :tone="p.reachable ? 'success' : 'danger'" dot>
              {{ p.reachable ? 'Online' : 'Offline' }}
            </UiBadge>
          </div>
        </template>
        <code class="prov__url">{{ p.baseUrl }}</code>
        <p v-if="p.error" class="prov__err">{{ p.error }}</p>
        <UiSection v-if="p.models?.length" title="Models">
          <div class="prov__models">
            <UiChip v-for="m in p.models" :key="m.id" tone="neutral">{{ m.id }}</UiChip>
          </div>
        </UiSection>
        <p v-else-if="p.reachable" class="prov__none">No models loaded.</p>
      </UiCard>
    </div>
  </div>
</template>

<style scoped>
.prov-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.prov-panel__sub {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--fg-muted);
}

.prov-panel__grid {
  display: grid;
  gap: var(--space-7);
}

.prov__head {
  display: flex;
  align-items: center;
  gap: var(--space-5);
}

.prov__name {
  font-weight: var(--font-weight-semibold);
  font-size: var(--text-md);
  color: var(--fg-strong);
  text-transform: capitalize;
}

.prov__url {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--fg-muted);
  background: var(--bg-soft);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-sm);
  display: inline-block;
  align-self: flex-start;
}

.prov__err {
  margin: 0;
  color: var(--danger);
  font-size: var(--text-sm);
}

.prov__none {
  margin: 0;
  color: var(--fg-subtle);
  font-size: var(--text-sm);
  font-style: italic;
}

.prov__models {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  max-height: 140px;
  overflow-y: auto;
  padding-right: var(--space-2);
}
</style>
