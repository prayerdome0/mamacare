import 'mother.dart';

class AlertLevel {
  static const red = 'red';
  static const amber = 'amber';
  static const green = 'green';

  static String label(String l) => switch (l) {
        red => 'URGENT — immediate clinical assessment',
        amber => 'REVIEW — clinical review / follow-up',
        green => 'No configured alert identified',
        _ => l,
      };
}

class AlertStatus {
  static const open = 'open';
  static const assessed = 'assessed';
  static const referred = 'referred';
  static const documented = 'documented';
  static const resolved = 'resolved';
}

/// A fired clinical alert. NOTE: the message is deliberately non-diagnostic
/// ("Potential danger sign — clinical assessment required."), never a label.
class ClinicalAlert {
  final String id;
  final String pregnancyId;
  final String? visitId;
  final String ruleKey;
  final String level;
  final String message;
  final String status;
  final String? assessedBy;
  final DateTime? assessedAt;
  final String? actionTaken;
  final DateTime createdAt;
  final int rowVersion;

  ClinicalAlert({
    required this.id,
    required this.pregnancyId,
    this.visitId,
    required this.ruleKey,
    required this.level,
    required this.message,
    this.status = AlertStatus.open,
    this.assessedBy,
    this.assessedAt,
    this.actionTaken,
    DateTime? createdAt,
    this.rowVersion = 1,
  }) : createdAt = createdAt ?? DateTime.now();

  factory ClinicalAlert.fromMap(Map<String, dynamic> m) => ClinicalAlert(
        id: m['id'] as String,
        pregnancyId: m['pregnancy_id'] as String,
        visitId: m['visit_id'] as String?,
        ruleKey: m['rule_key'] as String? ?? '',
        level: m['level'] as String? ?? AlertLevel.amber,
        message: m['message'] as String? ?? '',
        status: m['status'] as String? ?? AlertStatus.open,
        assessedBy: m['assessed_by'] as String?,
        assessedAt: mcDate(m['assessed_at']),
        actionTaken: m['action_taken'] as String?,
        createdAt: mcDate(m['created_at']) ?? DateTime.now(),
        rowVersion: m['row_version'] as int? ?? 1,
      );

  Map<String, dynamic> toMap() => {
        'id': id,
        'pregnancy_id': pregnancyId,
        'visit_id': visitId,
        'rule_key': ruleKey,
        'level': level,
        'message': message,
        'status': status,
        'assessed_by': assessedBy,
        'assessed_at': assessedAt != null ? mcDateStr(assessedAt!) : null,
        'action_taken': actionTaken,
        'created_at': mcDateStr(createdAt),
        'row_version': rowVersion,
      };
}
