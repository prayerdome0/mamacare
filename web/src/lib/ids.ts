/**
 * Identifier helpers.
 *
 * Every stored document is keyed by an opaque, collision-safe id. Human
 * identifiers (patient ids, codes) are generated from server/counter state and
 * are never derived from names, phones or emails.
 */

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

const randomSegment = (length: number): string => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
};

export function newId(prefix?: string): string {
  const base =
    typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${randomSegment(8)}-${randomSegment(4)}-${randomSegment(12)}`;
  return prefix ? `${prefix}_${base}` : base;
}

/** Client reference for idempotent writes: retrying the same form never duplicates. */
export const newClientRef = (): string => `cr_${randomSegment(16)}`;

export const formatPatientId = (sequence: number, prefix = 'MC'): string =>
  `${prefix}-${String(sequence).padStart(6, '0')}`;

export const isPatientId = (value: string): boolean => /^[A-Z]{2,4}-\d{4,8}$/.test(value.trim().toUpperCase());

export const normalizePatientId = (value: string): string => {
  const trimmed = value.trim().toUpperCase().replace(/\s+/g, '');
  const digits = trimmed.replace(/\D/g, '');
  if (!trimmed.includes('-')) return digits ? `${trimmed.replace(/\d.*/, '')}-${digits.slice(0, 6).padStart(6, '0')}` : trimmed;
  const [prefix = 'MC'] = trimmed.split('-');
  return `${prefix.replace(/[^A-Z]/g, '').slice(0, 4) || 'MC'}-${digits.slice(0, 6).padStart(6, '0')}`;
};

export const facilityCodeFromName = (name: string): string =>
  name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word.slice(0, 4))
    .join('-')
    .slice(0, 12) || `FAC-${randomSegment(4).toUpperCase()}`;

export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);

export const shortCode = (length = 6): string => randomSegment(length).toUpperCase();

/** Deterministic hash for file checksums / dedupe (FNV-1a, non-cryptographic). */
export async function fileChecksum(file: File | Blob): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .slice(0, 16)
    .join('');
}
