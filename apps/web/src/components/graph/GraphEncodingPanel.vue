<script setup lang="ts">
/**
 * GraphEncodingPanel — three rows mapping graph visual channels
 * (Color · Dimensione · Badge) to a property/metric `FieldRef` each.
 *
 * The panel is purely presentational over `useGraphPropertyEncodings`,
 * which owns persistence and the derived `requiredPropertyKeys` /
 * `requiresMetrics` flags consumed by `useGraphQuery`.
 */
import { computed, inject } from 'vue';
import type {
    FieldDataType,
    FieldDescriptor,
    FieldRef,
    GraphNode,
    PropertyValue,
    SystemFieldId,
} from '@continuum/shared';
import Icon from '@/components/ui/Icon.vue';
import UiButton from '@/components/ui/UiButton.vue';
import { GRAPH_PROPERTY_ENCODINGS_KEY, GRAPH_QUERY_KEY } from '@/components/query/graphQueryInjection';
import FieldPicker from '@/components/query/FieldPicker.vue';

const injectedEncodings = inject(GRAPH_PROPERTY_ENCODINGS_KEY);
if (!injectedEncodings) {
    throw new Error('GraphEncodingPanel: GRAPH_PROPERTY_ENCODINGS_KEY not provided. Wrap inside <GraphView>.');
}
const encodings: NonNullable<typeof injectedEncodings> = injectedEncodings;

const query = inject(GRAPH_QUERY_KEY, null);

type Channel = 'color' | 'size' | 'badge';

interface ChannelConfig {
    id: Channel;
    label: string;
    icon: string;
    description: string;
}

const CHANNELS: ChannelConfig[] = [
    { id: 'color', label: 'Colore', icon: 'palette', description: 'Tinta del nodo' },
    { id: 'size', label: 'Dimensione', icon: 'circle', description: 'Raggio del nodo' },
    { id: 'badge', label: 'Badge', icon: 'sparkles', description: 'Marcatore in alto a destra' },
];

const COLOR_TYPES = new Set<FieldDataType>([
    'number',
    'progress',
    'select',
    'multiSelect',
    'status',
    'relation',
    'boolean',
    'verification',
]);
const SIZE_TYPES = new Set<FieldDataType>(['number', 'progress']);
const COLOR_SYSTEM_FIELDS = new Set<SystemFieldId>(['note.folderId', 'note.tags']);
const BADGE_SYSTEM_FIELDS = new Set<SystemFieldId>(['note.folderId', 'note.tags', 'note.locked']);

interface CoverageInfo {
    label: string;
    tone: 'empty' | 'partial' | 'full';
}

function valueOf(channel: Channel): FieldRef | null {
    return encodings.encodings.value[channel];
}

function setChannel(channel: Channel, ref: FieldRef | null): void {
    encodings.setEncoding(channel, ref);
}

function fieldAllowedFor(channel: Channel, field: FieldDescriptor): boolean {
    if (channel === 'color') {
        if (field.ref.kind === 'graphMetric') return true;
        if (field.ref.kind === 'system') return COLOR_SYSTEM_FIELDS.has(field.ref.id);
        return COLOR_TYPES.has(field.dataType);
    }
    if (channel === 'size') {
        if (field.ref.kind === 'system') return false;
        return SIZE_TYPES.has(field.dataType);
    }
    if (field.ref.kind === 'graphMetric') return true;
    if (field.ref.kind === 'system') return BADGE_SYSTEM_FIELDS.has(field.ref.id);
    return field.ref.kind === 'property';
}

function reset(): void {
    encodings.reset();
}

function propertySnapshot(node: GraphNode, key: string): PropertyValue | null {
    return node.properties?.find((p) => p.key === key)?.value ?? null;
}

function hasPropertyValue(value: PropertyValue | null): boolean {
    if (!value) return false;
    switch (value.type) {
        case 'text':
        case 'longText':
        case 'url':
        case 'email':
        case 'phone':
        case 'createdBy':
        case 'lastEditedBy':
        case 'uniqueId':
            return value.value.trim().length > 0;
        case 'number':
        case 'progress':
            return Number.isFinite(value.value);
        case 'checkbox':
            return true;
        case 'date':
        case 'createdTime':
        case 'lastEditedTime':
            return value.value.trim().length > 0;
        case 'dateRange':
            return value.value.from.trim().length > 0 || value.value.to.trim().length > 0;
        case 'select':
        case 'status':
            return value.value.length > 0;
        case 'multiSelect':
        case 'relation':
        case 'files':
            return value.value.length > 0;
        case 'rollup':
        case 'formula':
            return value.value !== null;
        case 'verification':
            return value.state.length > 0;
        case 'button':
            return false;
    }
}

function hasSystemValue(node: GraphNode, ref: Extract<FieldRef, { kind: 'system' }>): boolean {
    switch (ref.id) {
        case 'note.title':
            return node.label.trim().length > 0;
        case 'note.kind':
            return node.kind.length > 0;
        case 'note.folderId':
            return Boolean(node.folderId);
        case 'note.locked':
            return Boolean(node.locked);
        case 'note.createdAt':
            return Boolean(node.createdAt);
        case 'note.updatedAt':
            return Boolean(node.updatedAt);
        case 'note.tags':
            return (node.tags?.length ?? 0) > 0;
    }
}

function hasEncodingValue(node: GraphNode, ref: FieldRef): boolean {
    if (ref.kind === 'system') return hasSystemValue(node, ref);
    if (ref.kind === 'graphMetric') {
        const value = node.metrics?.[ref.id];
        return typeof value === 'number' && Number.isFinite(value);
    }
    if (ref.kind === 'property') return hasPropertyValue(propertySnapshot(node, ref.key));
    return false;
}

const coverageByChannel = computed<Record<Channel, CoverageInfo | null>>(() => {
    const nodes = query?.payload.value?.nodes ?? [];
    const total = nodes.length;
    const out: Record<Channel, CoverageInfo | null> = { color: null, size: null, badge: null };
    if (total === 0) return out;

    for (const channel of ['color', 'size', 'badge'] as const) {
        const ref = valueOf(channel);
        if (!ref) continue;
        const affected = nodes.filter((node) => hasEncodingValue(node, ref)).length;
        out[channel] = {
            label: `${affected}/${total} nodi`,
            tone: affected === 0 ? 'empty' : affected === total ? 'full' : 'partial',
        };
    }

    return out;
});
</script>

<template>
    <div class="encoding-panel">
        <div class="encoding-panel__head">
            <span class="encoding-panel__title">Codifiche visive</span>
            <UiButton variant="ghost" size="sm" @click="reset">
                <template #icon-left>
                    <Icon name="refresh" :size="12" />
                </template>
                Reset
            </UiButton>
        </div>

        <div class="encoding-panel__rows">
            <div v-for="ch in CHANNELS" :key="ch.id" class="encoding-row">
                <div class="encoding-row__label">
                    <span class="encoding-row__label-main">
                        <Icon :name="ch.icon" :size="14" class="encoding-row__icon" />
                        <span>{{ ch.label }}</span>
                    </span>
                    <span
                        v-if="coverageByChannel[ch.id]"
                        class="encoding-row__coverage"
                        :class="`is-${coverageByChannel[ch.id]?.tone}`"
                    >
                        {{ coverageByChannel[ch.id]?.label }}
                    </span>
                </div>
                <FieldPicker
                    :model-value="valueOf(ch.id)"
                    surface="graph"
                    require-operators
                    :field-filter="(field) => fieldAllowedFor(ch.id, field)"
                    clearable
                    placeholder="Nessuna codifica"
                    @update:model-value="(ref) => setChannel(ch.id, ref)"
                />
            </div>
        </div>
    </div>
</template>

<style scoped>
.encoding-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

.encoding-panel__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
}

.encoding-panel__title {
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    color: var(--fg-muted);
    font-weight: var(--font-weight-semibold);
}

.encoding-panel__rows {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

.encoding-row {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
}

.encoding-row__label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--fg-muted);
}

.encoding-row__label-main {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
}

.encoding-row__icon {
    color: var(--fg-subtle);
}

.encoding-row__coverage {
    flex-shrink: 0;
    padding: 1px var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--bg-soft);
    color: var(--fg-subtle);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
}

.encoding-row__coverage.is-full {
    color: var(--success);
}

.encoding-row__coverage.is-partial {
    color: var(--accent);
}

.encoding-row__coverage.is-empty {
    color: var(--danger);
}
</style>
