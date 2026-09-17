/**
 * First-install seed for device (IndexedDB) mode.
 *
 * Two things happen here, once:
 *
 *  1. **Always**: the facility directory and the global settings document, so a
 *     brand-new install has something real to search and a settings screen that
 *     works.
 *  2. **When `VITE_LOCAL_DEMO_SEED` is on (the default)**: three demonstration
 *     accounts — a pregnant mother, a postnatal mother with a newborn, a verified
 *     midwife with a care link, and an administrator — so every screen of the
 *     platform can be exercised offline before Firebase is provisioned.
 *
 * Everything is written through the provider's own write path, so the seeded data
 * is subject to exactly the same rules as data a user types in. Nothing is faked
 * at read time.
 */

import { app } from '@/config/env';
import { facilitySeeds } from '@/config/facilities';
import { scheduleForBaby } from '@/config/immunization';
import { defaultProfile } from '@/services/auth/profile-lookup';
import { localAuth } from '@/services/auth/local-auth';
import { threadId } from '@/services/repositories';
import type { LocalDataProvider } from '@/services/data/local/provider';
import type { SystemSettings } from '@/types/domain';

export const DEMO_PASSWORD = 'mamacare123';

export const DEMO_ACCOUNTS = [
  { email: 'demo@mamacare.health', role: 'Mother — 24 weeks pregnant', name: 'Chileshe Mwansa' },
  { email: 'baby@mamacare.health', role: 'Mother & Baby mode — 14 days old', name: 'Bwalya Kapata' },
  { email: 'provider@mamacare.health', role: 'Healthcare provider (midwife)', name: 'Namwinga Banda' },
  { email: 'admin@mamacare.health', role: 'System administrator', name: 'Dr. Joseph Mulenga' },
];

const daysAgo = (days: number): string => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
};

const daysAhead = (days: number): string => daysAgo(-days);

export async function seedDeviceData(provider: LocalDataProvider): Promise<void> {
  const existing = await provider.readRaw('settings', 'global');
  if (existing) return; // already seeded

  /* Global settings ---------------------------------------------------- */
  const settings: SystemSettings = {
    id: 'global',
    key: 'global',
    registrationOpen: true,
    providerApprovalsRequired: true,
    defaultCountry: 'ZM',
    supportEmail: app.supportEmail,
    supportPhone: app.supportPhone,
    emergencyNumbers: [
      { label: 'Emergency — police, ambulance, fire', number: '999' },
      { label: 'Police', number: '991' },
      { label: 'Fire brigade', number: '993' },
      { label: 'Lusaka Ambulance Service', number: '0211 220180' },
    ],
    immunizationScheduleLabel: 'Zambia EPI routine schedule',
    contentReviewReminderDays: 365,
    maintenanceMessage: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await provider.seedRows('settings', [settings]);

  /* Facility directory -------------------------------------------------- */
  await provider.seedRows('facilities', facilitySeeds());

  if (!app.demoSeed) return;

  const facilities = await provider.readRaw('facilities', 'facility-kabwata-clinic');
  const kabwata = facilities ?? (await provider.readRaw('facilities', 'facility-university-teaching-hospital-uth'));
  const facilityName = kabwata?.name ?? 'Kabwata Clinic';
  const facilityId = kabwata?.id ?? null;

  /* Accounts ------------------------------------------------------------ */
  const motherUid = 'demo-mother';
  const postnatalUid = 'demo-postnatal';
  const providerUid = 'demo-provider';
  const adminUid = 'demo-admin';

  await localAuth.seedAccount({ uid: motherUid, email: 'demo@mamacare.health', password: DEMO_PASSWORD });
  await localAuth.seedAccount({ uid: postnatalUid, email: 'baby@mamacare.health', password: DEMO_PASSWORD });
  await localAuth.seedAccount({ uid: providerUid, email: 'provider@mamacare.health', password: DEMO_PASSWORD });
  await localAuth.seedAccount({ uid: adminUid, email: 'admin@mamacare.health', password: DEMO_PASSWORD });

  await provider.provisionUser({
    ...defaultProfile({
      uid: motherUid,
      fullName: 'Chileshe Mwansa',
      email: 'demo@mamacare.health',
      phone: '0971234567',
      dateOfBirth: '1996-04-18',
      country: 'ZM',
    }),
    emergencyContact: { name: 'Joseph Mwansa', phone: '0977654321', relationship: 'Husband' },
    facilityId: null,
  });

  await provider.provisionUser({
    ...defaultProfile({
      uid: postnatalUid,
      fullName: 'Bwalya Kapata',
      email: 'baby@mamacare.health',
      phone: '0966112233',
      dateOfBirth: '1993-09-02',
      country: 'ZM',
    }),
    emergencyContact: { name: 'Mutale Kapata', phone: '0966445566', relationship: 'Sister' },
  });

  await provider.provisionUser({
    ...defaultProfile({
      uid: providerUid,
      fullName: 'Namwinga Banda',
      email: 'provider@mamacare.health',
      phone: '0955000111',
      country: 'ZM',
      role: 'PROVIDER',
      status: 'ACTIVE',
    }),
    facilityId,
  });

  await provider.provisionUser({
    ...defaultProfile({
      uid: adminUid,
      fullName: 'Dr. Joseph Mulenga',
      email: 'admin@mamacare.health',
      phone: '0977000222',
      country: 'ZM',
      role: 'ADMIN',
      status: 'ACTIVE',
    }),
  });

  /* Pregnancy: 24 weeks -------------------------------------------------- */
  await provider.seedRows('pregnancies', [
    {
      id: 'demo-pregnancy',
      userId: motherUid,
      lmpDate: daysAgo(24 * 7),
      eddDate: daysAhead(16 * 7),
      datingMethod: 'lmp',
      previousPregnancies: 1,
      previousLiveBirths: 1,
      status: 'active',
      deliveryDate: null,
      postnatalSince: null,
      facilityId,
      notes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]);
  const pregnancy = { id: 'demo-pregnancy' };

  /* Postnatal pregnancy + baby ------------------------------------------ */
  await provider.seedRows('pregnancies', [
    {
      id: 'demo-pregnancy-2',
      userId: postnatalUid,
      lmpDate: daysAgo(280 + 14),
      eddDate: daysAgo(14),
      datingMethod: 'ultrasound',
      previousPregnancies: 2,
      previousLiveBirths: 2,
      status: 'delivered',
      deliveryDate: daysAgo(14),
      postnatalSince: daysAgo(14),
      facilityId,
      notes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]);

  const baby = {
    id: 'demo-baby',
    userId: postnatalUid,
    dateOfBirth: daysAgo(14),
  };
  await provider.seedRows('babies', [
    {
      id: 'demo-baby',
      userId: postnatalUid,
      pregnancyId: 'demo-pregnancy-2',
      name: 'Baby Kapata',
      dateOfBirth: daysAgo(14),
      sex: 'female',
      birthWeightKg: 3.2,
      birthLengthCm: 50,
      headCircumferenceCm: 34,
      birthFacilityId: facilityId,
      birthNotes: 'Normal vaginal delivery.',
      photoUrl: null,
      photoPublicId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]);

  /* Appointments --------------------------------------------------------- */
  await provider.seedRows('appointments', [
    {
      id: 'demo-appointment-1',
      userId: motherUid,
      babyId: null,
      kind: 'antenatal',
      date: daysAgo(28),
      time: '09:30',
      facilityId,
      facilityName,
      purpose: 'Antenatal check-up (20 weeks)',
      status: 'completed',
      observations: [
        { kind: 'blood-pressure', label: 'Blood pressure', value: '112/74', unit: 'mmHg', recordedBy: 'provider', takenAt: `${daysAgo(28)}T09:40:00.000Z` },
        { kind: 'weight', label: 'Weight', value: '68.5', unit: 'kg', recordedBy: 'provider', takenAt: `${daysAgo(28)}T09:35:00.000Z` },
        { kind: 'hb', label: 'Haemoglobin', value: '11.8', unit: 'g/dL', recordedBy: 'provider', takenAt: `${daysAgo(28)}T09:45:00.000Z` },
      ],
      testResults: 'Urine dipstick: no protein, no glucose.',
      questions: ['Is it safe to travel by bus to the village?'],
      clinicianNotes: 'Progressing well. Continue iron and folic acid.',
      nextAppointmentDate: daysAhead(5),
      reminderSentAt: null,
      sharedWithSupporter: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'demo-appointment-2',
      userId: motherUid,
      babyId: null,
      kind: 'antenatal',
      date: daysAhead(5),
      time: '09:00',
      facilityId,
      facilityName,
      purpose: 'Antenatal check-up (26 weeks)',
      status: 'scheduled',
      observations: [],
      testResults: null,
      questions: ['Ask about the anomaly scan', 'Ask about malaria prevention doses'],
      clinicianNotes: null,
      nextAppointmentDate: null,
      reminderSentAt: null,
      sharedWithSupporter: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'demo-appointment-3',
      userId: postnatalUid,
      babyId: baby.id,
      kind: 'postnatal',
      date: daysAhead(2),
      time: '08:30',
      facilityId,
      facilityName,
      purpose: 'Postnatal check for mother and baby',
      status: 'scheduled',
      observations: [],
      testResults: null,
      questions: ['Breastfeeding: baby seems to feed for a very long time'],
      clinicianNotes: null,
      nextAppointmentDate: null,
      reminderSentAt: null,
      sharedWithSupporter: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]);

  /* Reminders ------------------------------------------------------------ */
  await provider.seedRows('reminders', [
    {
      id: 'demo-reminder-1',
      userId: motherUid,
      kind: 'supplement',
      title: 'Iron and folic acid',
      medicine: 'Iron + folic acid tablet',
      dose: 'One tablet',
      times: ['08:00'],
      frequency: 'daily',
      daysOfWeek: [],
      startDate: daysAgo(120),
      endDate: null,
      active: true,
      prescribedBy: `${facilityName} antenatal clinic`,
      instructions: 'Take with food or fruit juice, not with tea or coffee.',
      takenLog: [`${daysAgo(1)}T08:02:00.000Z`, new Date().toISOString()],
      sharedWithSupporter: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'demo-reminder-2',
      userId: motherUid,
      kind: 'custom',
      title: 'Malaria preventive dose',
      medicine: 'As prescribed at the antenatal clinic',
      dose: 'As prescribed',
      times: ['19:00'],
      frequency: 'specific-days',
      daysOfWeek: [3],
      startDate: daysAgo(30),
      endDate: null,
      active: true,
      prescribedBy: facilityName,
      instructions: 'Follow the schedule your clinic gave you.',
      takenLog: [],
      sharedWithSupporter: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'demo-reminder-3',
      userId: postnatalUid,
      kind: 'custom',
      title: 'Baby vitamin drops',
      medicine: 'As prescribed for the baby',
      dose: 'As prescribed',
      times: ['07:30'],
      frequency: 'daily',
      daysOfWeek: [],
      startDate: daysAgo(10),
      endDate: null,
      active: true,
      prescribedBy: facilityName,
      instructions: 'Given by the child welfare clinic.',
      takenLog: [],
      sharedWithSupporter: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]);

  /* Observations between visits ------------------------------------------ */
  await provider.seedRows('observations', [
    {
      id: 'demo-observation-1',
      userId: motherUid,
      pregnancyId: pregnancy.id,
      kind: 'weight',
      label: 'Weight at home',
      value: '69.2',
      systolic: null,
      diastolic: null,
      unit: 'kg',
      weekNumber: 23,
      recordedBy: 'self',
      appointmentId: null,
      notes: null,
      createdAt: daysAgo(7),
      updatedAt: daysAgo(7),
    },
    {
      id: 'demo-observation-2',
      userId: motherUid,
      pregnancyId: pregnancy.id,
      kind: 'fetal-movement',
      label: 'Movements counted',
      value: '10 movements in 40 minutes',
      systolic: null,
      diastolic: null,
      unit: null,
      weekNumber: 24,
      recordedBy: 'self',
      appointmentId: null,
      notes: 'Counted after supper.',
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1),
    },
  ]);

  /* Immunization schedule for the newborn --------------------------------- */
  await provider.seedRows(
    'immunizations',
    scheduleForBaby(baby.dateOfBirth).map((dose, index) => ({
      id: `demo-immunization-${index}`,
      babyId: baby.id,
      userId: postnatalUid,
      vaccineCode: dose.code,
      vaccineName: dose.vaccine,
      dose: dose.dose,
      scheduledAgeLabel: dose.ageLabel,
      scheduledDate: dose.scheduledDate,
      givenDate: dose.scheduledDate <= daysAgo(0) ? dose.scheduledDate : null,
      status: dose.scheduledDate <= daysAgo(0) ? 'given' : 'upcoming',
      facilityId,
      facilityName: dose.scheduledDate <= daysAgo(0) ? facilityName : null,
      batchNumber: null,
      notes: dose.note ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
  );

  /* Journal --------------------------------------------------------------- */
  await provider.seedRows('journal', [
    {
      id: 'demo-journal-1',
      userId: motherUid,
      babyId: null,
      date: daysAgo(10),
      title: 'Felt the first real kicks',
      body: 'Baby kicked properly for the first time last night after supper. Joseph felt it too. I am 23 weeks.',
      mood: 'great',
      tags: ['milestone', 'movements'],
      private: true,
      createdAt: daysAgo(10),
      updatedAt: daysAgo(10),
    },
    {
      id: 'demo-journal-2',
      userId: motherUid,
      babyId: null,
      date: daysAgo(3),
      title: 'Questions for the next visit',
      body: 'Ask about the anomaly scan, whether I can travel to the village by bus, and about the malaria doses.',
      mood: 'okay',
      tags: ['questions'],
      private: true,
      createdAt: daysAgo(3),
      updatedAt: daysAgo(3),
    },
  ]);

  /* Provider directory + care link ---------------------------------------- */
  await provider.seedRows('providers', [
    {
      id: 'demo-provider-record',
      userId: providerUid,
      fullName: 'Namwinga Banda',
      title: 'SRN, RM',
      profession: 'midwife',
      facilityId,
      facilityName,
      licenseNumber: 'GNCZ-000000',
      languages: ['English', 'Bemba', 'Nyanja'],
      bio: 'Midwife with ten years in antenatal and delivery care. Interested in breastfeeding support and adolescent pregnancy.',
      phone: '0955000111',
      email: 'provider@mamacare.health',
      photoUrl: null,
      photoPublicId: null,
      status: 'approved',
      verifiedBy: 'Dr. Joseph Mulenga',
      verifiedAt: new Date().toISOString(),
      rejectionReason: null,
      acceptingNewPatients: true,
      listedInDirectory: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]);
  await provider.seedRows('care_links', [
    {
      id: 'demo-care-link',
      motherUserId: motherUid,
      motherName: 'Chileshe Mwansa',
      providerUserId: providerUid,
      providerId: 'demo-provider-record',
      providerName: 'Namwinga Banda',
      facilityId,
      facilityName,
      grantedBy: 'mother',
      status: 'active',
      note: 'Antenatal care at the clinic.',
      createdAt: daysAgo(120),
      updatedAt: daysAgo(120),
    },
  ]);

  /* Messages ---------------------------------------------------------------- */
  await provider.seedRows('messages', [
    {
      id: 'demo-message-1',
      threadId: threadId(motherUid, providerUid),
      fromUserId: motherUid,
      fromName: 'Chileshe Mwansa',
      fromRole: 'MOTHER',
      toUserId: providerUid,
      toName: 'Namwinga Banda',
      body: 'Good morning. Is it safe for me to travel by bus to the village next month?',
      readAt: new Date().toISOString(),
      systemNotice: false,
      createdAt: daysAgo(2),
      updatedAt: daysAgo(2),
    },
    {
      id: 'demo-message-2',
      threadId: threadId(motherUid, providerUid),
      fromUserId: providerUid,
      fromName: 'Namwinga Banda',
      fromRole: 'PROVIDER',
      toUserId: motherUid,
      toName: 'Chileshe Mwansa',
      body: 'Hello Chileshe. Short trips are usually fine at 24 weeks if you are well, but please raise it at your appointment on the date shown so I can check your blood pressure first. Remember this chat is not for emergencies.',
      readAt: null,
      systemNotice: false,
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1),
    },
  ]);

  /* Notifications ------------------------------------------------------------ */
  await provider.seedRows('notifications', [
    {
      id: 'demo-notification-1',
      userId: motherUid,
      kind: 'appointment',
      title: 'Antenatal appointment coming up',
      body: `Your antenatal check-up at ${facilityName} is in five days.`,
      link: '/app/appointments',
      readAt: null,
      deliveredByPush: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'demo-notification-2',
      userId: motherUid,
      kind: 'milestone',
      title: 'Week 24',
      body: 'You are in week 24 — the start of the third trimester is close. Your guide for this week is ready.',
      link: '/app/pregnancy',
      readAt: null,
      deliveredByPush: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'demo-notification-3',
      userId: postnatalUid,
      kind: 'immunization',
      title: 'Immunization due soon',
      body: 'Your baby has vaccines due at six weeks. Bring the child health card.',
      link: '/app/baby',
      readAt: null,
      deliveredByPush: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]);

  /* Announcements ------------------------------------------------------------- */
  await provider.seedRows('announcements', [
    {
      id: 'demo-announcement-1',
      title: 'Child welfare clinic hours',
      body: 'Immunization clinics run Monday to Friday, 07:30 to 12:00. Come early and bring the child health card.',
      audience: 'all',
      link: null,
      tone: 'info',
      active: true,
      startsAt: null,
      endsAt: null,
      createdBy: adminUid,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]);

  /* Audit trail ---------------------------------------------------------------- */
  await provider.seedRows('audit_logs', [
    {
      id: 'demo-audit-1',
      action: 'register',
      actorId: motherUid,
      actorName: 'Chileshe Mwansa',
      actorRole: 'MOTHER',
      targetType: 'users',
      targetId: motherUid,
      detail: 'Device-mode demonstration account',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'demo-audit-2',
      action: 'provider-approval',
      actorId: adminUid,
      actorName: 'Dr. Joseph Mulenga',
      actorRole: 'ADMIN',
      targetType: 'providers',
      targetId: 'demo-provider-record',
      detail: 'Approved Namwinga Banda (midwife)',
      createdAt: new Date().toISOString(),
    },
  ]);
}
