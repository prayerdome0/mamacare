import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { ActorClaims } from './firebase.js';

/**
 * Audit trail. Every privileged action taken by this service writes an entry with
 * the same shape the web client uses, so `audit_logs` stays one continuous record
 * regardless of which side of the wire the action came from.
 *
 * Metadata is deliberately small and free of clinical content — enough to
 * reconstruct who did what, never enough to expose a patient record.
 */
export type AuditAction =
  | 'auth.login'
  | 'auth.session_revoked'
  | 'auth.password_reset_requested'
  | 'user.created'
  | 'user.updated'
  | 'user.role_changed'
  | 'user.role_synced'
  | 'user.deactivated'
  | 'user.reactivated'
  | 'user.access_approved'
  | 'user.facility_assigned'
  | 'user.email_verification_sent'
  | 'user.push_token_registered'
  | 'media.signed'
  | 'media.deleted'
  | 'document.accessed'
  | 'document.uploaded'
  | 'notification.sms_queued'
  | 'notification.sms_sent'
  | 'notification.push_sent'
  | 'notification.announcement'
  | 'contact.message_received'
  | 'settings.updated'
  | 'rule.updated';

export interface AuditInput {
  action: AuditAction;
  targetType: 'user' | 'mother' | 'document' | 'media' | 'notification' | 'appointment' | 'settings' | 'rule' | 'session' | 'facility';
  targetId: string;
  targetLabel?: string | null;
  facilityId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
}

export async function writeAudit(db: Firestore, actor: Pick<ActorClaims, 'uid' | 'displayName' | 'role'> | null, input: AuditInput): Promise<void> {
  try {
    await db.collection('audit_logs').add({
      id: FieldValue.serverTimestamp(),
      action: input.action,
      actorId: actor?.uid ?? 'system',
      actorName: actor?.displayName ?? 'API service',
      actorRole: actor?.role ?? 'SYSTEM',
      targetType: input.targetType,
      targetId: input.targetId,
      targetLabel: input.targetLabel ?? null,
      facilityId: input.facilityId ?? null,
      metadata: input.metadata ?? {},
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    // An audit failure must never leak into a user-facing error, but it must be
    // visible to whoever runs the service.
    console.error(`[api] could not write audit entry ${input.action} for ${input.targetId}:`, error instanceof Error ? error.message : error);
  }
}

/** Removes the marker the web client writes itself, keeping one id field. */
export function stripId<T extends { id?: string }>(value: T): Omit<T, 'id'> {
  const { id: _ignored, ...rest } = value;
  return rest;
}
