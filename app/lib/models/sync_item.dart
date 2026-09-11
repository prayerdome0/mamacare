import 'mother.dart';

class SyncOp {
  static const upsert = 'upsert';
  static const delete = 'delete';
}

class SyncStatusValue {
  static const pending = 'pending';
  static const syncing = 'syncing';
  static const synced = 'synced';
  static const failed = 'failed';
}

/// One row of the local sync queue.
class SyncItem {
  final int? pk;
  final String entityType; // table name, e.g. 'mothers'
  final String entityId;
  final String operation;
  final DateTime createdAt;
  final int attempts;
  final String? lastError;
  final String status;

  SyncItem({
    this.pk,
    required this.entityType,
    required this.entityId,
    required this.operation,
    DateTime? createdAt,
    this.attempts = 0,
    this.lastError,
    this.status = SyncStatusValue.pending,
  }) : createdAt = createdAt ?? DateTime.now();

  factory SyncItem.fromMap(Map<String, dynamic> m) => SyncItem(
        pk: m['pk'] as int?,
        entityType: m['entity_type'] as String? ?? '',
        entityId: m['entity_id'] as String? ?? '',
        operation: m['operation'] as String? ?? SyncOp.upsert,
        createdAt: mcDate(m['created_at']) ?? DateTime.now(),
        attempts: m['attempts'] as int? ?? 0,
        lastError: m['last_error'] as String?,
        status: m['status'] as String? ?? SyncStatusValue.pending,
      );
}

/// Conflicts detected by the sync engine (remote row_version newer than the
/// local one). Default resolution is server-wins; the local delta is kept
/// here for manual review in Settings → Sync.
class SyncConflict {
  final int? pk;
  final String entityType;
  final String entityId;
  final String field;
  final String? localValue;
  final String? remoteValue;
  final DateTime detectedAt;
  final bool resolved;

  SyncConflict({
    this.pk,
    required this.entityType,
    required this.entityId,
    required this.field,
    this.localValue,
    this.remoteValue,
    DateTime? detectedAt,
    this.resolved = false,
  }) : detectedAt = detectedAt ?? DateTime.now();
}
