import 'mother.dart';

class AppointmentStatus {
  static const scheduled = 'scheduled';
  static const completed = 'completed';
  static const missed = 'missed';
  static const cancelled = 'cancelled';
}

class Appointment {
  final String id;
  final String pregnancyId;
  final DateTime scheduledDate;
  final List<int> reminderDays;
  final String status;
  final String? createdBy;
  final int rowVersion;

  Appointment({
    required this.id,
    required this.pregnancyId,
    required this.scheduledDate,
    this.reminderDays = const [7, 1],
    this.status = AppointmentStatus.scheduled,
    this.createdBy,
    this.rowVersion = 1,
  });

  factory Appointment.fromMap(Map<String, dynamic> m) => Appointment(
        id: m['id'] as String,
        pregnancyId: m['pregnancy_id'] as String,
        scheduledDate: mcDate(m['scheduled_date']) ?? DateTime.now(),
        reminderDays: (m['reminder_days'] as List?)
                ?.map((e) => (e as num).toInt())
                .toList() ??
            const [7, 1],
        status: m['status'] as String? ?? AppointmentStatus.scheduled,
        createdBy: m['created_by'] as String?,
        rowVersion: m['row_version'] as int? ?? 1,
      );

  Map<String, dynamic> toMap() => {
        'id': id,
        'pregnancy_id': pregnancyId,
        'scheduled_date': mcDateStr(scheduledDate),
        'reminder_days': reminderDays,
        'status': status,
        'created_by': createdBy,
        'row_version': rowVersion,
      };

  /// Days since the appointment date was expected (positive = overdue).
  int overdueDays(DateTime now) =>
      now.difference(scheduledDate).inDays;

  bool get isOverdue =>
      status == AppointmentStatus.scheduled && overdueDays(DateTime.now()) > 0;
}
