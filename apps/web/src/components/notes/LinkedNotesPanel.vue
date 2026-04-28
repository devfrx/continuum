<script setup lang="ts">
import { computed } from 'vue';
import { colorForKind } from '@continuum/graph';
import { UiSection, UiChip, UiEmpty } from '@/components/ui';
import type { Note } from '@continuum/shared';

const props = defineProps<{
    content: string;
    notes: Note[];
}>();

const emit = defineEmits<{ (e: 'select', id: string): void }>();

const WIKILINK_RE = /\[\[([^\]\n|]+)(?:\|[^\]]*)?\]\]/g;

interface LinkRef {
    name: string;
    note: Note | null;
}

const links = computed<LinkRef[]>(() => {
    const text = props.content || '';
    const seen = new Set<string>();
    const out: string[] = [];
    let m: RegExpExecArray | null;
    WIKILINK_RE.lastIndex = 0;
    while ((m = WIKILINK_RE.exec(text)) !== null) {
        const name = m[1].trim();
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(name);
    }
    const byTitle = new Map(props.notes.map((n) => [n.title.toLowerCase(), n]));
    return out.map((name) => ({ name, note: byTitle.get(name.toLowerCase()) ?? null }));
});
</script>

<template>
    <UiSection title="Linked notes">
        <div v-if="links.length" class="chip-row">
            <UiChip v-for="l in links" :key="l.name" :tone="l.note ? 'accent' : 'neutral'"
                :class="['chip', { clickable: !!l.note, unresolved: !l.note }]"
                @click="l.note && emit('select', l.note.id)">
                <template #icon>
                    <span class="dot" :style="{ background: colorForKind(l.note?.kind ?? 'custom') }" />
                </template>
                {{ l.note ? l.name : `${l.name} (no match)` }}
            </UiChip>
        </div>
        <UiEmpty v-else title="No outgoing wikilinks"
            description="Wrap a phrase in [[Note Title]] to link to another note." />
    </UiSection>
</template>

<style scoped>
.chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
}

.chip.clickable {
    cursor: pointer;
}

.chip.unresolved {
    font-style: italic;
    opacity: 0.75;
}

.dot {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-circle);
    display: inline-block;
}
</style>
