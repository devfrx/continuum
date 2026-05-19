<script setup lang="ts">
/**
 * PropertyGroupSection — collapsible header + slotted body used by the
 * properties panel to visually segment definitions by their source
 * (Private, or one section per database the note belongs to).
 *
 * Stays presentational on purpose: it knows nothing about properties,
 * notes or databases. The parent owns the entries, the labels and the
 * open/closed state — the section just renders a chevron header, a
 * label, an optional badge count and toggles `open` on click.
 *
 * Accessibility
 * ─────────────
 * Header is a real `<button>` with `aria-expanded` so screen readers
 * announce the collapsed state correctly. The body uses `aria-hidden`
 * and `hidden` (rather than `display: none` via CSS) so assistive tech
 * skips it when collapsed.
 */
import Icon from '@/components/ui/Icon.vue';
import type { AppIconName } from '@/assets/icons';

const props = withDefaults(defineProps<{
    /** Section label (e.g. "Private", or the database title). */
    label: string;
    /** Optional leading icon — defaults to a section glyph per group kind. */
    icon?: AppIconName;
    /** Number badge shown next to the label (omit to hide). */
    count?: number | null;
    /** Controlled open state. */
    open: boolean;
}>(), {
    icon: undefined,
    count: null,
});

const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>();

function toggle(): void {
    emit('update:open', !props.open);
}
</script>

<template>
    <section class="pp-group" :class="{ 'is-open': open }">
        <button
            type="button"
            class="pp-group__head"
            :aria-expanded="open"
            @click="toggle"
        >
            <Icon
                name="chevron-right"
                :size="12"
                class="pp-group__chevron"
                :class="{ 'is-open': open }"
            />
            <Icon v-if="icon" :name="icon" :size="12" class="pp-group__icon" />
            <span class="pp-group__label">{{ label }}</span>
            <span v-if="count !== null && count !== undefined" class="pp-group__count">{{ count }}</span>
        </button>
        <div v-show="open" class="pp-group__body" :aria-hidden="!open">
            <slot />
        </div>
    </section>
</template>

<style scoped>
.pp-group {
    display: flex;
    flex-direction: column;
    gap: 0;
}

.pp-group__head {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: 4px 6px;
    margin: 0;
    background: transparent;
    border: none;
    border-radius: var(--radius-xs);
    color: var(--fg-subtle);
    font-size: var(--text-xs);
    font-weight: var(--font-weight-medium);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    cursor: pointer;
    align-self: flex-start;
    transition: color var(--duration-fast, 120ms) var(--ease-standard, ease),
        background-color var(--duration-fast, 120ms) var(--ease-standard, ease);
}

.pp-group__head:hover {
    color: var(--fg-muted);
    background: var(--surface-hover, rgba(0, 0, 0, 0.04));
}

.pp-group__chevron {
    transition: transform var(--duration-fast, 120ms) var(--ease-standard, ease);
}

.pp-group__chevron.is-open {
    transform: rotate(90deg);
}

.pp-group__icon {
    opacity: 0.7;
}

.pp-group__label {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
}

.pp-group__count {
    margin-left: var(--space-1);
    padding: 0 6px;
    border-radius: 999px;
    background: var(--surface-2, rgba(0, 0, 0, 0.06));
    color: var(--fg-muted);
    font-size: 10px;
    line-height: 16px;
    font-weight: var(--font-weight-medium);
    letter-spacing: 0;
    text-transform: none;
}

.pp-group__body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-left: var(--space-3);
    margin-top: 2px;
}
</style>
