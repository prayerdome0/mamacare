import 'dart:convert';

import 'package:mamacare/models/anc_visit.dart';
import 'package:mamacare/models/appointment.dart';
import 'package:mamacare/models/clinical_alert.dart';
import 'package:mamacare/models/danger_sign.dart';
import 'package:mamacare/models/delivery.dart';
import 'package:mamacare/models/follow_up.dart';
import 'package:mamacare/models/mother.dart';
import 'package:mamacare/models/pregnancy.dart';
import 'package:mamacare/models/referral.dart';
import 'package:mamacare/models/test_result.dart';
import 'package:mamacare/models/vitals.dart';
import 'package:mamacare/models/alert_rule.dart';

import 'local_db/database.dart';
import 'sync/sync_engine.dart';

/// Local-first data access. EVERY write goes to SQLite immediately (so the
/// app is fully functional offline) and is enqueued for sync. Reads prefer
/// the local store; the sync engine keeps it fresh when online.
class DataRepository {
  DataRepository(this.db, this.sync);

  final LocalDatabase db;
  final SyncEngine sync;

  // ── Local-map normalization (SQLite types → model types) ────────────────

  static bool _b(dynamic v) => v == 1 || v == true || v == '1';

  static List<String> _strList(dynamic v) {
    if (v is List) return v.map((e) => e.toString()).toList();
    if (v is String && v.startsWith('[')) {
      try {
        return (jsonDecode(v) as List).map((e) => e.toString()).toList();
      } catch (_) {
        return const [];
      }
    }
    return const [];
  }

  static Map<String, dynamic> _boolify(Map<String, dynamic> r) => r;

  // ── Mothers / pregnancies ────────────────────────────────────────────────

  Future<Mother> registerMother(Mother mother, Pregnancy pregnancy) async {
    await db.insert('mothers', _localMother(mother));
    await db.insert('pregnancies', _localPregnancy(pregnancy));
    sync.enqueue('mothers', mother.id);
    sync.enqueue('pregnancies', pregnancy.id);
    return mother;
  }

  Future<List<Mother>> searchMothers(String term) async {
    final t = term.trim().toLowerCase();
    if (t.isEmpty) return getMothers();
    final rows = await db.query(
        "SELECT * FROM mothers WHERE deleted_at IS NULL AND "
        "(lower(full_name) LIKE ? OR coalesce(mother_code,'') LIKE ? "
        "OR coalesce(provisional_code,'') LIKE ? OR coalesce(phone,'') LIKE ?)",
        ['%$t%', '%$t%', '%$t%', '%$t%']);
    return rows.map((r) => Mother.fromMap(_boolify(r))).toList();
  }

  Future<List<Mother>> getMothers() async {
    final rows = await db.select(
        'mothers', where: 'deleted_at IS NULL', orderBy: 'full_name');
    return rows.map((r) => Mother.fromMap(_boolify(r))).toList();
  }

  Future<Mother?> getMother(String id) async {
    final r = await db.selectOne('mothers', id);
    return r == null ? null : Mother.fromMap(_boolify(r));
  }

  Future<Pregnancy?> getPregnancy(String id) async {
    final r = await db.selectOne('pregnancies', id);
    if (r == null) return null;
    return Pregnancy.fromMap({
      ..._boolify(r),
      'previous_complications': _strList(r['previous_complications']),
      'risk_factors': _strList(r['risk_factors']),
    });
  }

  Future<List<Pregnancy>> getPregnancies(String motherId) async {
    final rows = await db.select(
        'pregnancies', where: 'mother_id = ?', args: [motherId]);
    return rows
        .map((r) => Pregnancy.fromMap({
              ..._boolify(r),
              'previous_complications': _strList(r['previous_complications']),
              'risk_factors': _strList(r['risk_factors']),
            }))
        .toList();
  }

  Future<void> setPregnancyStatus(String id, String status) async {
    final r = await db.selectOne('pregnancies', id);
    if (r == null) return;
    await db.update('pregnancies', {...r, 'status': status}, id);
    sync.enqueue('pregnancies', id);
  }

  // ── ANC visits + children ────────────────────────────────────────────────

  Future<int> nextVisitNumber(String pregnancyId) async {
    final rows = await db.query(
        'SELECT COALESCE(MAX(visit_number), 0) AS n FROM anc_visits '
        'WHERE pregnancy_id = ?', [pregnancyId]);
    return ((rows.first['n'] as num?)?.toInt() ?? 0) + 1;
  }

  Future<void> saveVisit({
    required AncVisit visit,
    Vitals? vitals,
    required List<DangerSignReport> dangerSigns,
    required List<TestResult> tests,
    required List<ClinicalAlert> alerts,
  }) async {
    await db.insert('anc_visits', {
      'id': visit.id,
      'pregnancy_id': visit.pregnancyId,
      'visit_number': visit.visitNumber,
      'visit_date': visit.visitDate.toIso8601String(),
      'ga_weeks': visit.gaWeeks,
      'ga_days': visit.gaDays,
      'reason': visit.reason,
      'visit_type': visit.visitType,
      'recorded_by': visit.recordedBy,
      'created_at': visit.createdAt.toIso8601String(),
      'row_version': 1,
    });
    sync.enqueue('anc_visits', visit.id);

    if (vitals != null) {
      await db.insert('vitals', _vitalsRow(vitals));
      sync.enqueue('vitals', vitals.id);
    }
    for (final s in dangerSigns) {
      await db.insert('danger_signs', _signRow(s));
      sync.enqueue('danger_signs', s.id);
    }
    for (final t in tests) {
      await db.insert('tests', _testRow(t));
      sync.enqueue('tests', t.id);
    }
    for (final a in alerts) {
      // De-duplicate: one open alert per (pregnancy, visit, rule).
      final dup = await db.query(
          'SELECT id FROM alerts WHERE pregnancy_id = ? AND visit_id = ? '
          'AND rule_key = ? LIMIT 1',
          [a.pregnancyId, a.visitId, a.ruleKey]);
      if (dup.isNotEmpty) continue;
      await db.insert('alerts', _alertRow(a));
      sync.enqueue('alerts', a.id);
    }
  }

  Future<List<VisitRecord>> getVisitRecords(String pregnancyId) async {
    final visits = await db.select(
        'anc_visits',
        where: 'pregnancy_id = ?',
        args: [pregnancyId],
        orderBy: 'visit_number');
    final out = <VisitRecord>[];
    for (final v in visits) {
      final vitalsRows =
          await db.query('SELECT * FROM vitals WHERE visit_id = ?', [v['id']]);
      final Vitals? vitals = vitalsRows.isEmpty
          ? null
          : Vitals.fromMap(vitalsRows.first);
      final signs = await db.select(
          'danger_signs', where: 'visit_id = ?', args: [v['id']]);
      final tests =
          await db.select('tests', where: 'visit_id = ?', args: [v['id']]);
      out.add(VisitRecord(
        visit: AncVisit.fromMap(v),
        vitals: vitals,
        dangerSigns:
            signs.map((s) => DangerSignReport.fromMap(_boolify(s))).toList(),
        tests: tests.map((t) => TestResult.fromMap(t)).toList(),
      ));
    }
    return out;
  }

  Future<Vitals?> lastVitals(String pregnancyId) async {
    final rows = await db.query(
        'SELECT v.* FROM vitals v '
        'JOIN anc_visits a ON a.id = v.visit_id '
        'WHERE a.pregnancy_id = ? ORDER BY a.visit_number DESC LIMIT 1',
        [pregnancyId]);
    return rows.isEmpty ? null : Vitals.fromMap(rows.first);
  }

  // ── Appointments ─────────────────────────────────────────────────────────

  Future<void> addAppointment(Appointment a) async {
    await db.insert('appointments', _apptRow(a));
    sync.enqueue('appointments', a.id);
  }

  Future<void> setAppointmentStatus(String id, String status) async {
    final r = await db.selectOne('appointments', id);
    if (r == null) return;
    await db.update('appointments', {...r, 'status': status}, id);
    sync.enqueue('appointments', id);
  }

  /// Appointments scheduled for [day] (or overdue, if [includeOverdue]).
  Future<List<Map<String, dynamic>>> getAppointments(
      {DateTime? day, bool includeOverdue = false}) async {
    final today = day ?? DateTime.now();
    final dayStr =
        '${today.year}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}';
    final base = 'SELECT ap.*, m.full_name AS mother_name, m.mother_code, '
        'm.provisional_code, p.id AS pregnancy_id_x, p.status AS preg_status, '
        'p.edd_date FROM appointments ap '
        'JOIN pregnancies p ON p.id = ap.pregnancy_id '
        'JOIN mothers m ON m.id = p.mother_id ';
    if (includeOverdue) {
      return db.query(
          base +
              "WHERE (ap.scheduled_date = ? OR ap.scheduled_date < ?) "
              "AND ap.status = 'scheduled' ORDER BY ap.scheduled_date, m.full_name",
          [dayStr, dayStr]);
    }
    return db.query(
        base +
            "WHERE ap.scheduled_date = ? AND ap.status = 'scheduled' "
            'ORDER BY ap.scheduled_date, m.full_name',
        [dayStr]);
  }

  /// Overdue (missed) scheduled appointments, oldest first.
  Future<List<Map<String, dynamic>>> getMissedAppointments() async {
    return db.query(
        "SELECT ap.*, m.full_name AS mother_name, m.mother_code, "
        "m.provisional_code, m.phone, p.id AS pregnancy_id_x, "
        "julianday('now') - julianday(ap.scheduled_date) AS days_overdue "
        "FROM appointments ap "
        "JOIN pregnancies p ON p.id = ap.pregnancy_id "
        "JOIN mothers m ON m.id = p.mother_id "
        "WHERE ap.status = 'scheduled' AND ap.scheduled_date < date('now') "
        "ORDER BY ap.scheduled_date",
        []);
  }

  // ── Referrals / follow-ups / deliveries ─────────────────────────────────

  Future<void> addReferral(Referral r) async {
    await db.insert('referrals', _referralRow(r));
    sync.enqueue('referrals', r.id);
  }

  Future<void> setReferralStatus(String id, String status) async {
    final r = await db.selectOne('referrals', id);
    if (r == null) return;
    await db.update(
        'referrals',
        {...r, 'status': status, 'status_updated_at': DateTime.now().toIso8601String()},
        id);
    sync.enqueue('referrals', id);
  }

  Future<Referral?> getActiveReferral(String pregnancyId) async {
    final rows = await db.query(
        "SELECT * FROM referrals WHERE pregnancy_id = ? "
        "AND status IN ('active','received','assessment_completed','treated','admitted','referred_onward','follow_up_required') "
        "ORDER BY referred_at DESC LIMIT 1",
        [pregnancyId]);
    if (rows.isEmpty) return null;
    return Referral.fromMap(_boolify(rows.first));
  }

  Future<void> addFollowUp(FollowUp f) async {
    await db.insert('follow_ups', _followUpRow(f));
    sync.enqueue('follow_ups', f.id);
  }

  Future<void> addDelivery(Delivery d) async {
    await db.insert('deliveries', _deliveryRow(d));
    sync.enqueue('deliveries', d.id);
    await setPregnancyStatus(d.pregnancyId, PregnancyStatus.delivered);
  }

  // ── Alerts ───────────────────────────────────────────────────────────────

  Future<void> setAlertStatus(
      String id, String status, String? action, String? userId) async {
    final r = await db.selectOne('alerts', id);
    if (r == null) return;
    await db.update(
        'alerts',
        {
          ...r,
          'status': status,
          'action_taken': action ?? r['action_taken'],
          'assessed_by': userId,
          'assessed_at': DateTime.now().toIso8601String(),
        },
        id);
    sync.enqueue('alerts', id);
  }

  Future<List<Map<String, dynamic>>> getOpenAlerts() async {
    return db.query(
        "SELECT a.*, m.full_name AS mother_name, m.mother_code, "
        "m.provisional_code FROM alerts a "
        "JOIN pregnancies p ON p.id = a.pregnancy_id "
        "JOIN mothers m ON m.id = p.mother_id "
        "WHERE a.status = 'open' "
        "ORDER BY CASE a.level WHEN 'red' THEN 0 ELSE 1 END, a.created_at",
        []);
  }

  Future<List<ClinicalAlert>> getPregnancyAlerts(String pregnancyId) async {
    final rows = await db.select(
        'alerts',
        where: 'pregnancy_id = ?',
        args: [pregnancyId],
        orderBy: 'created_at DESC');
    return rows.map((r) => ClinicalAlert.fromMap(_boolify(r))).toList();
  }

  // ── Alert rules (local cache of the configurable clinical rules) ────────

  Future<List<AlertRule>> getLocalRules() async {
    final rows = await db.select('alert_rules', orderBy: 'rule_key');
    return rows
        .map((r) => AlertRule.fromMap({
              ...r,
              'condition_json':
                  jsonDecode(r['condition_json'] as String ?? '{}'),
              'enabled': _b(r['enabled']),
            }))
        .where((r) => r.enabled)
        .toList();
  }

  Future<void> cacheRules(List<AlertRule> rules) async {
    for (final r in rules) {
      await db.insert('alert_rules', {
        'id': r.id.isNotEmpty ? r.id : 'local_${r.ruleKey}',
        'rule_key': r.ruleKey,
        'level': r.level,
        'title': r.title,
        'message': r.message,
        'condition_json': jsonEncode(r.condition.toJson()),
        'enabled': r.enabled ? 1 : 0,
        'updated_at': DateTime.now().toIso8601String(),
      });
    }
  }

  // ── Dashboard aggregates ─────────────────────────────────────────────────

  Future<Map<String, dynamic>> dashboardStats() async {
    final activePreg = (await db.query(
        "SELECT COUNT(*) AS n FROM pregnancies WHERE status = 'active'"))
        .first['n'] as int? ??
        0;
    final missed = (await db.query(
        "SELECT COUNT(*) AS n FROM appointments "
        "WHERE status = 'scheduled' AND scheduled_date < date('now')"))
        .first['n'] as int? ??
        0;
    final redAlerts = (await db.query(
        "SELECT COUNT(*) AS n FROM alerts WHERE status='open' AND level='red'"))
        .first['n'] as int? ??
        0;
    final amberAlerts = (await db.query(
        "SELECT COUNT(*) AS n FROM alerts WHERE status='open' AND level='amber'"))
        .first['n'] as int? ??
        0;
    final todayAppts = (await db.query(
            'SELECT COUNT(*) AS n FROM appointments '
            "WHERE status='scheduled' AND scheduled_date = date('now')"))
        .first['n'] as int? ??
        0;
    final activeReferrals = (await db.query(
            "SELECT COUNT(*) AS n FROM referrals WHERE status != 'closed'"))
        .first['n'] as int? ??
        0;
    final monthVisits = (await db.query(
            'SELECT COUNT(*) AS n FROM anc_visits '
            "WHERE visit_date >= date('now', 'start of month')"))
        .first['n'] as int? ??
        0;
    final totalMothers = (await db.query(
            'SELECT COUNT(*) AS n FROM mothers WHERE deleted_at IS NULL'))
        .first['n'] as int? ??
        0;
    return {
      'activePregnancies': activePreg,
      'missed': missed,
      'redAlerts': redAlerts,
      'amberAlerts': amberAlerts,
      'todayAppointments': todayAppts,
      'activeReferrals': activeReferrals,
      'visitsThisMonth': monthVisits,
      'totalMothers': totalMothers,
    };
  }

  // ── Row mappers (local storage format) ───────────────────────────────────

  Map<String, dynamic> _localMother(Mother m) => {
        'id': m.id,
        'mother_code': m.motherCode,
        'provisional_code': m.provisionalCode,
        'full_name': m.fullName,
        'date_of_birth': m.dateOfBirth?.toIso8601String(),
        'age': m.age,
        'phone': m.phone,
        'address': m.address,
        'community': m.community,
        'emergency_contact_name': m.emergencyContactName,
        'emergency_contact_phone': m.emergencyContactPhone,
        'preferred_language': m.preferredLanguage,
        'registration_facility_id': m.registrationFacilityId,
        'registered_by': m.registeredBy,
        'deleted_at': null,
        'created_at': m.createdAt.toIso8601String(),
        'updated_at': m.updatedAt?.toIso8601String(),
        'row_version': 1,
      };

  Map<String, dynamic> _localPregnancy(Pregnancy p) => {
        'id': p.id,
        'mother_id': p.motherId,
        'gravida': p.gravida,
        'para': p.para,
        'previous_complications': jsonEncode(p.previousComplications),
        'lmp_date': p.lmpDate.toIso8601String(),
        'edd_date': p.eddDate.toIso8601String(),
        'confirmed_date': p.confirmedDate?.toIso8601String(),
        'multiple_pregnancy': p.multiplePregnancy,
        'previous_c_section': p.previousCSection ? 1 : 0,
        'risk_factors': jsonEncode(p.riskFactors),
        'status': p.status,
        'created_at': p.createdAt.toIso8601String(),
        'row_version': 1,
      };

  Map<String, dynamic> _vitalsRow(Vitals v) => {
        'id': v.id,
        'visit_id': v.visitId,
        'systolic_bp': v.systolicBp,
        'diastolic_bp': v.diastolicBp,
        'pulse': v.pulse,
        'temperature_c': v.temperatureC,
        'respiratory_rate': v.respiratoryRate,
        'weight_kg': v.weightKg,
        'other_observations': v.otherObservations,
        'row_version': 1,
      };

  Map<String, dynamic> _signRow(DangerSignReport s) => {
        'id': s.id,
        'visit_id': s.visitId,
        'sign_key': s.signKey,
        'reported': s.reported ? 1 : 0,
        'note': s.note,
        'row_version': 1,
      };

  Map<String, dynamic> _testRow(TestResult t) => {
        'id': t.id,
        'visit_id': t.visitId,
        'test_key': t.testKey,
        'result_value': t.resultValue,
        'result_text': t.resultText,
        'row_version': 1,
      };

  Map<String, dynamic> _alertRow(ClinicalAlert a) => {
        'id': a.id,
        'pregnancy_id': a.pregnancyId,
        'visit_id': a.visitId,
        'rule_key': a.ruleKey,
        'level': a.level,
        'message': a.message,
        'status': a.status,
        'assessed_by': a.assessedBy,
        'assessed_at': a.assessedAt?.toIso8601String(),
        'action_taken': a.actionTaken,
        'created_at': a.createdAt.toIso8601String(),
        'row_version': 1,
      };

  Map<String, dynamic> _apptRow(Appointment a) => {
        'id': a.id,
        'pregnancy_id': a.pregnancyId,
        'scheduled_date': a.scheduledDate.toIso8601String(),
        'reminder_days': jsonEncode(a.reminderDays),
        'status': a.status,
        'created_by': a.createdBy,
        'row_version': 1,
      };

  Map<String, dynamic> _referralRow(Referral r) => {
        'id': r.id,
        'pregnancy_id': r.pregnancyId,
        'reason': r.reason,
        'urgency': r.urgency,
        'referred_from_facility_id': r.referredFromFacilityId,
        'referred_to_facility_id': r.referredToFacilityId,
        'referred_to_name': r.referredToName,
        'referred_at': r.referredAt.toIso8601String(),
        'transport': r.transport,
        'clinical_notes': r.clinicalNotes,
        'status': r.status,
        'status_updated_at': r.statusUpdatedAt?.toIso8601String(),
        'created_by': r.createdBy,
        'row_version': 1,
      };

  Map<String, dynamic> _followUpRow(FollowUp f) => {
        'id': f.id,
        'pregnancy_id': f.pregnancyId,
        'appointment_id': f.appointmentId,
        'phone_contacted': f.phoneContacted ? 1 : 0,
        'home_visit': f.homeVisit ? 1 : 0,
        'attended_elsewhere': f.attendedElsewhere ? 1 : 0,
        'mother_unavailable': f.motherUnavailable ? 1 : 0,
        'phone_unavailable': f.phoneUnavailable ? 1 : 0,
        'other': f.other ? 1 : 0,
        'outcome': f.outcome,
        'recorded_by': f.recordedBy,
        'row_version': 1,
      };

  Map<String, dynamic> _deliveryRow(Delivery d) => {
        'id': d.id,
        'pregnancy_id': d.pregnancyId,
        'delivery_date': d.deliveryDate.toIso8601String(),
        'place_of_delivery': d.placeOfDelivery,
        'mode_of_delivery': d.modeOfDelivery,
        'outcome': d.outcome,
        'maternal_outcome': d.maternalOutcome,
        'baby_outcome': d.babyOutcome,
        'birth_weight_kg': d.birthWeightKg,
        'complications': d.complications,
        'referred_admission': d.referredAdmission ? 1 : 0,
        'recorded_by': d.recordedBy,
        'row_version': 1,
      };
}
