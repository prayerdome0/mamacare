import 'package:path/path.dart';
import 'package:sqflite/sqflite.dart';

/// Local SQLite store. Mirrors the Postgres schema 1:1 (snake_case columns)
/// so rows can be upserted to Supabase without mapping.
///
/// ⚠ PROTOTYPE: plain SQLite. Pre-deployment this must be SQLCipher
/// (see docs/SECURITY-VALIDATION.md).
class LocalDatabase {
  LocalDatabase._(this.db);

  final Database db;

  static const _version = 1;

  static Future<LocalDatabase> open() async {
    final path = join(await getDatabasesPath(), 'mamacare.db');
    final db = await openDatabase(
      path,
      version: _version,
      onConfigure: (d) => d.execute('PRAGMA foreign_keys = ON'),
      onCreate: (d, _) => _createAll(d),
    );
    return LocalDatabase._(db);
  }

  Future<void> close() => db.close();

  static Future<void> _createAll(Database d) async {
    await d.execute('''
      CREATE TABLE mothers (
        id TEXT PRIMARY KEY,
        mother_code TEXT,
        provisional_code TEXT,
        full_name TEXT NOT NULL,
        date_of_birth TEXT,
        age INTEGER,
        phone TEXT,
        address TEXT,
        community TEXT,
        emergency_contact_name TEXT,
        emergency_contact_phone TEXT,
        preferred_language TEXT,
        registration_facility_id TEXT NOT NULL,
        registered_by TEXT,
        deleted_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        row_version INTEGER NOT NULL DEFAULT 1
      )
    ''');
    await d.execute('''
      CREATE TABLE pregnancies (
        id TEXT PRIMARY KEY,
        mother_id TEXT NOT NULL REFERENCES mothers(id),
        gravida INTEGER NOT NULL DEFAULT 1,
        para INTEGER NOT NULL DEFAULT 0,
        previous_complications TEXT,
        lmp_date TEXT NOT NULL,
        edd_date TEXT NOT NULL,
        confirmed_date TEXT,
        multiple_pregnancy TEXT NOT NULL DEFAULT 'single',
        previous_c_section INTEGER NOT NULL DEFAULT 0,
        risk_factors TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        row_version INTEGER NOT NULL DEFAULT 1
        updated_at TEXT
      )
    ''');
    await d.execute('''
      CREATE TABLE anc_visits (
        id TEXT PRIMARY KEY,
        pregnancy_id TEXT NOT NULL REFERENCES pregnancies(id),
        visit_number INTEGER NOT NULL,
        visit_date TEXT NOT NULL,
        ga_weeks INTEGER NOT NULL,
        ga_days INTEGER NOT NULL,
        reason TEXT,
        visit_type TEXT NOT NULL DEFAULT 'routine',
        recorded_by TEXT,
        created_at TEXT NOT NULL,
        row_version INTEGER NOT NULL DEFAULT 1
        updated_at TEXT
      )
    ''');
    await d.execute('''
      CREATE TABLE vitals (
        id TEXT PRIMARY KEY,
        visit_id TEXT NOT NULL REFERENCES anc_visits(id),
        systolic_bp INTEGER,
        diastolic_bp INTEGER,
        pulse INTEGER,
        temperature_c REAL,
        respiratory_rate INTEGER,
        weight_kg REAL,
        other_observations TEXT,
        row_version INTEGER NOT NULL DEFAULT 1
        updated_at TEXT
      )
    ''');
    await d.execute('''
      CREATE TABLE danger_signs (
        id TEXT PRIMARY KEY,
        visit_id TEXT NOT NULL REFERENCES anc_visits(id),
        sign_key TEXT NOT NULL,
        reported INTEGER NOT NULL DEFAULT 1,
        note TEXT,
        row_version INTEGER NOT NULL DEFAULT 1,
        UNIQUE (visit_id, sign_key)
        updated_at TEXT
      )
    ''');
    await d.execute('''
      CREATE TABLE tests (
        id TEXT PRIMARY KEY,
        visit_id TEXT NOT NULL REFERENCES anc_visits(id),
        test_key TEXT NOT NULL,
        result_value TEXT,
        result_text TEXT,
        row_version INTEGER NOT NULL DEFAULT 1,
        UNIQUE (visit_id, test_key)
        updated_at TEXT
      )
    ''');
    await d.execute('''
      CREATE TABLE medications (
        id TEXT PRIMARY KEY,
        visit_id TEXT NOT NULL REFERENCES anc_visits(id),
        medication TEXT NOT NULL,
        dose TEXT,
        frequency TEXT,
        administered INTEGER NOT NULL DEFAULT 0,
        row_version INTEGER NOT NULL DEFAULT 1
        updated_at TEXT
      )
    ''');
    await d.execute('''
      CREATE TABLE appointments (
        id TEXT PRIMARY KEY,
        pregnancy_id TEXT NOT NULL REFERENCES pregnancies(id),
        scheduled_date TEXT NOT NULL,
        reminder_days TEXT NOT NULL DEFAULT '[7,1]',
        status TEXT NOT NULL DEFAULT 'scheduled',
        created_by TEXT,
        row_version INTEGER NOT NULL DEFAULT 1
        updated_at TEXT
      )
    ''');
    await d.execute('''
      CREATE TABLE referrals (
        id TEXT PRIMARY KEY,
        pregnancy_id TEXT NOT NULL REFERENCES pregnancies(id),
        reason TEXT NOT NULL,
        urgency TEXT NOT NULL DEFAULT 'urgent',
        referred_from_facility_id TEXT NOT NULL,
        referred_to_facility_id TEXT,
        referred_to_name TEXT,
        referred_at TEXT NOT NULL,
        transport TEXT,
        clinical_notes TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        status_updated_at TEXT,
        created_by TEXT,
        row_version INTEGER NOT NULL DEFAULT 1
      )
    ''');
    await d.execute('''
      CREATE TABLE follow_ups (
        id TEXT PRIMARY KEY,
        pregnancy_id TEXT NOT NULL REFERENCES pregnancies(id),
        appointment_id TEXT,
        phone_contacted INTEGER NOT NULL DEFAULT 0,
        home_visit INTEGER NOT NULL DEFAULT 0,
        attended_elsewhere INTEGER NOT NULL DEFAULT 0,
        mother_unavailable INTEGER NOT NULL DEFAULT 0,
        phone_unavailable INTEGER NOT NULL DEFAULT 0,
        other INTEGER NOT NULL DEFAULT 0,
        outcome TEXT,
        recorded_by TEXT,
        row_version INTEGER NOT NULL DEFAULT 1
        updated_at TEXT
      )
    ''');
    await d.execute('''
      CREATE TABLE deliveries (
        id TEXT PRIMARY KEY,
        pregnancy_id TEXT NOT NULL REFERENCES pregnancies(id),
        delivery_date TEXT NOT NULL,
        place_of_delivery TEXT NOT NULL,
        mode_of_delivery TEXT NOT NULL DEFAULT 'spontaneous',
        outcome TEXT NOT NULL,
        maternal_outcome TEXT,
        baby_outcome TEXT,
        birth_weight_kg REAL,
        complications TEXT,
        referred_admission INTEGER NOT NULL DEFAULT 0,
        recorded_by TEXT,
        row_version INTEGER NOT NULL DEFAULT 1
        updated_at TEXT
      )
    ''');
    await d.execute('''
      CREATE TABLE alerts (
        id TEXT PRIMARY KEY,
        pregnancy_id TEXT NOT NULL,
        visit_id TEXT,
        rule_key TEXT NOT NULL,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        assessed_by TEXT,
        assessed_at TEXT,
        action_taken TEXT,
        created_at TEXT NOT NULL,
        row_version INTEGER NOT NULL DEFAULT 1
        updated_at TEXT
      )
    ''');
    // Local cache of the configurable clinical rules (downloaded on sync).
    await d.execute('''
      CREATE TABLE alert_rules (
        id TEXT PRIMARY KEY,
        rule_key TEXT NOT NULL UNIQUE,
        level TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        condition_json TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT
      )
    ''');
    // The offline sync queue — one row per unsynced write.
    await d.execute('''
      CREATE TABLE sync_queue (
        pk INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        operation TEXT NOT NULL DEFAULT 'upsert',
        created_at TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        status TEXT NOT NULL DEFAULT 'pending'
      )
    ''');
    await d.execute('''
      CREATE TABLE sync_conflicts (
        pk INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        field TEXT NOT NULL,
        local_value TEXT,
        remote_value TEXT,
        detected_at TEXT NOT NULL,
        resolved INTEGER NOT NULL DEFAULT 0
      )
    ''');
    await d.execute(
        'CREATE INDEX idx_preg_mother ON pregnancies(mother_id)');
    await d.execute(
        'CREATE INDEX idx_visits_preg ON anc_visits(pregnancy_id, visit_number)');
    await d.execute('CREATE INDEX idx_appt_date ON appointments(scheduled_date)');
    await d.execute('CREATE INDEX idx_queue ON sync_queue(status, created_at)');
  }

  // ── Thin helpers used by the repository ─────────────────────────────────

  Future<int> insert(String table, Map<String, dynamic> row) =>
      db.insert(table, row, conflictAlgorithm: ConflictAlgorithm.replace);

  Future<int> update(
          String table, Map<String, dynamic> row, String id) =>
      db.update(
          table, row, where: 'id = ?', whereArgs: [id],
          conflictAlgorithm: ConflictAlgorithm.replace);

  Future<List<Map<String, dynamic>>> query(String sql,
          [List<Object?> args = const []]) =>
      db.rawQuery(sql, args);

  Future<List<Map<String, dynamic>>> select(String table,
          {String where = '1=1', List<Object?> args = const [],
          String orderBy = ''}) =>
      db.query(table, where: where, whereArgs: args, orderBy: orderBy);

  Future<Map<String, dynamic>?> selectOne(String table, String id) async {
    final rows =
        await db.query(table, where: 'id = ?', whereArgs: [id], limit: 1);
    return rows.isEmpty ? null : rows.first;
  }

  Future<void> delete(String table, String id) =>
      db.delete(table, where: 'id = ?', whereArgs: [id]);

  Future<int> deleteWhere(String table, String where,
          [List<Object?> args = const []]) =>
      db.delete(table, where: where, whereArgs: args);

  Future<int> updateWhere(
          String table, Map<String, dynamic> row, String where,
          [List<Object?> args = const []]) =>
      db.update(table, row, where: where, whereArgs: args);

  /// INSERT … ON CONFLICT REPLACE — used by the sync engine to store
  /// server rows back locally (server-wins refresh).
  Future<int> replace(String table, Map<String, dynamic> row) =>
      db.insert(table, row, conflictAlgorithm: ConflictAlgorithm.replace);
}
