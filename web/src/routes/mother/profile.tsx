/**
 * Profile — who I am on Mama Care, and the documents I keep here.
 *
 * Two halves. The identity half is ordinary: name, phone, language, emergency
 * contact. The documents half is where the real risk sits, so it is explicit about
 * routing — personal health documents never go to the public image library, they go
 * to a private per-user folder, and deleting one deletes the file too.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, Download, Eye, FileText, Lock, Pencil, ShieldCheck, Stethoscope, Trash2, Upload, UserRound } from 'lucide-react';
import {useAsync} from '@/hooks';
import { useMotherContext } from '@/hooks/use-mother';
import { careLinkRepo, profileRepo, providerRepo, supporterRepo } from '@/services/repositories';
import { deleteDocument, listDocuments, openDocument, uploadDocument, DOCUMENT_CATEGORIES } from '@/services/media/media-service';
import { useConfirm, useSession } from '@/providers/app-providers';
import { logAudit } from '@/services/audit';
import { profileSchema, validate, validateFile, DOCUMENT_ACCEPTED_MIME, MAX_DOCUMENT_BYTES } from '@/lib/validation';
import { COUNTRIES, countryOptions } from '@/config/geo';
import { formatDate, formatBytes } from '@/lib/utils';
import { LANGUAGES, PROFESSION_LABELS, type DocumentRecord, type LanguageCode } from '@/types/domain';
import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { ImageUploader, type ImageUploadResult } from '@/components/media/image-uploader';
import { Button } from '@/components/ui/button';
import { Card, KeyValue, SectionHeading } from '@/components/ui/card';
import { Avatar, Badge, EmptyState, ErrorState, LoadingRows } from '@/components/ui/display';
import { Field, FieldGrid, Select, TextArea, TextInput } from '@/components/ui/form';
import { Modal } from '@/components/ui/overlay';
import { useToast } from '@/components/ui/toast';

export default function ProfilePage() {
  const mother = useMotherContext();
  const { actor, profile } = useSession();
  const toast = useToast();
  const confirm = useConfirm();

  const [editOpen, setEditOpen] = useState(false);
  const [photo, setPhoto] = useState<ImageUploadResult | null>(
    profile?.photoUrl ? { publicId: profile.photoPublicId, secureUrl: profile.photoUrl } : null,
  );
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const { data: documents, loading: docsLoading, error: docsError, run: reloadDocs } = useAsync(() => listDocuments(), {
    deps: [actor?.uid],
    immediate: Boolean(actor),
  });
  const { data: careLinks } = useAsync(() => careLinkRepo.mine(), { deps: [actor?.uid] });
  const { data: supporters } = useAsync(() => supporterRepo.list(actor?.uid ?? ''), { deps: [actor?.uid], immediate: Boolean(actor) });
  const { data: myProvider } = useAsync(() => providerRepo.mine(), { deps: [actor?.uid], immediate: Boolean(actor) });

  /**
   * The verified badge is derived from the provider record an administrator
   * approved — never from a field the account can edit itself.
   */
  const verifiedLabel =
    myProvider?.status === 'approved'
      ? myProvider.profession === 'nurse'
        ? 'Verified nurse'
        : `Verified ${PROFESSION_LABELS[myProvider.profession]}`
      : null;

  const rows = useMemo<DocumentRecord[]>(() => documents ?? [], [documents]);

  useEffect(() => {
    document.title = 'Profile · Mama Care';
  }, []);

  const savePhoto = async (result: ImageUploadResult | null): Promise<void> => {
    setPhoto(result);
    if (!result) {
      await profileRepo.setPhoto(null, null);
      toast.info('Photo removed');
      mother.refresh();
      return;
    }
    setUploadingPhoto(true);
    try {
      await profileRepo.setPhoto(result.secureUrl, result.publicId);
      toast.success('Photo updated');
      mother.refresh();
    } catch {
      toast.error('That did not save');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const openDoc = async (record: DocumentRecord): Promise<void> => {
    try {
      const url = await openDocument(record, { purpose: 'view' });
      await logAudit('record-update', 'document', record.id, `Opened “${record.title}”`);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast.error('That file could not be opened', error instanceof Error ? error.message : undefined);
    }
  };

  const removeDoc = async (record: DocumentRecord): Promise<void> => {
    const ok = await confirm({
      title: `Delete “${record.title}”?`,
      message:
        'The file itself is deleted too, not just the record. If it was uploaded to the media library the deletion is queued and an administrator completes it. This cannot be undone.',
      confirmLabel: 'Delete file',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await deleteDocument(record);
      toast.success('Document deleted');
      void reloadDocs();
    } catch {
      toast.error('That did not delete');
    }
  };

  const activeLinks = (careLinks ?? []).filter((link) => link.status === 'active');
  const activeSupporters = (supporters ?? []).filter((link) => link.status === 'active');

  return (
    <AppShell>
      <PageHeader
        title="My profile"
        description="Your details, who can see your record, and the documents you keep in Mama Care."
        actions={
          <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)} icon={<Pencil className="size-4" aria-hidden />}>
            Edit details
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="space-y-4">
          <Card className="card-pad">
            <div className="flex flex-wrap items-center gap-4">
              <Avatar name={profile?.fullName ?? actor?.displayName ?? 'Mama'} src={profile?.photoUrl} size="lg" />
              <div className="min-w-0">
                <h2 className="card-title">{profile?.fullName ?? actor?.displayName ?? '—'}</h2>
                <p className="mt-0.5 text-sm text-ink-600">{actor?.email}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge tone="brand">{actor?.role === 'MOTHER' ? 'Mother' : actor?.role === 'SUPPORTER' ? 'Supporter' : actor?.role ?? ''}</Badge>
                  {verifiedLabel ? (
                    <Badge tone="green">
                      <BadgeCheck className="size-3" aria-hidden /> {verifiedLabel}
                    </Badge>
                  ) : null}
                  <Badge tone="neutral">{COUNTRIES.find((country) => country.code === (profile?.country ?? 'ZM'))?.name ?? profile?.country}</Badge>
                  {profile?.createdAt ? <Badge tone="neutral">Joined {formatDate(profile.createdAt, 'day')}</Badge> : null}
                </div>
              </div>
            </div>

            <div className="mt-5">
              <ImageUploader
                folder="profiles"
                label="Profile photo"
                value={photo}
                onChange={(result) => void savePhoto(result)}
                disabled={uploadingPhoto}
                ratio="1 / 1"
                hint="Optional. Stored in the public media library with a private-looking address — do not upload a photo you would not want cached."
              />
            </div>

            <div className="mt-5">
            <KeyValue
              columns={1}
              items={[
                { label: 'Phone', value: profile?.phone ?? 'Not provided' },
                { label: 'Date of birth', value: profile?.dateOfBirth ? formatDate(profile.dateOfBirth, 'long') : 'Not provided' },
                { label: 'Language', value: LANGUAGES.find((language) => language.code === profile?.language)?.label ?? 'English' },
                {
                  label: 'Emergency contact',
                  value: profile?.emergencyContact
                    ? `${profile.emergencyContact.name} · ${profile.emergencyContact.relationship} · ${profile.emergencyContact.phone}`
                    : 'Not provided',
                },
                { label: 'Last signed in', value: profile?.lastLoginAt ? formatDate(profile.lastLoginAt, 'long') : '—' },
              ]}
            />
            </div>
          </Card>

          <Card className="card-pad">
            <SectionHeading eyebrow="Access" title="Who can see my record" />
            <div className="mt-3 space-y-3">
              <div>
                <p className="micro">Healthcare providers</p>
                {activeLinks.length === 0 ? (
                  <p className="mt-1 text-sm text-ink-600">Nobody is linked. Your record is visible only to you.</p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {activeLinks.map((link) => (
                      <li key={link.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate text-ink-800">{link.providerName}</span>
                        <span className="shrink-0 text-xs text-ink-500">{link.facilityName}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="micro">Supporters</p>
                {activeSupporters.length === 0 ? (
                  <p className="mt-1 text-sm text-ink-600">No partner or family member has access.</p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {activeSupporters.map((link) => (
                      <li key={link.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate text-ink-800">
                          {link.supporterName} <span className="text-xs text-ink-500">· {link.relationship}</span>
                        </span>
                        <span className="shrink-0 text-xs text-ink-500">
                          {Object.entries(link.permissions)
                            .filter(([, allowed]) => allowed)
                            .map(([key]) => key)
                            .join(', ') || 'nothing shared'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex items-start gap-2 rounded-lg bg-brand-50 px-3 py-2">
                <Lock className="mt-0.5 size-3.5 shrink-0 text-brand-700" aria-hidden />
                <p className="text-xs leading-relaxed text-ink-700">
                  Your journal is excluded from all sharing. No setting gives anyone access to it.
                </p>
              </div>
              <div className="actions-wrap">
                <Link to="/app/pregnancy" className="btn btn-secondary btn-sm">
                  Manage care team
                </Link>
                <Link to="/app/settings" className="btn btn-ghost btn-sm">
                  Manage supporters
                </Link>
              </div>
            </div>
          </Card>

          <Card className="card-pad">
            <SectionHeading eyebrow="Healthcare professional" title="Nurse / provider verification" />
            {myProvider ? (
              <>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">
                  {myProvider.status === 'pending'
                    ? `Your application as ${PROFESSION_LABELS[myProvider.profession]} at ${myProvider.facilityName} is awaiting verification by an administrator.`
                    : myProvider.status === 'approved'
                      ? `You are verified as ${PROFESSION_LABELS[myProvider.profession]} at ${myProvider.facilityName}. Your profile carries the verified badge in the public directory.`
                      : myProvider.status === 'rejected'
                        ? `Your application was not approved${myProvider.rejectionReason ? `: ${myProvider.rejectionReason}` : '.'} You can correct the details and apply again.`
                        : `Your provider access is suspended${myProvider.rejectionReason ? `: ${myProvider.rejectionReason}` : ''}.`}
                </p>
                <div className="mt-3 actions-wrap">
                  <Link to="/become-a-provider" className="btn btn-secondary btn-sm">
                    {myProvider.status === 'pending' ? 'See application status' : 'Manage application'}
                  </Link>
                  {myProvider.status === 'approved' ? (
                    <Link to="/provider" className="btn btn-ghost btn-sm">
                      Open the healthcare portal
                    </Link>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">
                  Are you a nurse, midwife, doctor, or community health worker? Apply for verification to join the
                  healthcare provider portal and be listed in the public directory. An administrator checks your
                  registration before any verified status is granted.
                </p>
                <div className="mt-3 actions-wrap">
                  <Link to="/become-a-provider" className="btn btn-primary btn-sm">
                    <Stethoscope className="size-4" aria-hidden /> Apply to become a verified nurse
                  </Link>
                </div>
              </>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="card-pad">
            <SectionHeading
              eyebrow="Private storage"
              title="My documents"
              description="Scan reports, lab results, prescriptions, birth records and child health cards. Stored privately under your own user folder — never in the public image library."
              actions={
                <Button variant="primary" size="sm" onClick={() => setUploadOpen(true)} icon={<Upload className="size-4" aria-hidden />}>
                  Upload
                </Button>
              }
            />
            {docsError ? <ErrorState className="mt-3" title="Documents could not be loaded" message={docsError} onRetry={reloadDocs} /> : null}
            {docsLoading ? <LoadingRows className="mt-3" rows={3} /> : null}
            {!docsLoading && !docsError && rows.length === 0 ? (
              <EmptyState
                className="mt-3"
                icon={<FileText className="size-6" aria-hidden />}
                title="No documents yet"
                description="Photograph or scan a clinic document and keep it here. Useful when you change facility, or when a paper card goes missing."
                action={
                  <Button variant="primary" size="sm" onClick={() => setUploadOpen(true)}>
                    Upload a document
                  </Button>
                }
              />
            ) : null}
            <ul className="mt-3 divide-y divide-ink-100">
              {rows.map((record) => (
                <li key={record.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink-800">
                      <FileText className="size-4 shrink-0 text-brand-700" aria-hidden />
                      {record.title}
                      <Badge tone="neutral">{DOCUMENT_CATEGORIES.find((category) => category.value === record.category)?.label ?? record.category}</Badge>
                      {record.accessMode === 'private' ? (
                        <Badge tone="green">
                          <Lock className="size-3" aria-hidden /> Private
                        </Badge>
                      ) : (
                        <Badge tone="amber">Public storage</Badge>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {formatBytes(record.bytes)} · {record.mimeType || 'file'} · uploaded {relativeUploaded(record.createdAt)}
                    </p>
                    {record.notes ? <p className="mt-1 text-xs text-ink-600">{record.notes}</p> : null}
                  </div>
                  <div className="actions-wrap">
                    <Button variant="secondary" size="sm" onClick={() => void openDoc(record)} icon={<Eye className="size-4" aria-hidden />}>
                      Open
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void removeDoc(record)} aria-label={`Delete ${record.title}`}>
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 flex items-start gap-2 text-xs text-ink-500">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Only you and an administrator can open these. A provider you have linked cannot see your documents unless you
              share the file yourself.
            </p>
          </Card>

          <Card className="card-pad">
            <SectionHeading eyebrow="Your data" title="Export or delete" />
            <p className="mt-2 text-sm text-ink-600">
              Download everything Mama Care holds about you as a JSON file, or delete your account and all its records.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link to="/app/settings" className="btn btn-secondary btn-sm">
                <Download className="size-4" aria-hidden /> Privacy & data
              </Link>
              <Link to="/privacy" className="btn btn-ghost btn-sm">
                How data is handled
              </Link>
            </div>
          </Card>
        </div>
      </div>

      <EditProfileModal open={editOpen} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); mother.refresh(); }} />

      <UploadDocumentModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => {
          setUploadOpen(false);
          void reloadDocs();
        }}
      />
    </AppShell>
  );
}

const relativeUploaded = (value: string): string => formatDate(value, 'long');

/* ── Edit profile ──────────────────────────────────────────────────────── */

function EditProfileModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { profile } = useSession();
  const toast = useToast();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [country, setCountry] = useState('ZM');
  const [language, setLanguage] = useState<LanguageCode>('en');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [emergencyRelationship, setEmergencyRelationship] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !profile) return;
    setFullName(profile.fullName);
    setPhone(profile.phone ?? '');
    setDateOfBirth(profile.dateOfBirth ?? '');
    setCountry(profile.country);
    setLanguage(profile.language);
    setEmergencyName(profile.emergencyContact?.name ?? '');
    setEmergencyPhone(profile.emergencyContact?.phone ?? '');
    setEmergencyRelationship(profile.emergencyContact?.relationship ?? '');
    setErrors({});
  }, [open, profile]);

  const submit = async (): Promise<void> => {
    const result = validate(profileSchema, {
      fullName,
      phone,
      dateOfBirth,
      country,
      language,
      emergencyName,
      emergencyPhone,
      emergencyRelationship,
    });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setSaving(true);
    const value = result.value;
    try {
      await profileRepo.update({
        fullName: value.fullName,
        phone: value.phone || null,
        dateOfBirth: value.dateOfBirth || null,
        country: value.country,
        language: value.language,
        emergencyContact:
          value.emergencyName && value.emergencyPhone
            ? { name: value.emergencyName, phone: value.emergencyPhone, relationship: value.emergencyRelationship || 'Family' }
            : null,
      });
      toast.success('Profile updated');
      onSaved();
    } catch {
      setErrors({ form: 'That did not save. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit my details"
      description="Your email address cannot be changed here — it is the identity of your account."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={saving}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Full name" htmlFor="profile-name" error={errors.fullName} required>
          <TextInput id="profile-name" value={fullName} onValueChange={setFullName} invalid={Boolean(errors.fullName)} autoComplete="name" />
        </Field>
        <FieldGrid columns={2}>
          <Field label="Phone" htmlFor="profile-phone" error={errors.phone} optional>
            <TextInput id="profile-phone" type="tel" inputMode="tel" value={phone} onValueChange={setPhone} placeholder="+260 97 000 0000" invalid={Boolean(errors.phone)} />
          </Field>
          <Field label="Date of birth" htmlFor="profile-dob" optional>
            <TextInput id="profile-dob" type="date" value={dateOfBirth} onValueChange={setDateOfBirth} max={new Date().toISOString().slice(0, 10)} />
          </Field>
        </FieldGrid>
        <FieldGrid columns={2}>
          <Field label="Country" htmlFor="profile-country" required>
            <Select id="profile-country" value={country} onChange={(event) => setCountry(event.target.value)} options={countryOptions()} />
          </Field>
          <Field label="Language" htmlFor="profile-language" hint="Bemba, Nyanja, Tonga and Lozi are coming; English is available now.">
            <Select
              id="profile-language"
              value={language}
              onChange={(event) => setLanguage(event.target.value as LanguageCode)}
              options={LANGUAGES.map((item) => ({ value: item.code, label: item.available ? item.label : `${item.label} (coming soon)` }))}
            />
          </Field>
        </FieldGrid>

        <div className="border-t border-ink-100 pt-4">
          <h3 className="card-title">Emergency contact</h3>
          <p className="mt-1 text-xs text-ink-600">Someone a facility can call if you cannot be reached. Optional, and stored privately.</p>
          <FieldGrid className="mt-3" columns={3}>
            <Field label="Name" htmlFor="profile-ec-name" optional>
              <TextInput id="profile-ec-name" value={emergencyName} onValueChange={setEmergencyName} />
            </Field>
            <Field label="Relationship" htmlFor="profile-ec-rel" optional>
              <TextInput id="profile-ec-rel" value={emergencyRelationship} onValueChange={setEmergencyRelationship} placeholder="e.g. Husband" />
            </Field>
            <Field label="Phone" htmlFor="profile-ec-phone" error={errors.emergencyPhone} optional>
              <TextInput id="profile-ec-phone" type="tel" inputMode="tel" value={emergencyPhone} onValueChange={setEmergencyPhone} invalid={Boolean(errors.emergencyPhone)} />
            </Field>
          </FieldGrid>
        </div>

        {errors.form ? <p className="alert alert-error">{errors.form}</p> : null}
      </div>
    </Modal>
  );
}

/* ── Document upload ───────────────────────────────────────────────────── */

function UploadDocumentModal({ open, onClose, onUploaded }: { open: boolean; onClose: () => void; onUploaded: () => void }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<DocumentRecord['category']>('scan');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setTitle('');
    setCategory('scan');
    setNotes('');
    setError(null);
  }, [open]);

  const pick = (picked: File | null): void => {
    if (!picked) return;
    const problem = validateFile(picked, { accept: DOCUMENT_ACCEPTED_MIME, maxBytes: MAX_DOCUMENT_BYTES });
    if (problem) {
      setError(problem);
      setFile(null);
      return;
    }
    setError(null);
    setFile(picked);
    if (!title.trim()) setTitle(picked.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 80));
  };

  const submit = async (): Promise<void> => {
    if (!file) {
      setError('Choose a file to upload.');
      return;
    }
    if (title.trim().length < 2) {
      setError('Give the document a name you will recognise later.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await uploadDocument(file, { title: title.trim(), category, notes: notes.trim() || null });
      await logAudit('media-upload', 'document', file.name, `Uploaded “${title.trim()}” (${category})`);
      toast.success('Document uploaded', 'Stored privately under your account.');
      onUploaded();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'That did not upload. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Upload a document"
      description="Health documents are routed to private storage under your user folder. They never go to the public image library."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={saving} disabled={!file}>
            Upload document
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <span className="label">File</span>
          <label className="mt-1 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink-200 px-4 py-6 text-center hover:border-brand-400">
            <Upload className="size-5 text-ink-400" aria-hidden />
            <span className="text-sm font-medium text-ink-700">{file ? file.name : 'Choose a file'}</span>
            <span className="text-xs text-ink-500">
              PDF, PNG, JPEG, WebP, HEIC or plain text · up to {formatBytes(MAX_DOCUMENT_BYTES)}
            </span>
            <input
              type="file"
              className="sr-only"
              accept={DOCUMENT_ACCEPTED_MIME.join(',')}
              onChange={(event) => pick(event.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        <Field label="Name this document" htmlFor="doc-title" required hint="Something you will recognise in a year.">
          <TextInput id="doc-title" value={title} onValueChange={setTitle} placeholder="e.g. Dating scan — 12 weeks" />
        </Field>

        <Field label="What kind is it?" htmlFor="doc-category">
          <Select
            id="doc-category"
            value={category}
            onChange={(event) => setCategory(event.target.value as DocumentRecord['category'])}
            options={DOCUMENT_CATEGORIES.map((item) => ({ value: item.value, label: item.label }))}
          />
        </Field>

        <Field label="Notes (optional)" htmlFor="doc-notes">
          <TextArea id="doc-notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="e.g. Given at Chelstone Clinic, brought to every visit." />
        </Field>

        {error ? <p className="alert alert-error">{error}</p> : null}

        <p className="flex items-start gap-2 text-xs text-ink-500">
          <UserRound className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Only you and an administrator can open this file. Deleting it removes the file itself, not just the record.
        </p>
      </div>
    </Modal>
  );
}
