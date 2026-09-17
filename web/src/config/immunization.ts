/**
 * Immunization schedule.
 *
 * Based on the Zambia Expanded Programme on Immunization (EPI) routine schedule:
 * BCG and the polio/hepatitis B birth doses at birth, pentavalent, PCV, rotavirus
 * and oral polio at 6, 10 and 14 weeks, inactivated polio at 14 weeks, measles–
 * rubella at 9 months with a second dose at 18 months, and vitamin A at 6 and 9
 * months. Schedules are reviewed periodically by national programmes — the
 * `SCHEDULE_LABEL` and `REVIEWED` constants exist so the app can say which
 * version it is showing, and an administrator can override the label in Settings.
 *
 * Mama Care never advises skipping, delaying or adding a vaccine. It helps a
 * parent keep the dates a health worker gave them, and it points to the facility.
 */

export const SCHEDULE_LABEL = 'Zambia EPI routine schedule (under 2 years)';
export const REVIEWED = '2024';

export interface VaccineDose {
  code: string;
  vaccine: string;
  dose: string;
  /** Human age label, e.g. "At birth" or "6 weeks". */
  ageLabel: string;
  /** Target age in days after birth — used to compute the scheduled date. */
  ageDays: number;
  /** Not before this age, in days. */
  minAgeDays: number;
  route: string;
  protects: string;
  note?: string;
}

export const ZAMBIA_IMMUNIZATION_SCHEDULE: VaccineDose[] = [
  {
    code: 'BCG',
    vaccine: 'BCG',
    dose: 'Single dose',
    ageLabel: 'As soon as possible after birth',
    ageDays: 0,
    minAgeDays: 0,
    route: 'Intradermal, left upper arm',
    protects: 'Severe tuberculosis in childhood',
    note: 'A small raised spot appears after a few weeks and may leave a scar. This is expected.',
  },
  {
    code: 'OPV0',
    vaccine: 'Oral polio vaccine',
    dose: 'Birth dose',
    ageLabel: 'At birth',
    ageDays: 0,
    minAgeDays: 0,
    route: 'Two drops by mouth',
    protects: 'Poliomyelitis',
  },
  {
    code: 'HEPB0',
    vaccine: 'Hepatitis B',
    dose: 'Birth dose',
    ageLabel: 'Within 24 hours of birth',
    ageDays: 0,
    minAgeDays: 0,
    route: 'Intramuscular, thigh',
    protects: 'Hepatitis B',
    note: 'The birth dose matters most within the first 24 hours.',
  },
  {
    code: 'OPV1',
    vaccine: 'Oral polio vaccine',
    dose: 'Dose 1',
    ageLabel: '6 weeks',
    ageDays: 42,
    minAgeDays: 42,
    route: 'Two drops by mouth',
    protects: 'Poliomyelitis',
  },
  {
    code: 'PENTA1',
    vaccine: 'Pentavalent (diphtheria, tetanus, pertussis, hepatitis B, Hib)',
    dose: 'Dose 1',
    ageLabel: '6 weeks',
    ageDays: 42,
    minAgeDays: 42,
    route: 'Intramuscular, outer thigh',
    protects: 'Diphtheria, tetanus, whooping cough, hepatitis B and Hib meningitis',
  },
  {
    code: 'PCV1',
    vaccine: 'Pneumococcal conjugate vaccine',
    dose: 'Dose 1',
    ageLabel: '6 weeks',
    ageDays: 42,
    minAgeDays: 42,
    route: 'Intramuscular, thigh',
    protects: 'Pneumonia, meningitis and bloodstream infection from pneumococcus',
  },
  {
    code: 'ROTA1',
    vaccine: 'Rotavirus vaccine',
    dose: 'Dose 1',
    ageLabel: '6 weeks',
    ageDays: 42,
    minAgeDays: 42,
    route: 'By mouth',
    protects: 'Severe rotavirus diarrhoea',
  },
  {
    code: 'OPV2',
    vaccine: 'Oral polio vaccine',
    dose: 'Dose 2',
    ageLabel: '10 weeks',
    ageDays: 70,
    minAgeDays: 70,
    route: 'Two drops by mouth',
    protects: 'Poliomyelitis',
  },
  {
    code: 'PENTA2',
    vaccine: 'Pentavalent',
    dose: 'Dose 2',
    ageLabel: '10 weeks',
    ageDays: 70,
    minAgeDays: 70,
    route: 'Intramuscular, outer thigh',
    protects: 'Diphtheria, tetanus, whooping cough, hepatitis B and Hib',
  },
  {
    code: 'PCV2',
    vaccine: 'Pneumococcal conjugate vaccine',
    dose: 'Dose 2',
    ageLabel: '10 weeks',
    ageDays: 70,
    minAgeDays: 70,
    route: 'Intramuscular, thigh',
    protects: 'Pneumococcal disease',
  },
  {
    code: 'ROTA2',
    vaccine: 'Rotavirus vaccine',
    dose: 'Dose 2',
    ageLabel: '10 weeks',
    ageDays: 70,
    minAgeDays: 70,
    route: 'By mouth',
    protects: 'Severe rotavirus diarrhoea',
    note: 'The rotavirus series must be completed within the age limit set by the programme.',
  },
  {
    code: 'OPV3',
    vaccine: 'Oral polio vaccine',
    dose: 'Dose 3',
    ageLabel: '14 weeks',
    ageDays: 98,
    minAgeDays: 98,
    route: 'Two drops by mouth',
    protects: 'Poliomyelitis',
  },
  {
    code: 'PENTA3',
    vaccine: 'Pentavalent',
    dose: 'Dose 3',
    ageLabel: '14 weeks',
    ageDays: 98,
    minAgeDays: 98,
    route: 'Intramuscular, outer thigh',
    protects: 'Diphtheria, tetanus, whooping cough, hepatitis B and Hib',
  },
  {
    code: 'PCV3',
    vaccine: 'Pneumococcal conjugate vaccine',
    dose: 'Dose 3',
    ageLabel: '14 weeks',
    ageDays: 98,
    minAgeDays: 98,
    route: 'Intramuscular, thigh',
    protects: 'Pneumococcal disease',
  },
  {
    code: 'IPV',
    vaccine: 'Inactivated polio vaccine',
    dose: 'Single dose',
    ageLabel: '14 weeks',
    ageDays: 98,
    minAgeDays: 98,
    route: 'Intramuscular, thigh',
    protects: 'Poliomyelitis',
  },
  {
    code: 'VITA6',
    vaccine: 'Vitamin A',
    dose: 'Dose 1',
    ageLabel: '6 months',
    ageDays: 183,
    minAgeDays: 183,
    route: 'By mouth',
    protects: 'Vitamin A deficiency',
  },
  {
    code: 'MR1',
    vaccine: 'Measles–rubella vaccine',
    dose: 'Dose 1',
    ageLabel: '9 months',
    ageDays: 274,
    minAgeDays: 274,
    route: 'Subcutaneous, right upper arm',
    protects: 'Measles and rubella',
  },
  {
    code: 'VITA9',
    vaccine: 'Vitamin A',
    dose: 'Dose 2',
    ageLabel: '9 months',
    ageDays: 274,
    minAgeDays: 274,
    route: 'By mouth',
    protects: 'Vitamin A deficiency',
  },
  {
    code: 'MR2',
    vaccine: 'Measles–rubella vaccine',
    dose: 'Dose 2',
    ageLabel: '18 months',
    ageDays: 548,
    minAgeDays: 548,
    route: 'Subcutaneous, right upper arm',
    protects: 'Measles and rubella',
  },
];

/**
 * Tetanus toxoid (Td) doses for pregnant women, given at antenatal visits.
 * Timing depends on the woman's previous vaccination history — the health worker
 * decides the number of doses needed.
 */
export const MATERNAL_TD_SCHEDULE = [
  { code: 'TD1', label: 'Td 1', timing: 'As early as possible in pregnancy, or at first antenatal contact' },
  { code: 'TD2', label: 'Td 2', timing: 'At least 4 weeks after Td 1' },
  { code: 'TD3', label: 'Td 3', timing: 'At least 6 months after Td 2' },
  { code: 'TD4', label: 'Td 4', timing: 'At least 1 year after Td 3' },
  { code: 'TD5', label: 'Td 5', timing: 'At least 1 year after Td 4' },
];

const addDays = (iso: string, days: number): string => {
  const date = new Date(iso);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

export interface ScheduledVaccine {
  key: string;
  code: string;
  vaccine: string;
  dose: string;
  ageLabel: string;
  scheduledDate: string;
  route: string;
  protects: string;
  note?: string;
}

/** The dated schedule for one baby, computed from the date of birth. */
export function scheduleForBaby(dateOfBirth: string): ScheduledVaccine[] {
  return ZAMBIA_IMMUNIZATION_SCHEDULE.map((item) => ({
    key: `${item.code}-${item.ageDays}`,
    code: item.code,
    vaccine: item.vaccine,
    dose: item.dose,
    ageLabel: item.ageLabel,
    scheduledDate: addDays(dateOfBirth, item.ageDays),
    route: item.route,
    protects: item.protects,
    note: item.note,
  }));
}

/** Common, mild reactions — and the ones that mean "get seen". */
export const AFTER_VACCINATION = {
  common: [
    'Soreness, redness or a small lump where the injection was given.',
    'Mild fever for a day or two.',
    'Being unsettled or sleepier than usual.',
    'Reduced appetite for a short while.',
  ],
  seekCare: [
    'A fever of 38 °C or more that does not settle, or any fever in a baby under 3 months.',
    'Continuous inconsolable crying for more than three hours.',
    'A convulsion, or the baby becoming floppy or unresponsive.',
    'Difficulty breathing, swelling of the face or a widespread rash — seek care immediately.',
    'The baby not feeding at all, or refusing several feeds in a row.',
  ],
  comfort: [
    'Breastfeed or offer feeds more often than usual.',
    'A cool, clean cloth on the injection site can ease soreness.',
    'Give medicine only as advised by your health worker — never an adult dose.',
    'Bring the child health card to every visit so the record stays complete.',
  ],
};
