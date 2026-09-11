import 'mother.dart';

class Vitals {
  final String id;
  final String visitId;
  final int? systolicBp;
  final int? diastolicBp;
  final int? pulse;
  final double? temperatureC;
  final int? respiratoryRate;
  final double? weightKg;
  final String? otherObservations;
  final int rowVersion;

  Vitals({
    required this.id,
    required this.visitId,
    this.systolicBp,
    this.diastolicBp,
    this.pulse,
    this.temperatureC,
    this.respiratoryRate,
    this.weightKg,
    this.otherObservations,
    this.rowVersion = 1,
  });

  factory Vitals.fromMap(Map<String, dynamic> m) => Vitals(
        id: m['id'] as String,
        visitId: m['visit_id'] as String,
        systolicBp: m['systolic_bp'] as int?,
        diastolicBp: m['diastolic_bp'] as int?,
        pulse: m['pulse'] as int?,
        temperatureC: (m['temperature_c'] as num?)?.toDouble(),
        respiratoryRate: m['respiratory_rate'] as int?,
        weightKg: (m['weight_kg'] as num?)?.toDouble(),
        otherObservations: m['other_observations'] as String?,
        rowVersion: m['row_version'] as int? ?? 1,
      );

  Map<String, dynamic> toMap() => {
        'id': id,
        'visit_id': visitId,
        'systolic_bp': systolicBp,
        'diastolic_bp': diastolicBp,
        'pulse': pulse,
        'temperature_c': temperatureC,
        'respiratory_rate': respiratoryRate,
        'weight_kg': weightKg,
        'other_observations': otherObservations,
        'row_version': rowVersion,
      };

  String get bpLabel =>
      systolicBp != null && diastolicBp != null
          ? '${systolicBp}/${diastolicBp} mmHg'
          : '—';
}
