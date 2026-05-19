<script setup lang="ts">
/**
 * PropertySettingsHost — inline (non-floating) host for property
 * settings, designed to be mounted inside a `UiContextMenu` custom
 * submenu panel.
 *
 * Shares the same chrome as `PropertySettingsPopover` (header with the
 * property label + transient "Saving…" indicator, footer reminding the
 * user the change applies to every view) but drops the teleport /
 * floating positioning since the parent `ContextMenuPanel` already
 * handles placement.
 *
 * Persistence flows through `usePropertySettings`, identical to the
 * popover variant — the parent menu does not remount the host while
 * the user edits because Vue keeps the component alive as long as the
 * submenu path stays open.
 */
import { computed, shallowRef, watch } from 'vue';
import type { PropertyConfig, PropertyDefinition } from '@continuum/shared';
import { propertySettingsRegistry, hasPropertySettings } from './registry';
import { usePropertySettings } from './usePropertySettings';

const props = defineProps<{ definition: PropertyDefinition }>();

const panelComponent = shallowRef(propertySettingsRegistry[props.definition.type] ?? null);
watch(
    () => props.definition.type,
    (type) => {
        panelComponent.value = propertySettingsRegistry[type] ?? null;
    },
);

const supported = computed(() => hasPropertySettings(props.definition.type));

const { draft, patch, saving, error } = usePropertySettings(
    computed(() => props.definition),
    () => {
        /* no-op: realtime publishers fan out via usePropertySettings */
    },
);

function onPatch(config: PropertyConfig): void {
    patch(config);
}
</script>

<template>
    <div class="prop-settings-host" @click.stop @pointerdown.stop>
        <header class="prop-settings-host__head">
            <span class="prop-settings-host__title">{{ definition.label }}</span>
            <span v-if="saving" class="prop-settings-host__status">Saving…</span>
        </header>

        <div class="prop-settings-host__body">
            <component v-if="supported && panelComponent && draft" :is="panelComponent" :definition="definition"
                :config="draft" @update:config="onPatch" />
            <p v-else class="prop-settings-host__empty">
                This property type has no extra settings yet.
            </p>
        </div>

        <p v-if="error" class="prop-settings-host__error" role="alert">{{ error }}</p>
        <p v-else class="prop-settings-host__foot">
            Changes apply to all views showing this property.
        </p>
    </div>
</template>

<style scoped>
.prop-settings-host {
    min-width: 280px;
    max-width: 360px;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

.prop-settings-host__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding-bottom: var(--space-1);
    border-bottom: var(--border-width-1) solid var(--border);
}

.prop-settings-host__title {
    font-size: var(--text-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.prop-settings-host__status {
    font-size: var(--text-xs);
    color: var(--fg-subtle);
}

.prop-settings-host__body {
    display: flex;
    flex-direction: column;
}

.prop-settings-host__empty {
    margin: 0;
    padding: var(--space-4) 0;
    text-align: center;
    color: var(--fg-subtle);
    font-size: var(--text-xs);
}

.prop-settings-host__foot {
    margin: 0;
    padding-top: var(--space-2);
    font-size: 11px;
    color: var(--fg-subtle);
    border-top: var(--border-width-1) solid var(--border);
}

.prop-settings-host__error {
    margin: 0;
    padding-top: var(--space-2);
    font-size: 11px;
    color: var(--danger, #c0392b);
    border-top: var(--border-width-1) solid var(--border);
}
</style>
