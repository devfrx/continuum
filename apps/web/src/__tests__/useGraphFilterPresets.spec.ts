import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withHost } from './helpers/withHost';
import { STORAGE_KEYS } from '@/lib/storageKeys';
import type { GraphFilterPresetPayload } from '@/composables/graph/useGraphFilterPresets';

function payload(title: string): GraphFilterPresetPayload {
  return {
    filterRoot: {
      type: 'group',
      id: 'root',
      combinator: 'and',
      children: [
        {
          type: 'condition',
          id: 'c1',
          field: { kind: 'system', id: 'note.title' },
          operator: 'contains',
          value: { kind: 'string', value: title },
        },
      ],
    },
    edgeSources: {
      includeLinks: true,
      allRelationProperties: false,
      relationPropertyIds: ['rel-1'],
    },
    encodings: {
      color: { kind: 'graphMetric', id: 'degree' },
      size: null,
      badge: null,
    },
    filters: {
      hideOrphans: true,
      monochrome: false,
      arrows: true,
      labelFadeThreshold: 0.4,
      showNodeLabels: true,
      showNodeIcons: false,
      nodeSizeMultiplier: 1.2,
      edgeSizeMultiplier: 1.1,
      centerForce: 0.1,
      repelForce: -420,
      linkForce: 0.6,
      linkDistance: 160,
      solidNodes: true,
      lodEnabled: true,
    },
    searchQuery: title,
  };
}

type Mod = typeof import('@/composables/graph/useGraphFilterPresets');

describe('useGraphFilterPresets', () => {
  let mod: Mod;

  beforeEach(async () => {
    localStorage.clear();
    vi.resetModules();
    mod = await import('@/composables/graph/useGraphFilterPresets');
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('creates and restores saved presets from localStorage', async () => {
    const { value: first, unmount: unmountFirst } = withHost(() => mod.useGraphFilterPresets());
    const created = first.createPreset('Lavoro', payload('task'));
    expect(created?.name).toBe('Lavoro');
    expect(first.presets.value).toHaveLength(1);
    expect(localStorage.getItem(STORAGE_KEYS.graphFilterPresets)).toBeTruthy();
    unmountFirst();

    vi.resetModules();
    mod = await import('@/composables/graph/useGraphFilterPresets');
    const { value: second, unmount: unmountSecond } = withHost(() => mod.useGraphFilterPresets());
    expect(second.presets.value).toHaveLength(1);
    expect(second.presets.value[0].payload.searchQuery).toBe('task');
    expect(second.presets.value[0].payload.edgeSources.relationPropertyIds).toEqual(['rel-1']);
    unmountSecond();
  });

  it('updates and removes presets without mutating the captured payload by reference', () => {
    const { value: api, unmount } = withHost(() => mod.useGraphFilterPresets());
    const original = payload('alpha');
    const created = api.createPreset('Alpha', original);
    expect(created).not.toBeNull();
    original.searchQuery = 'changed-after-save';
    expect(api.presets.value[0].payload.searchQuery).toBe('alpha');

    const updated = api.updatePreset(api.presets.value[0].id, payload('beta'));
    expect(updated?.payload.searchQuery).toBe('beta');
    expect(api.presets.value[0].payload.searchQuery).toBe('beta');

    api.removePreset(api.presets.value[0].id);
    expect(api.presets.value).toEqual([]);
    unmount();
  });

  it('ignores malformed stored presets', () => {
    localStorage.setItem(
      STORAGE_KEYS.graphFilterPresets,
      JSON.stringify([{ id: '', name: 'Broken' }, { id: 'ok', name: '', payload: {} }]),
    );
    const { value: api, unmount } = withHost(() => mod.useGraphFilterPresets());
    expect(api.presets.value).toEqual([]);
    unmount();
  });
});
