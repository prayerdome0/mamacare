import 'mother.dart';
import 'test_result.dart';
import 'vitals.dart';
import 'danger_sign.dart';

class VisitType {
  static const routine = 'routine';
  static const unscheduled = 'unscheduled';
  static const review = 'review';
  static const followUp = 'follow_up';

  static String label(String v) => switch (v) {
        routine => 'Routine',
        unscheduled => 'Unscheduled',
        review => 'Review',
        followUp => 'Follow-up',
        _ => v,
      };
}

class AncVisit {
  final String id;
  final String pregnancyId;
  final int visitNumber;
  final DateTime visitDate;
  final int gaWeeks;
  final int gaDays;
  final String? reason;
  final String visitType;
  final String? recordedBy;
  final DateTime createdAt;
  final int rowVersion;

  AncVisit({
    required this.id,
    required this.pregnancyId,
    required this.visitNumber,
    required this.visitDate,
    required this.gaWeeks,
    required this.gaDays,
    this.reason,
    this.visitType = VisitType.routine,
    this.recordedBy,
    required this.createdAt,
    this.rowVersion = 1,
  });

  factory AncVisit.fromMap(Map<String, dynamic> m) => AncVisit(
        id: m['id'] as String,
        pregnancyId: m['pregnancy_id'] as String,
        visitNumber: m['visit_number'] as int? ?? 1,
        visitDate: mcDate(m['visit_date']) ?? DateTime.now(),
        gaWeeks: m['ga_weeks'] as int? ?? 0,
        gaDays: m['ga_days'] as int? ?? 0,
        reason: m['reason'] as String?,
        visitType: m['visit_type'] as String? ?? VisitType.routine,
        recordedBy: m['recorded_by'] as String?,
        createdAt: mcDate(m['created_at']) ?? DateTime.now(),
        rowVersion: m['row_version'] as int? ?? 1,
      );

  Map<String, dynamic> toMap() => {
        'id': id,
        'pregnancy_id': pregnancyId,
        'visit_number': visitNumber,
        'visit_date': mcDateStr(visitDate),
        'ga_weeks': gaWeeks,
        'ga_days': gaDays,
        'reason': reason,
        'visit_type': visitType,
        'recorded_by': recordedBy,
        'created_at': mcDateStr(createdAt),
        'row_version': rowVersion,
      };

  String get gaLabel =>
      '${gaWeeks}w ${gaDays}d';
}

/// A visit plus its child records, as used by the UI.
class VisitRecord {
  final AncVisit visit;
  final Vitals? vitals;
  final List<DangerSignReport> dangerSigns;
  final List<TestResult> tests;

  VisitRecord({
    required this.visit,
    this.vitals,
    this.dangerSigns = const [],
    this.tests = const [],
  });

  String get reportedSignsLabel => dangerSigns
      .where((s) => s.reported)
      .map((s) => DangerSignKeys.label(s.key))
      .join(', ');
}
