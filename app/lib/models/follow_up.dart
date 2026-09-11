import 'mother.dart';

/// A CHW follow-up on a missed appointment.
class FollowUp {
  final String id;
  final String pregnancyId;
  final String? appointmentId;
  final bool phoneContacted;
  final bool homeVisit;
  final bool attendedElsewhere;
  final bool motherUnavailable;
  final bool phoneUnavailable;
  final bool other;
  final String? outcome;
  final String? recordedBy;
  final int rowVersion;

  FollowUp({
    required this.id,
    required this.pregnancyId,
    this.appointmentId,
    this.phoneContacted = false,
    this.homeVisit = false,
    this.attendedElsewhere = false,
    this.motherUnavailable = false,
    this.phoneUnavailable = false,
    this.other = false,
    this.outcome,
    this.recordedBy,
    this.rowVersion = 1,
  });

  factory FollowUp.fromMap(Map<String, dynamic> m) => FollowUp(
        id: m['id'] as String,
        pregnancyId: m['pregnancy_id'] as String,
        appointmentId: m['appointment_id'] as String?,
        phoneContacted: mcBool(m['phone_contacted']),
        homeVisit: mcBool(m['home_visit']),
        attendedElsewhere: mcBool(m['attended_elsewhere']),
        motherUnavailable: mcBool(m['mother_unavailable']),
        phoneUnavailable: mcBool(m['phone_unavailable']),
        other: mcBool(m['other']),
        outcome: m['outcome'] as String?,
        recordedBy: m['recorded_by'] as String?,
        rowVersion: m['row_version'] as int? ?? 1,
      );

  Map<String, dynamic> toMap() => {
        'id': id,
        'pregnancy_id': pregnancyId,
        'appointment_id': appointmentId,
        'phone_contacted': phoneContacted ? 1 : 0,
        'home_visit': homeVisit ? 1 : 0,
        'attended_elsewhere': attendedElsewhere ? 1 : 0,
        'mother_unavailable': motherUnavailable ? 1 : 0,
        'phone_unavailable': phoneUnavailable ? 1 : 0,
        'other': other ? 1 : 0,
        'outcome': outcome,
        'recorded_by': recordedBy,
        'row_version': rowVersion,
      };
}
