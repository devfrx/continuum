import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FieldCatalog, FieldDescriptor } from '@continuum/shared';

const fieldsMock = vi.fn<(surface: 'graph' | 'note') => Promise<FieldCatalog>>();

vi.mock('@/api', () => ({
  api: {
    query: {
      fields: (surface: 'graph' | 'note' = 'graph') => fieldsMock(surface),
    },
  },
}));

function makeCatalog(): FieldCatalog {
  const fields: FieldDescriptor[] = [
    {
      ref: { kind: 'system', id: 'note.title' },
      key: 'sys:note.title',
      label: 'Title',
      group: 'note',
      dataType: 'string',
      operators: ['eq', 'contains'],
    },
    {
      ref: { kind: 'graphMetric', id: 'degree' },
      key: 'metric:degree',
      label: 'Degree',
      group: 'graph',
      dataType: 'number',
      operators: ['gt', 'lt'],
    },
  ];
  return { fields };
}

describe('useFieldCatalog', () => {
  type Mod = typeof import('@/composables/query/useFieldCatalog');
  let mod: Mod;

  beforeEach(async () => {
    vi.resetModules();
    fieldsMock.mockReset();
    mod = await import('@/composables/query/useFieldCatalog');
  });

  afterEach(() => {
    fieldsMock.mockReset();
  });

  it('load(surface) populates the cache and returns the field list', async () => {
    fieldsMock.mockResolvedValueOnce(makeCatalog());
    const api = mod.useFieldCatalog();
    const list = await api.load('graph');
    expect(list).toHaveLength(2);
    expect(api.fields('graph')).toHaveLength(2);
    expect(fieldsMock).toHaveBeenCalledTimes(1);
    expect(fieldsMock).toHaveBeenCalledWith('graph');
  });

  it('second call returns cached fields without re-fetching', async () => {
    fieldsMock.mockResolvedValueOnce(makeCatalog());
    const api = mod.useFieldCatalog();
    await api.load('graph');
    await api.load('graph');
    expect(fieldsMock).toHaveBeenCalledTimes(1);
  });

  it('force=true refetches even when cached', async () => {
    fieldsMock
      .mockResolvedValueOnce(makeCatalog())
      .mockResolvedValueOnce(makeCatalog());
    const api = mod.useFieldCatalog();
    await api.load('graph');
    await api.load('graph', true);
    expect(fieldsMock).toHaveBeenCalledTimes(2);
  });

  it('fields(surface) returns the array; fieldByKey finds by key', async () => {
    fieldsMock.mockResolvedValueOnce(makeCatalog());
    const api = mod.useFieldCatalog();
    await api.load('graph');
    expect(api.fields('graph').map((f) => f.key)).toEqual([
      'sys:note.title',
      'metric:degree',
    ]);
    const found = api.fieldByKey('graph', 'metric:degree');
    expect(found?.label).toBe('Degree');
    expect(api.fieldByKey('graph', 'nope')).toBeNull();
  });

  it('invalidate(surface) clears the cache and the next load refetches', async () => {
    fieldsMock
      .mockResolvedValueOnce(makeCatalog())
      .mockResolvedValueOnce(makeCatalog());
    const api = mod.useFieldCatalog();
    await api.load('graph');
    api.invalidate('graph');
    expect(api.fields('graph')).toEqual([]);
    await api.load('graph');
    expect(fieldsMock).toHaveBeenCalledTimes(2);
  });
});
