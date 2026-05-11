<script setup lang="ts">
/**
 * SettingsView — thin shell that mounts the dedicated panels.
 *
 * Each panel owns its own state and persistence. Cross-panel signals
 * (e.g. when a kind is deleted while it was the active default) flow
 * through `defineExpose` hooks the shell forwards via refs.
 */
import { ref } from 'vue';
import AiProviderSettingsPanel from '@/components/settings/AiProviderSettingsPanel.vue';
import KindsSettingsPanel from '@/components/settings/KindsSettingsPanel.vue';
import MaintenanceSettingsPanel from '@/components/settings/MaintenanceSettingsPanel.vue';

type AiProviderPanel = InstanceType<typeof AiProviderSettingsPanel> & {
  onKindRemoved: (id: string) => void;
};

const aiPanel = ref<AiProviderPanel | null>(null);

function onKindRemoved(id: string): void {
  aiPanel.value?.onKindRemoved(id);
}
</script>

<template>
  <div class="settings">
    <header class="settings__head">
      <div>
        <h2 class="settings__title">Settings</h2>
        <p class="settings__sub">Local preferences. Stored in your browser.</p>
      </div>
    </header>

    <AiProviderSettingsPanel ref="aiPanel" />
    <KindsSettingsPanel @kind-removed="onKindRemoved" />
    <MaintenanceSettingsPanel />
  </div>
</template>

<style scoped>
.settings {
  max-width: 880px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-10);
  padding: var(--space-2) var(--space-2) var(--space-16);
}

.settings__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-8);
}

.settings__title {
  margin: 0 0 var(--space-2);
  font-size: var(--text-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--fg-strong);
  letter-spacing: var(--tracking-tight);
}

.settings__sub {
  margin: 0;
  font-size: var(--text-base);
  color: var(--fg-muted);
}
</style>
