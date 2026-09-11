/// Gestational-age and EDD math.
///
/// Standard method used at registration: EDD = LMP + 280 days (Naegele).
/// The app computes GA + EDD automatically from the last menstrual period —
/// the nurse never enters the EDD by hand.
class GestationalMath {
  static const int eddOffsetDays = 280;

  static DateTime eddFromLmp(DateTime lmp) => lmp.add(const Duration(days: eddOffsetDays));

  /// Weeks + days from LMP to [on] (defaults to now).
  static (int weeks, int days) gaFromLmp(DateTime lmp, [DateTime? on]) {
    final ref = on ?? DateTime.now();
    final days = ref.difference(lmp).inDays;
    if (days < 0) return (0, 0);
    return (days ~/ 7, days % 7);
  }

  static String gaLabel(DateTime lmp, [DateTime? on]) {
    final (w, d) = gaFromLmp(lmp, on);
    return '$w weeks $d days';
  }

  static String gaShort(DateTime lmp, [DateTime? on]) {
    final (w, d) = gaFromLmp(lmp, on);
    return '${w}w ${d}d';
  }

  /// Suggested spacing for the next routine ANC visit (days from [from]).
  /// Deliberate default — MUST be validated against the current national
  /// ANC guideline before deployment (see docs/SECURITY-VALIDATION.md).
  static Duration suggestedNextVisitGap(int gaWeeks) {
    if (gaWeeks < 28) return const Duration(days: 14);
    if (gaWeeks < 36) return const Duration(days: 7);
    return const Duration(days: 7); // weekly from 36 weeks
  }
}
