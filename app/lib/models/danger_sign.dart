import 'mother.dart';

/// The danger-sign checklist, exactly as presented on the ANC form.
/// Keys are stable identifiers used by the alert rules — do not rename.
class DangerSignKeys {
  static const vaginalBleeding = 'vaginal_bleeding';
  static const severeAbdominalPain = 'severe_abdominal_pain';
  static const severeHeadache = 'severe_headache';
  static const blurredVision = 'blurred_vision';
  static const convulsions = 'convulsions';
  static const difficultyBreathing = 'difficulty_breathing';
  static const fever = 'fever';
  static const severeVomiting = 'severe_vomiting';
  static const reducedFetalMovement = 'reduced_fetal_movement';
  static const fluidLeakage = 'fluid_leakage';
  static const otherConcern = 'other_concern';
  static const noneReported = 'none_reported';

  static const ordered = <String, String>{
    vaginalBleeding: 'Vaginal bleeding',
    severeAbdominalPain: 'Severe abdominal pain',
    severeHeadache: 'Severe headache',
    blurredVision: 'Blurred / changed vision',
    convulsions: 'Convulsions',
    difficultyBreathing: 'Difficulty breathing',
    fever: 'Fever',
    severeVomiting: 'Severe vomiting',
    reducedFetalMovement: 'Reduced / absent fetal movement',
    fluidLeakage: 'Fluid leakage',
    otherConcern: 'Other concerning symptom',
    noneReported: 'None reported',
  };

  static String label(String key) => ordered[key] ?? key;
}

class DangerSignReport {
  final String id;
  final String visitId;
  final String signKey;
  final bool reported;
  final String? note;
  final int rowVersion;

  DangerSignReport({
    required this.id,
    required this.visitId,
    required this.signKey,
    this.reported = true,
    this.note,
    this.rowVersion = 1,
  });

  factory DangerSignReport.fromMap(Map<String, dynamic> m) => DangerSignReport(
        id: m['id'] as String,
        visitId: m['visit_id'] as String,
        signKey: m['sign_key'] as String,
        reported: m['reported'] == null ? true : mcBool(m['reported']),
        note: m['note'] as String?,
        rowVersion: m['row_version'] as int? ?? 1,
      );

  Map<String, dynamic> toMap() => {
        'id': id,
        'visit_id': visitId,
        'sign_key': signKey,
        'reported': reported,
        'note': note,
        'row_version': rowVersion,
      };
}
