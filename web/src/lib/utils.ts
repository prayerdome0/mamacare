import { clsx, type ClassValue } from 'clsx';

export const cn = (...inputs: ClassValue[]): string => clsx(inputs);

/* ── Time ────────────────────────────────────────────────────────────── */

const DAY_MS = 86_400_000;

export const toIsoDate = (value: Date | string): string => {
  const d = typeof value === 'string' ? new Date(value) : value;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const toIsoDateTime = (value: Date): string => value.toISOString();

export const startOfDay = (value: Date | string = new Date()): Date => {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
};

export const addDays = (value: Date | string, days: number): Date => {
  const d = new Date(value);
  d.setDate(d.getDate() + days);
  return d;
};

export const daysBetween = (from: Date | string, to: Date | string): number => {
  const a = startOfDay(from).getTime();
  const b = startOfDay(to).getTime();
  return Math.round((b - a) / DAY_MS);
};

export const isSameDay = (a: Date | string, b: Date | string): boolean =>
  toIsoDate(a) === toIsoDate(b);

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function formatDate(value?: string | Date | null, style: 'short' | 'long' | 'day' = 'short'): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mon = MONTHS[d.getMonth()];
  if (style === 'long') return `${dd} ${mon} ${d.getFullYear()}`;
  if (style === 'day') return `${DAYS[d.getDay()]}, ${dd} ${mon}`;
  return `${dd} ${mon} ${d.getFullYear()}`;
}

export function formatDateTime(value?: string | Date | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${formatDate(d)}, ${time}`;
}

export function formatTime(value?: string | Date | null): string {
  if (!value) return '—';
  if (typeof value === 'string' && /^\d{1,2}:\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function relativeTime(value?: string | Date | null, now: Date = new Date()): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const diff = d.getTime() - now.getTime();
  const abs = Math.abs(diff);
  const suffix = diff >= 0 ? 'from now' : 'ago';
  const mins = Math.round(abs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ${suffix}`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ${suffix}`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days} day${days === 1 ? '' : 's'} ${suffix}`;
  const months = Math.round(days / 30.4);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ${suffix}`;
  return `${Math.round(months / 12)} year(s) ${suffix}`;
}

/** "Overdue by 12 days" / "Due in 3 days" — clinical scheduling language. */
export function dueLabel(target?: string | Date | null, now: Date = new Date()): string {
  if (!target) return 'Not scheduled';
  const delta = daysBetween(now, target);
  if (delta === 0) return 'Due today';
  if (delta < 0) return `Overdue by ${Math.abs(delta)} day${Math.abs(delta) === 1 ? '' : 's'}`;
  return `Due in ${delta} day${delta === 1 ? '' : 's'}`;
}

/* ── Numbers & text ──────────────────────────────────────────────────── */

export const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

export const round = (n: number, decimals = 1): number => {
  const f = 10 ** decimals;
  return Math.round((n + Number.EPSILON) * f) / f;
};

export function formatNumber(n: number | null | undefined, decimals = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatBytes(bytes?: number | null): string {
  if (!bytes && bytes !== 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export const initials = (name?: string | null): string =>
  (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '—';

export const titleCase = (value: string): string =>
  value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const humanize = (value: string): string => titleCase(value.toLowerCase());

export function pluralize(count: number, singular: string, plural?: string): string {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}

export const truncate = (value: string, max = 90): string =>
  value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;

/** Masks identifiers in aggregate/shared views (data-minimisation). */
/** Builds a tel: href from a display number (keeps separators out of the URL). */
export const telHref = (value: string): string => `tel:${value.replace(/[^\d+]/g, '')}`;

/** mailto: with an optional subject. */
export const mailtoHref = (email: string, subject?: string): string =>
  `mailto:${email}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`;

export function maskPhone(phone?: string | null): string {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 6) return '•••';
  return `${digits.slice(0, 4)} ••• ${digits.slice(-2)}`;
}

export function maskName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return `${parts[0]?.[0] ?? '•'}••`;
  return `${parts[0]?.[0] ?? '•'}. ${parts.at(-1)?.[0] ?? '•'}.`;
}

/* ── Collections ─────────────────────────────────────────────────────── */

export function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const bucket = map.get(k);
    if (bucket) bucket.push(row);
    else map.set(k, [row]);
  }
  return map;
}

export const unique = <T>(rows: T[], key: (row: T) => string): T[] => {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const k = key(row);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(row);
    }
  }
  return out;
};

export function countBy<T>(rows: T[], key: (row: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const k = key(row);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export function sortBy<T>(rows: T[], key: (row: T) => number | string, direction: 'asc' | 'desc' = 'asc'): T[] {
  const factor = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka === kb) return 0;
    return (ka > kb ? 1 : -1) * factor;
  });
}

export const pct = (part: number, total: number): number =>
  total > 0 ? Math.round((part / total) * 100) : 0;

/* ── Misc ────────────────────────────────────────────────────────────── */

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export function debounce<A extends unknown[]>(fn: (...args: A) => void, wait = 250) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}
