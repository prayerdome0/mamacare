/**
 * Audit trail.
 *
 * Privileged and sensitive actions are logged so a deployment can answer "who
 * changed this, and when". Entries are append-only: the policy module allows
 * creating them and refuses to update or delete them, in both providers.
 *
 * Logging never blocks the action it describes — a failed audit write must not
 * stop a mother saving her appointment.
 */

import type { AuditAction, AuditLogEntry, Role } from '@/types/domain';
import { services } from '@/services/session-store';
import { newId } from '@/lib/ids';

export async function logAudit(
  action: AuditAction,
  targetType: string,
  targetId: string | null,
  detail: string | null = null,
): Promise<void> {
  try {
    const registry = services();
    const actor = registry.actorRef();
    const entry: Omit<AuditLogEntry, 'createdAt'> & { createdAt: string } = {
      id: newId('audit'),
      action,
      actorId: actor?.uid ?? 'system',
      actorName: actor?.displayName ?? 'System',
      actorRole: (actor?.role ?? 'SYSTEM') as Role | 'SYSTEM',
      targetType,
      targetId,
      detail,
      createdAt: new Date().toISOString(),
    };
    await registry.data.create('audit_logs', entry as unknown as AuditLogEntry);
  } catch {
    /* never fail the caller because of an audit write */
  }
}

/** Reads the trail. Restricted to administrators by the policy module. */
export async function readAuditLog(limit = 200): Promise<AuditLogEntry[]> {
  return services().data.rows('audit_logs', {
    orderBy: { field: 'createdAt', direction: 'desc' },
    limit,
  });
}

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  'sign-in': 'Signed in',
  'sign-out': 'Signed out',
  register: 'Registered',
  'role-change': 'Role changed',
  'status-change': 'Account status changed',
  'record-create': 'Record created',
  'record-update': 'Record updated',
  'record-delete': 'Record deleted',
  'content-publish': 'Content published',
  'provider-approval': 'Provider approval decision',
  'account-delete': 'Account deleted',
  'data-export': 'Data exported',
  'settings-change': 'Settings changed',
  'media-upload': 'Media uploaded',
};
