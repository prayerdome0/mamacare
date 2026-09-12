import { describe, expect, it } from 'vitest';
import { alignOrderWithFilters, applyQuery, matches, matchesAll, splitFilters } from './query-engine';

const rows = [
  { id: 'a', facilityId: 'fac-a', riskLevel: 'RED', visitDate: '2026-05-01', weeks: 32, signs: ['HEADACHE', 'BLEEDING'], archived: false },
  { id: 'b', facilityId: 'fac-b', riskLevel: 'GREEN', visitDate: '2026-04-01', weeks: 18, signs: [], archived: false },
  { id: 'c', facilityId: 'fac-a', riskLevel: 'AMBER', visitDate: '2026-06-01', weeks: 27, signs: ['FEVER'], archived: true },
];

describe('query engine', () => {
  it('applies every comparison operator the providers rely on', () => {
    expect(matches(rows[0], { field: 'facilityId', op: '==', value: 'fac-a' })).toBe(true);
    expect(matches(rows[1], { field: 'facilityId', op: '!=', value: 'fac-a' })).toBe(true);
    expect(matches(rows[0], { field: 'weeks', op: '>=', value: 28 })).toBe(true);
    expect(matches(rows[1], { field: 'weeks', op: '<', value: 28 })).toBe(true);
    expect(matches(rows[0], { field: 'riskLevel', op: 'in', value: ['RED', 'AMBER'] })).toBe(true);
    expect(matches(rows[1], { field: 'riskLevel', op: 'in', value: ['RED', 'AMBER'] })).toBe(false);
    expect(matches(rows[0], { field: 'signs', op: 'array-contains', value: 'BLEEDING' })).toBe(true);
    expect(matches(rows[1], { field: 'signs', op: 'array-contains', value: 'BLEEDING' })).toBe(false);
  });

  it('filters, orders, then pages — in that order', () => {
    const result = applyQuery(rows, {
      where: [{ field: 'facilityId', op: '==', value: 'fac-a' }],
      orderBy: { field: 'visitDate', direction: 'desc' },
      limit: 1,
    });
    expect(result.total).toBe(2);
    expect(result.rows.map((row) => row.id)).toEqual(['c']);
  });

  it('keeps the total count independent of the page size', () => {
    const paged = applyQuery(rows, { limit: 2, offset: 2, orderBy: { field: 'weeks', direction: 'asc' } });
    expect(paged.total).toBe(3);
    expect(paged.rows).toHaveLength(1);
  });

  it('treats a missing field as not equal, and an explicit null as equal', () => {
    expect(matches({ id: 'x', motherId: null }, { field: 'motherId', op: '==', value: null })).toBe(true);
    expect(matches({ id: 'x' }, { field: 'motherId', op: '==', value: null })).toBe(false);
    expect(matches({ id: 'x' }, { field: 'motherId', op: '!=', value: 'mom-1' })).toBe(true);
  });

  it('reads nested fields by dotted path', () => {
    expect(matches({ gestationalSnapshot: { weeks: 30 } }, { field: 'gestationalSnapshot.weeks', op: '>=', value: 28 })).toBe(true);
  });

  it('requires every filter to hold', () => {
    expect(matchesAll(rows[0], [{ field: 'facilityId', op: '==', value: 'fac-a' }, { field: 'archived', op: '==', value: false }])).toBe(true);
    expect(matchesAll(rows[0], [{ field: 'facilityId', op: '==', value: 'fac-a' }, { field: 'archived', op: '==', value: true }])).toBe(false);
  });

  it('separates what Firestore can index from what must be filtered afterwards', () => {
    const { indexed, postFilter } = splitFilters([
      { field: 'facilityId', op: '==', value: 'fac-a' },
      { field: 'signs', op: 'array-contains', value: 'FEVER' },
      { field: 'riskLevel', op: 'in', value: ['RED'] },
    ]);
    expect(indexed.length + postFilter.length).toBe(3);
    expect(postFilter.every((filter) => !indexed.includes(filter))).toBe(true);
  });

  it('aligns the ordering field with an inequality so the query stays valid', () => {
    const aligned = alignOrderWithFilters({
      where: [{ field: 'scheduledFor', op: '>=', value: '2026-09-01' }],
      orderBy: { field: 'createdAt', direction: 'asc' },
    });
    expect(aligned.orderBy?.field).toBe('scheduledFor');
  });

  it('leaves an already-valid spec alone', () => {
    const spec = { where: [{ field: 'facilityId', op: '==' as const, value: 'fac-a' }], orderBy: { field: 'visitDate', direction: 'desc' as const } };
    expect(alignOrderWithFilters(spec)).toEqual(spec);
  });
});
