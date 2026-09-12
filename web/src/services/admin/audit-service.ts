import { AppError } from '@/lib/errors';
import { formatDate, toCsv, downloadBlob } from '@/lib/utils';
import { services } from '@/services/session-store';
import type { AuditAction, AuditLogEntry, Role } from '@/types/domain';

/**
 * Audit trail queries and exports.
 *
 * Audit rows are append-only and PII-minimised by construction: they identify
 * *who* did *what* to *which record*, and never copy clinical content into the
 * log.
 */

export interface AuditFilters {
  actorId?: string | null;
  facilityId?: string | null;
  action?: AuditAction | 'ALL';
  targetType?: string | null;
  from?: string | null;
  to?: string | null;
  search?: string;
  limit?: number;
}

const ACTION_LABELS: Partial<Record<AuditAction, string>> = {
  'auth.login': 'Signed in',
  'auth.logout': 'Signed out',
  'auth.password_reset_requested': 'Password reset requested',
  'auth.password_changed': 'Password changed',
  'auth.session_revoked': 'Sessions revoked',
  'user.created': 'User created',
  'user.updated': 'User updated',
  'user.role_changed': 'Role changed',
  'user.deactivated': 'Account deactivated',
  'user.reactivated': 'Account reactivated',
  'user.access_approved': 'Access approved',
  'user.facility_assigned': 'Facility assigned',
  'mother.registered': 'Mother registered',
  'anc_visit.created': 'ANC visit recorded',
  'alert.created': 'Alert raised',
  'alert.resolved': 'Alert resolved',
  'referral.created': 'Referral created',
  'referral.status_changed': 'Referral status changed',
  'report.generated': 'Report generated',
  'document.uploaded': 'Document uploaded',
  'document.accessed': 'Document opened',
  'settings.updated': 'Settings changed',
  'rule.updated': 'Clinical rule changed',
};

export const auditActionLabel = (action: AuditAction): string => ACTION_LABELS[action] ?? action.replace(/[._]/g, ' ');

export async function listAuditLogs(filters: AuditFilters = {}): Promise<AuditLogEntry[]> {
  const registry = services();
  const actor = registry.require();
  if (actor.role !== 'ADMIN' && actor.role !== 'FACILITY_SUPERVISOR') {
    throw new AppError('Audit history is available to supervisors and administrators.', 'FORBIDDEN');
  }
  const facilityScope = actor.role === 'ADMIN' ? filters.facilityId ?? null : actor.facilityId;
  const { rows } = await registry.data.list('audit_logs', {
    where: filters.actorId ? [{ field: 'actorId', op: '==', value: filters.actorId }] : [],
    orderBy: { field: 'createdAt', direction: 'desc' },
    limit: filters.limit ?? 400,
  });

  return rows
    .filter((entry) => (facilityScope ? entry.facilityId === facilityScope || !entry.facilityId : true))
    .filter((entry) => (filters.action && filters.action !== 'ALL' ? entry.action === filters.action : true))
    .filter((entry) => (filters.targetType ? entry.targetType === filters.targetType : true))
    .filter((entry) => (filters.from ? entry.createdAt.slice(0, 10) >= filters.from : true))
    .filter((entry) => (filters.to ? entry.createdAt.slice(0, 10) <= filters.to : true))
    .filter((entry) => {
      if (!filters.search) return true;
      const needle = filters.search.toLowerCase();
      const text = `${entry.actorName} ${entry.action} ${entry.targetLabel ?? ''} ${entry.targetId}`.toLowerCase();
      return text.includes(needle);
    });
}

export async function exportAuditLogs(filters: AuditFilters = {}): Promise<{ fileName: string; rows: number }> {
  const rows = await listAuditLogs({ ...filters, limit: 2000 });
  const csv = toCsv(
    ['Timestamp', 'Actor', 'Role', 'Action', 'Resource type', 'Resource', 'Facility', 'Metadata'],
    rows.map((entry) => [
      entry.createdAt,
      entry.actorName,
      entry.actorRole,
      auditActionLabel(entry.action),
      entry.targetType,
      entry.targetLabel ?? entry.targetId,
      entry.facilityId ?? '',
      entry.metadata ? JSON.stringify(entry.metadata) : '',
    ]),
  );
  const fileName = `mamacare-audit-${formatDate(new Date()).replace(/\s/g, '')}.csv`;
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), fileName);
  return { fileName, rows: rows.length };
}

export function auditSummary(entries: AuditLogEntry[]): { label: string; value: number }[] {
  const today = new Date().toISOString().slice(0, 10);
  const byAction = new Map<string, number>();
  for (const entry of entries) {
    const key = auditActionLabel(entry.action);
    byAction.set(key, (byAction.get(key) ?? 0) + 1);
  }
  return [
    { label: 'Total events', value: entries.length },
    { label: 'Today', value: entries.filter((entry) => entry.createdAt.slice(0, 10) === today).length },
    { label: 'Privilege changes', value: entries.filter((entry) => entry.action.startsWith('user.')).length },
    { label: 'Clinical entries', value: entries.filter((entry) => entry.action.startsWith('anc_visit') || entry.action.startsWith('alert')).length },
    ...Array.from(byAction.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([label, value]) => ({ label, value })),
  ];
}

export const AUDIT_ROLES: Role[] = ['ADMIN', 'FACILITY_SUPERVISOR', 'MIDWIFE', 'NURSE', 'COMMUNITY_HEALTH_WORKER', 'MOTHER'];
