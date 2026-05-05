<script setup lang="ts">
/**
 * UiSelect — themed listbox with a teleported popup panel.
 *
 * Replaces the native `<select>` so the dropdown matches the rest of the
 * design system in every host (Electron, browser, modal, popover…).
 * Native selects render via the OS shell, can't be themed, and clash
 * visually with the dark cream UI.
 *
 * Public API kept identical to the previous styled-native implementation
 * so all existing call sites keep working without changes:
 *   - props: `modelValue`, `options`, `placeholder?`, `disabled?`, `variant?`
 *   - emits: `update:modelValue` (string)
 *
 * Behaviour:
 *   - opens on click / Space / Enter / ArrowDown / ArrowUp
 *   - keyboard: Up/Down move the active option (wrapping), Home/End jump,
 *     Enter/Space select, Escape/Tab close
 *   - typeahead: typing characters jumps to the next option whose label
 *     starts with the buffer (cleared after 700 ms idle)
 *   - the panel teleports into <body> so the popup is never clipped by
 *     overflow:hidden parents (modals, panes, popovers)
 *   - panel is anchored to the trigger and clamped to the viewport;
 *     flips above when there isn't enough room below
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import Icon from './Icon.vue';

interface Option {
    label: string;
    value: string | number;
}

interface Props {
    modelValue: string | number;
    options: Option[];
    placeholder?: string;
    disabled?: boolean;
    variant?: 'default' | 'bare';
}

const props = withDefaults(defineProps<Props>(), {
    disabled: false,
    variant: 'default',
});

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

// ---------- State ----------

const open = ref(false);
const triggerRef = ref<HTMLButtonElement | null>(null);
const panelRef = ref<HTMLDivElement | null>(null);
/** Index of the keyboard-active option (-1 = nothing active). */
const activeIndex = ref(-1);

const panelStyle = ref<{ top: string; left: string; width: string; minWidth: string; maxHeight: string }>(
    { top: '0px', left: '0px', width: 'auto', minWidth: '0px', maxHeight: '320px' },
);

const selectedIndex = computed(() =>
    props.options.findIndex((o) => String(o.value) === String(props.modelValue)),
);

const selectedLabel = computed<string>(() => {
    const i = selectedIndex.value;
    return i >= 0 ? props.options[i]!.label : '';
});

// ---------- Open / close ----------

async function openPanel(): Promise<void> {
    if (props.disabled || open.value) return;
    open.value = true;
    activeIndex.value = selectedIndex.value >= 0 ? selectedIndex.value : 0;
    await nextTick();
    reposition();
    panelRef.value?.focus();
    scrollActiveIntoView();
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

// ---------- Positioning ----------

/**
 * Anchor the panel under the trigger, match its width (with a min so very
 * narrow triggers stay readable), and flip above when below would
 * overflow the viewport.
 */
function reposition(): void {
    const trigger = triggerRef.value;
    const panel = panelRef.value;
    if (!trigger || !panel) return;

    const tRect = trigger.getBoundingClientRect();
    const pad = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const panelHeight = Math.min(panel.scrollHeight, 320);
    const spaceBelow = vh - tRect.bottom - pad;
    const spaceAbove = tRect.top - pad;
    const placeAbove = spaceBelow < panelHeight && spaceAbove > spaceBelow;

    const top = placeAbove
        ? Math.max(pad, tRect.top - panelHeight - 4)
        : Math.min(vh - panelHeight - pad, tRect.bottom + 4);

    const width = Math.max(tRect.width, 160);
    const left = Math.max(pad, Math.min(tRect.left, vw - width - pad));

    panelStyle.value = {
        top: `${top}px`,
        left: `${left}px`,
        width: `${width}px`,
        minWidth: `${tRect.width}px`,
        maxHeight: `${Math.max(120, placeAbove ? spaceAbove : spaceBelow)}px`,
    };
}

function scrollActiveIntoView(): void {
    const panel = panelRef.value;
    if (!panel) return;
    const el = panel.querySelector<HTMLElement>(`[data-index="${activeIndex.value}"]`);
    el?.scrollIntoView({ block: 'nearest' });
}

// ---------- Selection ----------

function selectAt(index: number): void {
    const opt = props.options[index];
    if (!opt) return;
    emit('update:modelValue', String(opt.value));
    closePanel();
}

// ---------- Keyboard ----------

function moveActive(delta: number): void {
    const n = props.options.length;
    if (n === 0) return;
    let next = activeIndex.value + delta;
    if (next < 0) next = n - 1;
    if (next >= n) next = 0;
    activeIndex.value = next;
    void nextTick(scrollActiveIntoView);
}

function onTriggerKeydown(e: KeyboardEvent): void {
    if (props.disabled) return;
    switch (e.key) {
        case 'Enter':
        case ' ':
        case 'ArrowDown':
        case 'ArrowUp':
            e.preventDefault();
            void openPanel();
            break;
    }
}

function onPanelKeydown(e: KeyboardEvent): void {
    switch (e.key) {
        case 'ArrowDown': e.preventDefault(); moveActive(1); break;
        case 'ArrowUp': e.preventDefault(); moveActive(-1); break;
        case 'Home': e.preventDefault(); activeIndex.value = 0; scrollActiveIntoView(); break;
        case 'End': e.preventDefault(); activeIndex.value = props.options.length - 1; scrollActiveIntoView(); break;
        case 'Enter':
        case ' ':
            e.preventDefault();
            if (activeIndex.value >= 0) selectAt(activeIndex.value);
            break;
        case 'Escape':
            e.preventDefault();
            closePanel();
            break;
        case 'Tab':
            closePanel();
            break;
        default:
            handleTypeahead(e);
    }
}

// ---------- Typeahead ----------

let typeBuffer = '';
let typeTimer: number | null = null;

function handleTypeahead(e: KeyboardEvent): void {
    if (e.key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey) return;
    typeBuffer += e.key.toLowerCase();
    if (typeTimer !== null) window.clearTimeout(typeTimer);
    typeTimer = window.setTimeout(() => { typeBuffer = ''; typeTimer = null; }, 700);
    const start = activeIndex.value < 0 ? 0 : activeIndex.value;
    const n = props.options.length;
    for (let off = 0; off < n; off++) {
        const idx = (start + off) % n;
        if (props.options[idx]!.label.toLowerCase().startsWith(typeBuffer)) {
            activeIndex.value = idx;
            scrollActiveIntoView();
            return;
        }
    }
}

// ---------- Outside-click + scroll/resize re-anchor ----------

function onDocPointerDown(e: PointerEvent): void {
    if (!open.value) return;
    const target = e.target as Node | null;
    if (!target) return;
    if (triggerRef.value?.contains(target)) return;
    if (panelRef.value?.contains(target)) return;
    closePanel();
}

function onWindowReposition(): void {
    if (open.value) reposition();
}

watch(open, (isOpen) => {
    if (isOpen) {
        document.addEventListener('pointerdown', onDocPointerDown, true);
        window.addEventListener('resize', onWindowReposition);
        window.addEventListener('scroll', onWindowReposition, true);
    } else {
        document.removeEventListener('pointerdown', onDocPointerDown, true);
        window.removeEventListener('resize', onWindowReposition);
        window.removeEventListener('scroll', onWindowReposition, true);
    }
});

onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onDocPointerDown, true);
    window.removeEventListener('resize', onWindowReposition);
    window.removeEventListener('scroll', onWindowReposition, true);
    if (typeTimer !== null) window.clearTimeout(typeTimer);
});
</script>

<template>
    <div class="ui-select" :class="[`ui-select--${variant}`, { 'is-disabled': disabled, 'is-open': open }]">
        <button ref="triggerRef" type="button" class="ui-select__trigger" :disabled="disabled" aria-haspopup="listbox"
            :aria-expanded="open" @click="toggle" @keydown="onTriggerKeydown">
            <span class="ui-select__value" :class="{ 'is-placeholder': !selectedLabel }">
                {{ selectedLabel || placeholder || '\u00A0' }}
            </span>
            <Icon class="ui-select__chev" name="chevron-down" :size="12" />
        </button>

        <Teleport to="body">
            <div v-if="open" ref="panelRef" class="ui-select__panel" role="listbox" tabindex="-1" :style="panelStyle"
                @keydown="onPanelKeydown">
                <button v-for="(opt, idx) in options" :key="String(opt.value)" type="button" class="ui-select__option"
                    role="option" :data-index="idx" :aria-selected="String(opt.value) === String(modelValue)" :class="{
                        'is-active': idx === activeIndex,
                        'is-selected': String(opt.value) === String(modelValue),
                    }" @mousemove="activeIndex = idx" @click="selectAt(idx)">
                    <span class="ui-select__option-label">{{ opt.label }}</span>
                    <Icon v-if="String(opt.value) === String(modelValue)" class="ui-select__option-tick" name="check"
                        :size="12" />
                </button>
                <div v-if="options.length === 0" class="ui-select__empty">No options</div>
            </div>
        </Teleport>
    </div>
</template>

<style scoped>
.ui-select {
    position: relative;
    display: inline-flex;
    width: 100%;
}

.ui-select__trigger {
    appearance: none;
    flex: 1;
    width: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    background: var(--bg-elev);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--fg);
    font: inherit;
    font-size: var(--text-base);
    padding: var(--space-3);
    cursor: pointer;
    text-align: left;
    transition:
        border-color var(--duration-fast) var(--ease-standard),
        background-color var(--duration-fast) var(--ease-standard);
}

.ui-select__trigger:hover {
    border-color: var(--border-strong);
}

.ui-select__trigger:focus-visible {
    outline: none;
    border-color: var(--border-strong);
}

.ui-select.is-open .ui-select__trigger {
    border-color: var(--border-strong);
}

.ui-select.is-disabled {
    opacity: 0.5;
}

.ui-select.is-disabled .ui-select__trigger {
    cursor: not-allowed;
}

/* Bare variant — blends into the surrounding row (used inside chips). */
.ui-select--bare .ui-select__trigger {
    background: transparent;
    border-color: transparent;
    padding: var(--space-1) var(--space-2);
    font-size: var(--text-sm);
}

.ui-select--bare .ui-select__trigger:hover,
.ui-select--bare.is-open .ui-select__trigger {
    background: var(--bg-soft);
    border-color: transparent;
}

.ui-select__value {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--fg);
}

.ui-select__value.is-placeholder {
    color: var(--fg-subtle);
}

.ui-select__chev {
    color: var(--fg-subtle);
    flex-shrink: 0;
    transition: transform var(--duration-fast) var(--ease-standard);
}

.ui-select.is-open .ui-select__chev {
    transform: rotate(180deg);
}
</style>

<style>
/**
 * Teleported panel — unscoped because Vue's scoped attribute is bound
 * to the component root, which lives outside <body> after teleport.
 */
.ui-select__panel {
    position: fixed;
    z-index: calc(var(--z-modal) + 1);
    background: var(--bg-elev);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-md, 0 8px 24px rgba(0, 0, 0, 0.35));
    padding: var(--space-1);
    overflow-y: auto;
    outline: none;
    display: flex;
    flex-direction: column;
}

.ui-select__option {
    appearance: none;
    background: transparent;
    border: none;
    color: var(--fg);
    font: inherit;
    font-size: var(--text-base);
    text-align: left;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-xs);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    width: 100%;
}

.ui-select__option:hover,
.ui-select__option.is-active {
    background: var(--bg-soft);
    color: var(--fg-strong);
}

.ui-select__option.is-selected {
    color: var(--fg-strong);
    background: color-mix(in srgb, var(--accent) 14%, transparent);
}

.ui-select__option.is-selected.is-active {
    background: color-mix(in srgb, var(--accent) 22%, transparent);
}

.ui-select__option-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.ui-select__option-tick {
    color: var(--accent);
    flex-shrink: 0;
}

.ui-select__empty {
    padding: var(--space-3);
    color: var(--fg-subtle);
    font-size: var(--text-sm);
    text-align: center;
}
</style>
