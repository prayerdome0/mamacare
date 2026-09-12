import type {
  AccountStatus,
  AlertRule,
  AncVisit,
  AppNotification,
  Appointment,
  AuditLogEntry,
  AuthClaims,
  ClinicalAlert,
  DeviceToken,
  DocumentRecord,
  EducationResource,
  Facility,
  FacilityAssignment,
  Mother,
  Pregnancy,
  QuerySpec,
  Referral,
  ReportRecord,
  Role,
  SystemSettings,
  UserProfile,
} from '@/types/domain';

/**
 * Storage contract.
 *
 * Both providers (Firestore for real deployments, the device provider for
 * offline / not-yet-configured environments) implement this interface, so no
 * screen knows or cares which one is active. Crucially the device provider
 * enforces the same access policy that `firestore.rules` enforces in
 * production: reads and writes travel *through* the policy layer instead of
 * trusting the caller.
 */

export interface Collections {
  users: UserProfile;
  facilities: Facility;
  mothers: Mother;
  pregnancies: Pregnancy;
  anc_visits: AncVisit;
  appointments: Appointment;
  alerts: ClinicalAlert;
  referrals: Referral;
  reports: ReportRecord;
  documents: DocumentRecord;
  notifications: AppNotification;
  audit_logs: AuditLogEntry;
  education: EducationResource;
  alert_rules: AlertRule;
  devices: DeviceToken;
  facility_assignments: FacilityAssignment;
  settings: SystemSettings;
}

export type CollectionName = keyof Collections;
export type RowOf<T extends CollectionName> = Collections[T];
export type NewRow<T extends CollectionName> = Partial<RowOf<T>> & Omit<RowOf<T>, 'id'>;

export type Actor = {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  facilityId: string | null;
  accountStatus: AccountStatus;
  motherId: string | null;
  privilegeVersion: number;
  /**
   * Where the authority came from. `firebase-profile` means the ID token carries
   * no custom claims yet (a fresh or unapproved account), so the UI may show the
   * role but Firestore rules will deny privileged reads.
   */
  claimsSource: 'firebase-id-token' | 'firebase-profile' | 'local-session';
  /**
   * Which layer decided `role`: the `users/{uid}` document (authoritative for
   * display and dashboards), the ID token claims, or the safe default.
   */
  roleSource?: 'custom-claims' | 'firestore-document' | 'device-session' | 'default';
  /**
   * The stored document and the session token disagree. The request to re-mint
   * claims has been made (or is pending); until it completes only the screens
   * the claims allow will read data successfully.
   */
  claimsPendingSync?: boolean;
  /** Set when the token could not be aligned with the stored role, with the reason. */
  claimSyncNotice?: string | null;
  /** User's country (ISO 3166-1 alpha-2). Zambia is the default. */
  country?: string | null;
};

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
  update<T extends CollectionName>(
    name: T,
    id: string,
    patch: Partial<RowOf<T>>,
    actor: Actor | null,
  ): Promise<RowOf<T>>;
  remove<T extends CollectionName>(name: T, id: string, actor: Actor | null): Promise<void>;
  /** Atomic counter used for canonical patient ids and rule versions. */
  nextSequence(name: string, step?: number): Promise<number>;
  /** Live subscription; returns an unsubscribe function. */
  subscribe<T extends CollectionName>(
    name: T,
    query: QuerySpec,
    actor: Actor | null,
    onChange: (result: ListResult<RowOf<T>>) => void,
    onError: (error: unknown) => void,
  ): () => void;
  /** Binary media storage (Cloudinary in production; IndexedDB on device). */
  putBlob(key: string, blob: Blob): Promise<void>;
  getBlob(key: string): Promise<Blob | null>;
  deleteBlob(key: string): Promise<void>;
  /** Batched writes for multi-document clinical operations. */
  transact<T>(work: (tx: TxHandle) => Promise<T>): Promise<T>;
  /** Device provider only — used by the destructive "reset this device" action. */
  purgeLocalData?(): Promise<void>;
}

export interface AuthAdapter {
  readonly kind: 'firebase' | 'local';
  restore(): Promise<void>;
  getActor(): Promise<Actor | null>;
  signIn(email: string, password: string): Promise<Actor>;
  signOut(): Promise<void>;
  register(input: {
    fullName: string;
    email: string;
    phone: string;
    password: string;
    claims: AuthClaims;
    photoUrl?: string | null;
  }): Promise<{ uid: string }>;
  resetPassword(email: string): Promise<void>;
  confirmReset(code: string, password: string): Promise<void>;
  changePassword(currentPassword: string | null, newPassword: string): Promise<void>;
  updateProfile(patch: { displayName?: string; photoURL?: string | null }): Promise<void>;
  deleteAccount(password?: string): Promise<void>;
  onSessionChange(listener: (actor: Actor | null) => void): () => void;
  /** Re-reads claims so privilege changes take effect without a re-login. */
  refreshClaims(): Promise<Actor | null>;
  verifyRecentLogin?(password: string): Promise<void>;
}
