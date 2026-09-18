/**
 * Domain repositories.
 *
 * Every screen reads and writes through here rather than touching the data layer
 * directly. Keeping the queries in one place means the "who can see this" logic,
 * the ordering and the field names are decided once, and a change in the model
 * only has to be made in one file.
 */

import { newId } from '@/lib/ids';
import { addDays, toIsoDate } from '@/lib/utils';
import {
  DEFAULT_NOTIFICATION_PREFS,
  HEALTHCARE_REPORT_TYPE_LABELS,
  type Announcement,
  type AppNotification,
  type Appointment,
  type Article,
  type ArticleCategory,
  type Baby,
  type CareLink,
  type ContentReport,
  type DeviceToken,
  type Facility,
  type Feedback,
  type HealthcareProvider,
  type HealthcareReport,
  type HealthcareReportType,
  type ImmunizationRecord,
  type JournalEntry,
  type Message,
  type NotificationKind,
  type NotificationPreferences,
  type Observation,
  type Pregnancy,
  type Reminder,
  type ReportTargetType,
  type SupporterLink,
  type SystemSettings,
  type UserProfile,
} from '@/types/domain';
import { services } from '@/services/session-store';
import { scheduleForBaby } from '@/config/immunization';
import { BUILTIN_ARTICLES } from '@/config/articles';
import { logAudit } from '@/services/audit';

const data = () => services().data;
const actor = () => services().actorRef();
const requireActor = () => services().require();

/* ── Profile ──────────────────────────────────────────────────────────── */

export const profileRepo = {
  async me(): Promise<UserProfile | null> {
    const uid = actor()?.uid;
    if (!uid) return null;
    return data().get('users', uid);
  },

  async update(patch: Partial<UserProfile>): Promise<UserProfile> {
    const me = requireActor();
    return data().update('users', me.uid, patch);
  },

  async updateNotificationPrefs(patch: Partial<NotificationPreferences>): Promise<UserProfile> {
    const me = requireActor();
    const profile = await data().get('users', me.uid);
    return data().update('users', me.uid, {
      notificationPrefs: { ...(profile?.notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS), ...patch },
    });
  },

  async setPhoto(photoUrl: string | null, photoPublicId: string | null): Promise<UserProfile> {
    const me = requireActor();
    return data().update('users', me.uid, { photoUrl, photoPublicId });
  },

  list: (limit = 200) => data().list('users', { orderBy: { field: 'createdAt', direction: 'desc' }, limit }),

  /** Read one account by its user id (administrative context). */
  byUid: (uid: string) => data().get('users', uid),

  /**
   * Administrator-only update of another account. The data layer still enforces the
   * role check, so this cannot be used by a mother to promote herself.
   */
  adminUpdate: (uid: string, patch: Partial<UserProfile>) => data().update('users', uid, patch),

  /** Administrator-only removal of an account row. Does not cascade to health records. */
  adminRemove: (uid: string) => data().remove('users', uid),

  byRole: (role: UserProfile['role']) => data().rows('users', { where: [{ field: 'role', op: '==', value: role }] }),
};

/* ── Pregnancy ────────────────────────────────────────────────────────── */

export const pregnancyRepo = {
  /** The mother's active pregnancy (or most recent, if she is postnatal). */
  async current(userId: string): Promise<Pregnancy | null> {
    const rows = await data().rows('pregnancies', {
      where: [{ field: 'userId', op: '==', value: userId }],
      orderBy: { field: 'createdAt', direction: 'desc' },
    });
    return rows.find((row) => row.status === 'active') ?? rows[0] ?? null;
  },

  async all(userId: string): Promise<Pregnancy[]> {
    return data().rows('pregnancies', {
      where: [{ field: 'userId', op: '==', value: userId }],
      orderBy: { field: 'createdAt', direction: 'desc' },
    });
  },

  async create(input: {
    lmpDate: string | null;
    eddDate: string | null;
    datingMethod: Pregnancy['datingMethod'];
    previousPregnancies: number;
    previousLiveBirths: number;
    facilityId?: string | null;
    notes?: string | null;
  }): Promise<Pregnancy> {
    const me = requireActor();
    return data().create('pregnancies', {
      userId: me.uid,
      lmpDate: input.lmpDate,
      eddDate: input.eddDate,
      datingMethod: input.datingMethod,
      previousPregnancies: input.previousPregnancies,
      previousLiveBirths: input.previousLiveBirths,
      status: 'active',
      deliveryDate: null,
      postnatalSince: null,
      facilityId: input.facilityId ?? null,
      notes: input.notes ?? null,
    });
  },

  update: (id: string, patch: Partial<Pregnancy>) => data().update('pregnancies', id, patch),

  /** Switch to Mother & Baby mode. */
  async recordDelivery(id: string, deliveryDate: string): Promise<Pregnancy> {
    const pregnancy = await data().update('pregnancies', id, {
      status: 'delivered',
      deliveryDate,
      postnatalSince: deliveryDate,
    });
    await logAudit('record-update', 'pregnancies', id, 'Recorded delivery; switched to Mother & Baby mode');
    return pregnancy;
  },

  async endPregnancy(id: string, note: string): Promise<Pregnancy> {
    return data().update('pregnancies', id, { status: 'ended', notes: note });
  },
};

/* ── Babies ───────────────────────────────────────────────────────────── */

export const babyRepo = {
  async list(userId: string): Promise<Baby[]> {
    return data().rows('babies', {
      where: [{ field: 'userId', op: '==', value: userId }],
      orderBy: { field: 'dateOfBirth', direction: 'desc' },
    });
  },

  get: (id: string) => data().get('babies', id),

  async create(input: Partial<Baby> & Pick<Baby, 'name' | 'dateOfBirth' | 'sex'>): Promise<Baby> {
    const me = requireActor();
    return data().create('babies', {
      pregnancyId: null,
      birthWeightKg: null,
      birthLengthCm: null,
      headCircumferenceCm: null,
      birthFacilityId: null,
      birthNotes: null,
      photoUrl: null,
      photoPublicId: null,
      ...input,
      userId: me.uid,
    } as Baby);
  },

  update: (id: string, patch: Partial<Baby>) => data().update('babies', id, patch),
  remove: (id: string) => data().remove('babies', id),
};

/* ── Appointments ─────────────────────────────────────────────────────── */

export const appointmentRepo = {
  async list(userId: string, options: { includePast?: boolean } = {}): Promise<Appointment[]> {
    const today = toIsoDate(new Date());
    const rows = await data().rows('appointments', {
      where: [{ field: 'userId', op: '==', value: userId }],
      orderBy: { field: 'date', direction: 'asc' },
    });
    return options.includePast ? rows : rows.filter((row) => row.date >= today || row.status === 'scheduled');
  },

  async upcoming(userId: string, limit = 5): Promise<Appointment[]> {
    const today = toIsoDate(new Date());
    const rows = await data().rows('appointments', {
      where: [
        { field: 'userId', op: '==', value: userId },
        { field: 'status', op: '==', value: 'scheduled' },
        { field: 'date', op: '>=', value: today },
      ],
      orderBy: { field: 'date', direction: 'asc' },
    });
    return rows.slice(0, limit);
  },

  async next(userId: string): Promise<Appointment | null> {
    const [first] = await appointmentRepo.upcoming(userId, 1);
    return first ?? null;
  },

  get: (id: string) => data().get('appointments', id),

  /**
   * `date`, `facilityName`, `purpose` and `kind` are required; everything else has
   * a safe default so a quick "add appointment" form stays short.
   */
  async create(input: Partial<Appointment> & Pick<Appointment, 'kind' | 'date' | 'facilityName' | 'purpose'>): Promise<Appointment> {
    const me = requireActor();
    return data().create('appointments', {
      observations: [],
      questions: [],
      clinicianNotes: null,
      testResults: null,
      nextAppointmentDate: null,
      reminderSentAt: null,
      sharedWithSupporter: false,
      status: 'scheduled',
      babyId: null,
      facilityId: null,
      time: null,
      ...input,
      userId: me.uid,
    } as Appointment);
  },

  update: (id: string, patch: Partial<Appointment>) => data().update('appointments', id, patch),
  remove: (id: string) => data().remove('appointments', id),

  async complete(id: string, patch: Partial<Appointment> = {}): Promise<Appointment> {
    return data().update('appointments', id, { status: 'completed', ...patch });
  },

  /** Appointments a provider may see — only for patients who shared care. */
  async forProvider(): Promise<Appointment[]> {
    const patients = await careLinkRepo.myPatients();
    const ids = new Set(patients.map((p) => p.uid));
    const rows = await data().rows('appointments', {
      orderBy: { field: 'date', direction: 'desc' },
      limit: 500,
    });
    return rows.filter((row) => ids.has(row.userId));
  },
};

/* ── Reminders ────────────────────────────────────────────────────────── */

export const reminderRepo = {
  async list(userId: string): Promise<Reminder[]> {
    return data().rows('reminders', {
      where: [{ field: 'userId', op: '==', value: userId }],
      orderBy: { field: 'createdAt', direction: 'asc' },
    });
  },

  get: (id: string) => data().get('reminders', id),

  async create(input: Partial<Reminder> & Pick<Reminder, 'kind' | 'title' | 'times' | 'frequency' | 'startDate'>): Promise<Reminder> {
    const me = requireActor();
    return data().create('reminders', {
      takenLog: [],
      daysOfWeek: [],
      endDate: null,
      active: true,
      medicine: null,
      dose: null,
      prescribedBy: null,
      instructions: null,
      sharedWithSupporter: false,
      ...input,
      userId: me.uid,
    } as Reminder);
  },

  update: (id: string, patch: Partial<Reminder>) => data().update('reminders', id, patch),
  remove: (id: string) => data().remove('reminders', id),

  /** Records a dose as taken. The app never suggests a dose. */
  async markTaken(id: string, at: Date = new Date()): Promise<Reminder> {
    const reminder = await data().get('reminders', id);
    const log = reminder?.takenLog ?? [];
    return data().update('reminders', id, { takenLog: [...log, at.toISOString()].slice(-400) });
  },
};

/* ── Observations ─────────────────────────────────────────────────────── */

export const observationRepo = {
  async list(userId: string, kind?: Observation['kind']): Promise<Observation[]> {
    const rows = await data().rows('observations', {
      where: [{ field: 'userId', op: '==', value: userId }],
      orderBy: { field: 'createdAt', direction: 'desc' },
    });
    return kind ? rows.filter((row) => row.kind === kind) : rows;
  },

  async create(input: Omit<Observation, 'id' | 'createdAt' | 'updatedAt'>): Promise<Observation> {
    return data().create('observations', input);
  },

  remove: (id: string) => data().remove('observations', id),
};

/* ── Immunization ─────────────────────────────────────────────────────── */

export const immunizationRepo = {
  async list(babyId: string): Promise<ImmunizationRecord[]> {
    const rows = await data().rows('immunizations', {
      where: [{ field: 'babyId', op: '==', value: babyId }],
      orderBy: { field: 'scheduledDate', direction: 'asc' },
    });
    return rows;
  },

  /** Creates the national schedule for a baby that does not have one yet. */
  async ensureSchedule(baby: Baby): Promise<ImmunizationRecord[]> {
    const existing = await immunizationRepo.list(baby.id);
    if (existing.length > 0) return existing;
    const created: ImmunizationRecord[] = [];
    for (const dose of scheduleForBaby(baby.dateOfBirth)) {
      created.push(
        await data().create('immunizations', {
          babyId: baby.id,
          userId: baby.userId,
          vaccineCode: dose.code,
          vaccineName: dose.vaccine,
          dose: dose.dose,
          scheduledAgeLabel: dose.ageLabel,
          scheduledDate: dose.scheduledDate,
          givenDate: null,
          status: 'upcoming',
          facilityId: null,
          facilityName: null,
          batchNumber: null,
          notes: dose.note ?? null,
        }),
      );
    }
    return created;
  },

  async markGiven(id: string, patch: { givenDate: string; facilityName?: string | null; batchNumber?: string | null }): Promise<ImmunizationRecord> {
    return data().update('immunizations', id, { status: 'given', ...patch });
  },

  update: (id: string, patch: Partial<ImmunizationRecord>) => data().update('immunizations', id, patch),
  remove: (id: string) => data().remove('immunizations', id),

  async nextDue(babyId: string): Promise<ImmunizationRecord | null> {
    const today = toIsoDate(new Date());
    const rows = await immunizationRepo.list(babyId);
    return rows.find((row) => row.status === 'upcoming' && row.scheduledDate >= today) ?? rows.find((row) => row.status === 'upcoming') ?? null;
  },
};

/* ── Journal ──────────────────────────────────────────────────────────── */

export const journalRepo = {
  async list(userId: string): Promise<JournalEntry[]> {
    return data().rows('journal', {
      where: [{ field: 'userId', op: '==', value: userId }],
      orderBy: { field: 'date', direction: 'desc' },
    });
  },

  async create(input: Omit<JournalEntry, 'id' | 'createdAt' | 'updatedAt' | 'userId'>): Promise<JournalEntry> {
    const me = requireActor();
    return data().create('journal', { ...input, userId: me.uid });
  },

  update: (id: string, patch: Partial<JournalEntry>) => data().update('journal', id, patch),
  remove: (id: string) => data().remove('journal', id),
};

/* ── Articles / education ─────────────────────────────────────────────── */

export const articleRepo = {
  /**
   * Built-in library merged with database articles. A database article with the
   * same slug replaces the built-in one, so an administrator can correct or
   * localise shipped content without deleting it.
   */
  async library(options: { audience?: Article['audience']; includeDrafts?: boolean } = {}): Promise<Article[]> {
    const rows = await data().rows('articles', { limit: 500 });
    const bySlug = new Map<string, Article>();
    for (const article of BUILTIN_ARTICLES) bySlug.set(article.slug, article);
    for (const article of rows) bySlug.set(article.slug, article);
    return Array.from(bySlug.values())
      .filter((article) => options.includeDrafts || article.status === 'published')
      .filter((article) => !options.audience || article.audience === options.audience || article.audience === 'public')
      .sort((a, b) => a.title.localeCompare(b.title));
  },

  async byCategory(category: ArticleCategory): Promise<Article[]> {
    const all = await articleRepo.library();
    return all.filter((article) => article.category === category);
  },

  async byWeek(week: number): Promise<Article[]> {
    const all = await articleRepo.library();
    return all.filter((article) => article.weekNumber === week);
  },

  async bySlug(slug: string): Promise<Article | null> {
    const all = await articleRepo.library({ includeDrafts: true });
    return all.find((article) => article.slug === slug) ?? null;
  },

  async drafts(): Promise<Article[]> {
    const rows = await data().rows('articles', { where: [{ field: 'status', op: '==', value: 'draft' }] });
    return rows;
  },

  create: (input: Omit<Article, 'id' | 'createdAt' | 'updatedAt'>) => data().create('articles', input),
  update: (id: string, patch: Partial<Article>) => data().update('articles', id, patch),
  remove: (id: string) => data().remove('articles', id),

  async publish(id: string, reviewerName: string): Promise<Article> {
    const article = await data().update('articles', id, {
      status: 'published',
      reviewedBy: reviewerName,
      reviewedAt: new Date().toISOString(),
    });
    await logAudit('content-publish', 'articles', id, article.title);
    return article;
  },
};

/* ── Facilities ───────────────────────────────────────────────────────── */

let facilityCache: { at: number; rows: Facility[] } | null = null;
const FACILITY_CACHE_TTL = 5 * 60_000;

export const facilityRepo = {
  async list(forceRefresh = false): Promise<Facility[]> {
    if (!forceRefresh && facilityCache && Date.now() - facilityCache.at < FACILITY_CACHE_TTL) {
      return facilityCache.rows;
    }
    const rows = await data().rows('facilities', { orderBy: { field: 'name', direction: 'asc' }, limit: 1000 });
    facilityCache = { at: Date.now(), rows };
    return rows;
  },

  get: async (id: string) => {
    if (facilityCache && Date.now() - facilityCache.at < FACILITY_CACHE_TTL) {
      const match = facilityCache.rows.find((f) => f.id === id);
      if (match) return match;
    }
    return data().get('facilities', id);
  },

  create: async (input: Omit<Facility, 'id' | 'createdAt' | 'updatedAt'>) => {
    facilityCache = null;
    return data().create('facilities', input);
  },
  update: async (id: string, patch: Partial<Facility>) => {
    facilityCache = null;
    return data().update('facilities', id, patch);
  },
  remove: async (id: string) => {
    facilityCache = null;
    return data().remove('facilities', id);
  },

  async verify(id: string, verifiedBy: string): Promise<Facility> {
    facilityCache = null;
    return data().update('facilities', id, { verified: true, verifiedAt: new Date().toISOString() });
  },
};

/* ── Providers ────────────────────────────────────────────────────────── */

export const providerRepo = {
  async directory(): Promise<HealthcareProvider[]> {
    const rows = await data().rows('providers', { limit: 500 });
    return rows.filter((row) => row.status === 'approved' && row.listedInDirectory);
  },

  async all(): Promise<HealthcareProvider[]> {
    return data().rows('providers', { orderBy: { field: 'fullName', direction: 'asc' }, limit: 500 });
  },

  async mine(): Promise<HealthcareProvider | null> {
    const uid = actor()?.uid;
    if (!uid) return null;
    const rows = await data().rows('providers', { where: [{ field: 'userId', op: '==', value: uid }] });
    return rows[0] ?? null;
  },

  get: (id: string) => data().get('providers', id),

  create: (input: Omit<HealthcareProvider, 'id' | 'createdAt' | 'updatedAt'>) => data().create('providers', input),
  update: (id: string, patch: Partial<HealthcareProvider>) => data().update('providers', id, patch),

  /**
   * Submit (or resubmit) a nurse/provider application for the signed-in user.
   *
   * The application is the user's own `providers` record in `pending` state —
   * the same record an administrator approves. A user can therefore never
   * "become a nurse" on their own: until an administrator flips `status` to
   * approved and the profile is updated, the record carries no privilege.
   * Resubmitting after a rejection updates the existing record so there is at
   * most one application per person.
   */
  async apply(input: {
    fullName: string;
    email: string;
    phone: string | null;
    location: string;
    facilityId: string | null;
    facilityName: string;
    profession: HealthcareProvider['profession'];
    licenseNumber: string;
    qualifications: string | null;
    supportingDocumentIds?: string[];
  }): Promise<HealthcareProvider> {
    const me = requireActor();
    const existing = await providerRepo.mine();
    const nowIso = new Date().toISOString();
    const fields = {
      fullName: input.fullName.trim(),
      email: input.email.trim(),
      phone: input.phone?.trim() || null,
      location: input.location.trim(),
      facilityId: input.facilityId,
      facilityName: input.facilityName.trim(),
      profession: input.profession,
      licenseNumber: input.licenseNumber.trim(),
      qualifications: input.qualifications?.trim() || null,
      supportingDocuments: input.supportingDocumentIds ?? existing?.supportingDocuments ?? [],
      status: 'pending' as const,
      verifiedBy: null,
      verifiedAt: null,
      rejectionReason: null,
    };
    if (existing) {
      const updated = await data().update('providers', existing.id, fields);
      await logAudit('record-update', 'providers', existing.id, `Re-submitted application for ${updated.fullName}`);
      return updated;
    }
    const created = await data().create('providers', {
      userId: me.uid,
      title: null,
      languages: ['English'],
      bio: null,
      photoUrl: null,
      photoPublicId: null,
      acceptingNewPatients: false,
      listedInDirectory: false,
      createdAt: nowIso,
      ...fields,
    } as Omit<HealthcareProvider, 'id'>);
    // Link the profile to the application; the rules keep this field owner-locked
    // here, but the link is what lets "which of my records is my application?"
    // stay a single query.
    await data().update('users', me.uid, { providerId: created.id }).catch(() => undefined);
    await logAudit('record-create', 'providers', created.id, `Nurse application submitted for ${created.fullName}`);
    return created;
  },

  async approve(id: string, byName: string): Promise<HealthcareProvider> {
    const provider = await data().update('providers', id, {
      status: 'approved',
      verifiedBy: byName,
      verifiedAt: new Date().toISOString(),
      rejectionReason: null,
    });
    await logAudit('provider-approval', 'providers', id, `Approved ${provider.fullName}`);
    return provider;
  },

  async reject(id: string, reason: string, byName: string): Promise<HealthcareProvider> {
    const provider = await data().update('providers', id, { status: 'rejected', rejectionReason: reason, verifiedBy: byName });
    await logAudit('provider-approval', 'providers', id, `Rejected ${provider.fullName}: ${reason}`);
    return provider;
  },
};

/* ── Care links (the only path from a provider to a patient) ──────────── */

export const careLinkRepo = {
  async mine(): Promise<CareLink[]> {
    const me = actor();
    if (!me) return [];
    return data().rows('care_links', { where: [{ field: 'motherUserId', op: '==', value: me.uid }] });
  },

  /** Patients who have shared their care with the signed-in provider. */
  async myPatients(): Promise<UserProfile[]> {
    const me = actor();
    if (!me) return [];
    const links = await data().rows('care_links', {
      where: [{ field: 'providerUserId', op: '==', value: me.uid }],
    });
    const active = links.filter((link) => link.status === 'active');
    const patients: UserProfile[] = [];
    for (const link of active) {
      const profile = await data().get('users', link.motherUserId);
      if (profile) patients.push(profile);
    }
    return patients;
  },

  /**
   * Every care link that names the signed-in provider, active and requested.
   * This is the provider's own view of their caseload — it never reaches links
   * belonging to another clinician.
   */
  async forProvider(): Promise<CareLink[]> {
    const me = actor();
    if (!me) return [];
    return data().rows('care_links', {
      where: [{ field: 'providerUserId', op: '==', value: me.uid }],
      orderBy: { field: 'createdAt', direction: 'desc' },
    });
  },

  /**
   * Requests care sharing with a provider (created by the provider, accepted by the
   * mother). The document id is deterministic — `mother__provider` — so Firestore
   * rules can check "does this clinician have an active link to this patient?" with
   * a single `exists()` instead of an unindexed query.
   */
  async create(input: Omit<CareLink, 'id' | 'createdAt' | 'updatedAt'>): Promise<CareLink> {
    const id = input.providerUserId ? careLinkId(input.motherUserId, input.providerUserId) : undefined;
    return data().create('care_links', { ...input, ...(id ? { id } : {}) } as Omit<CareLink, 'createdAt' | 'updatedAt'>);
  },

  update: (id: string, patch: Partial<CareLink>) => data().update('care_links', id, patch),
  remove: (id: string) => data().remove('care_links', id),
};

/* ── Supporters (family sharing) ──────────────────────────────────────── */

export const supporterRepo = {
  async list(userId: string): Promise<SupporterLink[]> {
    return data().rows('supporters', { where: [{ field: 'motherUserId', op: '==', value: userId }] });
  },

  async invite(input: { supporterEmail: string; supporterName: string; relationship: string; permissions: SupporterLink['permissions'] }): Promise<SupporterLink> {
    const me = requireActor();
    const email = input.supporterEmail.toLowerCase().trim();
    return data().create('supporters', {
      // Deterministic id (`mother__email`) so rules can resolve an invitation
      // before the supporter has an account of their own.
      id: supporterLinkId(me.uid, email),
      motherUserId: me.uid,
      supporterEmail: email,
      supporterUserId: null,
      supporterName: input.supporterName,
      relationship: input.relationship,
      permissions: input.permissions,
      status: 'invited',
      invitedBy: me.uid,
      acceptedAt: null,
    });
  },

  /** Claim an invitation addressed to this email (device mode; hosted mode uses the same rule). */
  async claimForMe(): Promise<SupporterLink[]> {
    const me = actor();
    if (!me) return [];
    const rows = await data().rows('supporters', {
      where: [{ field: 'supporterEmail', op: '==', value: me.email.toLowerCase() }],
    });
    const claimed: SupporterLink[] = [];
    for (const row of rows) {
      if (row.supporterUserId === me.uid && row.status === 'active') {
        claimed.push(row);
        continue;
      }
      claimed.push(
        await data().update('supporters', row.id, {
          supporterUserId: me.uid,
          status: 'active',
          acceptedAt: new Date().toISOString(),
        }),
      );
    }
    return claimed;
  },

  update: (id: string, patch: Partial<SupporterLink>) => data().update('supporters', id, patch),
  revoke: (id: string) => data().update('supporters', id, { status: 'revoked' }),
};

/* ── Messaging ────────────────────────────────────────────────────────── */

export const threadId = (a: string, b: string): string => [a, b].sort().join('__');

/** Deterministic care-link id: `mother__provider`. Referenced by firestore.rules. */
export const careLinkId = (motherUserId: string, providerUserId: string): string => `${motherUserId}__${providerUserId}`;

/** Deterministic supporter-invitation id: `mother__email`. Referenced by firestore.rules. */
export const supporterLinkId = (motherUserId: string, email: string): string =>
  `${motherUserId}__${email.toLowerCase().trim()}`;

export const messageRepo = {
  async threads(userId: string): Promise<{ peerId: string; peerName: string; last: Message; unread: number }[]> {
    const rows = await data().rows('messages', { orderBy: { field: 'createdAt', direction: 'desc' }, limit: 500 });
    const mine = rows.filter((row) => row.fromUserId === userId || row.toUserId === userId);
    const grouped = new Map<string, { peerId: string; peerName: string; last: Message; unread: number }>();
    for (const row of mine) {
      const peerId = row.fromUserId === userId ? row.toUserId : row.fromUserId;
      const peerName = row.fromUserId === userId ? row.toName : row.fromName;
      const existing = grouped.get(peerId);
      if (!existing) {
        grouped.set(peerId, { peerId, peerName, last: row, unread: row.toUserId === userId && !row.readAt ? 1 : 0 });
      } else if (!existing.unread && row.toUserId === userId && !row.readAt) {
        existing.unread += 1;
      }
    }
    return Array.from(grouped.values()).sort((a, b) => b.last.createdAt.localeCompare(a.last.createdAt));
  },

  async conversation(userId: string, peerId: string): Promise<Message[]> {
    const rows = await data().rows('messages', {
      where: [{ field: 'threadId', op: '==', value: threadId(userId, peerId) }],
      orderBy: { field: 'createdAt', direction: 'asc' },
      limit: 500,
    });
    return rows;
  },

  async send(input: { toUserId: string; toName: string; body: string }): Promise<Message> {
    const me = requireActor();
    return data().create('messages', {
      threadId: threadId(me.uid, input.toUserId),
      fromUserId: me.uid,
      fromName: me.displayName,
      fromRole: me.role,
      toUserId: input.toUserId,
      toName: input.toName,
      body: input.body,
      readAt: null,
      systemNotice: false,
    });
  },

  async markRead(userId: string, peerId: string): Promise<void> {
    const rows = await messageRepo.conversation(userId, peerId);
    for (const row of rows) {
      if (row.toUserId === userId && !row.readAt) await data().update('messages', row.id, { readAt: new Date().toISOString() });
    }
  },
};

/* ── Notifications ────────────────────────────────────────────────────── */

export const notificationRepo = {
  async list(userId: string, limit = 50): Promise<{ rows: AppNotification[]; total: number; unread: number }> {
    const rows = await data().rows('notifications', {
      where: [{ field: 'userId', op: '==', value: userId }],
      orderBy: { field: 'createdAt', direction: 'desc' },
      limit,
    });
    return { rows, total: rows.length, unread: rows.filter((row) => !row.readAt).length };
  },

  async push(input: { userId: string; title: string; body: string; kind: NotificationKind; link?: string | null; deliveredByPush?: boolean }): Promise<AppNotification> {
    return data().create('notifications', {
      userId: input.userId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      link: input.link ?? null,
      readAt: null,
      deliveredByPush: input.deliveredByPush ?? false,
    });
  },

  markRead: (id: string) => data().update('notifications', id, { readAt: new Date().toISOString() }),

  async markAllRead(userId: string): Promise<void> {
    const rows = await data().rows('notifications', {
      where: [{ field: 'userId', op: '==', value: userId }],
    });
    for (const row of rows) {
      if (!row.readAt) await data().update('notifications', row.id, { readAt: new Date().toISOString() });
    }
  },

  remove: (id: string) => data().remove('notifications', id),
};

/* ── Feedback, reports, announcements, settings ───────────────────────── */

export const feedbackRepo = {
  async submit(input: { email?: string | null; topic: Feedback['topic']; message: string }): Promise<Feedback> {
    const me = actor();
    return data().create('feedback', {
      userId: me?.uid ?? null,
      email: input.email ?? me?.email ?? null,
      topic: input.topic,
      message: input.message,
      status: 'new',
      response: null,
      handledBy: null,
    });
  },

  all: () => data().rows('feedback', { orderBy: { field: 'createdAt', direction: 'desc' }, limit: 500 }),
  update: (id: string, patch: Partial<Feedback>) => data().update('feedback', id, patch),
  remove: (id: string) => data().remove('feedback', id),
};

/* ── Healthcare Reports & Content Reports ───────────────────────────── */

export const healthcareReportRepo = {
  async create(input: {
    patientId: string;
    patientName: string;
    facilityId: string;
    facilityName: string;
    facilityAddress?: string | null;
    facilityPhone?: string | null;
    reportType: HealthcareReportType;
    title?: string;
    reportNumber?: string;
    status?: 'draft' | 'final' | 'archived';
    documentUrl?: string | null;
    documentPublicId?: string | null;
    metadata?: HealthcareReport['metadata'];
  }): Promise<HealthcareReport> {
    const me = requireActor();
    const year = new Date().getFullYear();
    const randSeq = Math.floor(10000 + Math.random() * 90000);
    const reportNumber = input.reportNumber || `MamaCare_Report_${year}-${randSeq}`;
    const title = input.title || HEALTHCARE_REPORT_TYPE_LABELS[input.reportType] || 'Official Healthcare Report';

    const row = (await data().create('reports', {
      patientId: input.patientId,
      patientName: input.patientName,
      facilityId: input.facilityId,
      facilityName: input.facilityName,
      facilityAddress: input.facilityAddress ?? null,
      facilityPhone: input.facilityPhone ?? null,
      reportType: input.reportType,
      reportNumber,
      title,
      generatedBy: me.uid,
      generatedByName: me.displayName || 'Healthcare Clinician',
      generatedByRole: me.role,
      status: input.status || 'final',
      documentUrl: input.documentUrl ?? null,
      documentPublicId: input.documentPublicId ?? null,
      metadata: input.metadata || {},
    } as never)) as unknown as HealthcareReport;

    await logAudit('record-create', 'reports', row.id, `${title} #${reportNumber} for patient ${input.patientName}`);
    return row;
  },

  async forPatient(patientId: string): Promise<HealthcareReport[]> {
    const rows = (await data().rows('reports', {
      where: [{ field: 'patientId', op: '==', value: patientId }],
      orderBy: { field: 'createdAt', direction: 'desc' },
      limit: 100,
    })) as unknown as (HealthcareReport | ContentReport)[];

    return rows.filter((r): r is HealthcareReport => 'patientId' in r && r.patientId === patientId);
  },

  async forProvider(): Promise<HealthcareReport[]> {
    const me = actor();
    if (!me) return [];
    const all = (await data().rows('reports', {
      orderBy: { field: 'createdAt', direction: 'desc' },
      limit: 250,
    })) as unknown as (HealthcareReport | ContentReport)[];

    return all.filter((r): r is HealthcareReport => 'patientId' in r);
  },

  async forFacility(facilityId: string): Promise<HealthcareReport[]> {
    const rows = (await data().rows('reports', {
      where: [{ field: 'facilityId', op: '==', value: facilityId }],
      orderBy: { field: 'createdAt', direction: 'desc' },
      limit: 150,
    })) as unknown as (HealthcareReport | ContentReport)[];

    return rows.filter((r): r is HealthcareReport => 'patientId' in r);
  },

  async all(limit = 200): Promise<HealthcareReport[]> {
    const rows = (await data().rows('reports', {
      orderBy: { field: 'createdAt', direction: 'desc' },
      limit,
    })) as unknown as (HealthcareReport | ContentReport)[];

    return rows.filter((r): r is HealthcareReport => 'patientId' in r);
  },

  async get(id: string): Promise<HealthcareReport | null> {
    const r = (await data().get('reports', id)) as unknown as (HealthcareReport | ContentReport | null);
    if (r && 'patientId' in r) return r as HealthcareReport;
    return null;
  },

  async update(id: string, patch: Partial<HealthcareReport>): Promise<HealthcareReport> {
    const updated = (await data().update('reports', id, patch as never)) as unknown as HealthcareReport;
    await logAudit('record-update', 'reports', id, `Updated healthcare report #${updated.reportNumber}`);
    return updated;
  },

  async remove(id: string): Promise<void> {
    await logAudit('record-delete', 'reports', id, 'Deleted healthcare report');
    await data().remove('reports', id);
  },

  async search(filters: {
    patientName?: string;
    patientId?: string;
    reportNumber?: string;
    facilityId?: string;
    reportType?: string;
    status?: string;
  }): Promise<HealthcareReport[]> {
    const all = await this.all(500);
    return all.filter((r) => {
      if (filters.patientName && !r.patientName?.toLowerCase().includes(filters.patientName.toLowerCase())) {
        return false;
      }
      if (filters.patientId && !r.patientId?.toLowerCase().includes(filters.patientId.toLowerCase())) {
        return false;
      }
      if (filters.reportNumber && !r.reportNumber?.toLowerCase().includes(filters.reportNumber.toLowerCase())) {
        return false;
      }
      if (filters.facilityId && filters.facilityId !== 'ALL' && r.facilityId !== filters.facilityId) {
        return false;
      }
      if (filters.reportType && filters.reportType !== 'ALL' && r.reportType !== filters.reportType) {
        return false;
      }
      if (filters.status && filters.status !== 'ALL' && r.status !== filters.status) {
        return false;
      }
      return true;
    });
  },
};

export const reportRepo = {
  async submit(input: { targetType: ReportTargetType; targetId: string; targetLabel: string; reason: string; details?: string | null }): Promise<void> {
    const me = actor();
    await data().create('reports', {
      reporterId: me?.uid ?? null,
      reporterName: me?.displayName ?? null,
      targetType: input.targetType,
      targetId: input.targetId,
      targetLabel: input.targetLabel,
      reason: input.reason,
      details: input.details ?? null,
      status: 'open',
      reviewedBy: null,
      reviewedAt: null,
      resolution: null,
    } as never);
  },

  async all(): Promise<ContentReport[]> {
    const rows = (await data().rows('reports', { orderBy: { field: 'createdAt', direction: 'desc' }, limit: 500 })) as (ContentReport | HealthcareReport)[];
    return rows.filter((r): r is ContentReport => 'targetType' in r);
  },
  update: (id: string, patch: Partial<ContentReport>) => data().update('reports', id, patch as never),
};

export const announcementRepo = {
  async active(): Promise<Announcement[]> {
    const rows = await data().rows('announcements', { limit: 100 });
    const nowIso = new Date().toISOString();
    return rows
      .filter((row) => row.active)
      .filter((row) => !row.startsAt || row.startsAt <= nowIso)
      .filter((row) => !row.endsAt || row.endsAt >= nowIso)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  all: () => data().rows('announcements', { orderBy: { field: 'createdAt', direction: 'desc' }, limit: 200 }),
  create: (input: Omit<Announcement, 'id' | 'createdAt' | 'updatedAt'>) => data().create('announcements', input),
  update: (id: string, patch: Partial<Announcement>) => data().update('announcements', id, patch),
  remove: (id: string) => data().remove('announcements', id),
};

export const settingsRepo = {
  async get(): Promise<SystemSettings | null> {
    return data().get('settings', 'global');
  },

  async save(patch: Partial<SystemSettings>): Promise<SystemSettings> {
    const existing = await settingsRepo.get();
    if (existing) return data().update('settings', 'global', patch);
    return data().create('settings', {
      id: 'global',
      key: 'global',
      registrationOpen: true,
      providerApprovalsRequired: true,
      defaultCountry: 'ZM',
      supportEmail: 'support@mamacare.health',
      supportPhone: '',
      emergencyNumbers: [],
      immunizationScheduleLabel: 'Zambia EPI routine schedule',
      contentReviewReminderDays: 365,
      maintenanceMessage: null,
      ...patch,
    } as SystemSettings);
  },
};

/* ── Devices (push tokens) ────────────────────────────────────────────── */

export const deviceRepo = {
  async register(userId: string, token: string): Promise<void> {
    const rows = await data().rows('devices', {
      where: [{ field: 'userId', op: '==', value: userId }],
    });
    const existing = rows.find((row) => row.token === token);
    const platform = typeof navigator !== 'undefined' ? navigator.platform || 'web' : 'web';
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : null;
    if (existing) {
      await data().update('devices', existing.id, { lastSeenAt: new Date().toISOString() });
      return;
    }
    await data().create('devices', { userId, token, platform, userAgent, lastSeenAt: new Date().toISOString() });
  },

  async unregister(token: string): Promise<void> {
    const rows = await data().rows('devices', {});
    const match = rows.find((row) => row.token === token);
    if (match) await data().remove('devices', match.id);
  },
};

/* ── Convenience used by the dashboard ────────────────────────────────── */

export async function todayReminders(reminders: Reminder[], on = new Date()): Promise<Reminder[]> {
  const day = on.getDay();
  const isToday = (reminder: Reminder): boolean => {
    if (!reminder.active) return false;
    const start = new Date(reminder.startDate);
    if (!Number.isNaN(start.getTime()) && toIsoDate(start) > toIsoDate(on)) return false;
    if (reminder.endDate && reminder.endDate < toIsoDate(on)) return false;
    switch (reminder.frequency) {
      case 'daily':
        return true;
      case 'weekdays':
        return day >= 1 && day <= 5;
      case 'weekly':
        return day === new Date(reminder.startDate || Date.now()).getDay();
      case 'specific-days':
        return reminder.daysOfWeek.includes(day);
      case 'once':
        return toIsoDate(new Date(reminder.startDate)) === toIsoDate(on);
      default:
        return true;
    }
  };
  return reminders.filter(isToday);
}

/** Adds a reminder-driven appointment for the next due immunization. */
export async function suggestImmunizationAppointment(baby: Baby, record: ImmunizationRecord, facilityName: string): Promise<Appointment> {
  return appointmentRepo.create({
    babyId: baby.id,
    kind: 'immunization',
    date: record.scheduledDate,
    time: '08:00',
    facilityId: null,
    facilityName,
    purpose: `${record.vaccineName} — ${record.dose}`,
    status: 'scheduled',
    testResults: null,
    clinicianNotes: null,
    nextAppointmentDate: null,
    sharedWithSupporter: false,
    observations: [],
    questions: ['Bring the child health card.'],
  });
}

export const newRecordId = newId;
export const inDays = (days: number): string => toIsoDate(addDays(new Date(), days));
