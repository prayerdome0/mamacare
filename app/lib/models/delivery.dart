import 'mother.dart';

class DeliveryMode {
  static const spontaneous = 'spontaneous';
  static const vacuum = 'instrumental_vacuum';
  static const forceps = 'instrumental_forceps';
  static const cesarean = 'cesarean_section';

  static String label(String m) => switch (m) {
        spontaneous => 'Spontaneous / normal',
        vacuum => 'Instrumental — vacuum',
        forceps => 'Instrumental — forceps',
        cesarean => 'Cesarean section',
        _ => m,
      };
}

class Delivery {
  final String id;
  final String pregnancyId;
  final DateTime deliveryDate;
  final String placeOfDelivery; // this_facility | other_facility | home | other
  final String modeOfDelivery;
  final String outcome; // alive | dead | stillbirth
  final String? maternalOutcome;
  final String? babyOutcome;
  final double? birthWeightKg;
  final String? complications;
  final bool referredAdmission;
  final String? recordedBy;
  final int rowVersion;

  Delivery({
    required this.id,
    required this.pregnancyId,
    required this.deliveryDate,
    required this.placeOfDelivery,
    required this.modeOfDelivery,
    required this.outcome,
    this.maternalOutcome,
    this.babyOutcome,
    this.birthWeightKg,
    this.complications,
    this.referredAdmission = false,
    this.recordedBy,
    this.rowVersion = 1,
  });

  factory Delivery.fromMap(Map<String, dynamic> m) => Delivery(
        id: m['id'] as String,
        pregnancyId: m['pregnancy_id'] as String,
        deliveryDate: mcDate(m['delivery_date']) ?? DateTime.now(),
        placeOfDelivery: m['place_of_delivery'] as String? ?? 'other',
        modeOfDelivery: m['mode_of_delivery'] as String? ?? DeliveryMode.spontaneous,
        outcome: m['outcome'] as String? ?? '',
        maternalOutcome: m['maternal_outcome'] as String?,
        babyOutcome: m['baby_outcome'] as String?,
        birthWeightKg: (m['birth_weight_kg'] as num?)?.toDouble(),
        complications: m['complications'] as String?,
        referredAdmission: mcBool(m['referred_admission']),
        recordedBy: m['recorded_by'] as String?,
        rowVersion: m['row_version'] as int? ?? 1,
      );

  Map<String, dynamic> toMap() => {
        'id': id,
        'pregnancy_id': pregnancyId,
        'delivery_date': mcDateStr(deliveryDate),
        'place_of_delivery': placeOfDelivery,
        'mode_of_delivery': modeOfDelivery,
        'outcome': outcome,
        'maternal_outcome': maternalOutcome,
        'baby_outcome': babyOutcome,
        'birth_weight_kg': birthWeightKg,
        'complications': complications,
        'referred_admission': referredAdmission,
        'recorded_by': recordedBy,
        'row_version': rowVersion,
      };
}
