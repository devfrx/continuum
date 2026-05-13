import { sql, type SQL } from 'drizzle-orm';

export function textArray(values: readonly string[]): SQL {
  return sql`ARRAY[${sql.join(values.map((value) => sql`${value}`), sql`, `)}]::text[]`;
}

export function jsonbStringArray(values: readonly string[]): SQL {
  return sql`${JSON.stringify(values)}::jsonb`;
}