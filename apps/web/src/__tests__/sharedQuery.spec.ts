import { describe, expect, it } from 'vitest';
import {
  COMPUTED_PROPERTY_TYPES,
  EMPTY_FILTER_GROUP,
  FILTER_OPERATORS,
  PROPERTY_TYPES,
  PROPERTY_TYPE_CAPABILITIES,
  fieldRefKey,
  isFilterEmpty,
  parseFieldRefKey,
  type FilterCondition,
} from '@continuum/shared';
import {
  defaultFilterValueForField,
  valueKindForField,
} from '@/components/query/filterValueKinds';

describe('PROPERTY_TYPE_CAPABILITIES', () => {
  it('has an entry for every PROPERTY_TYPES value', () => {
    for (const type of PROPERTY_TYPES) {
      expect(PROPERTY_TYPE_CAPABILITIES[type]).toBeDefined();
    }
    // And no extras.
    expect(Object.keys(PROPERTY_TYPE_CAPABILITIES).sort()).toEqual(
      [...PROPERTY_TYPES].sort(),
    );
  });

  it('marks every COMPUTED_PROPERTY_TYPES entry as computed:true', () => {
    for (const type of COMPUTED_PROPERTY_TYPES) {
      expect(PROPERTY_TYPE_CAPABILITIES[type].computed).toBe(true);
    }
  });

  it('only relation has edgeSource:true', () => {
    const edgeSources = PROPERTY_TYPES.filter(
      (t) => PROPERTY_TYPE_CAPABILITIES[t].edgeSource,
    );
    expect(edgeSources).toEqual(['relation']);
  });

  it('hasOptions is true exactly for select / multiSelect / status / relation', () => {
    const optioned = PROPERTY_TYPES.filter(
      (t) => PROPERTY_TYPE_CAPABILITIES[t].hasOptions,
    );
    expect(optioned.sort()).toEqual(
      ['multiSelect', 'relation', 'select', 'status'].sort(),
    );
  });

  it('operator sets are non-empty for non-button types and empty for button', () => {
    for (const type of PROPERTY_TYPES) {
      const ops = PROPERTY_TYPE_CAPABILITIES[type].operators;
      if (type === 'button') {
        expect(ops).toEqual([]);
      } else {
        expect(ops.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('fieldRefKey / parseFieldRefKey', () => {
  it('round-trips a system ref', () => {
    const ref = { kind: 'system' as const, id: 'note.title' as const };
    const key = fieldRefKey(ref);
    expect(key).toBe('sys:note.title');
    expect(parseFieldRefKey(key)).toEqual(ref);
  });

  it('round-trips a property ref', () => {
    const ref = {
      kind: 'property' as const,
      propertyId: '11111111-1111-1111-1111-111111111111',
    };
    const key = fieldRefKey(ref);
    expect(key).toBe('prop:11111111-1111-1111-1111-111111111111');
    expect(parseFieldRefKey(key)).toEqual(ref);
  });

  it('round-trips a graphMetric ref', () => {
    const ref = { kind: 'graphMetric' as const, id: 'degree' as const };
    const key = fieldRefKey(ref);
    expect(key).toBe('metric:degree');
    expect(parseFieldRefKey(key)).toEqual(ref);
  });

  it('returns null for malformed input', () => {
    expect(parseFieldRefKey('garbage')).toBeNull();
    expect(parseFieldRefKey('')).toBeNull();
    expect(parseFieldRefKey(':foo')).toBeNull();
    expect(parseFieldRefKey('sys:')).toBeNull();
    expect(parseFieldRefKey('unknown:foo')).toBeNull();
  });

  it('rejects property refs whose payload is not a UUID', () => {
    expect(parseFieldRefKey('prop:not-a-uuid')).toBeNull();
  });
});

describe('filter helpers', () => {
  it('EMPTY_FILTER_GROUP has zero children and is reported as empty', () => {
    expect(EMPTY_FILTER_GROUP.type).toBe('group');
    expect(EMPTY_FILTER_GROUP.children).toEqual([]);
    expect(isFilterEmpty(EMPTY_FILTER_GROUP)).toBe(true);
  });

  it('isFilterEmpty returns false when at least one condition exists', () => {
    const cond: FilterCondition = {
      type: 'condition',
      id: 'c1',
      field: { kind: 'system', id: 'note.title' },
      operator: 'isNotEmpty',
      value: { kind: 'none' },
    };
    expect(
      isFilterEmpty({
        type: 'group',
        id: 'r',
        combinator: 'and',
        children: [cond],
      }),
    ).toBe(false);
  });

  it('isFilterEmpty treats nested empty groups as empty', () => {
    expect(
      isFilterEmpty({
        type: 'group',
        id: 'r',
        combinator: 'and',
        children: [
          { type: 'group', id: 'g1', combinator: 'or', children: [] },
          {
            type: 'group',
            id: 'g2',
            combinator: 'and',
            children: [
              { type: 'group', id: 'g3', combinator: 'and', children: [] },
            ],
          },
        ],
      }),
    ).toBe(true);
  });

  it('FILTER_OPERATORS.eq.valueKinds matches the contract shipped in filters.ts', () => {
    expect(FILTER_OPERATORS.eq.valueKinds).toEqual([
      'string',
      'number',
      'boolean',
      'date',
    ]);
  });

  it('unary operators (isEmpty / today) accept only the "none" value kind', () => {
    expect(FILTER_OPERATORS.isEmpty.valueKinds).toEqual(['none']);
    expect(FILTER_OPERATORS.today.valueKinds).toEqual(['none']);
  });
});

describe('field-aware filter value kinds', () => {
  it('chooses numeric values for polymorphic equality on numeric fields', () => {
    const field = { dataType: 'number' } as const;
    expect(valueKindForField(field, 'eq')).toBe('number');
    expect(defaultFilterValueForField(field, 'eq')).toEqual({ kind: 'number', value: 0 });
  });

  it('chooses date values for polymorphic equality on date fields', () => {
    const field = { dataType: 'date' } as const;
    expect(valueKindForField(field, 'neq')).toBe('date');
    expect(defaultFilterValueForField(field, 'neq')).toEqual({ kind: 'date', value: '' });
  });

  it('keeps select and unique id equality string-based', () => {
    expect(valueKindForField({ dataType: 'select' }, 'eq')).toBe('string');
    expect(valueKindForField({ dataType: 'uniqueId' }, 'eq')).toBe('string');
  });
});
