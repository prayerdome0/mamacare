/// A registered mother. [motherCode] is the canonical server-assigned code
/// (MC-000245). While offline and unsynced, [provisionalCode] is shown
/// instead so two devices can never mint the same canonical code.
class Mother {
  final String id;
  final String? motherCode;
  final String? provisionalCode;
  final String fullName;
  final DateTime? dateOfBirth;
  final int? age;
  final String? phone;
  final String? address;
  final String? community;
  final String? emergencyContactName;
  final String? emergencyContactPhone;
  final String? preferredLanguage;
  final String registrationFacilityId;
  final String? registeredBy;
  final DateTime createdAt;
  final DateTime? updatedAt;
  final int rowVersion;

  Mother({
    required this.id,
    this.motherCode,
    this.provisionalCode,
    required this.fullName,
    this.dateOfBirth,
    this.age,
    this.phone,
    this.address,
    this.community,
    this.emergencyContactName,
    this.emergencyContactPhone,
    this.preferredLanguage,
    required this.registrationFacilityId,
    this.registeredBy,
    required this.createdAt,
    this.updatedAt,
    this.rowVersion = 1,
  });

  /// Display code: canonical when synced, provisional while offline.
  String get displayCode => motherCode ?? provisionalCode ?? 'MC-LOCAL';

  factory Mother.fromMap(Map<String, dynamic> m) => Mother(
        id: m['id'] as String,
        motherCode: m['mother_code'] as String?,
        provisionalCode: m['provisional_code'] as String?,
        fullName: m['full_name'] as String? ?? '',
        dateOfBirth: mcDate(m['date_of_birth']),
        age: m['age'] as int?,
        phone: m['phone'] as String?,
        address: m['address'] as String?,
        community: m['community'] as String?,
        emergencyContactName: m['emergency_contact_name'] as String?,
        emergencyContactPhone: m['emergency_contact_phone'] as String?,
        preferredLanguage: m['preferred_language'] as String?,
        registrationFacilityId: m['registration_facility_id'] as String,
        registeredBy: m['registered_by'] as String?,
        createdAt: mcDate(m['created_at']) ?? DateTime.now(),
        updatedAt: mcDate(m['updated_at']),
        rowVersion: (m['row_version'] as int?) ?? 1,
      );

  Map<String, dynamic> toMap() => {
        'id': id,
        'mother_code': motherCode,
        'provisional_code': provisionalCode,
        'full_name': fullName,
        'date_of_birth': dateOfBirth != null ? mcDateStr(dateOfBirth!) : null,
        'age': age,
        'phone': phone,
        'address': address,
        'community': community,
        'emergency_contact_name': emergencyContactName,
        'emergency_contact_phone': emergencyContactPhone,
        'preferred_language': preferredLanguage,
        'registration_facility_id': registrationFacilityId,
        'registered_by': registeredBy,
        'created_at': mcDateStr(createdAt),
        'updated_at': updatedAt != null ? mcDateStr(updatedAt!) : null,
        'row_version': rowVersion,
      };
}

/// Shared date helpers so every model serializes the same way.
DateTime? mcDate(dynamic v) {
  if (v == null) return null;
  if (v is DateTime) return v;
  return DateTime.tryParse(v.toString());
}

String mcDateStr(DateTime dt) {
  final pad = (int n) => n.toString().padLeft(2, '0');
  return '${dt.year}-${pad(dt.month)}-${pad(dt.day)}'
      ' ${pad(dt.hour)}:${pad(dt.minute)}:${pad(dt.second)}';
}

String mcDayStr(DateTime dt) =>
    '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}';

/// Tolerant bool parse — Postgres returns real booleans, local SQLite
/// returns 0/1 ints.
bool mcBool(dynamic v) => v == true || v == 1 || v == '1';
