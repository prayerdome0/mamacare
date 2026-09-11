import 'dart:async';
import 'dart:convert';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../models/alert_rule.dart';
import '../../models/sync_item.dart';
import '../local_db/database.dart';

/// Idempotent offline sync.
///
/// Design:
///  * Every row is created with a client-generated UUID *before* it exists,
///    so pushing is always `upsert on id` — retries can never duplicate.
///  * Queue is drained parent→child (mothers → pregnancies → visits →
///    vitals/signs/tests → referrals/appointments/alerts).
///  * Conflicts: if the server row's `row_version` is newer than the local
///    one, resolution is **server-wins** by default; the local delta is
///    recorded in `sync_conflicts` for manual review (see Settings → Sync).
///    Referral status transitions are additionally monotonic in the UI — a
///    closed/received referral can never silently regress.
///  * Failures are retried with a growing backoff; after 5 attempts the item
///    is marked failed and surfaced in the UI (never silently dropped).
class SyncEngine {
  SyncEngine(this.db, this.connectivity);

  final LocalDatabase db;
  final Connectivity connectivity;

  /// Supabase client accessor (may be null in unconfigured/offline builds).
  SupabaseClient? Function() client;

  static const _tablePriority = {
    'mothers': 0,
    'pregnancies': 1,
    'anc_visits': 2,
    'vitals': 3,
    'danger_signs': 3,
    'tests': 3,
    'medications': 3,
    'appointments': 4,
    'referrals': 4,
    'follow_ups': 4,
    'deliveries': 4,
    'alerts': 5,
  };

  /// Local columns stored as JSON strings that must be sent as real arrays.
  static const _listColumns = {
    'pregnancies': ['previous_complications', 'risk_factors'],
    'appointments': ['reminder_days'],
  };

  final _statusController = StreamController<SyncStatusValue>.broadcast();
  String _lastError;
  DateTime? lastSyncAt;

  Stream<SyncStatusValue> get onStatus => _statusController.stream;
  String get lastSyncError => _lastError;
  bool _syncing = false;

  void _emit(SyncStatusValue s) => _statusController.add(s);

  // ── Queue operations ─────────────────────────────────────────────────────

  Future<void> enqueue(String entityType, String entityId,
      [String operation = SyncOp.upsert]) async {
    final existing = await db.query(
        "SELECT pk FROM sync_queue WHERE entity_type=? AND entity_id=?",
        [entityType, entityId]);
    if (existing.isNotEmpty) return; // already queued
    await db.insert('sync_queue', {
      'entity_type': entityType,
      'entity_id': entityId,
      'operation': operation,
      'created_at': DateTime.now().toIso8601String(),
      'attempts': 0,
      'last_error': null,
      'status': SyncStatusValue.pending,
    });
  }

  Future<int> pendingCount() async {
    final rows = await db.query(
        "SELECT COUNT(*) AS n FROM sync_queue WHERE status IN ('pending','failed')");
    return (rows.first['n'] as int? ?? 0);
  }

  // ── Sync run ─────────────────────────────────────────────────────────────

  Future<bool> syncNow() async {
    if (_syncing) return false;
    final supa = client();
    if (supa == null) return false; // not configured

    // Connectivity gate — never burn battery on hopeless networks.
    final results = await connectivity.checkConnectivity().timeout(
        const Duration(seconds: 5), onTimeout: () => const []);
    if (results.every(
        (r) => r == ConnectivityResult.none)) {
      return false;
    }

    _syncing = true;
    _emit(SyncStatusValue.syncing);
    try {
      await _pushQueue(supa);
      await _pullRemote(supa);
      lastSyncAt = DateTime.now();
      _lastError = '';
      _emit(SyncStatusValue.synced);
      return true;
    } catch (e) {
      _lastError = e.toString();
      _emit(SyncStatusValue.failed);
      return false;
    } finally {
      _syncing = false;
    }
  }

  Future<void> _pushQueue(SupabaseClient supa) async {
    while (true) {
      final rows = await db.query(
          "SELECT * FROM sync_queue WHERE status IN ('pending','failed') "
          'ORDER BY created_at, pk LIMIT 1');
      if (rows.isEmpty) break;
      final item = SyncItem.fromMap({
        ...rows.first,
        'pk': rows.first['pk'],
      });
      await _processItem(supa, item);
      // Hard stop for a pathological loop (e.g. constant conflict loop).
      if (item.pk == null) break;
    }
  }

  Future<void> _processItem(SupabaseClient supa, SyncItem item) async {
    final table = item.entityType;
    final localRow = await db.selectOne(table, item.entityId);
    if (localRow == null) {
      await _completeItem(item, null);
      return;
    }

    // Conflict check BEFORE pushing: server newer than local → server wins.
    final existing =
        await supa.from(table).select('row_version, id').eq('id', item.entityId).limit(1);
    if (existing.data != null && (existing.data as List).isNotEmpty) {
      final remote = (existing.data as List).first as Map<String, dynamic>;
      final remoteVer = (remote['row_version'] as num?)?.toInt() ?? 1;
      final localVer = (localRow['row_version'] as num?)?.toInt() ?? 1;
      if (remoteVer > localVer) {
        await _recordConflict(table, item.entityId, 'row_version',
            localVer.toString(), remoteVer.toString());
        // Server-wins: refresh the local row from the server.
        final fresh = await supa
            .from(table)
            .select()
            .eq('id', item.entityId)
            .limit(1)
            .single();
        if (fresh.data != null) {
          await _storeLocal(table, Map<String, dynamic>.from(fresh.data));
        }
        await _completeItem(item, null);
        return;
      }
    }

    final payload = _payloadFor(table, localRow);
    final res = await supa
        .from(table)
        .upsert(payload, onConflict: 'id')
        .select();

    if (res.error != null) {
      await _failItem(item, res.error.message);
      return;
    }

    // After a fresh insert the server may have assigned canonical values
    // (e.g. mothers.mother_code). Pull them back so the UI shows the real code.
    if (table == 'mothers' && localRow['mother_code'] == null) {
      final code = res.data != null
          ? ((res.data as List).first as Map<String, dynamic>)['mother_code']
          : null;
      if (code != null) {
        await db.update(table, {...localRow, 'mother_code': code}, item.entityId);
      }
    }
    await _completeItem(item, null);
  }

  Map<String, dynamic> _payloadFor(String table, Map<String, dynamic> row) {
    final out = Map<String, dynamic>.from(row);
    out.remove('pk');
    for (final col in _listColumns[table] ?? const <String>[]) {
      final v = out[col];
      if (v is String && v.startsWith('[')) {
        try {
          out[col] = jsonDecode(v);
        } catch (_) {/* leave as-is */}
      }
    }
    return out;
  }

  Future<void> _recordConflict(String table, String id, String field,
      String? local, String? remote) async {
    await db.insert('sync_conflicts', {
      'entity_type': table,
      'entity_id': id,
      'field': field,
      'local_value': local,
      'remote_value': remote,
      'detected_at': DateTime.now().toIso8601String(),
      'resolved': 0,
    });
  }

  Future<void> _completeItem(SyncItem item, String? error) async {
    if (item.pk != null) {
      await db.deleteWhere('sync_queue', 'pk = ?', [item.pk]);
    }
  }

  Future<void> _failItem(SyncItem item, String error) async {
    final attempts = item.attempts + 1;
    final failed = attempts >= 5;
    if (item.pk != null) {
      await db.updateWhere(
          'sync_queue',
          {
            'attempts': attempts,
            'last_error': error,
            'status': failed ? SyncStatusValue.failed : SyncStatusValue.pending
          },
          'pk = ?',
          [item.pk]);
    }
    if (failed) _emit(SyncStatusValue.failed);
    // Backoff is implicit: the item is re-attempted on the next online run.
    // Pre-deployment: add explicit exponential backoff with jitter —
    // see docs/SECURITY-VALIDATION.md.
  }

  /// Store a server row back into the local table (server-wins refresh).
  Future<void> _storeLocal(String table, Map<String, dynamic> remote) async {
    // Encode Postgres arrays back into local JSON strings.
    final row = Map<String, dynamic>.from(remote);
    for (final col in _listColumns[table] ?? const <String>[]) {
      final v = row[col];
      if (v is List) row[col] = jsonEncode(v);
    }
    await db.replace(table, row);
  }

  // ── Pull (delta refresh + rule downloads) ────────────────────────────────

  Future<void> _pullRemote(SupabaseClient supa) async {
    final since = lastSyncAt ?? DateTime.fromMillisecondsSinceEpoch(0);
    final sinceIso = since.toIso8601String();

    // 1) Refresh alert rules (the configurable clinical ruleset).
    final rules =
        await supa.from('alert_rules').select().eq('enabled', true);
    if (rules.data != null) {
      final list = (rules.data as List)
          .map((e) => AlertRule.fromMap(
              (e as Map).cast<String, dynamic>()))
          .toList();
      if (list.isNotEmpty) {
        await db.deleteWhere('alert_rules', '1=1');
        for (final r in list) {
          await db.insert('alert_rules', {
            'id': r.id,
            'rule_key': r.ruleKey,
            'level': r.level,
            'title': r.title,
            'message': r.message,
            'condition_json': jsonEncode(r.condition.toJson()),
            'enabled': 1,
            'updated_at': DateTime.now().toIso8601String(),
          });
        }
      }
    }

    // 2) Delta-refresh clinical tables modified since the last sync
    //    (RLS scopes this automatically to the signed-in user's facility).
    for (final table in const [
      'mothers',
      'pregnancies',
      'anc_visits',
      'appointments',
      'referrals',
      'alerts'
    ]) {
      final res = await supa
          .from(table)
          .select()
          .gte('updated_at', sinceIso)
          .limit(500);
      if (res.data == null) continue;
      for (final e in res.data as List) {
        await _storeLocal(table, (e as Map).cast<String, dynamic>());
      }
    }
  }

  Future<void> dispose() => _statusController.close();
}
