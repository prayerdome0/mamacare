/**
 * Storage contract.
 *
 * Two providers implement this interface: Firestore for a live deployment and an
 * IndexedDB provider for offline / not-yet-provisioned use. No screen knows which
 * one is active. The device provider enforces the same access policy that
 * `firestore.rules` enforces in production, so behaviour is identical either way.
 */

import type {
  AccountStatus,
  Announcement,
  AppNotification,
  Appointment,
  Article,
  AuditLogEntry,
  Baby,
  CareLink,
  ContentReport,
  DeviceToken,
  DocumentRecord,
  Facility,
  Feedback,
  HealthcareProvider,
  HealthcareReport,
  ImmunizationRecord,
  JournalEntry,
  LanguageCode,
  Message,
  NotificationPreferences,
  Observation,
  Pregnancy,
  QuerySpec,
  Reminder,
  Role,
  SupporterLink,
  SystemSettings,
  UserProfile,
} from '@/types/domain';

export interface Collections {
  users: UserProfile;
  pregnancies: Pregnancy;
  babies: Baby;
  appointments: Appointment;
  reminders: Reminder;
  observations: Observation;
  immunizations: ImmunizationRecord;
  journal: JournalEntry;
  articles: Article;
  facilities: Facility;
  healthFacilities: Facility;
  providers: HealthcareProvider;
  messages: Message;
  notifications: AppNotification;
  devices: DeviceToken;
  announcements: Announcement;
  supporters: SupporterLink;
  care_links: CareLink;
  feedback: Feedback;
  reports: HealthcareReport | ContentReport;
  audit_logs: AuditLogEntry;
  settings: SystemSettings;
  documents: DocumentRecord;
}

export type CollectionName = keyof Collections;
export type RowOf<T extends CollectionName> = Collections[T];
export type NewRow<T extends CollectionName> = Partial<RowOf<T>> & Omit<RowOf<T>, 'id' | 'createdAt' | 'updatedAt'>;

/** The signed-in identity every read and write is authorised against. */
export interface Actor {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  status: AccountStatus;
  facilityId: string | null;
  providerId: string | null;
  /** The mother a supporter account helps. */
  supportsUserId: string | null;
  country: string;
  language: LanguageCode;
  photoUrl: string | null;
  notificationPrefs: NotificationPreferences;
  privilegeVersion: number;
  /** Where the role came from — custom claims are authoritative when present. */
  claimsSource: 'custom-claims' | 'profile-document' | 'device-session' | 'default';
}

export interface ListResult<T> {
  rows: T[];
  total: number;
}

export interface TxHandle {
  set<T extends CollectionName>(name: T, id: string, value: RowOf<T>): void;
  update<T extends CollectionName>(name: T, id: string, patch: Partial<RowOf<T>>): void;
  remove(name: CollectionName, id: string): void;
}

export interface DataProvider {
  readonly kind: 'firebase' | 'local';

  get<T extends CollectionName>(name: T, id: string, actor: Actor | null): Promise<RowOf<T> | null>;
  list<T extends CollectionName>(name: T, query: QuerySpec, actor: Actor | null): Promise<ListResult<RowOf<T>>>;
  create<T extends CollectionName>(name: T, value: NewRow<T>, actor: Actor | null): Promise<RowOf<T>>;
  update<T extends CollectionName>(name: T, id: string, patch: Partial<RowOf<T>>, actor: Actor | null): Promise<RowOf<T>>;
  remove<T extends CollectionName>(name: T, id: string, actor: Actor | null): Promise<void>;
  nextSequence(name: string, step?: number): Promise<number>;
  subscribe<T extends CollectionName>(
    name: T,
    query: QuerySpec,
    actor: Actor | null,
    onChange: (result: ListResult<RowOf<T>>) => void,
    onError: (error: unknown) => void,
  ): () => void;
  putBlob(key: string, blob: Blob): Promise<void>;
  getBlob(key: string): Promise<Blob | null>;
  deleteBlob(key: string): Promise<void>;
  transact<T>(work: (tx: TxHandle) => Promise<T>): Promise<T>;
  /** Device provider only — powers the destructive "reset this device" action. */
  purgeLocalData?(): Promise<void>;
}

/** Authentication adapters: Firebase Auth, or a device-local password store. */
/** The profile a registration writes, before the identity provider mints the uid. */
export type ProfileDraft = Omit<UserProfile, 'id' | 'uid' | 'createdAt' | 'updatedAt'>;

export interface AuthAdapter {
  readonly kind: 'firebase' | 'local';
  createAccount?(input: { email: string; password: string; profile: ProfileDraft }): Promise<unknown>;
  restore(): Promise<void>;
  getActor(): Promise<Actor | null>;
  onSessionChange(listener: (actor: Actor | null) => void): () => void;
  signIn(email: string, password: string, remember?: boolean): Promise<Actor>;
  signOut(): Promise<void>;
  refreshClaims(): Promise<Actor | null>;
  sendPasswordReset(email: string): Promise<void>;
  changePassword(current: string, next: string): Promise<void>;
  deleteAccount(password?: string): Promise<void>;
}
