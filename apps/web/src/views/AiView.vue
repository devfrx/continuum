<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '@/api';
import type { AiHealthResponse, AiChatMessage } from '@continuum/shared';
import {
  UiButton,
  UiCard,
  UiBadge,
  UiChip,
  UiSection,
  UiTextarea,
  UiEmpty,
  Icon,
} from '@/components/ui';

const health = ref<AiHealthResponse | null>(null);
const loading = ref(false);
const prompt = ref('');
const sending = ref(false);
const reply = ref('');
const errorMsg = ref('');

async function refresh() {
  loading.value = true;
  try {
    health.value = await api.ai.health();
  } finally {
    loading.value = false;
  }
}

interface ChatChoiceLike {
  message?: { content?: string };
  text?: string;
}
interface ChatResponseLike {
  choices?: ChatChoiceLike[];
  content?: string;
  message?: { content?: string };
}

function extractContent(data: unknown): string {
  if (typeof data === 'string') return data;
  if (!data || typeof data !== 'object') return '';
  const r = data as ChatResponseLike;
  const choice = r.choices?.[0];
  return (
    choice?.message?.content ??
    choice?.text ??
    r.message?.content ??
    r.content ??
    JSON.stringify(data, null, 2)
  );
}

async function sendPrompt() {
  if (!prompt.value.trim() || sending.value) return;
  sending.value = true;
  reply.value = '';
  errorMsg.value = '';
  try {
    const messages: AiChatMessage[] = [{ role: 'user', content: prompt.value.trim() }];
    const res = await api.ai.chat(messages);
    reply.value = extractContent(res);
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : String(e);
  } finally {
    sending.value = false;
  }
}

const reachableCount = computed(
  () => (health.value?.providers ?? []).filter((p) => p.reachable).length,
);

onMounted(refresh);
</script>

<template>
  <div class="ai-view">
    <header class="ai-view__head">
      <div>
        <h2 class="ai-view__title">AI</h2>
        <p class="ai-view__sub">
          {{ reachableCount }} of {{ health?.providers.length ?? 0 }} providers online ·
          primary <strong>{{ health?.primary ?? '—' }}</strong> · fallback
          <strong>{{ health?.fallback ?? '—' }}</strong>
        </p>
      </div>
      <UiButton variant="subtle" :loading="loading" @click="refresh">
        <template #icon-left>
          <Icon name="refresh" :size="14" />
        </template>
        {{ loading ? 'Checking…' : 'Refresh' }}
      </UiButton>
    </header>

    <UiSection title="Provider health" description="Status of locally-configured AI runtimes.">
      <div v-if="!health && !loading">
        <UiEmpty title="No data yet" description="Click refresh to query providers." />
      </div>
      <div v-else class="ai-view__providers">
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
    </UiSection>

    <UiSection title="Quick chat" description="Send a one-shot prompt to the primary provider.">
      <UiTextarea v-model="prompt" placeholder="Ask anything about your world…" :rows="4" :disabled="sending" />
      <div class="ai-view__actions">
        <UiButton variant="primary" :loading="sending" :disabled="!prompt.trim()" @click="sendPrompt">
          <template #icon-left>
            <Icon name="sparkles" :size="14" />
          </template>
          {{ sending ? 'Sending…' : 'Send prompt' }}
        </UiButton>
      </div>

      <UiCard v-if="reply || errorMsg">
        <template #header>
          <span class="reply__label">Response</span>
          <UiBadge v-if="errorMsg" tone="danger">Error</UiBadge>
          <UiBadge v-else tone="accent">Reply</UiBadge>
        </template>
        <pre v-if="errorMsg" class="reply__err">{{ errorMsg }}</pre>
        <pre v-else class="reply__body">{{ reply }}</pre>
      </UiCard>
    </UiSection>
  </div>
</template>

<style scoped>
.ai-view {
  max-width: var(--layout-content-max);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-14);
  padding: var(--space-4) var(--space-2) var(--space-20);
}

.ai-view__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-8);
}

.ai-view__title {
  margin: 0 0 var(--space-2);
  font-size: var(--text-2xl);
  font-weight: var(--font-weight-semibold);
  color: var(--fg-strong);
  letter-spacing: var(--tracking-tight);
}

.ai-view__sub {
  margin: 0;
  font-size: var(--text-base);
  color: var(--fg-muted);
}

.ai-view__providers {
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

.ai-view__actions {
  display: flex;
  justify-content: flex-end;
}

.reply__label {
  font-weight: var(--font-weight-semibold);
  font-size: var(--text-base);
  color: var(--fg-strong);
}

.reply__body,
.reply__err {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--fg);
  line-height: var(--leading-normal);
}

.reply__err {
  color: var(--danger);
}
</style>
