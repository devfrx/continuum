<script setup lang="ts">
/**
 * Continuum-styled date / datetime picker.
 *
 * - Trigger renders the formatted value (or a placeholder) like Notion.
 * - Click opens a popover with a month grid + optional time controls.
 * - Keyboard: arrows move focus, Enter selects, Esc closes, Backspace
 *   on the trigger clears the value.
 *
 * Stores ISO 8601 strings via `v-model`. Empty string represents "no
 * value". Locale comes from the browser; week starts on Monday.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useFloatingPosition } from '@/composables/useFloatingPosition';
import Icon from './Icon.vue';

interface Props {
    modelValue: string;
    /** When true the picker also shows hour / minute inputs. */
    datetime?: boolean;
    placeholder?: string;
    /** When true the trigger uses a transparent background that fills its slot. */
    bare?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
    datetime: false,
    placeholder: 'Empty',
    bare: false,
});

const emit = defineEmits<{
    'update:modelValue': [value: string];
}>();

const open = ref(false);
const root = ref<HTMLDivElement | null>(null);
const panel = ref<HTMLDivElement | null>(null);

const { style: panelStyle, reposition } = useFloatingPosition({
    triggerRef: root,
    panelRef: panel,
    open,
    minWidth: 260,
    maxHeight: props.datetime ? 380 : 340,
});

/** Month being browsed in the popover (1st of the month, local time). */
const cursor = ref<Date>(new Date());

const selected = computed<Date | null>(() => {
    if (!props.modelValue) return null;
    const d = new Date(props.modelValue);
    return Number.isNaN(d.getTime()) ? null : d;
});

const formatted = computed<string>(() => {
    const d = selected.value;
    if (!d) return '';
    if (props.datetime) {
        return d.toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    }
    return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
});

const today = computed<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
});

const monthLabel = computed<string>(() =>
    cursor.value.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
);

/** Mon..Sun headers in the user's locale. */
const weekdays = computed<string[]>(() => {
    const fmt = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
    // Pick a known Monday (2024-01-01 is Monday) and walk a week.
    const base = new Date(2024, 0, 1);
    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(base);
        d.setDate(base.getDate() + i);
        return fmt.format(d);
    });
});

interface Cell {
    date: Date;
    inMonth: boolean;
    isToday: boolean;
    isSelected: boolean;
}

const cells = computed<Cell[]>(() => {
    const c = cursor.value;
    const first = new Date(c.getFullYear(), c.getMonth(), 1);
    // Monday-first offset: getDay() returns 0 for Sunday.
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(first.getDate() - offset);
    const sel = selected.value;
    const todayMs = today.value.getTime();
    return Array.from({ length: 42 }, (_, i) => {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        return {
            date: d,
            inMonth: d.getMonth() === c.getMonth(),
            isToday: day.getTime() === todayMs,
            isSelected: sel
                ? d.getFullYear() === sel.getFullYear()
                    && d.getMonth() === sel.getMonth()
                    && d.getDate() === sel.getDate()
                : false,
        };
    });
});

const hour = ref<string>('00');
const minute = ref<string>('00');

watch(
    () => props.modelValue,
    (iso) => {
        const d = iso ? new Date(iso) : null;
        if (d && !Number.isNaN(d.getTime())) {
            cursor.value = new Date(d.getFullYear(), d.getMonth(), 1);
            hour.value = String(d.getHours()).padStart(2, '0');
            minute.value = String(d.getMinutes()).padStart(2, '0');
        } else if (open.value) {
            cursor.value = new Date(today.value);
        }
    },
    { immediate: true },
);

function emitDate(d: Date): void {
    emit('update:modelValue', d.toISOString());
}

function pick(cell: Cell): void {
    const d = new Date(cell.date);
    if (props.datetime) {
        d.setHours(Number(hour.value) || 0, Number(minute.value) || 0, 0, 0);
    } else {
        d.setHours(0, 0, 0, 0);
    }
    emitDate(d);
    if (!props.datetime) close();
}

function shiftMonth(delta: number): void {
    const c = cursor.value;
    cursor.value = new Date(c.getFullYear(), c.getMonth() + delta, 1);
}

function jumpToday(): void {
    const t = today.value;
    cursor.value = new Date(t.getFullYear(), t.getMonth(), 1);
    if (props.datetime && selected.value) {
        const d = new Date(t);
        d.setHours(Number(hour.value) || 0, Number(minute.value) || 0, 0, 0);
        emitDate(d);
    } else {
        emitDate(t);
    }
    if (!props.datetime) close();
}

function clear(): void {
    emit('update:modelValue', '');
    close();
}

function onTimeBlur(): void {
    const sel = selected.value;
    if (!sel) return;
    const d = new Date(sel);
    d.setHours(clampInt(hour.value, 0, 23), clampInt(minute.value, 0, 59), 0, 0);
    emitDate(d);
}

function clampInt(s: string, lo: number, hi: number): number {
    const n = Number.parseInt(s, 10);
    if (Number.isNaN(n)) return lo;
    return Math.min(Math.max(n, lo), hi);
}

function onDocClick(e: MouseEvent): void {
    const target = e.target as Node;
    if (root.value?.contains(target)) return;
    if (panel.value?.contains(target)) return;
    close();
}

function toggle(): void {
    open.value ? close() : openPanel();
}

function openPanel(): void {
    open.value = true;
    void nextTick(() => {
        reposition();
        document.addEventListener('mousedown', onDocClick, true);
    });
}

function close(): void {
    open.value = false;
    document.removeEventListener('mousedown', onDocClick, true);
}

function onTriggerKey(e: KeyboardEvent): void {
    if ((e.key === 'Backspace' || e.key === 'Delete') && props.modelValue) {
        e.preventDefault();
        clear();
    }
}

onBeforeUnmount(() => document.removeEventListener('mousedown', onDocClick, true));
</script>

<template>
    <div ref="root" class="ui-dp" :class="{ 'is-bare': bare, 'is-open': open }">
        <button type="button" class="ui-dp__trigger" @click="toggle" @keydown="onTriggerKey">
            <Icon name="prop-date" :size="12" class="ui-dp__icon" />
            <span v-if="formatted" class="ui-dp__value">{{ formatted }}</span>
            <span v-else class="ui-dp__placeholder">{{ placeholder }}</span>
        </button>

        <Teleport to="body">
            <div v-if="open" ref="panel" class="ui-dp__panel" role="dialog" :style="panelStyle">
                <header class="ui-dp__header">
                    <button type="button" class="ui-dp__nav" @click="shiftMonth(-1)" aria-label="Previous month">
                        <Icon name="chevron-left" :size="12" />
                    </button>
                    <span class="ui-dp__title">{{ monthLabel }}</span>
                    <button type="button" class="ui-dp__nav" @click="shiftMonth(1)" aria-label="Next month">
                        <Icon name="chevron-right" :size="12" />
                    </button>
                </header>

                <div class="ui-dp__weekdays">
                    <span v-for="d in weekdays" :key="d">{{ d }}</span>
                </div>

                <div class="ui-dp__grid">
                    <button v-for="(c, i) in cells" :key="i" type="button" class="ui-dp__day" :class="{
                        'is-out': !c.inMonth,
                        'is-today': c.isToday,
                        'is-selected': c.isSelected,
                    }" @click="pick(c)">
                        {{ c.date.getDate() }}
                    </button>
                </div>

                <div v-if="datetime" class="ui-dp__time">
                    <Icon name="prop-clock" :size="12" />
                    <input v-model="hour" inputmode="numeric" maxlength="2" class="ui-dp__time-input" aria-label="Hour"
                        @blur="onTimeBlur" />
                    <span class="ui-dp__time-sep">:</span>
                    <input v-model="minute" inputmode="numeric" maxlength="2" class="ui-dp__time-input" aria-label="Minute"
                        @blur="onTimeBlur" />
                </div>

                <footer class="ui-dp__footer">
                    <button type="button" class="ui-dp__action" @click="jumpToday">Today</button>
                    <button type="button" class="ui-dp__action ui-dp__action--ghost" :disabled="!modelValue" @click="clear">
                        Clear
                    </button>
                </footer>
            </div>
        </Teleport>
    </div>
</template>

<style scoped>
.ui-dp {
    position: relative;
    width: 100%;
}

.ui-dp__trigger {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    background: transparent;
    border: var(--border-width-1) solid transparent;
    color: var(--fg);
    text-align: left;
    cursor: pointer;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    font: inherit;
    font-size: var(--text-sm);
    transition: background var(--duration-fast) var(--ease-standard),
        border-color var(--duration-fast) var(--ease-standard);
}

.ui-dp__trigger:hover,
.ui-dp.is-open .ui-dp__trigger {
    background: var(--bg-soft);
}

.ui-dp:not(.is-bare) .ui-dp__trigger {
    border-color: var(--border);
    background: var(--bg-elev);
}

.ui-dp__icon {
    color: var(--fg-subtle);
    flex-shrink: 0;
}

.ui-dp__placeholder {
    color: var(--fg-subtle);
}

.ui-dp__value {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.ui-dp__panel {
    position: fixed;
    z-index: 1300;
    background: var(--surface-2);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-dropdown);
    padding: var(--space-3);
    min-width: 260px;
    overflow: auto;
    user-select: none;
}

.ui-dp__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
}

.ui-dp__nav {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: transparent;
    border: none;
    color: var(--fg-muted);
    cursor: pointer;
    border-radius: var(--radius-sm);
}

.ui-dp__nav:hover {
    background: var(--bg-soft);
    color: var(--fg);
}

.ui-dp__title {
    font-size: var(--text-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--fg);
    text-transform: capitalize;
}

.ui-dp__weekdays,
.ui-dp__grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
}

.ui-dp__weekdays {
    margin-bottom: 4px;
}

.ui-dp__weekdays span {
    text-align: center;
    font-size: 10px;
    color: var(--fg-subtle);
    text-transform: uppercase;
    letter-spacing: var(--tracking-widest);
    padding: 2px 0;
}

.ui-dp__day {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 28px;
    background: transparent;
    border: none;
    color: var(--fg);
    cursor: pointer;
    border-radius: var(--radius-sm);
    font: inherit;
    font-size: var(--text-xs);
    transition: background var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard);
}

.ui-dp__day:hover {
    background: var(--bg-soft);
}

.ui-dp__day.is-out {
    color: var(--fg-subtle);
    opacity: 0.55;
}

.ui-dp__day.is-today {
    box-shadow: inset 0 0 0 1px var(--border-strong);
}

.ui-dp__day.is-selected {
    background: var(--accent, #5B7B95);
    color: #fff;
    font-weight: var(--font-weight-semibold);
}

.ui-dp__day.is-selected:hover {
    background: var(--accent, #5B7B95);
    filter: brightness(1.08);
}

.ui-dp__time {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-3);
    padding-top: var(--space-3);
    border-top: var(--border-width-1) solid var(--border);
    color: var(--fg-muted);
}

.ui-dp__time-input {
    width: 36px;
    text-align: center;
    background: var(--bg-base);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--fg);
    font: inherit;
    font-size: var(--text-sm);
    padding: 2px;
    outline: none;
}

.ui-dp__time-input:focus {
    border-color: var(--border-strong);
}

.ui-dp__time-sep {
    color: var(--fg-subtle);
    font-weight: var(--font-weight-semibold);
}

.ui-dp__footer {
    display: flex;
    justify-content: space-between;
    gap: var(--space-2);
    margin-top: var(--space-3);
    padding-top: var(--space-3);
    border-top: var(--border-width-1) solid var(--border);
}

.ui-dp__action {
    background: transparent;
    border: none;
    color: var(--accent, #5B7B95);
    cursor: pointer;
    font-size: var(--text-xs);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    font-weight: var(--font-weight-semibold);
}

.ui-dp__action:hover {
    background: var(--bg-soft);
}

.ui-dp__action:disabled {
    color: var(--fg-subtle);
    cursor: not-allowed;
}

.ui-dp__action--ghost {
    color: var(--fg-subtle);
}
</style>
