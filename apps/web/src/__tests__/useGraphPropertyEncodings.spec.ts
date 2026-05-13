import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withHost } from './helpers/withHost';
import { STORAGE_KEYS } from '@/lib/storageKeys';

// Make sure each test starts with a clean module + storage so the
// composable's `readStored()` returns defaults.
type Mod = typeof import('@/composables/query/useGraphPropertyEncodings');

describe('useGraphPropertyEncodings', () => {
  let mod: Mod;

  beforeEach(async () => {
    localStorage.clear();
    vi.resetModules();
    mod = await import('@/composables/query/useGraphPropertyEncodings');
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('defaults to all-null slots', () => {
    const { value: api, unmount } = withHost(() => mod.useGraphPropertyEncodings());
    expect(api.encodings.value).toEqual({ color: null, size: null, badge: null });
    expect(api.requiredPropertyIds.value).toEqual([]);
    expect(api.requiresMetrics.value).toBe(false);
    unmount();
  });

  it('setEncoding updates a single slot in place', () => {
    const { value: api, unmount } = withHost(() => mod.useGraphPropertyEncodings());
    const propId = '11111111-1111-1111-1111-111111111111';
    api.setEncoding('color', { kind: 'property', propertyId: propId });
    expect(api.encodings.value.color).toEqual({ kind: 'property', propertyId: propId });
    expect(api.encodings.value.size).toBeNull();
    expect(api.encodings.value.badge).toBeNull();
    unmount();
  });

  it('requiredPropertyIds reflects only property-kind refs and dedupes them', () => {
    const { value: api, unmount } = withHost(() => mod.useGraphPropertyEncodings());
    const propA = '11111111-1111-1111-1111-111111111111';
    const propB = '22222222-2222-2222-2222-222222222222';
    api.setEncoding('color', { kind: 'property', propertyId: propA });
    api.setEncoding('size', { kind: 'property', propertyId: propA });
    api.setEncoding('badge', { kind: 'property', propertyId: propB });
    expect(api.requiredPropertyIds.value.sort()).toEqual([propA, propB].sort());

    // System refs and graphMetric refs do not contribute property ids.
    api.setEncoding('badge', { kind: 'graphMetric', id: 'degree' });
    expect(api.requiredPropertyIds.value).toEqual([propA]);
    unmount();
  });

  it('requiresMetrics is true when ANY slot references a graphMetric field', () => {
    const { value: api, unmount } = withHost(() => mod.useGraphPropertyEncodings());
    expect(api.requiresMetrics.value).toBe(false);
    api.setEncoding('color', { kind: 'system', id: 'note.title' });
    expect(api.requiresMetrics.value).toBe(false);
    api.setEncoding('size', { kind: 'graphMetric', id: 'inDegree' });
    expect(api.requiresMetrics.value).toBe(true);
    api.setEncoding('size', null);
    expect(api.requiresMetrics.value).toBe(false);
    unmount();
  });

  it('reset() returns to defaults', () => {
    const { value: api, unmount } = withHost(() => mod.useGraphPropertyEncodings());
    api.setEncoding('color', { kind: 'graphMetric', id: 'degree' });
    api.reset();
    expect(api.encodings.value).toEqual({ color: null, size: null, badge: null });
    expect(api.requiresMetrics.value).toBe(false);
    expect(api.requiredPropertyIds.value).toEqual([]);
    // Storage key matches the documented one.
    expect(STORAGE_KEYS.graphEncodings).toBe('continuum.graph.encodings.v1');
    unmount();
  });
});
