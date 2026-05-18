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
    expect(api.requiredPropertyKeys.value).toEqual([]);
    expect(api.requiresMetrics.value).toBe(false);
    unmount();
  });

  it('setEncoding updates a single slot in place', () => {
    const { value: api, unmount } = withHost(() => mod.useGraphPropertyEncodings());
    const propKey = 'priority';
    api.setEncoding('color', { kind: 'property', key: propKey });
    expect(api.encodings.value.color).toEqual({ kind: 'property', key: propKey });
    expect(api.encodings.value.size).toBeNull();
    expect(api.encodings.value.badge).toBeNull();
    unmount();
  });

  it('requiredPropertyKeys reflects only property-kind refs and dedupes them', () => {
    const { value: api, unmount } = withHost(() => mod.useGraphPropertyEncodings());
    const propA = 'priority';
    const propB = 'status';
    api.setEncoding('color', { kind: 'property', key: propA });
    api.setEncoding('size', { kind: 'property', key: propA });
    api.setEncoding('badge', { kind: 'property', key: propB });
    expect(api.requiredPropertyKeys.value.sort()).toEqual([propA, propB].sort());

    // System refs and graphMetric refs do not contribute property keys.
    api.setEncoding('badge', { kind: 'graphMetric', id: 'degree' });
    expect(api.requiredPropertyKeys.value).toEqual([propA]);
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
    expect(api.requiredPropertyKeys.value).toEqual([]);
    // Storage key matches the documented one.
    expect(STORAGE_KEYS.graphEncodings).toBe('continuum.graph.encodings.v1');
    unmount();
  });
});
