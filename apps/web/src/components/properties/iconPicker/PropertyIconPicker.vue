<script setup lang="ts">
/**
 * PropertyIconPicker.vue — popover icon picker for property definitions.
 *
 * Anchors below a trigger element (typically the column header chevron
 * or a context-menu item callback) and renders the curated Solar icon
 * catalogue via {@link UiIconPicker}. The first row offers an "Auto"
 * tile that resets the property to its type-default icon (encoded as
 * `null` on the wire — see `PROPERTY_TYPE_ICONS`).
 *
 * The popover is purely presentational: it emits the picked value and
 * leaves persistence to the parent (which calls `api.properties.update`).
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { UiIconPicker, Icon } from '@/components/ui';
import { useFloatingPosition } from '@/composables/useFloatingPosition';
import { PROPERTY_TYPE_ICONS, type PropertyType } from '@continuum/shared';

interface Props {
    modelValue: boolean;
    triggerEl: HTMLElement | null;
    /** Property type, used to compute the "Auto" default icon. */
    type: PropertyType;
    /** Current icon value (`null` means "use the type default"). */
    icon: string | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
    /** Emitted with the picked icon name, or `null` for the type default. */
    pick: [icon: string | null];
}>();

const panelRef = ref<HTMLDivElement | null>(null);
const open = computed({
    get: () => props.modelValue,
    set: (v) => emit('update:modelValue', v),
});

const triggerRef = ref<HTMLElement | null>(props.triggerEl);
watch(() => props.triggerEl, (el) => { triggerRef.value = el; });

const { style: panelStyle, reposition } = useFloatingPosition({
    triggerRef,
    panelRef,
    open,
    maxHeight: 360,
    minWidth: 280,
});

watch([open, () => props.triggerEl], async ([isOpen]) => {
    if (!isOpen) return;
    await nextTick();
    reposition();
}, { flush: 'post' });

const autoIcon = computed(() => PROPERTY_TYPE_ICONS[props.type]);
const isAuto = computed(() => props.icon === null || props.icon === '');

/**
 * Two-way handle into UiIconPicker. The picker only models the
 * "explicit" icon; when the user is on the type default, we hand it the
 * computed default string so the active tile highlights correctly.
 */
const effectiveIcon = computed({
    get: () => props.icon ?? autoIcon.value,
    set: (next: string) => emit('pick', next),
});

function pickAuto(): void {
    emit('pick', null);
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
        <div v-if="open" ref="panelRef" class="prop-icon-pop" role="dialog" :style="panelStyle">
            <header class="prop-icon-pop__head">
                <button type="button" class="prop-icon-pop__auto" :class="{ 'is-active': isAuto }"
                    title="Use the default icon for this property type" @click="pickAuto">
                    <Icon :name="autoIcon" :size="16" />
                    <span>Auto</span>
                </button>
            </header>
            <UiIconPicker v-model="effectiveIcon" :show-preview="false" />
        </div>
    </Teleport>
</template>

<style scoped>
.prop-icon-pop {
    position: fixed;
    z-index: 1300;
    background: var(--surface-2);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-dropdown);
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    overflow: hidden;
}

.prop-icon-pop__head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
}

.prop-icon-pop__auto {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    background: transparent;
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--fg);
    padding: var(--space-1) var(--space-3);
    font-size: var(--text-xs);
    cursor: pointer;
    transition:
        background-color var(--duration-fast) var(--ease-standard),
        border-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard);
}

.prop-icon-pop__auto:hover {
    background: var(--bg-soft);
}

.prop-icon-pop__auto.is-active {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent);
}
</style>
