<script setup lang="ts">
import { computed } from 'vue';
import { colorForKind, getWikilinkPattern } from '@continuum/shared';
import { UiSection, UiChip, UiEmpty } from '@/components/ui';
import { graphDisplayLabel } from '@/utils/graphLabels';
import type { Note } from '@continuum/shared';

const props = defineProps<{
    content: string;
    notes: Note[];
}>();

const emit = defineEmits<{ (e: 'select', id: string): void }>();

interface LinkRef {
    name: string;
    note: Note | null;
}

function parseWikilink(payload: string): { target: string; label: string } | null {
    const separator = payload.indexOf('|');
    const target = (separator >= 0 ? payload.slice(0, separator) : payload).trim();
    const label = (separator >= 0 ? payload.slice(separator + 1) : target).trim();
    if (!target) return null;
    return { target, label: label || target };
}

const links = computed<LinkRef[]>(() => {
    const text = props.content || '';
    const seen = new Set<string>();
    const out: Array<{ target: string; label: string }> = [];
    const pattern = getWikilinkPattern();
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
        if (m[1]) continue;
        const parsed = parseWikilink(m[2] ?? '');
        if (!parsed) continue;
        const key = parsed.target.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(parsed);
    }
    const byTitle = new Map(props.notes.map((n) => [n.title.toLowerCase(), n]));
    return out.map(({ target, label }) => {
        const note = byTitle.get(target.toLowerCase()) ?? null;
        return { name: graphDisplayLabel(note?.title ?? label, 42), note };
    });
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
