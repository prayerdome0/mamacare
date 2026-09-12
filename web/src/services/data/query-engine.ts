import type { QueryFilter, QuerySpec } from '@/types/domain';

/**
 * Query engine shared by the device provider (and used to post-filter Firestore
 * reads where a compound index would otherwise be required). Semantics mirror
 * `where`/`orderBy`/`limit` so both providers behave identically.
 */

const valueOf = (row: Record<string, unknown>, path: string): unknown =>
  path.includes('.')
    ? path.split('.').reduce<unknown>((acc, key) => (acc == null ? undefined : (acc as Record<string, unknown>)[key]), row)
    : row[path];

const comparable = (value: unknown): number | string => {
  if (value === null || value === undefined) return -Infinity;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  return String(value);
};

export function matches(row: unknown, filter: QueryFilter): boolean {
  const record = (row ?? {}) as Record<string, unknown>;
  const value = valueOf(record, filter.field);
  switch (filter.op) {
    case '==':
      return value === filter.value;
    case '!=':
      return value !== filter.value;
    case '>':
      return comparable(value) > comparable(filter.value);
    case '>=':
      return comparable(value) >= comparable(filter.value);
    case '<':
      return comparable(value) < comparable(filter.value);
    case '<=':
      return comparable(value) <= comparable(filter.value);
    case 'in':
      return Array.isArray(filter.value) && filter.value.includes(value as never);
    case 'array-contains':
      return Array.isArray(value) && value.includes(filter.value as never);
    case 'array-contains-any':
      return (
        Array.isArray(value) &&
        Array.isArray(filter.value) &&
        value.some((v) => (filter.value as unknown[]).includes(v))
      );
    default:
      return true;
  }
}

export function matchesAll(row: unknown, filters: QueryFilter[] = []): boolean {
  return filters.every((filter) => matches(row, filter));
}

export function applyQuery<T>(rows: T[], spec: QuerySpec): { rows: T[]; total: number } {
  let out = rows as unknown as Record<string, unknown>[];
  if (spec.where?.length) out = out.filter((row) => spec.where!.every((filter) => matches(row, filter)));
  const total = out.length;
  if (spec.orderBy) {
    const { field, direction } = spec.orderBy;
    const factor = direction === 'desc' ? -1 : 1;
    out = [...out].sort((a, b) => {
      const av = comparable(valueOf(a, field));
      const bv = comparable(valueOf(b, field));
      if (av === bv) return 0;
      return (av > bv ? 1 : -1) * factor;
    });
  }
  const offset = spec.offset ?? 0;
  const limited = spec.limit && spec.limit > 0 ? out.slice(offset, offset + spec.limit) : out.slice(offset);
  return { rows: limited as unknown as T[], total };
}

/**
 * Translates a QuerySpec into a Firestore query description that is safe to run
 * without a custom index: at most one inequality/range filter, equality filters
 * only otherwise. Extra filters are returned for client-side application.
 */
export function splitFilters(filters: QueryFilter[] = []): { indexed: QueryFilter[]; postFilter: QueryFilter[] } {
  const indexed: QueryFilter[] = [];
  const postFilter: QueryFilter[] = [];
  let rangeUsed = false;
  for (const filter of filters) {
    const isRange = filter.op === '>' || filter.op === '>=' || filter.op === '<' || filter.op === '<=';
    if (filter.op === '==' && !rangeUsed) {
      indexed.push(filter);
      continue;
    }
    if (isRange && !rangeUsed) {
      indexed.push(filter);
      rangeUsed = true;
      continue;
    }
    postFilter.push(filter);
  }
  return { indexed, postFilter };
}

/** Firestore cannot combine orderBy on another field with a range filter; keep them aligned. */
export function alignOrderWithFilters(spec: QuerySpec): QuerySpec {
  const range = spec.where?.find((f) => ['>', '>=', '<', '<=', '!='].includes(f.op));
  if (!range || !spec.orderBy || spec.orderBy.field === range.field) return spec;
  return { ...spec, orderBy: { field: range.field, direction: spec.orderBy.direction } };
}
