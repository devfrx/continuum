<script setup lang="ts">
/**
 * PropertySettingsPopover.vue — anchored host for per-type settings.
 *
 * Mounts the {@link propertySettingsRegistry} entry for the given
 * `definition.type` inside a teleported, floating panel. Shared
 * chrome (header showing the property label and a "changes apply to
 * all views" footnote) lives here so individual panels stay focused on
 * their inputs.
 *
 * Persistence flows through the same `api.properties.update` PATCH the
 * rest of the app uses, so changes propagate to every view that
 * renders the same datasource (the source-of-truth contract for
 * `PropertyDefinition`). Saves are debounced through {@link
 * usePropertySettings} to avoid flooding the server while the user
 * scrubs a slider or types into a number input.
 */
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { useFloatingPosition } from '@/composables/useFloatingPosition';
import type { PropertyConfig, PropertyDefinition } from '@continuum/shared';
import { propertySettingsRegistry, hasPropertySettings } from './registry';
import { usePropertySettings } from './usePropertySettings';

interface Props {
    modelValue: boolean;
    triggerEl: HTMLElement | null;
    definition: PropertyDefinition | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
    /** Emitted after a successful server save, with the latest definition. */
    saved: [definition: PropertyDefinition];
}>();

const panelRef = ref<HTMLDivElement | null>(null);
const open = computed({
    get: () => props.modelValue && props.definition !== null,
    set: (v) => emit('update:modelValue', v),
});

const triggerRef = ref<HTMLElement | null>(props.triggerEl);
watch(() => props.triggerEl, (el) => { triggerRef.value = el; });

const { style: panelStyle, reposition } = useFloatingPosition({
    triggerRef,
    panelRef,
    open,
    maxHeight: 480,
    minWidth: 280,
});

watch([open, () => props.triggerEl], async ([isOpen]) => {
    if (!isOpen) return;
    await nextTick();
    reposition();
}, { flush: 'post' });

const panelComponent = shallowRef(
    props.definition ? propertySettingsRegistry[props.definition.type] ?? null : null,
);
watch(
    () => props.definition?.type,
    (type) => {
        panelComponent.value = type ? propertySettingsRegistry[type] ?? null : null;
    },
);

const supported = computed(() =>
    props.definition ? hasPropertySettings(props.definition.type) : false,
);

const { draft, patch, saving, error } = usePropertySettings(
    computed(() => props.definition),
    (next) => emit('saved', next),
);

function onPatch(config: PropertyConfig): void {
    patch(config);
}

function onDocPointerDown(e: PointerEvent): void {
    if (!open.value) return;
    const target = e.target as Node | null;
    if (!target) return;
    if (triggerRef.value?.contains(target)) return;
    if (panelRef.value?.contains(target)) return;
    open.value = false;
}

watch(open, (isOpen) => {
    if (isOpen) {
        document.addEventListener('pointerdown', onDocPointerDown, true);
    } else {
        document.removeEventListener('pointerdown', onDocPointerDown, true);
    }
});

onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onDocPointerDown, true);
});
</script>

<template>
    <Teleport to="body">
        <div v-if="open && definition" ref="panelRef" class="prop-settings-pop" role="dialog" :style="panelStyle">
            <header class="prop-settings-pop__head">
                <span class="prop-settings-pop__title">{{ definition.label }}</span>
                <span v-if="saving" class="prop-settings-pop__status">Saving…</span>
            </header>

            <div class="prop-settings-pop__body">
                <component v-if="supported && panelComponent && draft" :is="panelComponent"
                    :definition="definition" :config="draft" @update:config="onPatch" />
                <p v-else class="prop-settings-pop__empty">
                    This property type has no extra settings yet.
                </p>
            </div>

            <p v-if="error" class="prop-settings-pop__error" role="alert">{{ error }}</p>
            <p v-else class="prop-settings-pop__foot">
                Changes apply to all views showing this property.
            </p>
        </div>
    </Teleport>
</template>

<style scoped>
.prop-settings-pop {
    position: fixed;
    z-index: 1300;
    background: var(--surface-2);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-dropdown);
    padding: var(--space-3) var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    overflow: auto;
}

.prop-settings-pop__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding-bottom: var(--space-1);
    border-bottom: var(--border-width-1) solid var(--border);
}

.prop-settings-pop__title {
    font-size: var(--text-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.prop-settings-pop__status {
    font-size: var(--text-xs);
    color: var(--fg-subtle);
}

.prop-settings-pop__body {
    display: flex;
    flex-direction: column;
}

.prop-settings-pop__empty {
    margin: 0;
    padding: var(--space-4) 0;
    text-align: center;
    color: var(--fg-subtle);
    font-size: var(--text-xs);
}

.prop-settings-pop__foot {
    margin: 0;
    padding-top: var(--space-2);
    font-size: 11px;
    color: var(--fg-subtle);
    border-top: var(--border-width-1) solid var(--border);
}

.prop-settings-pop__error {
    margin: 0;
    padding-top: var(--space-2);
    font-size: 11px;
    color: var(--danger, #c0392b);
    border-top: var(--border-width-1) solid var(--border);
}
</style>
