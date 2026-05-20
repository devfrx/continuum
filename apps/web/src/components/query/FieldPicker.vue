<script setup lang="ts">
/**
 * FieldPicker — dropdown that lists every queryable `FieldDescriptor`
 * exposed by `useFieldCatalog`, grouped by `FieldDescriptor.group`
 * (Note · Properties · Graph · System).
 *
 * Visually mirrors `UiSelect` — same trigger height, border, chevron — but
 * the popup renders a sectioned list because a flat `<UiSelect>` cannot
 * carry icons, hints, or group headers. Click outside, Escape and Tab
 * close the panel.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import {
    fieldRefKey,
    type FieldDescriptor,
    type FieldGroupId,
    type FieldRef,
} from '@continuum/shared';
import Icon from '@/components/ui/Icon.vue';
import { useFieldCatalog } from '@/composables/query/useFieldCatalog';
import { useFloatingPosition } from '@/composables/useFloatingPosition';
import { useContinuumScrollLock } from '@/composables/useContinuumScrollLock';

interface Props {
    modelValue: FieldRef | null;
    /** Which catalog to read. Defaults to the graph catalog. */
    surface?: 'graph' | 'note';
    /** Hide fields that have no operators (cannot participate in filters). */
    requireOperators?: boolean;
    /** Optional caller-side filter for specialised pickers (for example visual encodings). */
    fieldFilter?: (field: FieldDescriptor) => boolean;
    placeholder?: string;
    disabled?: boolean;
    /** Allow the user to clear the selection (renders a × in the trigger). */
    clearable?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
    surface: 'graph',
    requireOperators: false,
    placeholder: 'Seleziona campo…',
    disabled: false,
    clearable: false,
});

const emit = defineEmits<{
    'update:modelValue': [ref: FieldRef | null];
}>();

const catalog = useFieldCatalog();

// Kick off catalog load lazily — first picker mount triggers the fetch.
void catalog.load(props.surface);
watch(
    () => props.surface,
    (s) => {
        void catalog.load(s);
    },
);

// ───────── Catalog → grouped, filtered view ─────────

const fields = computed<FieldDescriptor[]>(() => {
    let all = catalog.fields(props.surface);
    if (props.requireOperators) all = all.filter((f) => f.operators.length > 0);
    if (props.fieldFilter) all = all.filter(props.fieldFilter);
    return all;
});

const GROUP_ORDER: FieldGroupId[] = ['note', 'property', 'graph', 'system'];
const GROUP_LABELS: Record<FieldGroupId, string> = {
    note: 'Note',
    property: 'Proprietà',
    graph: 'Grafo',
    system: 'Sistema',
};

interface FieldGroupEntry {
    id: FieldGroupId;
    label: string;
    fields: FieldDescriptor[];
}

const groups = computed<FieldGroupEntry[]>(() => {
    const buckets = new Map<FieldGroupId, FieldDescriptor[]>();
    for (const id of GROUP_ORDER) buckets.set(id, []);
    for (const f of fields.value) {
        const list = buckets.get(f.group);
        if (list) list.push(f);
    }
    return GROUP_ORDER
        .map((id) => ({ id, label: GROUP_LABELS[id], fields: buckets.get(id) ?? [] }))
        .filter((g) => g.fields.length > 0);
});

const selectedKey = computed<string | null>(() =>
    props.modelValue ? fieldRefKey(props.modelValue) : null,
);

const selected = computed<FieldDescriptor | null>(() => {
    if (!selectedKey.value) return null;
    return catalog.fieldByKey(props.surface, selectedKey.value) ?? null;
});

// ───────── Open / close ─────────

const open = ref(false);
const triggerRef = ref<HTMLButtonElement | null>(null);
const panelRef = ref<HTMLDivElement | null>(null);

const { style: panelStyle, reposition } = useFloatingPosition({
    triggerRef,
    panelRef,
    open,
    maxHeight: 360,
    minWidth: 220,
});
useContinuumScrollLock(open);

async function openPanel(): Promise<void> {
    if (props.disabled || open.value) return;
    open.value = true;
    await nextTick();
    reposition();
    panelRef.value?.focus();
}

function closePanel(): void {
    if (!open.value) return;
    open.value = false;
    triggerRef.value?.focus();
}

function toggle(): void {
    if (open.value) closePanel();
    else void openPanel();
}

function selectField(field: FieldDescriptor): void {
    emit('update:modelValue', field.ref);
    closePanel();
}

function clear(event: Event): void {
    event.stopPropagation();
    emit('update:modelValue', null);
}

function onTriggerKey(e: KeyboardEvent): void {
    if (props.disabled) return;
    if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        void openPanel();
    }
}

function onPanelKey(e: KeyboardEvent): void {
    if (e.key === 'Escape' || e.key === 'Tab') {
        e.preventDefault();
        closePanel();
    }
}

function onDocPointerDown(e: PointerEvent): void {
    if (!open.value) return;
    const t = e.target as Node | null;
    if (!t) return;
    if (triggerRef.value?.contains(t)) return;
    if (panelRef.value?.contains(t)) return;
    closePanel();
}

watch(open, (isOpen) => {
    if (isOpen) document.addEventListener('pointerdown', onDocPointerDown, true);
    else document.removeEventListener('pointerdown', onDocPointerDown, true);
});

onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onDocPointerDown, true);
});
</script>

<template>
    <div class="field-picker" :class="{ 'is-disabled': disabled, 'is-open': open }">
        <button
            ref="triggerRef"
            type="button"
            class="field-picker__trigger"
            :disabled="disabled"
            aria-haspopup="listbox"
            :aria-expanded="open"
            @click="toggle"
            @keydown="onTriggerKey"
        >
            <span v-if="selected" class="field-picker__selected">
                <Icon v-if="selected.icon" :name="selected.icon" :size="14" class="field-picker__selected-icon" />
                <span class="field-picker__selected-label">{{ selected.label }}</span>
                <span v-if="selected.hint" class="field-picker__selected-hint">{{ selected.hint }}</span>
            </span>
            <span v-else class="field-picker__placeholder">{{ placeholder }}</span>
            <button
                v-if="clearable && selected"
                type="button"
                class="field-picker__clear"
                aria-label="Rimuovi selezione"
                @click="clear"
            >
                <Icon name="close" :size="11" />
            </button>
            <Icon class="field-picker__chev" name="chevron-down" :size="12" />
        </button>

        <Teleport to="body">
            <div
                v-if="open"
                ref="panelRef"
                class="field-picker__panel"
                role="listbox"
                tabindex="-1"
                data-continuum-scroll-lock-allow="true"
                :style="panelStyle"
                @keydown="onPanelKey"
            >
                <div v-if="groups.length === 0" class="field-picker__empty">Nessun campo disponibile</div>
                <div v-for="g in groups" :key="g.id" class="field-picker__group">
                    <div class="field-picker__group-label">{{ g.label }}</div>
                    <button
                        v-for="f in g.fields"
                        :key="f.key"
                        type="button"
                        role="option"
                        class="field-picker__option"
                        :class="{ 'is-selected': f.key === selectedKey }"
                        :aria-selected="f.key === selectedKey"
                        @click="selectField(f)"
                    >
                        <Icon
                            v-if="f.icon"
                            :name="f.icon"
                            :size="14"
                            class="field-picker__option-icon"
                        />
                        <span class="field-picker__option-label">{{ f.label }}</span>
                        <span v-if="f.hint" class="field-picker__option-hint">{{ f.hint }}</span>
                    </button>
                </div>
            </div>
        </Teleport>
    </div>
</template>

<style scoped>
.field-picker {
    position: relative;
    display: inline-flex;
    width: 100%;
}

.field-picker__trigger {
    appearance: none;
    flex: 1;
    width: 100%;
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    background: var(--bg-elev);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--fg);
    font: inherit;
    font-size: var(--text-sm);
    min-height: 32px;
    padding: var(--space-2) var(--space-3);
    cursor: pointer;
    text-align: left;
    transition:
        border-color var(--duration-fast) var(--ease-standard),
        background-color var(--duration-fast) var(--ease-standard);
}

.field-picker__trigger:hover {
    border-color: var(--border-strong);
}

.field-picker.is-open .field-picker__trigger {
    border-color: var(--border-strong);
}

.field-picker.is-disabled {
    opacity: 0.5;
}

.field-picker.is-disabled .field-picker__trigger {
    cursor: not-allowed;
}

.field-picker__selected {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    flex: 1;
    min-width: 0;
}

.field-picker__selected-icon {
    color: var(--fg-muted);
    flex-shrink: 0;
}

.field-picker__selected-label {
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.field-picker__selected-hint {
    color: var(--fg-subtle);
    font-size: var(--text-xs);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.field-picker__placeholder {
    flex: 1;
    color: var(--fg-subtle);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.field-picker__clear {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border: none;
    border-radius: var(--radius-xs);
    background: transparent;
    color: var(--fg-subtle);
    cursor: pointer;
    flex-shrink: 0;
}

.field-picker__clear:hover {
    background: var(--bg-soft);
    color: var(--fg);
}

.field-picker__chev {
    color: var(--fg-subtle);
    flex-shrink: 0;
    transition: transform var(--duration-fast) var(--ease-standard);
}

.field-picker.is-open .field-picker__chev {
    transform: rotate(180deg);
}
</style>

<style>
/* Teleported panel — unscoped (lives outside the component root). */
.field-picker__panel {
    position: absolute;
    z-index: var(--z-popover, 1100);
    background: var(--surface-1);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    padding: var(--space-2);
    overflow-y: auto;
    outline: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

.field-picker__group {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.field-picker__group-label {
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    color: var(--fg-subtle);
    padding: var(--space-1) var(--space-3);
}

.field-picker__option {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    text-align: left;
    border: none;
    background: transparent;
    color: var(--fg);
    font: inherit;
    font-size: var(--text-sm);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    cursor: pointer;
}

.field-picker__option:hover,
.field-picker__option:focus-visible {
    background: var(--bg-soft);
    outline: none;
}

.field-picker__option.is-selected {
    background: var(--accent-soft, var(--bg-soft));
    color: var(--accent, var(--fg));
}

.field-picker__option-icon {
    color: var(--fg-muted);
    flex-shrink: 0;
}

.field-picker__option-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.field-picker__option-hint {
    color: var(--fg-subtle);
    font-size: var(--text-xs);
    flex-shrink: 0;
}

.field-picker__empty {
    padding: var(--space-3);
    color: var(--fg-subtle);
    font-size: var(--text-sm);
    text-align: center;
}
</style>
