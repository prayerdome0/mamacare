/**
 * Week-by-week pregnancy guide.
 *
 * Educational content only. Every week carries the same five sections a mother
 * was promised in the product brief: **your baby**, **your body**, **things to
 * discuss with your healthcare provider**, **healthy habits** and **important
 * warning signs**.
 *
 * Nothing here interprets a measurement or names a diagnosis. Wording is always
 * "what is commonly experienced" and "ask your provider", and the warning signs
 * always end at *seek care*, never at a conclusion about the cause.
 */

import type { RiskLevel } from '@/types/domain';

export interface WarningSign {
  title: string;
  detail: string;
  level: RiskLevel;
}

export interface WeekGuide {
  week: number;
  trimester: 1 | 2 | 3;
  /** Everyday size comparison — the thing mothers actually remember. */
  size: string;
  baby: string;
  body: string;
  ask: string[];
  habits: string[];
  /** Week-specific warning signs; the trimester list is always shown too. */
  warnings: WarningSign[];
  /** Milestones the app celebrates ("halfway there"). */
  milestone?: string;
}

/** Warning signs that apply throughout pregnancy. */
export const GENERAL_WARNING_SIGNS: WarningSign[] = [
  {
    title: 'Heavy bleeding',
    detail: 'Bleeding that soaks a pad, or bleeding with pain, needs same-day assessment at a facility.',
    level: 'RED',
  },
  {
    title: 'Severe or persistent abdominal pain',
    detail: 'Pain that does not settle with rest, or pain that comes in a regular pattern before 37 weeks.',
    level: 'RED',
  },
  {
    title: 'Difficulty breathing or chest pain',
    detail: 'Shortness of breath at rest is not a normal pregnancy change. Seek care now.',
    level: 'RED',
  },
  {
    title: 'Fits or convulsions',
    detail: 'An emergency. Do not wait — go to the nearest facility with a maternity service.',
    level: 'RED',
  },
  {
    title: 'Fainting or loss of consciousness',
    detail: 'Ask someone to stay with you and get to a facility.',
    level: 'RED',
  },
  {
    title: 'Severe headache with blurred vision',
    detail: 'A headache that will not go away, especially with swelling of the face or hands, or pain below the ribs.',
    level: 'RED',
  },
  {
    title: 'High fever or severe illness',
    detail: 'A fever of 38 °C or more, or vomiting that stops you keeping fluids down.',
    level: 'AMBER',
  },
  {
    title: 'Sudden severe swelling',
    detail: 'Swelling of the face, hands or feet that appears quickly, with a headache or visual changes.',
    level: 'AMBER',
  },
  {
    title: 'Pain or burning when passing urine',
    detail: 'Tell your provider — urinary infections are common in pregnancy and are treatable.',
    level: 'AMBER',
  },
];

/** Warning signs shown after delivery, on the postnatal screens. */
export const POSTNATAL_WARNING_SIGNS: WarningSign[] = [
  { title: 'Heavy bleeding', detail: 'Soaking more than one pad an hour, or passing large clots. Seek care now.', level: 'RED' },
  { title: 'Fever of 38 °C or more', detail: 'Especially with foul-smelling discharge, breast pain or a painful wound.', level: 'RED' },
  { title: 'Severe headache with blurred vision', detail: 'Can appear in the days after birth. Do not wait to see if it passes.', level: 'RED' },
  { title: 'Fits or convulsions', detail: 'An emergency. Go to a facility immediately.', level: 'RED' },
  { title: 'Chest pain or difficulty breathing', detail: 'Seek care now.', level: 'RED' },
  { title: 'One leg swollen, red, hot or painful', detail: 'Ask to be seen today.', level: 'AMBER' },
  { title: 'Feeling hopeless, or thoughts of harming yourself or your baby', detail: 'Tell someone you trust and contact your provider today. This is treatable.', level: 'AMBER' },
  { title: 'Baby feeding poorly, drowsy or feverish', detail: 'A newborn with any of these needs to be seen the same day.', level: 'RED' },
];

/** Newborn warning signs — always "get the baby seen", never a home remedy. */
export const NEWBORN_WARNING_SIGNS: WarningSign[] = [
  { title: 'Fast or difficult breathing', detail: 'Grunting, flaring nostrils, or the chest pulling in between the ribs. Go now.', level: 'RED' },
  { title: 'Fever (38 °C or more) or low temperature (below 36 °C)', detail: 'A newborn with a temperature change must be seen urgently.', level: 'RED' },
  { title: 'Not feeding, or too sleepy to wake for feeds', detail: 'Seek same-day care.', level: 'RED' },
  { title: 'Convulsions or abnormal movements', detail: 'An emergency.', level: 'RED' },
  { title: 'Yellow palms and soles, or jaundice in the first 24 hours', detail: 'Ask to be seen today.', level: 'AMBER' },
  { title: 'Red, swollen or discharging umbilical stump', detail: 'Contact your provider.', level: 'AMBER' },
  { title: 'Fewer wet nappies than usual', detail: 'A sign of poor feeding — ask for a feeding review.', level: 'AMBER' },
];

const T1_ASK = [
  'Confirming your dates: last menstrual period, or an early ultrasound scan if your cycles are irregular.',
  'Booking your first antenatal visit — ideally before 12 weeks.',
  'Which routine blood tests your provider recommends (blood group, haemoglobin, HIV, syphilis, and others offered locally).',
  'Any medicine or supplement you already take, and whether to continue it.',
  'Tetanus toxoid vaccination and your vaccination history.',
];

const T2_ASK = [
  'Whether an anomaly scan is available and appropriate for you.',
  'Screening for gestational diabetes if your provider recommends it.',
  'Your blood pressure and urine checked at every visit.',
  'Iron and folic acid, and any other supplement prescribed for you.',
  'Malaria prevention in pregnancy, if you live in an area where it is recommended.',
];

const T3_ASK = [
  'Your birth plan: where you will deliver, who will be with you, and how you will get there.',
  'Signs that labour has started, and when to leave for the facility.',
  'Fetal movement — what is normal for your baby and when to come in.',
  'Breastfeeding support available at your facility after birth.',
  'Postnatal visits for you and your baby, and the immunization schedule.',
];

const T1_HABITS = [
  'Take the supplement your provider prescribed, at the same time each day.',
  'Eat regularly even if you feel nauseous — small amounts, often.',
  'Rest when you can; tiredness in early pregnancy is common and real.',
  'Avoid alcohol, tobacco and recreational drugs, and ask before taking any new medicine.',
  'Drink safe, clean water throughout the day.',
];

const T2_HABITS = [
  'Keep every antenatal appointment, even when you feel well.',
  'Include protein, iron-rich foods, vegetables and fruit at each meal.',
  'Stay active with gentle walking unless your provider advises otherwise.',
  'Sleep on your side rather than flat on your back.',
  'Note down questions between visits so you do not forget them.',
];

const T3_HABITS = [
  'Pack your hospital bag and agree transport in advance.',
  'Count fetal movements and know your baby\'s normal pattern.',
  'Eat small, frequent meals and keep drinking water.',
  'Practise the birth companionship plan with whoever will be with you.',
  'Rest in the day so you have energy at night.',
];

const FETAL_MOVEMENT_WARNING: WarningSign = {
  title: 'Reduced fetal movement',
  detail:
    'From about 24 weeks you will get to know your baby\'s pattern. If movements reduce or stop, contact your facility the same day — do not wait until the next appointment.',
  level: 'RED',
};

interface WeekSeed {
  size: string;
  baby: string;
  body: string;
  milestone?: string;
  extra?: WarningSign[];
  ask?: string[];
}

/** 42 weeks of content, indexed by week number (week 1 is the first week after the LMP). */
const WEEKS: WeekSeed[] = [
  { size: 'A poppy seed', baby: 'Weeks 1–2 of a pregnancy are counted from the first day of your last period, so conception has usually not happened yet. Your body is preparing an egg.', body: 'You may not feel pregnant at all yet. Some women notice period-like cramps or spotting around the time of implantation.', extra: [{ title: 'Bleeding in early pregnancy', detail: 'Light spotting can be normal, but any bleeding should be mentioned to your provider so it can be checked.', level: 'AMBER' }] },
  { size: 'A poppy seed', baby: 'Fertilisation has happened and the fertilised egg is travelling to the uterus and beginning to implant.', body: 'Nothing is visible yet. Some women notice mild cramping, breast tenderness or fatigue.', ask: ['Starting a folic acid supplement if your provider recommends one.'] },
  { size: 'A poppy seed', baby: 'The embryo is implanting and the placenta is beginning to form. This is when a pregnancy test can turn positive.', body: 'A missed period is usually the first sign. Breast tenderness, tiredness and mood changes are common.', extra: [{ title: 'Severe one-sided pain or heavy bleeding', detail: 'Get urgent assessment — this needs a clinician to rule out a pregnancy outside the uterus.', level: 'RED' }] },
  { size: 'A poppy seed', baby: 'The neural tube — which becomes the brain and spinal cord — is forming. The heart tube begins to beat.', body: 'Nausea may start. Food aversions and a heightened sense of smell are common.', milestone: 'A positive pregnancy test — book your first antenatal visit now.' },
  { size: 'A sesame seed', baby: 'The heart is beating and circulating blood. Early structures of the eyes, ears and limbs are appearing.', body: 'Nausea ("morning sickness", which can happen at any hour), tiredness and frequent urination.' },
  { size: 'A lentil', baby: 'Facial features are forming. Arm and leg buds lengthen and the heart has divided into chambers.', body: 'Nausea may be at its worst. Constipation and bloating are common as hormones slow digestion.', extra: [{ title: 'Vomiting so severe you cannot keep fluids down', detail: 'You may become dehydrated. Seek same-day care.', level: 'AMBER' }] },
  { size: 'A blueberry', baby: 'Fingers and toes are forming. The brain is growing quickly and the embryo begins to move, though you cannot feel it yet.', body: 'Your waistband may feel tight even though there is no visible bump. Mood swings are common.' },
  { size: 'A raspberry', baby: 'The embryo is now called a fetus. The tail has disappeared and the face is recognisably human.', body: 'Nausea often starts to ease. You may feel hungrier, or still have no appetite at all.', milestone: 'Around 8 weeks many women have their first antenatal (booking) visit.' },
  { size: 'A cherry', baby: 'All essential organs have begun to develop. Muscles form, so the fetus can make small movements.', body: 'Breasts may be tender and larger. Skin changes such as darkening around the nipples can appear.' },
  { size: 'A kumquat', baby: 'The heart has four chambers and beats around 170 times a minute. Fingernails and hair follicles form.', body: 'The uterus is now the size of a large orange. Some women feel less nauseous from here.', ask: [...T1_ASK, 'Whether you need an early scan if your dates are uncertain.'] },
  { size: 'A fig', baby: 'Tooth buds appear under the gums. The fetus practises swallowing and kicking.', body: 'Nausea is usually improving. You may notice more vaginal discharge, which is normal if it is not itchy, sore or smelly.', extra: [{ title: 'Itchy, sore or foul-smelling discharge', detail: 'Ask your provider — infections in pregnancy are treatable and worth checking.', level: 'AMBER' }] },
  { size: 'A lime', baby: 'Fingers and toes have separated. The voice box forms and the kidneys begin producing urine.', body: 'The first trimester is nearly over. Fatigue is still common but often lifts soon.', milestone: 'End of the first trimester.' },
  {
    size: 'A plum',
    baby: 'Facial expressions become possible. Fingernails are fully formed and the skeleton begins to harden.',
    body: 'Nausea usually settles and appetite returns. You may start to show, especially if this is not your first pregnancy.',
    milestone: 'Week 12 — the first-trimester screening window many providers use.',
    ask: ['First-trimester screening or an early scan, if available.', 'Your haemoglobin and blood group results.', 'When your next appointment should be.'],
  },
  { size: 'A peach', baby: 'Fingerprints have formed. The fetus can squint, frown and make sucking movements.', body: 'Energy often returns. Round ligament pain — a sharp twinge in the lower belly when you move — is common.' },
  { size: 'An apple', baby: 'Bones are hardening, especially the skull and long bones. The fetus is around 10 cm long.', body: 'Breast growth continues. Some women notice their nose bleeding or gums bleeding more easily.' },
  { size: 'An onion', baby: 'The ears are in position and the fetus may respond to sound. Legs are now longer than the arms.', body: 'The bump becomes obvious. Your centre of gravity shifts, so take care on stairs and uneven ground.' },
  { size: 'A pear', baby: 'The skeleton is visible on a scan as bones harden. The fetus practises breathing movements.', body: 'Back ache and leg cramps can start. A supportive pillow between the knees helps at night.' },
  { size: 'A bell pepper', baby: 'The fetus can hear your voice. A waxy protective coating (vernix) covers the skin.', body: 'You may feel the first flutters — quickening. First-time mothers often feel them a little later.', milestone: 'First movements, usually felt between 16 and 22 weeks.' },
  { size: 'A mango', baby: 'Fat begins to be stored under the skin. The fetus has regular sleep and wake cycles.', body: 'Nasal congestion and nosebleeds are common because blood volume has risen substantially.' },
  {
    size: 'A banana',
    baby: 'An anomaly scan is usually offered around this time, looking at the baby\'s structure, the placenta and the fluid around the baby.',
    body: 'Appetite increases. Heartburn may begin as the uterus presses upward.',
    milestone: 'The halfway point of a 40-week pregnancy.',
    ask: [...T2_ASK, 'Whether an anomaly scan is available at your facility.'],
  },
  { size: 'A carrot', baby: 'Senses are developing rapidly. The fetus responds to sound with movement or a startle.', body: 'Stretch marks may appear on the belly, breasts or thighs. Moisturising helps the itching but does not prevent them.' },
  { size: 'A spaghetti squash', baby: 'The ears are developed enough to hear conversations from outside. Hair is growing.', body: 'Dizziness can occur if you stand up quickly or have not eaten for a while.', extra: [{ title: 'Fainting or feeling light-headed often', detail: 'Mention it at your next visit, and seek care the same day if you actually faint.', level: 'AMBER' }] },
  { size: 'A grapefruit', baby: 'Lungs are developing air sacs. The fetus has a regular sleep pattern you may be able to recognise.', body: 'Ankle swelling at the end of the day is common; raise your feet when you can.', extra: [{ title: 'Sudden swelling of the face and hands with a headache', detail: 'Ask to have your blood pressure and urine checked today.', level: 'RED' }] },
  {
    size: 'A cauliflower',
    baby: 'Movements are strong and clear. The fetus can grip, and eyebrows and lashes are present.',
    body: 'You may feel the baby hiccupping — a rhythmic twitching that lasts a few minutes.',
    extra: [FETAL_MOVEMENT_WARNING],
    ask: ['How to count fetal movements and what your baby\'s normal pattern is.'],
  },
  { size: 'A turnip', baby: 'The lungs are practising breathing. Skin is still wrinkled but beginning to smooth out.', body: 'Back pain and pelvic pressure increase. A maternity support belt helps some women.' },
  {
    size: 'A butternut squash',
    baby: 'Eyes can open and close and the fetus responds to light through the abdominal wall.',
    body: 'Heartburn and leg cramps are common. Gentle calf stretches before bed can help.',
    milestone: 'The third trimester begins.',
    ask: [...T3_ASK],
    extra: [FETAL_MOVEMENT_WARNING],
  },
  { size: 'An aubergine', baby: 'The brain is growing quickly and the lungs continue to mature. The fetus usually settles into a head-down position later.', body: 'Breathlessness when climbing stairs is common as the uterus presses on the diaphragm.', extra: [FETAL_MOVEMENT_WARNING] },
  { size: 'A cabbage', baby: 'Bones are fully formed but still soft. The fetus gains weight steadily now.', body: 'Braxton Hicks — practice contractions that come and go and ease with rest or a change of position.', extra: [{ title: 'Regular, painful contractions before 37 weeks', detail: 'Contact your facility — this may be early labour.', level: 'RED' }, FETAL_MOVEMENT_WARNING] },
  { size: 'A pineapple', baby: 'The fetus has developed a sucking reflex and can grasp firmly.', body: 'Swelling of the feet and hands may increase in hot weather or after standing a long time.', extra: [FETAL_MOVEMENT_WARNING] },
  { size: 'A jicama', baby: 'Lung maturity continues. Most babies turn head-down between now and 34 weeks.', body: 'Frequent urination returns as the baby drops lower into the pelvis.', extra: [FETAL_MOVEMENT_WARNING] },
  { size: 'A leek', baby: 'The kidneys are fully developed and the liver can process waste.', body: 'Pelvic pressure and waddling are common. Rest with your feet up when you can.', extra: [FETAL_MOVEMENT_WARNING] },
  { size: 'A squash', baby: 'The fetus is putting on fat and looks more like a newborn each week.', body: 'Nesting urges, difficulty sleeping and vivid dreams are all common.', extra: [FETAL_MOVEMENT_WARNING], ask: ['Where you will deliver and how you will travel there.', 'Who will look after your other children while you are away.'] },
  { size: 'A coconut', baby: 'Lungs are nearly mature. The head usually engages in the pelvis, which can make breathing easier.', body: 'Colostrum — the first breast milk — may leak. Breast pads help.', extra: [FETAL_MOVEMENT_WARNING], milestone: 'Term begins at 37 weeks.' },
  { size: 'A pineapple', baby: 'The fetus continues to gain weight. All organs are ready for life outside the uterus.', body: 'You may feel sharper pelvic twinges as the head presses down.', extra: [{ title: 'A gush or trickle of fluid', detail: 'Your waters may have broken. Contact your facility, even without contractions.', level: 'RED' }, FETAL_MOVEMENT_WARNING] },
  { size: 'A watermelon', baby: 'The lungs and brain continue maturing. The fetus is around 48 cm long.', body: 'Irregular contractions may increase. Time them if they become regular and painful.', extra: [{ title: 'Contractions every 5 minutes for an hour', detail: 'Go to your delivery facility.', level: 'RED' }, FETAL_MOVEMENT_WARNING] },
  { size: 'A winter melon', baby: 'The skull bones are not yet fused, which lets the head mould during birth.', body: 'Tiredness and impatience are normal. Keep drinking water and resting.', extra: [FETAL_MOVEMENT_WARNING] },
  { size: 'A small pumpkin', baby: 'Most babies are born around this week. The fetus has a firm grasp and recognises voices.', body: 'You may pass the mucus plug ("show") — a sign that labour can start soon.', extra: [{ title: 'Bleeding heavier than a show', detail: 'Seek care now.', level: 'RED' }, FETAL_MOVEMENT_WARNING] },
  { size: 'A pumpkin', baby: 'The fetus is considered fully ready for birth. Weight gain slows.', body: 'Braxton Hicks may be more frequent. Rest between them.', extra: [FETAL_MOVEMENT_WARNING], milestone: 'Your estimated due date. Only about 1 in 20 babies arrive on the exact day.' },
  { size: 'A large pumpkin', baby: 'The fetus remains comfortable and continues to gain a little weight each week.', body: 'You will probably have extra monitoring now. Keep every appointment.', ask: ['How often your provider wants to see you after the due date.', 'What monitoring is available if you go past your dates.'], extra: [FETAL_MOVEMENT_WARNING] },
  { size: 'A small watermelon', baby: 'Still growing. Most providers discuss induction or extra monitoring at this stage.', body: 'Discomfort increases. Ask about your options rather than waiting at home.', extra: [FETAL_MOVEMENT_WARNING] },
];

const TRIMESTER_HABITS = { 1: T1_HABITS, 2: T2_HABITS, 3: T3_HABITS } as const;
const TRIMESTER_ASK = { 1: T1_ASK, 2: T2_ASK, 3: T3_ASK } as const;

/** Build the guide for a week number (clamped to 1–42). */
export function weekGuide(week: number): WeekGuide {
  const clamped = Math.min(42, Math.max(1, Math.round(week)));
  const seed = WEEKS[clamped - 1] ?? WEEKS[WEEKS.length - 1]!;
  const trimester: 1 | 2 | 3 = clamped < 14 ? 1 : clamped < 28 ? 2 : 3;
  return {
    week: clamped,
    trimester,
    size: seed.size,
    baby: seed.baby,
    body: seed.body,
    ask: seed.ask ?? TRIMESTER_ASK[trimester],
    habits: TRIMESTER_HABITS[trimester],
    warnings: seed.extra ?? [],
    milestone: seed.milestone,
  };
}

export const ALL_WEEKS: WeekGuide[] = Array.from({ length: 42 }, (_, i) => weekGuide(i + 1));

/** Trimester boundaries used by the tracker. */
export const TRIMESTER_RANGES = [
  { trimester: 1 as const, label: 'First trimester', from: 1, to: 13 },
  { trimester: 2 as const, label: 'Second trimester', from: 14, to: 27 },
  { trimester: 3 as const, label: 'Third trimester', from: 28, to: 42 },
];
