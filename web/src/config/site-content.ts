/**
 * Public site copy and contact configuration.
 *
 * Everything a clinic would need to change before publishing lives here (or in
 * the environment). Emergency numbers default to the published Lusaka / national
 * short codes and can be overridden per deployment with VITE_EMERGENCY_* — there
 * is no single centralised emergency number outside Lusaka, so a deployment must
 * be able to point at its own referral hospital.
 */

const env = import.meta.env as Record<string, string | undefined>;

export const SITE = {
  name: 'MAMA CARE',
  tagline: 'Better Maternal Care. Connected.',
  description:
    'MAMA CARE is a maternal-health platform for clinics: structured antenatal records, risk alerts that never diagnose, referral tracking, appointment reminders and a mother-facing portal — on one secure record per pregnancy.',
  org: {
    name: env.VITE_ORG_NAME ?? 'MAMA CARE',
    email: env.VITE_SUPPORT_EMAIL ?? 'support@mamacare.health',
    phone: env.VITE_ORG_PHONE ?? '+260 211 000 000',
    address: env.VITE_ORG_ADDRESS ?? 'Lusaka, Zambia',
    hours: env.VITE_ORG_HOURS ?? 'Support: Monday–Friday, 08:00–17:00 (CAT)',
  },
  privacyContact: env.VITE_PRIVACY_EMAIL ?? 'data-protection@mamacare.health',
} as const;

export const EMERGENCY_CONTACTS = {
  /** Overridable so a deployment can point at its own dispatch. */
  ambulance: env.VITE_EMERGENCY_AMBULANCE ?? '991',
  emergency: env.VITE_EMERGENCY_EMERGENCY ?? '999',
  fire: env.VITE_EMERGENCY_FIRE ?? '993',
  facilityLine: env.VITE_EMERGENCY_FACILITY_LINE ?? '',
  lines: [
    { label: 'Ambulance (Lusaka)', number: env.VITE_EMERGENCY_AMBULANCE ?? '991' },
    { label: 'Emergency — police, ambulance, fire', number: env.VITE_EMERGENCY_EMERGENCY ?? '999' },
    { label: 'Lusaka Ambulance Service', number: env.VITE_EMERGENCY_LUSAKA_AMBULANCE ?? '0211 220180' },
    { label: 'Fire brigade', number: env.VITE_EMERGENCY_FIRE ?? '993' },
  ],
  note:
    'Outside Lusaka there is no single centralised ambulance number. Call the labour ward of your nearest facility directly and send someone with the mother. Every second matters in an obstetric emergency.',
} as const;

/** Danger signs shown publicly. Wording is "seek assessment", never a diagnosis. */
export const PUBLIC_DANGER_SIGNS = [
  { key: 'VAGINAL_BLEEDING', title: 'Any vaginal bleeding', detail: 'Bleeding or spotting at any point in pregnancy needs same-day assessment.' },
  { key: 'SEVERE_HEADACHE', title: 'Severe headache that will not go away', detail: 'Especially with swelling, blurred vision or pain below the ribs.' },
  { key: 'VISUAL_DISTURBANCE', title: 'Blurred vision, flashing lights or spots', detail: 'Stop what you are doing and ask to be seen today.' },
  { key: 'CONVULSIONS', title: 'Fits or convulsions', detail: 'An emergency. Do not wait — go to a facility immediately.' },
  { key: 'SWELLING_FACE_HANDS', title: 'Sudden swelling of face, hands or feet', detail: 'Ask for your blood pressure and urine to be checked today.' },
  { key: 'SEVERE_ABDOMINAL_PAIN', title: 'Severe abdominal pain', detail: 'Persistent pain, particularly with fever or bleeding, needs assessment.' },
  { key: 'DIFFICULTY_BREATHING', title: 'Difficulty breathing', detail: 'Breathlessness at rest or being unable to speak in sentences.' },
  { key: 'FEVER', title: 'High fever or shivering', detail: 'Particularly with burning on urination, rash or feeling very unwell.' },
  { key: 'SEVERE_VOMITING', title: 'Vomiting that will not stop', detail: 'Unable to keep fluids down for more than 12 hours, or weight loss.' },
  { key: 'REDUCED_FETAL_MOVEMENT', title: 'Reduced or no fetal movement', detail: 'From about 24 weeks, a clear change in your baby’s usual movements needs assessment today.' },
  { key: 'FLUID_LEAKAGE', title: 'Water broken before labour', detail: 'A gush or trickle of fluid — go to the facility, even without contractions.' },
  { key: 'CORD_PROLAPSE', title: 'Cord coming through first', detail: 'Emergency. Get to a facility immediately, ideally on hands and knees.' },
  { key: 'PROLONGED Labour', title: 'Labour that is long or obstructed', detail: 'Many hours of strong contractions without progress needs assessment.' },
];

export const SERVICES = [
  {
    key: 'registration',
    title: 'One record per mother and pregnancy',
    summary:
      'Registration creates a unique patient ID, dates the pregnancy automatically, and records a structured booking visit — so the record follows the mother even when she moves between facilities.',
    image: 'communityWorker' as const,
    bullets: ['Unique internal patient ID (never a name as the key)', 'Automatic gestational age and estimated due date', 'Consent captured and versioned at registration', 'Cross-facility lookup by patient ID or phone'],
  },
  {
    key: 'anc',
    title: 'Structured antenatal visits',
    summary:
      'Every visit is recorded the same way: blood pressure, pulse, temperature, respirations, weight, MUAC, fundal height, fetal heart, urine findings, a full danger-sign screen, tests, medications, counselling and the plan.',
    image: 'ancConsultation' as const,
    bullets: ['Thirteen danger signs plus a free-text concern', 'Rules evaluated at the moment of saving', 'Findings and thresholds shown side by side', 'Visit history and trend charts per pregnancy'],
  },
  {
    key: 'alerts',
    title: 'Risk alerts that route care, not diagnose',
    summary:
      'Configured rules compare recorded observations against facility thresholds and raise a red or amber alert with the evidence attached. Alerts always say what to do next: assess, refer, monitor — never what the mother has.',
    image: 'screening' as const,
    bullets: ['Red / amber / green with explicit text labels', 'One alert per rule per visit, so nothing duplicates', 'Full acknowledgement and response trail', 'Thresholds editable by administrators with sign-off tracking'],
  },
  {
    key: 'referrals',
    title: 'Referrals with a closed loop',
    summary:
      'Referral packets carry the clinical question, urgency, vitals at transfer and transport arrangements; the receiving facility records arrival, assessment and outcome, so nothing is lost between two sites.',
    image: 'midwifeConsultation' as const,
    bullets: ['Nine statuses from active to closed', 'Vital-sign snapshot travels with the referral', 'Receiving facility feedback recorded on the mother record', 'Awaiting-closure queue for the referral desk'],
  },
  {
    key: 'appointments',
    title: 'Appointments, reminders and lost-to-follow-up',
    summary:
      'Scheduled reviews for every mother in care, with automatic missed-visit detection and reminders by push notification and — where an approved SMS provider is configured — by SMS.',
    image: 'appointmentCheckin' as const,
    bullets: ['Today, upcoming, overdue and missed views', 'Reminder lead times configured per facility', 'Missed visits raise a follow-up alert', 'Community health worker follow-up assignment'],
  },
  {
    key: 'reports',
    title: 'Reports, documents and the audit trail',
    summary:
      'Facility and patient reports are generated as PDFs, stored with access metadata in the database, delivered through Cloudinary, and every access is auditable.',
    image: 'aboutPlatform' as const,
    bullets: ['Eight report types from ANC coverage to referrals', 'Patients see only their own reports', 'Permissions enforced by database rules, not the UI', 'Append-only audit log of every privileged action'],
  },
];

export const ABOUT = {
  problem:
    'In many clinics a pregnancy is followed on a paper card that stays in one facility. Blood pressure readings are copied into a ledger if they are copied at all, referrals leave on a slip of paper with no record of arrival, and a mother who does not return is often discovered only when she arrives in labour.',
  approach:
    'MAMA CARE keeps one structured record per mother and pregnancy. Observations are captured in a fixed format so they can be compared over time, thresholds are configured by the facility, and every alert carries the evidence that raised it. The mother keeps her own view of the record — her dates, her appointments, her reports — and a referral sends a complete packet to the receiving facility, which closes the loop with its own assessment.',
  principles: [
    { title: 'Alerts route care, they do not diagnose', detail: 'An alert states which recorded value crossed which configured threshold and what assessment is required. A diagnosis is made by a clinician.' },
    { title: 'The record belongs to the facility and the mother', detail: 'Staff enter findings; the mother sees her own dates, appointments, results and reports. Aggregate views are counts only — never names.' },
    { title: 'Access is enforced where the data lives', detail: 'Every read and write is checked by security rules against the authenticated user\'s role and facility. Interface permissions improve the experience; they are never the protection.' },
    { title: 'Offline-tolerant and low-bandwidth aware', detail: 'The workspace is built for shared clinic devices on unreliable networks: optimistic saves, retryable operations and no dependency on large media.' },
  ],
  governance:
    'The clinical rule set shipped with this build is a starting configuration, not approved guidance. Thresholds, alert wording and escalation steps must be reviewed and signed off by the responsible clinical authority before the system is used for real patient care. The settings screen records who reviewed the rules and when.',
} as const;

export const MATERNAL_HEALTH = {
  intro:
    'Most maternal deaths and complications are preventable when problems are found early and followed through. Routine antenatal contact is how a clinic finds them: a blood pressure reading, a urine test, a haemoglobin result, a fundal height measurement, and the mother’s own account of how she feels.',
  who: [
    {
      title: 'Early and regular contact',
      body: 'The World Health Organization recommends at least eight antenatal contacts for every pregnancy, the first early in the first trimester. More contacts mean more chances to detect hypertension, anaemia, growth problems and preterm labour.',
    },
    {
      title: 'Blood pressure and urine at every visit',
      body: 'Hypertensive disorders remain a leading cause of maternal death. Measuring blood pressure at each contact and testing urine for protein is what makes pre-eclampsia detectable before it becomes an emergency.',
    },
    {
      title: 'Iron and folinic acid, and a haemoglobin check',
      body: 'Anaemia in pregnancy increases the danger of bleeding at birth. Supplementation and a recorded haemoglobin result allow the team to act while there is still time.',
    },
    {
      title: 'Fetal movement from the third trimester',
      body: 'A clear reduction in the baby’s usual movements after about 24 weeks needs assessment the same day. MAMA CARE records the report on the visit and raises it immediately.',
    },
    {
      title: 'Birth preparedness and a working referral route',
      body: 'Agreeing where and how a mother will reach a facility, before labour starts, and sending a complete referral packet with a tracked receipt, are among the most effective routine practices a facility has.',
    },
    {
      title: 'Postnatal follow-up for mother and baby',
      body: 'The first week after birth carries the highest risk of bleeding, infection and complications from hypertension. Antenatal records continue into postnatal visits so nothing restarts from zero.',
    },
  ],
  records: [
    { label: 'A booking visit that dates the pregnancy', detail: 'LMP or ultrasound dating gives the gestational age and due date; the app recalculates them at every visit.' },
    { label: 'A danger-sign screen every visit', detail: 'Thirteen listed signs plus “other”, with a positive “none reported” checkbox so the absence of symptoms is itself documented.' },
    { label: 'Trended measurements', detail: 'Weight, fundal height, blood pressure and haemoglobin across visits, drawn as charts rather than scattered across a card.' },
    { label: 'An alert with its evidence attached', detail: 'The reading that crossed the threshold, the rule that fired, who saw it, what was done, and when.' },
    { label: 'A referral that arrives complete', detail: 'Reason, clinical question, urgency, findings at transfer, transport, and the receiving facility’s outcome.' },
  ],
} as const;

export const FAQS = [
  {
    q: 'Does MAMA CARE give medical advice?',
    a: 'No. It records what a clinician measured and raises an alert when a recorded value crosses a threshold the facility configured. The alert text describes the finding and the assessment required. Diagnosis and treatment remain with the clinical team.',
  },
  {
    q: 'Who can see a mother’s record?',
    a: 'Staff at her registered or care facility, and the clinicians involved in an active referral to or from another facility. Administrators can see directory and audit information. A mother with a patient account sees her own record. Access is enforced by database security rules, not only by the interface.',
  },
  {
    q: 'Can a health worker give themselves administrator access?',
    a: 'No. Registration always creates the least-privileged account. Roles are changed only by an existing administrator — through a privileged API endpoint in a Firebase deployment — and the change is written to the audit log.',
  },
  {
    q: 'What happens if the network fails during a visit?',
    a: 'The visit is saved when a connection returns, and a save is idempotent: replaying the same submission cannot create two records. Nothing is stored only in memory.',
  },
  {
    q: 'Are photographs and lab results kept somewhere safe?',
    a: 'Media are stored in Cloudinary under the mamacare/ folder tree. Reports and medical documents are uploaded with a non-public access mode and opened through short-lived signed URLs; only the metadata lives in the database.',
  },
  {
    q: 'Can we use this without a cloud project?',
    a: 'The evaluation build runs entirely on the device using IndexedDB, with the same permission model and rules engine, so a facility can test the workflow before connecting Firebase. Records stay on that device only.',
  },
];

/**
 * Published clinical reference standards (WHO / national guidance) — not platform
 * metrics. The live platform counts are read from the database and labelled
 * separately (`LiveStats`); these are facts about the care model, so they are
 * safe to show to an anonymous visitor and are never presented as usage numbers.
 */
export const PUBLIC_STATS = {
  note: 'Reference standards are published guidance; usage counts come from the database.',
} as const;

export const STATS = [
  { value: '8', label: 'recommended antenatal contacts per pregnancy (WHO)' },
  { value: '13', label: 'danger signs screened at every visit' },
  { value: '9', label: 'referral statuses tracked to closure' },
  { value: '0', label: 'clinical conclusions drawn by the software' },
] as const;

/**
 * The pregnancy lifecycle as the platform follows it.
 *
 * Each stage names what is *recorded* at that point, not what the software
 * concludes. Used by the "How it works" page; the stage key doubles as the
 * anchor id so a link can point straight at one stage.
 */
export const CARE_LIFECYCLE = [
  {
    key: 'registration',
    stage: 'Registration',
    weeks: 'First contact, any gestation',
    title: 'She is registered once, and the record is dated',
    body:
      'A unique patient ID is issued from a server-side counter, so two devices can never mint the same one. The pregnancy is dated from the last menstrual period or an ultrasound, and the estimated due date and gestational age are then recalculated at every visit rather than copied forward. Consent is captured with its version, so a later change of policy can be answered from the record.',
    recorded: ['Patient ID and identity details', 'Pregnancy dating and estimated due date', 'Obstetric history and parity', 'Consent, with the version accepted'],
  },
  {
    key: 'booking',
    stage: 'Booking visit',
    weeks: 'As early as possible in the first trimester',
    title: 'A baseline the rest of the pregnancy is compared against',
    body:
      'The booking visit carries the full observation set — blood pressure, pulse, temperature, respirations, weight, MUAC, fundal height, fetal heart where audible, urine findings and haemoglobin — plus the danger-sign screen. Everything recorded later is a trend away from this baseline, which is why the baseline is captured completely rather than partially.',
    recorded: ['Complete observation set', 'Thirteen-sign danger screen', 'Haemoglobin and urine result', 'Iron and folic acid started and recorded'],
  },
  {
    key: 'followup',
    stage: 'Follow-up contacts',
    weeks: 'To at least eight contacts',
    title: 'The same form every time, so the visits can be compared',
    body:
      'Each contact is recorded in a fixed format. The rules run at the moment of saving: a value that crosses a configured threshold raises an alert immediately, with the reading and the threshold shown side by side. Weight, fundal height, blood pressure and haemoglobin are drawn as charts across the pregnancy, so a trajectory is visible rather than inferred from memory.',
    recorded: ['Observations in the same format', 'Rules evaluated on save', 'Trend charts across visits', 'Counselling given and the plan agreed'],
  },
  {
    key: 'alert',
    stage: 'Alert raised',
    weeks: 'Whenever a threshold is crossed',
    title: 'An alert routes the assessment; it never names a diagnosis',
    body:
      'An alert states which recorded value crossed which configured threshold and what assessment is required — assess now, review within a set interval, or monitor. One alert per rule per visit, so a single reading cannot produce three queue entries. Whoever responds records what was done and when; the trail is part of the record, not a note in a margin.',
    recorded: ['Red / amber severity with text labels', 'The triggering value and the threshold', 'Acknowledgement and response trail', 'Escalation to the referral queue where required'],
  },
  {
    key: 'referral',
    stage: 'Referral',
    weeks: 'When higher-level care is needed',
    title: 'A packet that arrives complete, and a loop that closes',
    body:
      'The referral carries the clinical question, urgency, vital signs at transfer, transport arrangements and the record summary. The receiving facility records arrival, assessment and outcome against the same record, and an awaiting-closure queue means an unanswered referral is visible to the referring desk rather than lost between two sites.',
    recorded: ['Clinical question and urgency', 'Vital-sign snapshot at transfer', 'Transport and companion arrangements', 'Receiving facility assessment and outcome'],
  },
  {
    key: 'postnatal',
    stage: 'Delivery and postnatal',
    weeks: 'Birth, then day one, day seven, six weeks',
    title: 'The record continues past delivery',
    body:
      'The first week carries the highest risk of bleeding, infection and complications from hypertension, so antenatal findings continue into postnatal visits rather than restarting from zero. Newborn weight and the six-week check are recorded against the same record, and family planning is offered and documented before the record closes.',
    recorded: ['Mode and outcome of delivery', 'Postnatal checks for mother and baby', 'Newborn weight and feeding notes', 'Family planning offered'],
  },
] as const;

/**
 * Where data actually lives. Written to match the implementation — the
 * /how-it-works page renders this verbatim, so it must not promise anything the
 * code does not do.
 */
export const DATA_FLOW = [
  {
    key: 'entry',
    title: 'Entered on the clinic device',
    body: 'A visit is entered against the mother’s record. Validation runs before the save, and a save is idempotent — replaying the same submission cannot create a second record.',
  },
  {
    key: 'storage',
    title: 'Stored as rows in the project database',
    body: 'Records are stored as documents in Cloud Firestore, one collection per record type. Every read and write is checked by security rules against the authenticated token, not only by what the interface shows.',
  },
  {
    key: 'media',
    title: 'Files stored separately from the record',
    body: 'Photographs and documents go to Cloudinary; reports and clinical documents are uploaded non-public and opened through short-lived signed URLs. The database holds only the metadata.',
  },
  {
    key: 'delivery',
    title: 'Delivered to the people who need it',
    body: 'Reminders go out as push notifications and, where an approved SMS provider is configured, as SMS. Referral packets reach the receiving facility through the record itself.',
  },
  {
    key: 'audit',
    title: 'Recorded in an append-only log',
    body: 'Every privileged action — a role change, a threshold edit, a report generated — is written to an audit log with who, what and when. Entries cannot be edited or removed.',
  },
] as const;

/**
 * Adoption path for a facility. Rendered on /for-clinics. Each step names the
 * screen an administrator actually uses, so the page stays honest about what
 * has to be done before real patient care.
 */
export const FOR_CLINICS = {
  intro:
    'MAMA CARE is deployed per facility or per health authority. The platform arrives with a starting clinical configuration that is explicitly not approved guidance: the thresholds, alert wording and escalation steps are reviewed and signed off by your clinical authority before the system holds real records, and the settings screen records who reviewed them and when.',
  steps: [
    {
      step: '01',
      title: 'Create the facility record',
      body: 'An administrator creates each facility — type, district and province, contact details, whether it has a maternity ward, ultrasound and laboratory, and which higher-level facility it refers up to. The directory is what referrals and staff assignment are built on.',
      screen: 'Admin → Facilities',
    },
    {
      step: '02',
      title: 'Approve staff and assign them',
      body: 'Health workers register and land in a pending queue. An administrator approves each account, sets the role and assigns the facility. Self-registration can never request administrator, and every role change is written to the audit log.',
      screen: 'Admin → Staff',
    },
    {
      step: '03',
      title: 'Review and sign off the clinical rules',
      body: 'Alert thresholds ship as a starting configuration. The clinical authority reviews each rule — the value, the threshold, the severity and the wording — and signs it off. Until that is done the rules are marked as awaiting review.',
      screen: 'Admin → Platform settings',
    },
    {
      step: '04',
      title: 'Publish the services the facility offers',
      body: 'The services catalogue lists what the facility actually provides: antenatal care, delivery, postnatal, newborn care, laboratory, outreach. It is read by the public services page and by appointment booking, so nothing about what the clinic offers is hard-coded.',
      screen: 'Admin → Services',
    },
    {
      step: '05',
      title: 'Configure reminders and integrations',
      body: 'Reminder lead times, whether SMS is enabled and which push project is in use are configured per deployment. Where no SMS provider is approved, push notifications alone are used rather than sending through an unvetted route.',
      screen: 'Admin → Platform settings',
    },
    {
      step: '06',
      title: 'Train the team, then open the register',
      body: 'The education library holds the reading offered to mothers and the training material for staff, authored in the facility’s own languages. Once the team has run a full cycle in training, mothers are registered for real.',
      screen: 'Workspace → Education',
    },
  ],
  responsibilities: [
    { title: 'Clinical authority', detail: 'Reviews and signs off the rule set, thresholds and escalation wording. Named on the record.' },
    { title: 'Administrator', detail: 'Approves accounts, maintains the facility directory, publishes services, reviews the audit log.' },
    { title: 'Facility supervisor', detail: 'Manages staff assignment, monitors the alert and lost-to-follow-up queues, signs off reports.' },
    { title: 'Clinical team', detail: 'Records visits and referrals, responds to alerts within the interval the rule specifies.' },
  ],
  evaluation:
    'A facility can run the whole workflow before connecting a cloud project: with no Firebase configuration present, the build stores records in the browser using the same permission model and the same rules engine. Nothing leaves the device in that mode, and the service status page says so plainly.',
} as const;

/**
 * What a mother with a patient account can actually do. Rendered on
 * /for-mothers; every line corresponds to a screen in the mother portal.
 */
export const FOR_MOTHERS = {
  intro:
    'A mother with an account sees her own record and nothing else — her dates, her next appointment, her results and her reports. She cannot see another patient’s record, and no aggregate view on the site ever shows a name.',
  features: [
    { title: 'Your pregnancy at a glance', detail: 'How many weeks pregnant you are, your estimated due date, and which visit you are on — recalculated from your dating at every contact.' },
    { title: 'Appointments and reminders', detail: 'Your next appointment, and a reminder before it. If you cannot attend, your facility sees that the visit was missed and follows up.' },
    { title: 'Your visit records', detail: 'What was measured at each antenatal contact: blood pressure, weight, fundal height, test results, the medicines you were given and the plan agreed.' },
    { title: 'Your reports and documents', detail: 'Reports released to you by your facility, and the documents on your record. They open through a short-lived link, not a public one.' },
    { title: 'Reading for your stage', detail: 'Health education chosen for the stage of pregnancy you are in, in your chosen language.' },
    { title: 'Messages from your clinic', detail: 'Announcements from the facility and messages from the team caring for you, in one place.' },
  ],
  boundaries: [
    'Your record belongs to the facility that holds it. Corrections and deletions are requested from that facility, not from this site.',
    'MAMA CARE does not diagnose. If an alert appears on your record it means a clinician needs to assess a recorded finding.',
    'In an emergency, do not use the portal. Go to the nearest facility and call the numbers on the emergency page.',
  ],
} as const;

/**
 * Published external references and printable material.
 *
 * These are real, stable publications — the resources page links out to them
 * rather than restating clinical guidance in the platform's own words, so the
 * authority for each statement stays with its publisher.
 */
export const PUBLIC_RESOURCES = [
  {
    key: 'who-anc',
    title: 'WHO recommendations on antenatal care for a positive pregnancy experience',
    publisher: 'World Health Organization',
    detail: 'The eight-contact model, the recommended tests and supplements at each contact, and the evidence behind them.',
    href: 'https://www.who.int/health-topics/antenatal-care',
  },
  {
    key: 'who-maternal-mortality',
    title: 'Maternal mortality — fact sheet',
    publisher: 'World Health Organization',
    detail: 'Current global and regional figures, the leading causes of maternal death, and which of them are preventable.',
    href: 'https://www.who.int/news-room/fact-sheets/detail/maternal-mortality',
  },
  {
    key: 'who-preeclampsia',
    title: 'WHO recommendation on the prevention and treatment of pre-eclampsia and eclampsia',
    publisher: 'World Health Organization',
    detail: 'Blood-pressure thresholds, the role of calcium and magnesium sulphate, and when referral is indicated.',
    href: 'https://www.who.int/publications/i/item/9789241549226',
  },
  {
    key: 'unfpa-zambia',
    title: 'UNFPA Zambia — sexual and reproductive health',
    publisher: 'United Nations Population Fund',
    detail: 'National context for maternal health in Zambia, including programmes operating with the Ministry of Health.',
    href: 'https://zambia.unfpa.org',
  },
  {
    key: 'moh-zambia',
    title: 'Ministry of Health, Republic of Zambia',
    publisher: 'Government of Zambia',
    detail: 'National health policy, facility directory information and public health notices.',
    href: 'https://www.moh.gov.zm',
  },
  {
    key: 'unicef-newborn',
    title: 'Newborn health and early child development',
    publisher: 'UNICEF',
    detail: 'Postnatal care for the newborn, essential newborn care practices and follow-up in the first weeks.',
    href: 'https://www.unicef.org/health/newborn-health',
  },
] as const;
