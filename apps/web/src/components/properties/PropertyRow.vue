<script setup lang="ts">
/**
 * One row in the property panel: label on the left, the type-specific
 * editor on the right. Right-click opens a small context menu (rename /
 * configure / delete). Click on the label opens the same menu — designed
 * to be discoverable without overloading the row.
 */
import { computed, onBeforeUnmount, ref } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import { propertyEditorRegistry } from './editors/registry';
import {
    PROPERTY_TYPE_ICONS,
    type NoteProperty,
    type PropertyOption,
    type PropertyValue,
    type StatusOption,
} from '@continuum/shared';

const props = defineProps<{
    entry: NoteProperty;
    noteId?: string | null;
    readonly?: boolean;
    valueReadonly?: boolean;
    reorderable?: boolean;
    dragActive?: boolean;
    dropTarget?: boolean;
}>();

const emit = defineEmits<{
    'update:value': [value: PropertyValue];
    'select': [id: string];
    'remove': [];
    'reload': [];
    'drag-start': [event: DragEvent];
    'drag-over': [event: DragEvent];
    'drop': [event: DragEvent];
    'drag-end': [];
}>();

const editor = computed(() => propertyEditorRegistry[props.entry.definition.type]);
const valueReadonly = computed(() => props.readonly || props.valueReadonly === true);
const icon = computed(
    () =>
        props.entry.definition.icon ||
        PROPERTY_TYPE_ICONS[props.entry.definition.type] ||
        'circle',
);

const menuOpen = ref(false);
const root = ref<HTMLDivElement | null>(null);

interface ReadonlyChip {
    label: string;
    color?: string;
    id?: string;
}

type ReadonlyDisplay =
    | { kind: 'empty'; text: string }
    | { kind: 'text'; text: string }
    | { kind: 'checkbox'; text: string; checked: boolean }
    | { kind: 'chips'; chips: ReadonlyChip[] }
    | { kind: 'link'; text: string; href: string }
    | { kind: 'relation'; ids: string[] };

function formatDate(value: string): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

function optionsForEntry(): PropertyOption[] {
    const config = props.entry.definition.config;
    if (config.type === 'select' || config.type === 'multiSelect') return config.options;
    if (config.type === 'status') return config.options as StatusOption[];
    return [];
}

function optionChip(id: string): ReadonlyChip {
    const option = optionsForEntry().find((item) => item.id === id);
    return option ? { label: option.label, color: option.color } : { label: id };
}

function urlHref(value: string): string {
    return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function readonlyValue(value: PropertyValue | null): ReadonlyDisplay {
    if (!value) return { kind: 'empty', text: 'Empty' };

    switch (value.type) {
        case 'text':
        case 'longText': {
            const text = value.value.trim();
            return text ? { kind: 'text', text } : { kind: 'empty', text: 'Empty' };
        }
        case 'number': {
            const config = props.entry.definition.config;
            const precision = config.type === 'number' ? config.precision : undefined;
            const unit = config.type === 'number' && config.unit ? ` ${config.unit}` : '';
            const text = typeof precision === 'number'
                ? value.value.toFixed(precision)
                : String(value.value);
            return { kind: 'text', text: `${text}${unit}` };
        }
        case 'date': {
            const text = formatDate(value.value);
            return text ? { kind: 'text', text } : { kind: 'empty', text: 'Empty' };
        }
        case 'dateRange': {
            const from = formatDate(value.value.from);
            const to = formatDate(value.value.to);
            if (!from && !to) return { kind: 'empty', text: 'Empty' };
            return { kind: 'text', text: [from, to].filter(Boolean).join(' to ') };
        }
        case 'checkbox':
            return { kind: 'checkbox', checked: value.value, text: value.value ? 'Yes' : 'No' };
        case 'select':
            return value.value ? { kind: 'chips', chips: [optionChip(value.value)] } : { kind: 'empty', text: 'Empty' };
        case 'multiSelect':
            return value.value.length
                ? { kind: 'chips', chips: value.value.map(optionChip) }
                : { kind: 'empty', text: 'Empty' };
        case 'url': {
            const text = value.value.trim();
            return text ? { kind: 'link', text, href: urlHref(text) } : { kind: 'empty', text: 'Empty' };
        }
        case 'email': {
            const text = value.value.trim();
            return text ? { kind: 'link', text, href: `mailto:${text}` } : { kind: 'empty', text: 'Empty' };
        }
        case 'relation':
            return value.value.length ? { kind: 'relation', ids: value.value } : { kind: 'empty', text: 'Empty' };
        case 'phone': {
            const text = value.value.trim();
            return text ? { kind: 'link', text, href: `tel:${text.replace(/\s+/g, '')}` } : { kind: 'empty', text: 'Empty' };
        }
        case 'status':
            return value.value ? { kind: 'chips', chips: [optionChip(value.value)] } : { kind: 'empty', text: 'Empty' };
        case 'progress':
            return { kind: 'text', text: `${value.value}` };
        case 'verification':
            return value.state === 'verified'
                ? { kind: 'text', text: '✓ Verified' }
                : value.state === 'expired'
                    ? { kind: 'text', text: '⚠ Expired' }
                    : { kind: 'empty', text: 'Not verified' };
        case 'files':
            return value.value.length
                ? { kind: 'chips', chips: value.value.map((f) => ({ label: f.name })) }
                : { kind: 'empty', text: 'Empty' };
        case 'uniqueId':
            return value.value ? { kind: 'text', text: value.value } : { kind: 'empty', text: '—' };
        case 'createdTime':
        case 'lastEditedTime': {
            const text = value.value ? formatDate(value.value) : '';
            return text ? { kind: 'text', text } : { kind: 'empty', text: '—' };
        }
        case 'createdBy':
        case 'lastEditedBy':
            return value.value ? { kind: 'text', text: value.value } : { kind: 'empty', text: '—' };
        case 'formula':
            return value.value === null || value.value === undefined
                ? { kind: 'empty', text: '—' }
                : { kind: 'text', text: String(value.value) };
        case 'rollup':
            return value.value === null || value.value === undefined
                ? { kind: 'empty', text: '—' }
                : { kind: 'text', text: String(value.value) };
        case 'button':
            return { kind: 'empty', text: '—' };
    }
}

const readonlyDisplay = computed<ReadonlyDisplay>(() => readonlyValue(props.entry.value));

function onDocClick(e: MouseEvent): void {
    if (!root.value) return;
    if (!root.value.contains(e.target as Node)) menuOpen.value = false;
}

function toggleMenu(): void {
    if (props.readonly) return;
    menuOpen.value = !menuOpen.value;
    if (menuOpen.value) {
        queueMicrotask(() => document.addEventListener('mousedown', onDocClick));
    } else {
        document.removeEventListener('mousedown', onDocClick);
    }
}

function close(): void {
    menuOpen.value = false;
    document.removeEventListener('mousedown', onDocClick);
}

onBeforeUnmount(() => document.removeEventListener('mousedown', onDocClick));
</script>

<template>
    <div ref="root" class="prop-row" :class="[`prop-row--${entry.definition.type}`, {
        'is-readonly': readonly,
        'is-reorderable': reorderable,
        'is-dragging': dragActive,
        'is-drop-target': dropTarget,
    }]" @dragover="emit('drag-over', $event)" @drop="emit('drop', $event)">
        <button v-if="reorderable" type="button" class="prop-row__drag"
            :aria-label="`Drag ${entry.definition.label} to reorder`" title="Drag to reorder" draggable="true"
            @dragstart.stop="emit('drag-start', $event)" @dragend="emit('drag-end')">
            <Icon name="drag" :size="13" />
        </button>
        <span v-else-if="!readonly" class="prop-row__drag-space" aria-hidden="true" />

        <button v-if="!readonly" type="button" class="prop-row__label"
            :title="entry.definition.description ?? entry.definition.label"
            @click="toggleMenu" @contextmenu.prevent="toggleMenu">
            <Icon :name="icon" :size="13" class="prop-row__icon" />
            <span class="prop-row__name">{{ entry.definition.label }}</span>
        </button>
        <div v-else class="prop-row__label prop-row__label--readonly"
            :title="entry.definition.description ?? entry.definition.label">
            <Icon :name="icon" :size="13" class="prop-row__icon" />
            <span class="prop-row__name">{{ entry.definition.label }}</span>
        </div>
        <div class="prop-row__editor">
            <div v-if="valueReadonly" class="prop-row__readonly" :class="`prop-row__readonly--${entry.definition.type}`">
                <span v-if="readonlyDisplay.kind === 'empty'" class="prop-row__readonly-empty">
                    {{ readonlyDisplay.text }}
                </span>
                <span v-else-if="readonlyDisplay.kind === 'checkbox'" class="prop-row__readonly-check"
                    :class="{ 'is-on': readonlyDisplay.checked }">
                    <Icon :name="readonlyDisplay.checked ? 'check' : 'close'" :size="12" />
                    {{ readonlyDisplay.text }}
                </span>
                <span v-else-if="readonlyDisplay.kind === 'chips'" class="prop-row__readonly-chips">
                    <span v-for="chip in readonlyDisplay.chips" :key="chip.label" class="prop-row__readonly-chip"
                        :style="chip.color ? { background: chip.color } : undefined">
                        {{ chip.label }}
                    </span>
                </span>
                <a v-else-if="readonlyDisplay.kind === 'link'" class="prop-row__readonly-link"
                    :href="readonlyDisplay.href" target="_blank" rel="noreferrer">
                    {{ readonlyDisplay.text }}
                </a>
                <span v-else-if="readonlyDisplay.kind === 'relation'" class="prop-row__readonly-chips">
                    <button v-for="(id, index) in readonlyDisplay.ids" :key="id" type="button"
                        class="prop-row__readonly-relation" @click="emit('select', id)">
                        Linked note {{ index + 1 }}
                    </button>
                </span>
                <span v-else class="prop-row__readonly-text">{{ readonlyDisplay.text }}</span>
            </div>
            <component v-else :is="editor" :value="entry.value" :definition="entry.definition"
                :note-id="noteId"
                @update:value="emit('update:value', $event)"
                @select="emit('select', $event)"
                @reload="emit('reload')" />
        </div>

        <div v-if="menuOpen && !readonly" class="prop-row__menu" role="menu" @click="close">
            <button type="button" class="prop-row__menu-item prop-row__menu-item--danger" role="menuitem"
                @click="emit('remove')">
                <Icon name="trash" :size="12" />
                <span>Delete property</span>
            </button>
        </div>
    </div>
</template>

<style scoped>
.prop-row {
    position: relative;
    display: grid;
    grid-template-columns: 22px minmax(124px, 164px) minmax(0, 1fr);
    align-items: center;
    column-gap: var(--space-2);
    min-height: 36px;
    padding: 0 var(--space-1);
    border: var(--border-width-1) solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    transition:
        background-color var(--duration-fast) var(--ease-standard),
        border-color var(--duration-fast) var(--ease-standard),
        opacity var(--duration-fast) var(--ease-standard),
        transform var(--duration-fast) var(--ease-standard);
}

.prop-row:hover {
    background: color-mix(in srgb, var(--bg-soft) 58%, transparent);
    border-color: color-mix(in srgb, var(--border) 68%, transparent);
}

.prop-row.is-readonly:hover {
    background: transparent;
    border-color: transparent;
}

.prop-row.is-readonly {
    grid-template-columns: minmax(124px, 164px) minmax(0, 1fr);
}

.prop-row.is-dragging {
    opacity: 0.45;
}

.prop-row.is-drop-target {
    border-color: color-mix(in srgb, var(--accent) 58%, transparent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    transform: translateY(1px);
}

.prop-row--text,
.prop-row--longText,
.prop-row--dateRange,
.prop-row--url,
.prop-row--email,
.prop-row--relation,
.prop-row--files,
.prop-row--progress,
.prop-row--button {
    grid-column: 1 / -1;
}

.prop-row__label {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    align-self: center;
    background: transparent;
    border: none;
    color: var(--fg-muted);
    cursor: pointer;
    padding: var(--space-1) var(--space-1);
    border-radius: var(--radius-sm);
    text-align: left;
    font-size: var(--text-xs);
    text-transform: none;
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    transition:
        background-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard);
}

.prop-row__label:hover {
    color: var(--fg);
}

.prop-row__label--readonly {
    cursor: default;
}

.prop-row__label--readonly:hover {
    color: var(--fg-muted);
}

.prop-row__icon {
    color: var(--fg-subtle);
    flex-shrink: 0;
}

.prop-row__drag,
.prop-row__drag-space {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 26px;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
}

.prop-row__drag {
    background: transparent;
    border: none;
    color: var(--fg-subtle);
    cursor: grab;
    padding: 0;
    opacity: 0.72;
    transition:
        background-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard),
        opacity var(--duration-fast) var(--ease-standard);
}

.prop-row__drag:hover,
.prop-row__drag:focus-visible {
    background: var(--bg-soft);
    color: var(--fg);
    opacity: 1;
    outline: none;
}

.prop-row__drag:active {
    cursor: grabbing;
}

.prop-row__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.prop-row__editor {
    min-width: 0;
    width: 100%;
    align-self: center;
}

.prop-row__editor :deep(.prop-editor),
.prop-row__editor :deep(.prop-num),
.prop-row__editor :deep(.prop-date),
.prop-row__editor :deep(.prop-range),
.prop-row__editor :deep(.prop-url),
.prop-row__editor :deep(.prop-email),
.prop-row__editor :deep(.prop-rel),
.prop-row__editor :deep(.prop-sel__trigger),
.prop-row__editor :deep(.prop-ms__trigger) {
    background: transparent;
    border: var(--border-width-1) solid transparent;
    border-radius: var(--radius-sm);
}

.prop-row__editor :deep(.prop-editor:hover),
.prop-row__editor :deep(.prop-editor:focus),
.prop-row__editor :deep(.prop-num:hover),
.prop-row__editor :deep(.prop-num:focus-within),
.prop-row__editor :deep(.prop-date:hover),
.prop-row__editor :deep(.prop-date:focus-within),
.prop-row__editor :deep(.prop-range:hover),
.prop-row__editor :deep(.prop-range:focus-within),
.prop-row__editor :deep(.prop-url:hover),
.prop-row__editor :deep(.prop-url:focus-within),
.prop-row__editor :deep(.prop-email:hover),
.prop-row__editor :deep(.prop-email:focus-within),
.prop-row__editor :deep(.prop-rel:hover),
.prop-row__editor :deep(.prop-sel__trigger:hover),
.prop-row__editor :deep(.prop-sel__trigger:focus),
.prop-row__editor :deep(.prop-ms__trigger:hover),
.prop-row__editor :deep(.prop-ms__trigger:focus) {
    background: var(--bg-soft);
    border-color: color-mix(in srgb, var(--border) 78%, transparent);
}

.prop-row__editor :deep(.prop-sel__panel),
.prop-row__editor :deep(.prop-ms__panel),
.prop-row__editor :deep(.ui-dp__panel) {
    border-color: var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--bg-elev);
    box-shadow: var(--shadow-lg, 0 8px 24px rgba(0, 0, 0, 0.22));
}

.prop-row__readonly {
    min-height: 28px;
    display: flex;
    align-items: center;
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-sm);
    color: var(--fg);
    font-size: var(--text-sm);
    line-height: var(--leading-snug);
}

.prop-row__readonly-text,
.prop-row__readonly-empty,
.prop-row__readonly-link {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
}

.prop-row__readonly-text {
    white-space: pre-wrap;
    word-break: break-word;
}

.prop-row__readonly-empty {
    color: var(--fg-subtle);
    font-size: var(--text-xs);
}

.prop-row__readonly-check {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--fg-muted);
    font-size: var(--text-xs);
    font-weight: var(--font-weight-medium);
}

.prop-row__readonly-check.is-on {
    color: var(--fg);
}

.prop-row__readonly-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    min-width: 0;
}

.prop-row__readonly-chip,
.prop-row__readonly-relation {
    display: inline-flex;
    align-items: center;
    max-width: 180px;
    height: 22px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    font-weight: var(--font-weight-semibold);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.prop-row__readonly-chip {
    color: #fff;
    background: var(--bg-elev);
}

.prop-row__readonly-relation {
    border: var(--border-width-1) solid var(--border);
    background: var(--bg-elev);
    color: var(--fg);
    cursor: pointer;
}

.prop-row__readonly-relation:hover {
    border-color: var(--border-strong);
}

.prop-row__readonly-link {
    color: var(--accent);
    text-decoration: none;
    white-space: nowrap;
}

.prop-row__readonly-link:hover {
    text-decoration: underline;
}

@media (max-width: 760px) {
    .prop-row {
        grid-template-columns: 24px minmax(0, 1fr);
        row-gap: 1px;
        padding: var(--space-1) 0;
    }

    .prop-row__label {
        grid-column: 2;
        align-self: flex-start;
        padding-bottom: 0;
    }

    .prop-row__editor {
        grid-column: 2;
    }

    .prop-row.is-readonly {
        grid-template-columns: minmax(0, 1fr);
    }

    .prop-row.is-readonly .prop-row__label,
    .prop-row.is-readonly .prop-row__editor {
        grid-column: 1;
    }
}

.prop-row__menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 60;
    background: var(--bg-elev);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
    padding: var(--space-1);
    min-width: 160px;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.prop-row__menu-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    background: transparent;
    border: none;
    color: var(--fg);
    text-align: left;
    cursor: pointer;
    padding: var(--space-2);
    font-size: var(--text-xs);
    border-radius: var(--radius-sm);
}

.prop-row__menu-item:hover {
    background: var(--bg-soft);
}

.prop-row__menu-item--danger {
    color: var(--danger, #c66);
}
</style>
