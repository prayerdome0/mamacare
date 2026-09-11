/**
 * Demonstration dataset — device provider only.
 *
 * This writes real records through the same repositories the UI uses (no fake
 * arrays, no separate data path), so charts, filters, alerts and reports behave
 * exactly as they will in production. It exists because an empty installation
 * cannot demonstrate a maternal-care system, and it is unavailable whenever
 * Firebase is configured.
 *
 * All names are fictitious and are not real patients.
 */

import { addDays, toIsoDate } from '@/lib/utils';
import { eddFromLmp, gestationalAge } from '@/lib/obstetrics';
import { newId } from '@/lib/ids';
import { services } from '@/services/session-store';
import type { LocalDataProvider } from '@/services/data/local/provider';
import type { Actor } from '@/services/data/contract';
import { createCredential } from '@/services/auth/local-auth';
import { DEFAULT_ALERT_RULES } from '@/services/clinical/rules';
import type {
  AlertRule,
  AncVisit,
  Appointment,
  ClinicalAlert,
  DocumentRecord,
  EducationResource,
  Facility,
  Mother,
  Pregnancy,
  Referral,
  Role,
  UserProfile,
} from '@/types/domain';

export interface SeedAccount {
  email: string;
  password: string;
  name: string;
  role: Role;
  title: string;
}

export const DEMO_PASSWORD = 'MamaCare!2026';

export const DEMO_ACCOUNTS: SeedAccount[] = [
  { email: 'admin@mamacare.health', password: DEMO_PASSWORD, name: 'Grace Mwansa', role: 'ADMIN', title: 'System administrator' },
  { email: 'supervisor@clinic.mamacare.health', password: DEMO_PASSWORD, name: 'Beatrice Zulu', role: 'FACILITY_SUPERVISOR', title: 'In-charge, Chilenje Health Post' },
  { email: 'midwife@clinic.mamacare.health', password: DEMO_PASSWORD, name: 'Thandiwe Phiri', role: 'MIDWIFE', title: 'Senior midwife' },
  { email: 'nurse@clinic.mamacare.health', password: DEMO_PASSWORD, name: 'Joseph Chanda', role: 'NURSE', title: 'Clinical nurse' },
  { email: 'chw@clinic.mamacare.health', password: DEMO_PASSWORD, name: 'Mercy Banda', role: 'COMMUNITY_HEALTH_WORKER', title: 'Community health worker' },
  { email: 'mother@mamacare.health', password: DEMO_PASSWORD, name: 'Mary Phiri', role: 'MOTHER', title: 'Mother (patient account)' },
];

const FIRST_NAMES = ['Mary', 'Chipo', 'Luyando', 'Thandiwe', 'Natasha', 'Doris', 'Brenda', 'Mutale', 'Lombe', 'Nsofwa', 'Chanda', 'Mwape', 'Bupe', 'Kunda', 'Tayeba', 'Namukolo', 'Zimbabwe-diaspora'];
const SURNAMES = ['Phiri', 'Mwanza', 'Banda', 'Zulu', 'Tembo', 'Mwansa', 'Chileshe', 'Nkhuwa', 'Daka', 'Musonda', 'Gondwe', 'Lungu', 'Sakala', 'Mumba', 'Chanda', 'Nawakwi', 'Siketi'];
const COMMUNITIES = ['Chilenje', 'Kanyama R2', 'Matero Zone 4', 'Fairview', 'Olympia', 'Chawama', 'Avondshire', 'Kabwata', 'Makeni', 'Chelstone'];
const LANGUAGES = ['Bemba', 'Nyanja', 'English', 'Tonga'];

const pick = <T>(array: T[], index: number): T => array[index % array.length] as T;

let counter = 100;
const nextSeq = (): number => (counter += 1);

interface Blueprint {
  fullName: string;
  phone: string;
  community: string;
  language: string;
  age: number;
  lmpDaysAgo: number;
  gravida: number;
  para: number;
  riskFactors: string[];
  previousComplications: string[];
  previousCesarean: boolean;
  gestationCount: 1 | 2;
  visits: {
    offsetDays: number;
    systolic: number;
    diastolic: number;
    pulse: number;
    temperature: number | null;
    weight: number;
    muac: number | null;
    fundal: number | null;
    fetal: number | null;
    haemoglobin: number | null;
    protein: 'NONE' | 'TRACE' | 'PLUS_1' | 'PLUS_2' | null;
    dangerSigns: string[];
    note: string;
    outcome?: 'CONTINUE_CARE' | 'REFERRED' | 'ADMITTED';
    counselling: string[];
  }[];
  referral?: { urgency: 'EMERGENCY' | 'URGENT' | 'ROUTINE'; reason: string; status: Referral['status'] };
  appointmentOffsets: number[];
  missedCount?: number;
}

function buildBlueprints(): Blueprint[] {
  const plans: Blueprint[] = [];
  // A term pregnancy with severe-range blood pressure → RED.
  plans.push({
    fullName: 'Mary Phiri',
    phone: '0971234501',
    community: 'Chilenje',
    language: 'Nyanja',
    age: 29,
    lmpDaysAgo: 170,
    gravida: 3,
    para: 1,
    riskFactors: ['PREVIOUS_CSECTION', 'AGE_OVER_35'],
    previousComplications: ['PRE_ECLAMPSIA'],
    previousCesarean: true,
    gestationCount: 1,
    visits: [
      { offsetDays: 150, systolic: 132, diastolic: 84, pulse: 82, temperature: 36.8, weight: 68.2, muac: 26.5, fundal: null, fetal: null, haemoglobin: 11.8, protein: 'NONE', dangerSigns: [], note: 'Booking visit. Dates confirmed by LMP.', counselling: ['Birth preparedness', 'Danger signs explained', 'ITN use'] },
      { offsetDays: 104, systolic: 138, diastolic: 88, pulse: 84, temperature: null, weight: 70.1, muac: 26.2, fundal: 24, fetal: 146, haemoglobin: 11.2, protein: 'TRACE', dangerSigns: [], note: 'Routine review. Mild oedema, otherwise comfortable.', counselling: ['Iron supplementation', 'Kick counting from 24 weeks'] },
      { offsetDays: 32, systolic: 148, diastolic: 96, pulse: 92, temperature: null, weight: 75.4, muac: 25.8, fundal: 30, fetal: 142, haemoglobin: 10.4, protein: 'PLUS_1', dangerSigns: ['SWELLING_FACE_HANDS'], note: 'Elevated BP with new swelling. Repeat reading at 15 minutes, review within one week.', counselling: ['BP monitoring', 'Return immediately if headache or visual change'] },
      { offsetDays: 4, systolic: 168, diastolic: 112, pulse: 98, temperature: null, weight: 78.9, muac: 25.5, fundal: 34, fetal: 138, haemoglobin: 9.6, protein: 'PLUS_2', dangerSigns: ['SEVERE_HEADACHE', 'VISUAL_DISTURBANCE'], note: 'Severe-range blood pressure with headache and blurred vision. Immediate assessment, magnesium sulphation availability confirmed, transfer arranged.', outcome: 'REFERRED', counselling: ['Urgent review today', 'Do not await the next appointment'] },
    ],
    referral: { urgency: 'EMERGENCY', reason: 'Severe-range hypertension with headache and visual disturbance at 33 weeks — requires assessment for antihypertensive therapy and delivery planning.', status: 'RECEIVED' },
    appointmentOffsets: [-32, -4, 3],
    missedCount: 0,
  });
  // Healthy mid-trimester → GREEN.
  plans.push({
    fullName: 'Chipo Mwanza',
    phone: '0971234502',
    community: 'Matero Zone 4',
    language: 'Bemba',
    age: 24,
    lmpDaysAgo: 122,
    gravida: 1,
    para: 0,
    riskFactors: [],
    previousComplications: [],
    previousCesarean: false,
    gestationCount: 1,
    visits: [
      { offsetDays: 100, systolic: 116, diastolic: 72, pulse: 78, temperature: 36.9, weight: 58.4, muac: 25.0, fundal: null, fetal: null, haemoglobin: 12.4, protein: 'NONE', dangerSigns: [], note: 'First trimester booking. No complications reported.', counselling: ['Folic acid', 'Nutrition', 'Danger signs explained'] },
      { offsetDays: 58, systolic: 118, diastolic: 74, pulse: 80, temperature: null, weight: 60.2, muac: 25.2, fundal: 20, fetal: 150, haemoglobin: 12.0, protein: 'NONE', dangerSigns: [], note: 'Routine review, satisfactory progress.', counselling: ['Iron supplementation', 'Kick counting from 24 weeks'] },
      { offsetDays: 12, systolic: 120, diastolic: 76, pulse: 79, temperature: null, weight: 63.1, muac: 25.4, fundal: 27, fetal: 148, haemoglobin: null, protein: 'NONE', dangerSigns: [], note: 'Routine review. Fetal movement felt daily.', counselling: ['Birth preparedness review'] },
    ],
    appointmentOffsets: [9, 30],
  });
  // Reduced fetal movement at 30 weeks → RED (fetal).
  plans.push({
    fullName: 'Luyando Tembo',
    phone: '0971234503',
    community: 'Kanyama R2',
    language: 'Nyanja',
    age: 33,
    lmpDaysAgo: 210,
    gravida: 4,
    para: 2,
    riskFactors: ['PARA_OVER_4', 'ANAEMIA'],
    previousComplications: ['PPH'],
    previousCesarean: false,
    gestationCount: 1,
    visits: [
      { offsetDays: 180, systolic: 124, diastolic: 80, pulse: 86, temperature: null, weight: 71.0, muac: 24.4, fundal: null, fetal: null, haemoglobin: 9.8, protein: 'NONE', dangerSigns: [], note: 'Booking at 27 weeks (late attendance). Anaemia identified.', counselling: ['Iron and folinic acid', 'Nutrition counselling', 'Birth preparedness'] },
      { offsetDays: 120, systolic: 126, diastolic: 82, pulse: 88, temperature: null, weight: 73.5, muac: 24.6, fundal: 30, fetal: 144, haemoglobin: 10.1, protein: 'NONE', dangerSigns: [], note: 'Recheck of haemoglobin planned. Previous PPH discussed with the team.', counselling: ['Third-trimester iron', 'Facility birth plan'] },
      { offsetDays: 10, systolic: 130, diastolic: 84, pulse: 90, temperature: null, weight: 76.2, muac: 24.5, fundal: 32, fetal: 118, haemoglobin: 9.2, protein: 'NONE', dangerSigns: ['REDUCED_FETAL_MOVEMENT'], note: 'Reported reduced fetal movement today. Fetal heart 118 bpm. Continuous monitoring started; assessment for delivery arranged.', outcome: 'ADMITTED', counselling: ['Immediate assessment', 'Do not leave the unit'] },
    ],
    appointmentOffsets: [-6, 2],
    missedCount: 1,
  });
  // Twin pregnancy, 34 weeks, growth concern → AMBER.
  plans.push({
    fullName: 'Thandiwe Banda',
    phone: '0971234504',
    community: 'Avondshire',
    language: 'English',
    age: 31,
    lmpDaysAgo: 238,
    gravida: 2,
    para: 1,
    riskFactors: ['MULTIPLE_PREGNANCY'],
    previousComplications: [],
    previousCesarean: false,
    gestationCount: 2,
    visits: [
      { offsetDays: 200, systolic: 122, diastolic: 78, pulse: 84, temperature: null, weight: 66.0, muac: 25.1, fundal: 26, fetal: 150, haemoglobin: 11.0, protein: 'NONE', dangerSigns: [], note: 'Twin pregnancy confirmed by ultrasound at 19 weeks. Increased surveillance schedule agreed.', counselling: ['Twice-monthly reviews', 'Iron and folinic acid'] },
      { offsetDays: 150, systolic: 128, diastolic: 82, pulse: 86, temperature: null, weight: 70.4, muac: 24.9, fundal: 34, fetal: 148, haemoglobin: 10.4, protein: 'TRACE', dangerSigns: [], note: 'Fundal height ahead of dates as expected for twins. Ultrasound referral for growth.', counselling: ['Growth surveillance'] },
      { offsetDays: 60, systolic: 136, diastolic: 88, pulse: 90, temperature: 37.2, weight: 76.8, muac: 24.2, fundal: 33, fetal: 146, haemoglobin: 9.4, protein: 'PLUS_1', dangerSigns: ['SEVERE_VOMITING'], note: 'Reduced weight gain with vomiting. Blood pressure trending up; repeat urine protein and review within one week.', counselling: ['Smaller frequent meals', 'Return if headache'] },
    ],
    appointmentOffsets: [-4, 5, 12],
    missedCount: 1,
  });
  // Post-term, no danger signs → AMBER only via dating.
  plans.push({
    fullName: 'Nsofwa Daka',
    phone: '0971234506',
    community: 'Chelstone',
    language: 'Bemba',
    age: 37,
    lmpDaysAgo: 300,
    gravida: 5,
    para: 4,
    riskFactors: ['AGE_OVER_35', 'PARA_OVER_4'],
    previousComplications: [],
    previousCesarean: false,
    gestationCount: 1,
    visits: [
      { offsetDays: 250, systolic: 126, diastolic: 80, pulse: 82, temperature: null, weight: 78.0, muac: 27.0, fundal: 32, fetal: 140, haemoglobin: 11.6, protein: 'NONE', dangerSigns: [], note: 'Grand multiparity discussed; facility birth strongly advised.', counselling: ['Birth preparedness', 'Partner support'] },
      { offsetDays: 120, systolic: 130, diastolic: 84, pulse: 84, temperature: null, weight: 82.5, muac: 27.2, fundal: 38, fetal: 138, haemoglobin: 11.0, protein: 'NONE', dangerSigns: [], note: 'Term. Labour preparedness reviewed.', counselling: ['When to come to the unit'] },
      { offsetDays: 6, systolic: 132, diastolic: 86, pulse: 86, temperature: null, weight: 84.0, muac: 27.0, fundal: 39, fetal: 136, haemoglobin: null, protein: 'NONE', dangerSigns: [], note: 'Past 41 weeks. Plan for hospital assessment confirmed with the day team.', outcome: 'REFERRED', counselling: ['Attend the labour ward if contractions start'] },
    ],
    appointmentOffsets: [-2, 2],
  });
  // Early pregnancy with hyperemesis → AMBER.
  plans.push({
    fullName: 'Brenda Musonda',
    phone: '0971234507',
    community: 'Kabwata',
    language: 'English',
    age: 21,
    lmpDaysAgo: 70,
    gravida: 1,
    para: 0,
    riskFactors: [],
    previousComplications: [],
    previousCesarean: false,
    gestationCount: 1,
    visits: [
      { offsetDays: 40, systolic: 108, diastolic: 66, pulse: 96, temperature: 37.0, weight: 52.4, muac: 23.0, fundal: null, fetal: null, haemoglobin: 12.8, protein: 'NONE', dangerSigns: ['SEVERE_VOMITING'], note: 'First trimester with severe vomiting and weight loss. Oral rehydration, review in 3 days.', counselling: ['Small frequent meals', 'Return if unable to keep fluids'] },
      { offsetDays: 14, systolic: 110, diastolic: 68, pulse: 88, temperature: null, weight: 51.2, muac: 22.6, fundal: null, fetal: null, haemoglobin: null, protein: 'NONE', dangerSigns: [], note: 'Improved intake, weight still below booking.', counselling: ['Continue supplementation'] },
    ],
    appointmentOffsets: [6, 21],
  });
  // Fever in pregnancy (malaria screen) → AMBER/RED by temperature.
  plans.push({
    fullName: 'Mutale Chileshe',
    phone: '0971234508',
    community: 'Chawama',
    language: 'Bemba',
    age: 26,
    lmpDaysAgo: 148,
    gravida: 2,
    para: 0,
    riskFactors: [],
    previousComplications: [],
    previousCesarean: false,
    gestationCount: 1,
    visits: [
      { offsetDays: 120, systolic: 114, diastolic: 70, pulse: 80, temperature: null, weight: 61.0, muac: 24.8, fundal: 22, fetal: 152, haemoglobin: 11.4, protein: 'NONE', dangerSigns: [], note: 'Routine review at 22 weeks.', counselling: ['ITN distribution', 'Routine tests'] },
      { offsetDays: 2, systolic: 118, diastolic: 74, pulse: 104, temperature: 38.6, weight: 62.4, muac: 24.6, fundal: 26, fetal: 162, haemoglobin: 10.2, protein: 'NONE', dangerSigns: ['FEVER'], note: 'Fever with rigors. RDT and blood film sent; IPTp deferred pending results.', counselling: ['Return if fever persists beyond 24 hours'] },
    ],
    appointmentOffsets: [4],
  });
  // Delivered, postnatal → shows delivery records.
  plans.push({
    fullName: 'Bupe Gondwe',
    phone: '0971234509',
    community: 'Olympia',
    language: 'Nyanja',
    age: 30,
    lmpDaysAgo: 292,
    gravida: 2,
    para: 1,
    riskFactors: [],
    previousComplications: [],
    previousCesarean: false,
    gestationCount: 1,
    visits: [
      { offsetDays: 250, systolic: 120, diastolic: 76, pulse: 80, temperature: null, weight: 65.0, muac: 25.6, fundal: 30, fetal: 144, haemoglobin: 11.8, protein: 'NONE', dangerSigns: [], note: 'Routine third-trimester review.', counselling: ['Birth preparedness'] },
      { offsetDays: 210, systolic: 122, diastolic: 78, pulse: 82, temperature: null, weight: 69.8, muac: 25.4, fundal: 36, fetal: 140, haemoglobin: 11.2, protein: 'NONE', dangerSigns: [], note: 'Term. Spontaneous vertex delivery recorded at the maternity ward.', counselling: ['Postnatal visit schedule', 'Family planning discussed'] },
    ],
    appointmentOffsets: [6, 34],
  });

  // Fill the facility roster with routine, low-risk mothers.
  for (let index = 0; index < 12; index += 1) {
    const lmpDaysAgo = 40 + index * 14;
    plans.push({
      fullName: `${pick(FIRST_NAMES, index * 3 + 1)} ${pick(SURNAMES, index * 5 + 2)}`,
      phone: `097123${String(4600 + index * 7)}`,
      community: pick(COMMUNITIES, index),
      language: pick(LANGUAGES, index),
      age: 19 + ((index * 3) % 18),
      lmpDaysAgo,
      gravida: 1 + (index % 4),
      para: index % 3,
      riskFactors: index % 5 === 0 ? ['AGE_UNDER_18'] : [],
      previousComplications: [],
      previousCesarean: false,
      gestationCount: 1,
      visits: Array.from({ length: 1 + (index % 3) }, (_, visitIndex) => ({
        offsetDays: Math.max(3, lmpDaysAgo - 28 * (visitIndex + 1)),
        systolic: 110 + ((index + visitIndex) % 18),
        diastolic: 68 + ((index + visitIndex) % 12),
        pulse: 74 + ((index * 2 + visitIndex) % 18),
        temperature: visitIndex % 4 === 0 ? 36.9 : null,
        weight: 55 + index * 0.9 + visitIndex * 1.8,
        muac: 24 + (index % 4) * 0.6,
        fundal: lmpDaysAgo - 28 * (visitIndex + 1) > 130 ? 20 + visitIndex * 4 : null,
        fetal: lmpDaysAgo - 28 * (visitIndex + 1) > 150 ? 140 + (index % 10) : null,
        haemoglobin: index % 3 === 0 ? 11.8 : null,
        protein: 'NONE',
        dangerSigns: [],
        note: 'Routine antenatal review. No concerns reported at this visit.',
        counselling: ['Danger signs explained', 'Iron supplementation'],
      })),
      appointmentOffsets: [4 + (index % 12), 32 + (index % 20)],
      missedCount: index % 6 === 0 ? 1 : 0,
    });
  }
  return plans;
}

export interface SeedSummary {
  facilities: number;
  users: number;
  mothers: number;
  pregnancies: number;
  visits: number;
  alerts: number;
  appointments: number;
  referrals: number;
  documents: number;
  education: number;
  rules: number;
}

/**
 * Writes the demonstration dataset. Idempotent per device: refuses to run twice
 * unless `force` is set (in which case existing demonstration facilities are
 * removed first — real records at other facilities are left untouched).
 */
export async function seedDemonstrationData(options: { force?: boolean } = {}): Promise<SeedSummary> {
  const registry = services();
  if (registry.provider.kind !== 'local') {
    throw new Error('The demonstration dataset can only be written to the device provider.');
  }
  const provider = registry.provider as unknown as LocalDataProvider;
  const systemActor: Actor = {
    uid: 'system',
    email: 'system@mamacare.health',
    displayName: 'System provisioning',
    role: 'ADMIN',
    facilityId: null,
    accountStatus: 'ACTIVE',
    motherId: null,
    privilegeVersion: 1,
    claimsSource: 'local-session',
  };

  const existingFacilities = await provider.list('facilities', {}, systemActor);
  const demoFacilities = existingFacilities.rows.filter((facility) => facility.code.startsWith('DEMO-'));
  if (demoFacilities.length > 0 && !options.force) {
    throw new Error('Demonstration data already exists on this device. Reset the device store first to regenerate it.');
  }
  if (demoFacilities.length > 0 && options.force) {
    for (const facility of demoFacilities) await provider.remove('facilities', facility.id, systemActor);
  }

  const summary: SeedSummary = { facilities: 0, users: 0, mothers: 0, pregnancies: 0, visits: 0, alerts: 0, appointments: 0, referrals: 0, documents: 0, education: 0, rules: 0 };

  /* facilities */
  const facilities: Facility[] = [
    {
      id: newId('fac'),
      code: 'DEMO-CHP',
      name: 'Chilenje Health Post',
      type: 'HEALTH_CENTRE',
      district: 'Lusaka',
      province: 'Lusaka',
      address: 'Levy Road, Chilenje, Lusaka',
      phone: '+260 211 000 111',
      email: null,
      referralToFacilityId: null,
      bedCount: 60,
      hasMaternityWard: true,
      hasUltrasound: true,
      hasLaboratory: true,
      active: true,
      imageUrl: null,
      imagePublicId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'system',
    },
    {
      id: newId('fac'),
      code: 'DEMO-LGH',
      name: 'Lusaka General Hospital',
      type: 'PROVINCIAL_HOSPITAL',
      district: 'Lusaka',
      province: 'Lusaka',
      address: 'Addis Ababa Avenue, Lusaka',
      phone: '+260 211 000 222',
      email: null,
      referralToFacilityId: null,
      bedCount: 1450,
      hasMaternityWard: true,
      hasUltrasound: true,
      hasLaboratory: true,
      active: true,
      imageUrl: null,
      imagePublicId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'system',
    },
  ];
  facilities[1]!.referralToFacilityId = null;
  facilities[0]!.referralToFacilityId = facilities[1]!.id;
  for (const facility of facilities) {
    await provider.create('facilities', facility as never, systemActor);
    summary.facilities += 1;
  }
  const [healthPost, hospital] = facilities as [Facility, Facility];

  /* accounts */
  const users: UserProfile[] = [];
  for (const account of DEMO_ACCOUNTS) {
    const uid = newId('usr');
    await createCredential(uid, account.email, account.password);
    const isPatient = account.role === 'MOTHER';
    users.push({
      id: uid,
      email: account.email,
      fullName: account.name,
      phone: `+260 97${String(1000000 + nextSeq())}`,
      role: account.role,
      status: 'ACTIVE',
      accountKind: isPatient ? 'PATIENT' : 'HEALTH_WORKER',
      requestedRole: null,
      facilityId: isPatient ? healthPost.id : healthPost.id,
      motherId: null,
      title: account.title,
      licenseNumber: isPatient ? null : `HC-${String(20260 + nextSeq())}`,
      photoUrl: null,
      photoPublicId: null,
      emailVerified: true,
      privilegeVersion: 1,
      createdAt: new Date(Date.now() - 86_400_000 * 40).toISOString(),
      createdBy: 'system',
      updatedAt: new Date().toISOString(),
      updatedBy: 'system',
      lastLoginAt: new Date().toISOString(),
      deactivatedAt: null,
      deactivatedBy: null,
      deactivationReason: null,
    });
  }
  for (const user of users) {
    await provider.provisionUser(user);
    summary.users += 1;
  }
  const midwife = users.find((user) => user.role === 'MIDWIFE')!;
  const chw = users.find((user) => user.role === 'COMMUNITY_HEALTH_WORKER')!;
  const motherUser = users.find((user) => user.role === 'MOTHER')!;

  /* clinical rules (shipped defaults, recorded so admins can edit them) */
  for (const rule of DEFAULT_ALERT_RULES as AlertRule[]) {
    await provider.create('alert_rules', { ...rule, id: `rule_${rule.key}` } as never, systemActor);
    summary.rules += 1;
  }

  /* mothers, pregnancies, visits, alerts, appointments, referrals */
  const blueprints = buildBlueprints();
  for (const [index, blueprint] of blueprints.entries()) {
    const lmp = toIsoDate(addDays(new Date(), -blueprint.lmpDaysAgo));
    const edd = eddFromLmp(lmp);
    const motherId = newId('mot');
    const pregnancyId = newId('preg');
    const patientId = `MC-${String(240 + index).padStart(6, '0')}`;
    const ga = gestationalAge({ lmpDate: lmp, eddDate: edd });

    const mother: Mother = {
      id: motherId,
      patientId,
      userId: index === 0 ? motherUser.id : null,
      fullName: blueprint.fullName,
      dateOfBirth: toIsoDate(addDays(new Date(), -(365 * blueprint.age + 40))),
      ageYears: blueprint.age,
      phone: blueprint.phone,
      alternatePhone: null,
      address: `Plot ${120 + index}, ${blueprint.community}`,
      community: blueprint.community,
      chiefName: `Chief ${pick(SURNAMES, index + 2)}`,
      landmark: null,
      emergencyContact: { name: `${pick(SURNAMES, index + 4)} (spouse)`, relation: 'Spouse', phone: `096${String(2200000 + index * 137)}` },
      preferredLanguage: blueprint.language,
      literacyLevel: index % 3 === 0 ? 'SECONDARY' : 'PRIMARY',
      maritalStatus: 'MARRIED',
      occupation: index % 2 === 0 ? 'Market trader' : 'Teacher',
      husbandName: `${pick(SURNAMES, index + 4)}`,
      husbandPhone: `096${String(2200000 + index * 137)}`,
      bloodGroup: index % 4 === 0 ? 'O+' : null,
      allergies: index % 7 === 0 ? 'Penicillin (rash)' : null,
      chronicConditions: index % 9 === 0 ? ['HYPERTENSION'] : [],
      registrationFacilityId: healthPost.id,
      careFacilityId: healthPost.id,
      assignedChwUserId: chw.id,
      catchmentArea: `Catchment ${1 + (index % 4)}`,
      photoUrl: null,
      photoPublicId: null,
      consent: {
        accepted: true,
        version: '1.0',
        acceptedAt: new Date(Date.now() - 86_400_000 * 60).toISOString(),
        acceptedBy: midwife.id,
        language: blueprint.language,
        mode: 'SELF',
      },
      status: 'ACTIVE',
      currentPregnancyId: pregnancyId,
      riskLevel: 'GREEN',
      gestationalSnapshot: { weeks: ga.weeks, days: ga.days, asOf: new Date().toISOString() },
      eddSnapshot: edd,
      lastVisitAt: null,
      nextAppointmentAt: null,
      createdAt: new Date(Date.now() - 86_400_000 * (blueprint.lmpDaysAgo - 10)).toISOString(),
      createdBy: midwife.id,
      createdByName: midwife.fullName,
      updatedAt: new Date().toISOString(),
      updatedBy: midwife.id,
    };
    if (index === 0) motherUser.motherId = motherId;
    await provider.provisionUser(motherUser);

    const pregnancy: Pregnancy = {
      id: pregnancyId,
      motherId,
      facilityId: healthPost.id,
      parityNumber: blueprint.gravida,
      status: 'ACTIVE',
      lmpDate: lmp,
      eddDate: edd,
      datingMethod: 'LMP',
      confirmedAt: lmp,
      bookedAt: toIsoDate(addDays(new Date(), -blueprint.lmpDaysAgo + 20)),
      gravida: blueprint.gravida,
      para: blueprint.para,
      livingChildren: blueprint.para,
      gestationCount: blueprint.gestationCount,
      isMultiple: blueprint.gestationCount > 1,
      previousCesarean: blueprint.previousCesarean,
      previousComplications: blueprint.previousComplications as Pregnancy['previousComplications'],
      riskFactors: blueprint.riskFactors as Pregnancy['riskFactors'],
      riskLevel: 'GREEN',
      notes: null,
      outcome: 'ONGOING',
      createdAt: mother.createdAt,
      createdBy: midwife.id,
      updatedAt: new Date().toISOString(),
      updatedBy: midwife.id,
    };

    if (blueprint.fullName === 'Bupe Gondwe') {
      pregnancy.status = 'DELIVERED';
      pregnancy.outcome = 'DELIVERED_LIVE_BIRTH';
      pregnancy.delivery = {
        date: toIsoDate(addDays(new Date(), -8)),
        gestationalAgeWeeks: 39,
        mode: 'SPONTANEOUS',
        presentation: 'VERTEX',
        outcome: 'DELIVERED_LIVE_BIRTH',
        birthCount: 1,
        babies: [{ sex: 'F', birthWeightKg: 3.2, apgar1: 8, apgar5: 9, condition: 'WELL', feedingStatus: 'Breastfeeding within 1 hour' }],
        complications: [],
        attendedByName: 'Thandiwe Phiri',
        birthFacilityId: healthPost.id,
        recordedAt: new Date().toISOString(),
        recordedBy: midwife.id,
      };
    }

    await provider.create('mothers', mother as never, systemActor);
    await provider.create('pregnancies', pregnancy as never, systemActor);
    summary.mothers += 1;
    summary.pregnancies += 1;

    let motherRisk: 'RED' | 'AMBER' | 'GREEN' = 'GREEN';

    for (const [visitIndex, visitPlan] of blueprint.visits.entries()) {
      const visitDate = toIsoDate(addDays(new Date(), -visitPlan.offsetDays));
      const visitGa = gestationalAge({ lmpDate: lmp, eddDate: edd, asOf: new Date(`${visitDate}T09:00:00`) });
      const visitId = newId('anc');
      const alertIds: string[] = [];

      const fired: { level: 'RED' | 'AMBER'; category: ClinicalAlert['category']; title: string; message: string; ruleKey: string; triggered: ClinicalAlert['triggeredBy'] }[] = [];
      const sys = visitPlan.systolic;
      const dia = visitPlan.diastolic;
      if (sys >= 160 || dia >= 110) {
        fired.push({
          level: 'RED',
          category: 'BLOOD_PRESSURE',
          title: 'Severe hypertension',
          message: 'Blood pressure in the severe range was recorded. Potential danger sign. Immediate clinical assessment required.',
          ruleKey: 'severe_hypertension',
          triggered: [{ label: 'Blood pressure', value: `${sys}/${dia}`, unit: 'mmHg' }],
        });
      } else if (sys >= 140 || dia >= 90) {
        fired.push({
          level: 'AMBER',
          category: 'BLOOD_PRESSURE',
          title: 'Elevated blood pressure',
          message: 'Blood pressure in the elevated range was recorded. Concerning finding. Clinical review and follow-up required.',
          ruleKey: 'moderate_hypertension',
          triggered: [{ label: 'Blood pressure', value: `${sys}/${dia}`, unit: 'mmHg' }],
        });
      }
      if (visitPlan.dangerSigns.includes('REDUCED_FETAL_MOVEMENT') && visitGa.weeks >= 24) {
        fired.push({
          level: 'RED',
          category: 'FETAL',
          title: 'Reduced or absent fetal movement',
          message: 'Reduced fetal movement was reported after the viability threshold. Potential danger sign. Immediate clinical assessment required.',
          ruleKey: 'reduced_fetal_movement',
          triggered: [{ label: 'Reported symptom', value: 'reduced fetal movement', unit: null }],
        });
      }
      if (visitPlan.dangerSigns.includes('SEVERE_HEADACHE') && visitPlan.dangerSigns.includes('VISUAL_DISTURBANCE')) {
        fired.push({
          level: 'RED',
          category: 'DANGER_SIGN',
          title: 'Severe headache with visual disturbance',
          message: 'Severe headache together with visual disturbance was reported. Potential danger sign. Immediate clinical assessment required.',
          ruleKey: 'headache_with_visual_disturbance',
          triggered: [{ label: 'Reported symptoms', value: 'severe headache, visual disturbance', unit: null }],
        });
      }
      if ((visitPlan.temperature ?? 0) >= 38) {
        fired.push({
          level: visitPlan.temperature && visitPlan.temperature >= 39 ? 'RED' : 'AMBER',
          category: 'INFECTION',
          title: visitPlan.temperature && visitPlan.temperature >= 39 ? 'High temperature' : 'Fever',
          message: `Temperature of ${visitPlan.temperature?.toFixed(1)} °C was recorded. Concerning finding. Clinical review and follow-up required.`,
          ruleKey: 'fever',
          triggered: [{ label: 'Temperature', value: String(visitPlan.temperature), unit: '°C' }],
        });
      }
      if (visitPlan.haemoglobin !== null && visitPlan.haemoglobin < 10.5) {
        fired.push({
          level: visitPlan.haemoglobin < 7 ? 'RED' : 'AMBER',
          category: 'LABORATORY',
          title: visitPlan.haemoglobin < 7 ? 'Severely low haemoglobin' : 'Low haemoglobin',
          message: `Haemoglobin of ${visitPlan.haemoglobin} g/dL was recorded. Concerning finding. Clinical review and follow-up required.`,
          ruleKey: 'anaemia',
          triggered: [{ label: 'Haemoglobin', value: String(visitPlan.haemoglobin), unit: 'g/dL' }],
        });
      }
      if (visitPlan.fetal !== null && (visitPlan.fetal < 110 || visitPlan.fetal > 160)) {
        fired.push({
          level: 'RED',
          category: 'FETAL',
          title: 'Abnormal fetal heart rate',
          message: `Fetal heart rate of ${visitPlan.fetal} bpm was recorded. Potential danger sign. Immediate clinical assessment required.`,
          ruleKey: 'fetal_heart_abnormal',
          triggered: [{ label: 'Fetal heart rate', value: String(visitPlan.fetal), unit: 'bpm' }],
        });
      }

      const visit: AncVisit = {
        id: visitId,
        motherId,
        pregnancyId,
        facilityId: healthPost.id,
        visitNumber: visitIndex + 1,
        visitDate,
        visitType: visitIndex === 0 ? 'BOOKING' : 'ROUTINE',
        reasonForVisit: visitIndex === 0 ? 'Booking visit' : 'Routine antenatal review',
        gestationalAge: { weeks: visitGa.weeks, days: visitGa.days },
        vitals: {
          systolicBp: sys,
          diastolicBp: dia,
          pulse: visitPlan.pulse,
          temperatureC: visitPlan.temperature,
          respiratoryRate: visitPlan.temperature ? 20 : null,
          weightKg: Math.round(visitPlan.weight * 10) / 10,
          muacCm: visitPlan.muac,
          fundalHeightCm: visitPlan.fundal,
          fetalHeartRate: visitPlan.fetal,
          urineProtein: visitPlan.protein,
          haemoglobinGdl: visitPlan.haemoglobin,
          oedema: visitPlan.dangerSigns.includes('SWELLING_FACE_HANDS') ? 'MILD' : 'NONE',
          presentation: visitGa.weeks > 34 ? 'VERTEX' : null,
        },
        dangerSigns: {
          reported: visitPlan.dangerSigns as never,
          otherNote: null,
          noneReported: visitPlan.dangerSigns.length === 0,
        },
        tests: visitPlan.haemoglobin !== null ? [{ id: newId('test'), panel: 'ROUTINE', name: 'Haemoglobin', value: String(visitPlan.haemoglobin), unit: 'g/dL', collectedAt: visitDate, resultAt: visitDate, flagged: visitPlan.haemoglobin < 11, documentedBy: midwife.id }] : [],
        medications: visitIndex === 0 ? [{ id: newId('med'), name: 'Ferrous fumarate with folic acid', dose: '1 tablet', frequency: 'daily', startDate: visitDate }] : [],
        counselling: visitPlan.counselling,
        note: visitPlan.note,
        nextAppointmentAt: null,
        outcome: visitPlan.outcome ?? 'CONTINUE_CARE',
        riskLevelAfter: fired.some((alert) => alert.level === 'RED') ? 'RED' : fired.length > 0 ? 'AMBER' : 'GREEN',
        alertIds,
        createdAt: new Date(`${visitDate}T09:15:00.000Z`).toISOString(),
        createdBy: midwife.id,
        createdByName: midwife.fullName,
        updatedAt: null,
        clientRef: newId('ref'),
      };
      await provider.create('anc_visits', visit as never, systemActor);
      summary.visits += 1;

      for (const alert of fired) {
        const alertId = newId('alt');
        const record: ClinicalAlert = {
          id: alertId,
          motherId,
          motherName: blueprint.fullName,
          patientId,
          pregnancyId,
          visitId,
          facilityId: healthPost.id,
          level: alert.level,
          category: alert.category,
          ruleKey: alert.ruleKey,
          ruleVersion: DEFAULT_ALERT_RULES.find((rule) => rule.key === alert.ruleKey)?.version ?? 1,
          title: alert.title,
          message: alert.message,
          triggeredBy: alert.triggered,
          status: visitIndex < blueprint.visits.length - 1 || index % 3 === 0 ? 'RESOLVED' : 'OPEN',
          actions:
            visitIndex < blueprint.visits.length - 1 || index % 3 === 0
              ? [
                  {
                    status: 'ASSESSED',
                    note: alert.level === 'RED' ? 'Assessed on the day; treatment started and follow-up arranged.' : 'Reviewed with the clinician; plan documented.',
                    byUserId: midwife.id,
                    byName: midwife.fullName,
                    at: new Date(`${visitDate}T11:40:00.000Z`).toISOString(),
                    facilityId: healthPost.id,
                  },
                  {
                    status: 'RESOLVED',
                    note: 'Findings addressed and the mother counselled on return criteria.',
                    byUserId: midwife.id,
                    byName: midwife.fullName,
                    at: new Date(`${visitDate}T13:05:00.000Z`).toISOString(),
                    facilityId: healthPost.id,
                  },
                ]
              : [],
          assignedUserId: midwife.id,
          assignedUserName: midwife.fullName,
          openedAt: new Date(`${visitDate}T09:20:00.000Z`).toISOString(),
          openedBy: midwife.id,
          openedByName: midwife.fullName,
          resolvedAt: visitIndex < blueprint.visits.length - 1 || index % 3 === 0 ? new Date(`${visitDate}T13:05:00.000Z`).toISOString() : null,
        };
        await provider.create('alerts', record as never, systemActor);
        visit.alertIds.push(alertId);
        await provider.update('anc_visits', visitId, { alertIds: visit.alertIds } as never, systemActor);
        summary.alerts += 1;
        if (alert.level === 'RED') motherRisk = 'RED';
        else if (motherRisk !== 'RED') motherRisk = 'AMBER';
      }
    }

    /* appointments */
    for (const [offsetIndex, offset] of blueprint.appointmentOffsets.entries()) {
      const scheduledFor = toIsoDate(addDays(new Date(), offset));
      const missed = (blueprint.missedCount ?? 0) > 0 && offset < 0 && offsetIndex === 0;
      const appointment: Appointment = {
        id: newId('apt'),
        motherId,
        patientId,
        motherName: blueprint.fullName,
        pregnancyId,
        facilityId: healthPost.id,
        scheduledFor,
        time: offsetIndex % 2 === 0 ? '08:30' : '10:15',
        durationMinutes: 30,
        type: offsetIndex === 0 ? 'ANC' : 'FOLLOW_UP',
        status: offset < 0 ? (missed ? 'MISSED' : 'COMPLETED') : 'SCHEDULED',
        reason: offset < 0 ? 'Routine review' : 'Scheduled antenatal review',
        notes: missed ? 'Did not attend. Follow-up call made by the community health worker.' : null,
        assignedUserId: missed ? chw.id : midwife.id,
        assignedUserName: missed ? chw.fullName : midwife.fullName,
        reminderDays: [7, 1],
        remindersSent: { '7': new Date(addDays(new Date(), offset - 7)).toISOString() },
        smsEnabled: true,
        createdByName: midwife.fullName,
        createdAt: new Date(addDays(new Date(), offset - 30)).toISOString(),
        createdBy: midwife.id,
        updatedAt: null,
      };
      await provider.create('appointments', appointment as never, systemActor);
      summary.appointments += 1;
      if (missed) {
        const missedAlert: ClinicalAlert = {
          id: newId('alt'),
          motherId,
          motherName: blueprint.fullName,
          patientId,
          pregnancyId,
          facilityId: healthPost.id,
          level: 'AMBER',
          category: 'MISSED_VISIT',
          title: 'Missed appointment',
          message: 'A scheduled antenatal visit was marked as missed. Follow-up contact is required to re-engage the mother.',
          triggeredBy: [{ label: 'Appointment date', value: scheduledFor, unit: null }],
          status: 'FOLLOW_UP_REQUIRED',
          actions: [
            {
              status: 'FOLLOW_UP_REQUIRED',
              note: 'Community health worker assigned for a home visit.',
              byUserId: chw.id,
              byName: chw.fullName,
              at: new Date().toISOString(),
              facilityId: healthPost.id,
            },
          ],
          assignedUserId: chw.id,
          assignedUserName: chw.fullName,
          openedAt: new Date().toISOString(),
          openedBy: midwife.id,
          openedByName: midwife.fullName,
        };
        await provider.create('alerts', missedAlert as never, systemActor);
        summary.alerts += 1;
        if (motherRisk === 'GREEN') motherRisk = 'AMBER';
      }
      if (!missed && offset > 0 && !mother.nextAppointmentAt) {
        mother.nextAppointmentAt = new Date(`${scheduledFor}T${appointment.time}:00`).toISOString();
      }
    }

    /* referral */
    if (blueprint.referral) {
      const referral: Referral = {
        id: newId('ref'),
        motherId,
        patientId,
        motherName: blueprint.fullName,
        pregnancyId,
        originFacilityId: healthPost.id,
        receivingFacilityId: hospital.id,
        reason: blueprint.referral.reason,
        clinicalQuestion: 'Please advise on timing and mode of delivery.',
        urgency: blueprint.referral.urgency,
        scheduledAt: new Date(addDays(new Date(), -2)).toISOString(),
        transport: 'AMBULANCE',
        transportNote: 'Referred by the facility ambulance with a nurse escort.',
        clinicalNotes: 'Vitals at transfer, blood pressure monitoring hourly. Group and save sent. Counselling provided to the mother and her companion.',
        vitalSnapshot: { systolicBp: 152, diastolicBp: 98, pulse: 94, temperatureC: 36.9 },
        status: blueprint.referral.status,
        statusHistory: [
          { status: 'ACTIVE', at: new Date(addDays(new Date(), -2)).toISOString(), byUserId: midwife.id, byName: midwife.fullName, note: 'Referral created', facilityId: healthPost.id },
          ...(blueprint.referral.status !== 'ACTIVE'
            ? [{ status: blueprint.referral.status, at: new Date().toISOString(), byUserId: midwife.id, byName: midwife.fullName, note: 'Received at the referral desk', facilityId: hospital.id }]
            : []),
        ] as Referral['statusHistory'],
        createdAt: new Date(addDays(new Date(), -2)).toISOString(),
        createdBy: midwife.id,
        createdByName: midwife.fullName,
      };
      await provider.create('referrals', referral as never, systemActor);
      summary.referrals += 1;
    }

    /* consent document (device-stored) */
    const consentText = [
      `MAMA CARE — consent to record maternal health information`,
      ``,
      `Patient: ${blueprint.fullName}`,
      `Patient ID: ${patientId}`,
      `Facility: ${healthPost.name}`,
      `Date: ${toIsoDate(new Date())}`,
      ``,
      `I agree that my facility and community health workers may record my pregnancy`,
      `details, visit findings and appointment dates in MAMA CARE so that my care can`,
      `continue between visits. I understand that information is shared with the`,
      `referring and receiving facilities when a referral is needed, and that I may ask`,
      `the facility to correct or stop records at any time.`,
      ``,
      `Consent recorded by: ${midwife.fullName}`,
    ].join('\n');
    const consentBlob = new Blob([consentText], { type: 'text/plain' });
    const consentHandle = `media/mamacare/documents/${patientId}/consent-${index}`;
    await provider.putBlob(consentHandle, consentBlob);
    const document: DocumentRecord = {
      id: newId('doc'),
      name: `Consent to record — ${patientId}`,
      category: 'CONSENT',
      description: 'Signed consent captured at registration.',
      ownerUserId: mother.userId ?? null,
      motherId,
      patientId,
      facilityId: healthPost.id,
      uploadedBy: midwife.id,
      uploadedByName: midwife.fullName,
      uploadedAt: mother.createdAt,
      mimeType: 'text/plain',
      sizeBytes: consentBlob.size,
      publicId: `device:mamacare/documents/${patientId}/consent-${index}`,
      secureUrl: null,
      localHandle: consentHandle,
      version: 1,
      folder: 'mamacare/documents',
      accessRoles: ['MIDWIFE', 'NURSE', 'FACILITY_SUPERVISOR', 'ADMIN', 'MOTHER'],
      accessUserIds: [midwife.id, motherUser.id],
      accessMode: 'AUTHENTICATED',
      metadata: { storage: 'device', kind: 'consent' },
    };
    await provider.create('documents', document as never, systemActor);
    summary.documents += 1;

    await provider.update('mothers', motherId, { riskLevel: motherRisk, lastVisitAt: visitDate(mother) } as never, systemActor);
    if (motherRisk !== 'GREEN') {
      await provider.update('pregnancies', pregnancyId, { riskLevel: motherRisk, riskReviewedAt: new Date().toISOString(), riskReviewedBy: midwife.id } as never, systemActor);
    }
  }

  /* health education (mother-facing) */
  const education: EducationResource[] = [
    {
      id: newId('edu'),
      title: 'Attending every antenatal visit',
      summary: 'Why each visit matters, what is checked, and what to do if you cannot come.',
      body: [
        'Your care team uses antenatal visits to follow you and your baby through pregnancy. Most pregnancies need at least eight contacts.',
        '',
        'At each visit, staff will usually: check your blood pressure and weight; ask about danger signs; listen for the baby’s heartbeat from later in pregnancy; give the supplements and tests scheduled for that stage; and set the date of your next visit.',
        '',
        'If you cannot attend, telephone your clinic or tell your community health worker so the visit can be re-arranged. Missing visits does not lose your place at the clinic.',
        '',
        'Between visits, come to the facility immediately — do not wait for your appointment — if you have: heavy vaginal bleeding; severe headache with blurred vision; fits; swelling of the face and hands; severe pain in the abdomen; difficulty breathing; a fever that will not settle; no fetal movement after 24 weeks, or a sudden reduction in movement.',
      ].join('\n'),
      topics: ['ANC schedule', 'Appointments', 'Danger signs'],
      language: 'English',
      audience: ['MOTHER', 'HEALTH_WORKER'],
      stage: 'GENERAL',
      coverImageUrl: null,
      coverImagePublicId: 'mamacare/public/maternal-education',
      readingMinutes: 3,
      status: 'PUBLISHED',
      facilityId: null,
      reviewedBy: 'Clinical governance (pending local approval)',
      reviewedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'system',
      createdByName: 'MAMA CARE content',
    },
    {
      id: newId('edu'),
      title: 'Iron, folinic acid and what you eat',
      summary: 'Simple steps to reduce anaemia in pregnancy.',
      body: [
        'Anaemia is common in pregnancy and makes you more likely to become unwell if you bleed at birth. Your clinic checks your haemoglobin and gives iron and folinic acid.',
        '',
        'Take your tablets with water or a citrus drink. Tea and coffee reduce how much iron your body absorbs, so try to leave a gap. If tablets upset your stomach, take them with a small meal and tell your nurse rather than stopping.',
        '',
        'Food that helps: beans, groundnuts, mealie meal with relish of dark green leaves, eggs, fish, chicken, liver, fortified porridge. Vitamin C from citrus or tomato with the meal helps absorption.',
        '',
        'If you feel very tired, breathless, or your eyes look pale, tell the clinic at your next visit — or come sooner.',
      ].join('\n'),
      topics: ['Nutrition', 'Anaemia', 'Supplements'],
      language: 'English',
      audience: ['MOTHER'],
      stage: 'SECOND_TRIMESTER',
      coverImageUrl: null,
      coverImagePublicId: 'mamacare/public/anc-consultation',
      readingMinutes: 2,
      status: 'PUBLISHED',
      facilityId: null,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'system',
      createdByName: 'MAMA CARE content',
    },
    {
      id: newId('edu'),
      title: 'Preparing for birth and for the first week',
      summary: 'What to arrange before labour starts, and what to watch afterwards.',
      body: [
        'Before your due date, agree with your family: where you will deliver; how you will get there and at what time of day; who will look after your other children; what supplies and money are needed; who will accompany you.',
        '',
        'Bring your MAMA CARE card or phone so the facility can see your records even if the clinic is closed.',
        '',
        'After birth, watch for heavy bleeding, fever, severe pain, foul-smelling discharge, a breast that is red and painful, or feeling low and unable to care for your baby. All of these need assessment — come to the facility.',
        '',
        'Postnatal visits protect both you and your baby. Do not skip them even if you feel well.',
      ].join('\n'),
      topics: ['Birth preparedness', 'Postnatal care', 'Family planning'],
      language: 'English',
      audience: ['MOTHER', 'HEALTH_WORKER'],
      stage: 'THIRD_TRIMESTER',
      coverImageUrl: null,
      coverImagePublicId: 'mamacare/public/mother-newborn',
      readingMinutes: 3,
      status: 'PUBLISHED',
      facilityId: null,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'system',
      createdByName: 'MAMA CARE content',
    },
  ];
  for (const resource of education) {
    await provider.create('education', resource as never, systemActor);
    summary.education += 1;
  }

  /* settings + audit trail of the provisioning itself */
  await provider.create('settings', {
    id: 'app',
    patientIdPrefix: 'MC',
    patientIdSequence: 260 + blueprints.length,
    reminderDaysDefault: [7, 1],
    smsEnabled: false,
    pushEnabled: false,
    registrationRequiresApproval: true,
    defaultLanguage: 'English',
    bootstrapAdminEmails: ['admin@mamacare.health'],
    clinicalRulesVersion: DEFAULT_ALERT_RULES[0]?.version ?? 1,
    clinicalRulesReviewedBy: null,
    clinicalRulesReviewedAt: null,
    dataRetentionPolicy: 'Records are retained for 10 years per national health-records guidance.',
    allowPatientAccountSelfRegistration: true,
    updatedAt: new Date().toISOString(),
    updatedBy: 'system',
  } as never, systemActor).catch(() => null);

  await provider.create('audit_logs', {
    id: newId('audit'),
    action: 'settings.updated',
    actorId: 'system',
    actorName: 'System provisioning',
    actorRole: 'SYSTEM',
    targetType: 'settings',
    targetId: 'demo-seed',
    targetLabel: 'Demonstration dataset written on this device',
    facilityId: healthPost.id,
    metadata: { mothers: summary.mothers, visits: summary.visits, alerts: summary.alerts, synthetic: true },
    createdAt: new Date().toISOString(),
  } as never, systemActor).catch(() => null);

  return summary;
}

const visitDate = (mother: Mother): string => `${mother.updatedAt}`;
