import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// In-app reminder notifications for the assigned worker.
///
/// SMS reminders to mothers are handled by the `sms-reminders` Edge
/// Function (server side, cron-driven) — the app never holds SMS secrets.
class ReminderService {
  ReminderService(this._plugin);

  final FlutterLocalNotificationsPlugin _plugin;

  Future<void> initialize() async {
    const init = InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
    );
    await _plugin.initialize(
      init,
      onDidReceiveNotificationResponse: (_) {},
    );
  }

  /// Notify about today's appointments (called from the dashboard).
  Future<void> notifyTodaysAppointments(int count) async {
    if (count == 0) return;
    await _plugin.show(
      1,
      'TODAY',
      '$count appointment${count == 1 ? '' : 's'} scheduled',
      const NotificationDetails(
        android: AndroidNotificationDetails(
          'appointments',
          'Appointments',
          channelDescription: 'ANC appointment reminders',
          importance: Importance.high,
          priority: Priority.high,
        ),
      ),
    );
  }

  /// Notify about overdue (missed) appointments needing follow-up.
  Future<void> notifyMissedVisits(int count) async {
    if (count == 0) return;
    await _plugin.show(
      2,
      'MISSED VISITS',
      '$count mother${count == 1 ? '' : 's'} overdue — follow-up needed',
      const NotificationDetails(
        android: AndroidNotificationDetails(
          'missed',
          'Missed visits',
          channelDescription: 'Missed ANC visit follow-ups',
          importance: Importance.max,
          priority: Priority.max,
        ),
      ),
    );
  }

  /// Notify about a new RED alert (immediate assessment).
  Future<void> notifyRedAlert(String motherName) async {
    await _plugin.show(
      3,
      'URGENT ALERT',
      '$motherName — potential danger sign, immediate clinical assessment '
          'required.',
      const NotificationDetails(
        android: AndroidNotificationDetails(
          'alerts',
          'Clinical alerts',
          channelDescription: 'Danger-sign alerts',
          importance: Importance.max,
          priority: Priority.max,
          ledColor: androidColors.RED,
        ),
      ),
    );
  }
}
