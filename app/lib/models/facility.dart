class Facility {
  final String id;
  final String code;
  final String name;
  final String type;
  final String? district;
  final String? province;
  final String? phone;

  const Facility({
    required this.id,
    required this.code,
    required this.name,
    required this.type,
    this.district,
    this.province,
    this.phone,
  });

  factory Facility.fromMap(Map<String, dynamic> m) => Facility(
        id: m['id'] as String,
        code: m['facility_code'] as String? ?? '',
        name: m['name'] as String? ?? '',
        type: m['facility_type'] as String? ?? 'health_centre',
        district: m['district'] as String?,
        province: m['province'] as String?,
        phone: m['phone'] as String?,
      );

  Map<String, dynamic> toMap() => {
        'id': id,
        'facility_code': code,
        'name': name,
        'facility_type': type,
        'district': district,
        'province': province,
        'phone': phone,
      };
}
