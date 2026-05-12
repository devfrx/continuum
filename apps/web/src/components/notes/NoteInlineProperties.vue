<script setup lang="ts">
/**
 * Inline properties section that lives between the note header and the
 * editor body — replaces the right-sidebar Properties panel.
 *
 * Mirrors the Notion pattern: a compact metadata disclosure that users
 * can collapse when they only want to focus on the body. State is persisted
 * across pages via localStorage.
 */
import { ref } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import PropertyPanel from '../properties/PropertyPanel.vue';

defineProps<{
    noteId: string;
    kindId: string;
    readonly?: boolean;
}>();

const emit = defineEmits<{ (e: 'select', id: string): void }>();

const STORAGE_KEY = 'continuum.notesView.inlinePropertiesOpen';

function loadOpen(): boolean {
    if (typeof window === 'undefined') return true;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return true;
    return raw === '1';
}

const open = ref<boolean>(loadOpen());

function toggle(): void {
    open.value = !open.value;
    if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, open.value ? '1' : '0');
    }
}
</script>

<template>
    <section class="inline-props" :class="{ 'is-open': open, 'is-readonly': readonly }">
        <button type="button" class="inline-props__head" :aria-expanded="open" @click="toggle">
            <Icon name="prop-text" :size="13" class="inline-props__icon" />
            <span class="inline-props__title">Properties</span>
            <span v-if="readonly" class="inline-props__badge">Read only</span>
            <Icon name="chevron-down" :size="12" class="inline-props__chev" :class="{ 'is-open': open }" />
        </button>
        <div v-if="open" class="inline-props__body">
            <PropertyPanel :note-id="noteId" :kind-id="kindId" :readonly="readonly" @select="emit('select', $event)" />
        </div>
    </section>
</template>

<style scoped>
.inline-props {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    width: 100%;
    padding: 0 0 var(--space-2);
}

.inline-props:not(.is-open) {
    padding-bottom: 0;
}

.inline-props.is-readonly {
    opacity: 0.92;
}

.inline-props__head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    align-self: stretch;
    width: 100%;
    min-height: 30px;
    background: transparent;
    border: var(--border-width-1) solid transparent;
    color: var(--fg-muted);
    cursor: pointer;
    padding: var(--space-1) var(--space-2);
    margin-left: 0;
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    text-align: left;
    transition: background var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard);
}

.inline-props__head:hover {
    background: color-mix(in srgb, var(--bg-soft) 72%, transparent);
    border-color: color-mix(in srgb, var(--border) 76%, transparent);
    color: var(--fg);
}

.inline-props.is-open .inline-props__head {
    width: 100%;
    background: color-mix(in srgb, var(--bg-soft) 42%, transparent);
    border-color: color-mix(in srgb, var(--border) 62%, transparent);
}

.inline-props__head:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
}

.inline-props__icon {
    color: var(--fg-subtle);
    flex-shrink: 0;
}

.inline-props__title {
    flex: 1;
    line-height: 1;
}

.inline-props__badge {
    display: inline-flex;
    align-items: center;
    height: 18px;
    padding: 0 var(--space-2);
    border: var(--border-width-1) solid color-mix(in srgb, var(--accent) 28%, transparent);
    border-radius: var(--radius-sm);
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    font-size: var(--text-2xs);
    font-weight: var(--font-weight-semibold);
    text-transform: none;
    letter-spacing: 0;
}

.inline-props__chev {
    color: var(--fg-subtle);
    flex-shrink: 0;
    transform: rotate(-90deg);
    transition: transform var(--duration-fast) var(--ease-standard);
}

.inline-props.is-open .inline-props__chev {
    margin-left: auto;
}

.inline-props__chev.is-open {
    transform: rotate(0deg);
}

.inline-props__body {
    width: 100%;
    box-sizing: border-box;
    padding: var(--space-1) 0 var(--space-1) 28px;
    border-left: var(--border-width-1) solid color-mix(in srgb, var(--border) 72%, transparent);
    margin-left: 0;
}
</style>
