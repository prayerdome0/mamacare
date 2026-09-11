import 'mother.dart';

class ReferralUrgency {
  static const emergency = 'emergency';
  static const urgent = 'urgent';
  static const routine = 'routine';

  static String label(String u) => switch (u) {
        emergency => 'Emergency',
        urgent => 'Urgent',
        routine => 'Routine',
        _ => u,
      };
}

class ReferralStatus {
  static const active = 'active';
  static const received = 'received';
  static const assessmentCompleted = 'assessment_completed';
  static const treated = 'treated';
  static const admitted = 'admitted';
  static const discharged = 'discharged';
  static const referredOnward = 'referred_onward';
  static const followUpRequired = 'follow_up_required';
  static const closed = 'closed';

  static const receivingOrder = [
    received,
    assessmentCompleted,
    treated,
    admitted,
    discharged,
    referredOnward,
    followUpRequired,
    closed,
  ];

  static String label(String s) => switch (s) {
        active => 'Referral active',
        received => 'Received',
        assessmentCompleted => 'Assessment completed',
        treated => 'Treatment',
        admitted => 'Admission',
        discharged => 'Discharged',
        referredOnward => 'Referred onward',
        followUpRequired => 'Follow-up required',
        closed => 'Closed',
        _ => s,
      };
}

class Referral {
  final String id;
  final String pregnancyId;
  final String reason;
  final String urgency;
  final String referredFromFacilityId;
  final String? referredToFacilityId;
  final String? referredToName;
  final DateTime referredAt;
  final String? transport; // ambulance | private | other
  final String? clinicalNotes;
  final String status;
  final DateTime? statusUpdatedAt;
  final String? createdBy;
  final int rowVersion;

  Referral({
    required this.id,
    required this.pregnancyId,
    required this.reason,
    required this.urgency,
    required this.referredFromFacilityId,
    this.referredToFacilityId,
    this.referredToName,
    DateTime? referredAt,
    this.transport,
    this.clinicalNotes,
    this.status = ReferralStatus.active,
    this.statusUpdatedAt,
    this.createdBy,
    this.rowVersion = 1,
  }) : referredAt = referredAt ?? DateTime.now();

  factory Referral.fromMap(Map<String, dynamic> m) => Referral(
        id: m['id'] as String,
        pregnancyId: m['pregnancy_id'] as String,
        reason: m['reason'] as String? ?? '',
        urgency: m['urgency'] as String? ?? ReferralUrgency.urgent,
        referredFromFacilityId: m['referred_from_facility_id'] as String,
        referredToFacilityId: m['referred_to_facility_id'] as String?,
        referredToName: m['referred_to_name'] as String?,
        referredAt: mcDate(m['referred_at']) ?? DateTime.now(),
        transport: m['transport'] as String?,
        clinicalNotes: m['clinical_notes'] as String?,
        status: m['status'] as String? ?? ReferralStatus.active,
        statusUpdatedAt: mcDate(m['status_updated_at']),
        createdBy: m['created_by'] as String?,
        rowVersion: m['row_version'] as int? ?? 1,
      );

  Map<String, dynamic> toMap() => {
        'id': id,
        'pregnancy_id': pregnancyId,
        'reason': reason,
        'urgency': urgency,
        'referred_from_facility_id': referredFromFacilityId,
        'referred_to_facility_id': referredToFacilityId,
        'referred_to_name': referredToName,
        'referred_at': mcDateStr(referredAt),
        'transport': transport,
        'clinical_notes': clinicalNotes,
        'status': status,
        'status_updated_at':
            statusUpdatedAt != null ? mcDateStr(statusUpdatedAt!) : null,
        'created_by': createdBy,
        'row_version': rowVersion,
      };

  bool get isActive => ReferralStatus.receivingOrder.contains(status) &&
      status != ReferralStatus.closed;

  Referral copyWithStatus(String newStatus) => Referral(
        id: id,
        pregnancyId: pregnancyId,
        reason: reason,
        urgency: urgency,
        referredFromFacilityId: referredFromFacilityId,
        referredToFacilityId: referredToFacilityId,
        referredToName: referredToName,
        referredAt: referredAt,
        transport: transport,
        clinicalNotes: clinicalNotes,
        status: newStatus,
        statusUpdatedAt: DateTime.now(),
        createdBy: createdBy,
        rowVersion: rowVersion,
      );
}
