<script setup lang="ts">
/**
 * Inline "details" footer for the note page.
 *
 * Replaces the old right sidebar: Linked notes + Backlinks live directly
 * below the editor body, where they belong contextually. Each block is a
 * collapsible disclosure with a count badge and persisted open / closed
 * state (per user, not per note).
 */
import { computed, ref } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import LinkedNotesPanel from './LinkedNotesPanel.vue';
import BacklinksPanel from './BacklinksPanel.vue';
import type { Note } from '@continuum/shared';
import type { BacklinkEntry } from '@/api';

const props = defineProps<{
    note: Note;
    notes: Note[];
    backlinks: BacklinkEntry[];
    backlinksLoading: boolean;
}>();

const emit = defineEmits<{ (e: 'select', id: string): void }>();

type SectionKey = 'linked' | 'backlinks';
const STORAGE_KEY = 'continuum.notesView.footerSections';

interface SectionState {
    linked: boolean;
    backlinks: boolean;
}

const DEFAULT_STATE: SectionState = { linked: true, backlinks: true };

function loadState(): SectionState {
    if (typeof window === 'undefined') return { ...DEFAULT_STATE };
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULT_STATE };
        return { ...DEFAULT_STATE, ...(JSON.parse(raw) as Partial<SectionState>) };
    } catch {
        return { ...DEFAULT_STATE };
    }
}

const sections = ref<SectionState>(loadState());

function toggle(key: SectionKey): void {
    sections.value[key] = !sections.value[key];
    if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sections.value));
    }
}

const linkedCount = computed(() => {
    const text = props.note.content ?? '';
    if (!text) return 0;
    const matches = text.match(/\[\[([^\]]+)\]\]/g);
    return matches ? new Set(matches).size : 0;
});
const backlinksCount = computed(() => props.backlinks.length);
</script>

<template>
    <footer class="note-footer">
        <section class="block">
            <button type="button" class="block__head" :aria-expanded="sections.linked" @click="toggle('linked')">
                <Icon name="connection" :size="13" class="block__icon" />
                <span class="block__title">Linked notes</span>
                <span v-if="linkedCount" class="block__count">{{ linkedCount }}</span>
                <Icon name="chevron-down" :size="12" class="block__chev" :class="{ 'is-open': sections.linked }" />
            </button>
            <div v-if="sections.linked" class="block__body">
                <LinkedNotesPanel :content="note.content" :notes="notes" @select="emit('select', $event)" />
            </div>
        </section>

        <section class="block">
            <button type="button" class="block__head" :aria-expanded="sections.backlinks" @click="toggle('backlinks')">
                <Icon name="prop-relation" :size="13" class="block__icon" />
                <span class="block__title">Backlinks</span>
                <span v-if="backlinksCount" class="block__count">{{ backlinksCount }}</span>
                <Icon name="chevron-down" :size="12" class="block__chev" :class="{ 'is-open': sections.backlinks }" />
            </button>
            <div v-if="sections.backlinks" class="block__body">
                <BacklinksPanel :backlinks="backlinks" :loading="backlinksLoading"
                    @select="emit('select', $event)" />
            </div>
        </section>
    </footer>
</template>

<style scoped>
.note-footer {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding-top: var(--space-5);
    margin-top: var(--space-2);
    border-top: var(--border-width-1) solid var(--border);
}

.block {
    display: flex;
    flex-direction: column;
}

.block__head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    background: transparent;
    border: none;
    color: var(--fg-muted);
    cursor: pointer;
    padding: var(--space-2) var(--space-3);
    margin-left: calc(var(--space-3) * -1);
    border-radius: var(--radius-sm);
    text-align: left;
    font-size: var(--text-xs);
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    transition: background var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard);
}

.block__head:hover {
    background: var(--bg-soft);
    color: var(--fg);
}

.block__icon {
    color: var(--fg-subtle);
    flex-shrink: 0;
}

.block__title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.block__count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 16px;
    padding: 0 5px;
    background: var(--bg-soft);
    border-radius: var(--radius-pill, 999px);
    color: var(--fg-muted);
    font-size: 10px;
    font-weight: var(--font-weight-medium);
    letter-spacing: 0;
    text-transform: none;
    flex-shrink: 0;
}

.block__chev {
    color: var(--fg-subtle);
    flex-shrink: 0;
    transform: rotate(-90deg);
    transition: transform var(--duration-fast) var(--ease-standard);
}

.block__chev.is-open {
    transform: rotate(0deg);
}

.block__body {
    padding: var(--space-2) 0 var(--space-2);
}
</style>
