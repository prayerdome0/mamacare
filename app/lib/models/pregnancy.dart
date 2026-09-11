import 'mother.dart';

class PregnancyStatus {
  static const active = 'active';
  static const delivered = 'delivered';
  static const postnatal = 'postnatal';
  static const closed = 'closed';
  static const lost = 'lost_to_followup';

  static String label(String s) => switch (s) {
        active => 'Active pregnancy',
        delivered => 'Delivered',
        postnatal => 'Postnatal follow-up',
        closed => 'Closed',
        lost => 'Lost to follow-up',
        _ => s,
      };
}

class Pregnancy {
  final String id;
  final String motherId;
  final int gravida;
  final int para;
  final List<String> previousComplications;
  final DateTime lmpDate;
  final DateTime eddDate;
  final DateTime? confirmedDate;
  final String multiplePregnancy; // single | suspected_multiple | confirmed_multiple
  final bool previousCSection;
  final List<String> riskFactors;
  final String status;
  final DateTime createdAt;
  final int rowVersion;

  Pregnancy({
    required this.id,
    required this.motherId,
    required this.gravida,
    required this.para,
    this.previousComplications = const [],
    required this.lmpDate,
    required this.eddDate,
    this.confirmedDate,
    this.multiplePregnancy = 'single',
    this.previousCSection = false,
    this.riskFactors = const [],
    this.status = PregnancyStatus.active,
    required this.createdAt,
    this.rowVersion = 1,
  });

  factory Pregnancy.fromMap(Map<String, dynamic> m) => Pregnancy(
        id: m['id'] as String,
        motherId: m['mother_id'] as String,
        gravida: m['gravida'] as int? ?? 1,
        para: m['para'] as int? ?? 0,
        previousComplications:
            (m['previous_complications'] as List?)?.cast<String>() ?? const [],
        lmpDate: mcDate(m['lmp_date']) ?? DateTime.now(),
        eddDate: mcDate(m['edd_date']) ?? DateTime.now(),
        confirmedDate: mcDate(m['confirmed_date']),
        multiplePregnancy: m['multiple_pregnancy'] as String? ?? 'single',
        previousCSection: mcBool(m['previous_c_section']),
        riskFactors: (m['risk_factors'] as List?)?.cast<String>() ?? const [],
        status: m['status'] as String? ?? PregnancyStatus.active,
        createdAt: mcDate(m['created_at']) ?? DateTime.now(),
        rowVersion: m['row_version'] as int? ?? 1,
      );

  Map<String, dynamic> toMap() => {
        'id': id,
        'mother_id': motherId,
        'gravida': gravida,
        'para': para,
        'previous_complications': previousComplications,
        'lmp_date': mcDateStr(lmpDate),
        'edd_date': mcDateStr(eddDate),
        'confirmed_date': confirmedDate != null ? mcDateStr(confirmedDate!) : null,
        'multiple_pregnancy': multiplePregnancy,
        'previous_c_section': previousCSection,
        'risk_factors': riskFactors,
        'status': status,
        'created_at': mcDateStr(createdAt),
        'row_version': rowVersion,
      };

  Pregnancy copyWithStatus(String newStatus) => Pregnancy(
        id: id,
        motherId: motherId,
        gravida: gravida,
        para: para,
        previousComplications: previousComplications,
        lmpDate: lmpDate,
        eddDate: eddDate,
        confirmedDate: confirmedDate,
        multiplePregnancy: multiplePregnancy,
        previousCSection: previousCSection,
        riskFactors: riskFactors,
        status: newStatus,
        createdAt: createdAt,
        rowVersion: rowVersion,
      );
}
