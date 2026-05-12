<script setup lang="ts">
/**
 * Button property editor.
 *
 * Renders a labelled button styled by `config.variant`. Clicking the
 * button delegates to `api.properties.runButton` for `set-property` /
 * `increment-property` actions and opens external links for `open-url`
 * directly from the browser.
 *
 * After a server-side action completes, the editor emits `reload` so the
 * parent panel refetches the affected note property values.
 */
import { computed, ref } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import { api } from '@/api';
import type { ButtonConfig, PropertyDefinition } from '@continuum/shared';

const props = defineProps<{
    noteId: string;
    definition: PropertyDefinition;
}>();

const emit = defineEmits<{ reload: [] }>();

const cfg = computed(() => props.definition.config as ButtonConfig);
const label = computed(() => cfg.value.label || props.definition.label);

const busy = ref(false);

async function trigger(): Promise<void> {
    if (busy.value) return;
    busy.value = true;
    try {
        if (cfg.value.action.type === 'open-url' && cfg.value.action.url) {
            window.open(cfg.value.action.url, '_blank', 'noopener,noreferrer');
        }
        const res = await api.properties.runButton(props.noteId, props.definition.id);
        if (res.result) emit('reload');
    } finally {
        busy.value = false;
    }
}
</script>

<template>
    <button type="button" class="prop-btn" :data-variant="cfg.variant ?? 'default'"
        :disabled="busy" @click="trigger">
        <Icon v-if="busy" name="loader" :size="12" />
        <Icon v-else name="play" :size="12" />
        <span>{{ label }}</span>
    </button>
</template>

<style scoped>
.prop-btn {
    display: inline-flex; align-items: center; gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    border: var(--border-width-1) solid var(--border);
    background: var(--bg-soft); color: var(--fg);
    font-size: var(--text-sm); font-weight: var(--font-weight-semibold);
    cursor: pointer;
    transition: background var(--duration-fast) var(--ease-standard);
}
.prop-btn:hover:not(:disabled) { background: var(--bg-hover, var(--bg-elev)); }
.prop-btn:disabled { opacity: 0.6; cursor: progress; }
.prop-btn[data-variant="primary"] {
    background: var(--accent); color: #fff; border-color: var(--accent);
}
.prop-btn[data-variant="primary"]:hover:not(:disabled) {
    filter: brightness(1.05);
}
.prop-btn[data-variant="ghost"] { background: transparent; }
</style>
