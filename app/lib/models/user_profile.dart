import 'mother.dart';

/// Roles, per the MAMA CARE access model.
class Roles {
  static const admin = 'admin';
  static const midwife = 'midwife';
  static const nurse = 'nurse';
  static const chp = 'chp';
  static const supervisor = 'supervisor';
  static const mother = 'mother';

  static const all = [admin, midwife, nurse, chp, supervisor, mother];

  static String label(String role) => switch (role) {
        admin => 'Administrator',
        midwife => 'Midwife',
        nurse => 'Nurse',
        chp => 'Community Health Worker',
        supervisor => 'Facility Supervisor',
        mother => 'Mother',
        _ => role,
      };
}

class UserProfile {
  final String id;
  final String fullName;
  final String role;
  final String? phone;
  final String? facilityId;
  final String? facilityName;
  final bool isActive;

  const UserProfile({
    required this.id,
    required this.fullName,
    required this.role,
    this.phone,
    this.facilityId,
    this.facilityName,
    this.isActive = true,
  });

  factory UserProfile.fromMap(Map<String, dynamic> m, {String? facilityName}) =>
      UserProfile(
        id: m['id'] as String,
        fullName: m['full_name'] as String? ?? '',
        role: m['role'] as String? ?? Roles.chp,
        phone: m['phone'] as String?,
        facilityId: m['facility_id'] as String?,
        facilityName: facilityName,
        isActive: m['is_active'] == null ? true : mcBool(m['is_active']),
      );

  Map<String, dynamic> toMap() => {
        'id': id,
        'full_name': fullName,
        'role': role,
        'phone': phone,
        'facility_id': facilityId,
        'is_active': isActive,
      };
}
