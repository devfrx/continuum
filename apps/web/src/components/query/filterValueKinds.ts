import {
  FILTER_OPERATORS,
  type FieldDescriptor,
  type FilterOperatorId,
  type FilterValue,
} from '@continuum/shared';

export function valueKindForField(
  field: Pick<FieldDescriptor, 'dataType'> | null,
  operator: FilterOperatorId,
): FilterValue['kind'] {
  const accepted = FILTER_OPERATORS[operator].valueKinds;
  if (accepted.length === 0) return 'none';
  if (accepted.length === 1) return accepted[0];

  switch (field?.dataType) {
    case 'number':
    case 'progress':
      return accepted.includes('number') ? 'number' : accepted[0];
    case 'date':
      return accepted.includes('date') ? 'date' : accepted[0];
    case 'boolean':
      return accepted.includes('boolean') ? 'boolean' : accepted[0];
    default:
      return accepted[0];
  }
}

export function defaultFilterValueForField(
  field: Pick<FieldDescriptor, 'dataType'> | null,
  operator: FilterOperatorId,
): FilterValue {
  switch (valueKindForField(field, operator)) {
    case 'none':
      return { kind: 'none' };
    case 'string':
      return { kind: 'string', value: '' };
    case 'number':
      return { kind: 'number', value: 0 };
    case 'numberRange':
      return { kind: 'numberRange', from: 0, to: 0 };
    case 'boolean':
      return { kind: 'boolean', value: true };
    case 'date':
      return { kind: 'date', value: '' };
    case 'dateRange':
      return { kind: 'dateRange', from: '', to: '' };
    case 'duration':
      return { kind: 'duration', days: 0 };
    case 'stringList':
      return { kind: 'stringList', values: [] };
  }
}