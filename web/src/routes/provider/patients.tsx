/**
 * Provider patients — caseload list and the individual record.
 *
 * The list is exactly the set of mothers with an active care link to this
 * clinician, plus the requests waiting on them. There is no search across all
 * mothers: a provider cannot browse the user base, and the record screen says
 * plainly which collections are excluded (journal, documents) rather than showing
 * empty panels that imply there is nothing there.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Baby as BabyIcon,
  CalendarDays,
  ClipboardList,
  Lock,
  MessageSquare,
  Plus,
  Stethoscope,
  Syringe,
  Users,
  X,
} from 'lucide-react';
import { useAsync } from '@/hooks';
import {
  appointmentRepo,
  babyRepo,
  careLinkRepo,
  immunizationRepo,
  observationRepo,
  pregnancyRepo,
} from '@/services/repositories';
import { logAudit } from '@/services/audit';
import { useConfirm, useSession } from '@/providers/app-providers';
import { daysBetween, formatDate, formatTime, relativeTime, toIsoDate } from '@/lib/utils';
import { ageFromDob, formatGestationalAge, gestationalAge, trimesterLabel } from '@/lib/obstetrics';
import { observationSchema, parseBloodPressure, validate } from '@/lib/validation';
import {
  APPOINTMENT_KIND_LABELS,
  type Appointment,
  type Baby,
  type CareLink,
  type ImmunizationRecord,
  type Observation,
  type Pregnancy,
  type UserProfile,
} from '@/types/domain';
import { StaffPageHeader, StaffShell } from '@/components/layout/staff-shell';
import { datingLabel } from '@/components/pregnancy/pregnancy-widgets';
import { Button } from '@/components/ui/button';
import { Card, KeyValue, SectionHeading } from '@/components/ui/card';
import { Avatar, Badge, EmptyState, ErrorState, LoadingRows } from '@/components/ui/display';
import { Field, FieldGrid, SearchInput, Select, TextArea, TextInput } from '@/components/ui/form';
import { Modal } from '@/components/ui/overlay';
import { SegmentedControl, Tabs, Timeline } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';

/* ── Caseload list ─────────────────────────────────────────────────────── */

export default function ProviderPatientsPage() {
  const { actor } = useSession();
  const navigate = useNavigate();
  const uid = actor?.uid ?? '';
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'active' | 'requested'>('active');

  const { data: links, loading, error, retryable, run } = useAsync(() => careLinkRepo.forProvider(), {
    deps: [uid],
    immediate: Boolean(uid),
  });

  const rows = useMemo<CareLink[]>(() => links ?? [], [links]);
  const active = rows.filter((link) => link.status === 'active');
  const requested = rows.filter((link) => link.status === 'requested');

  const filtered = (view === 'active' ? active : requested).filter((link) =>
    search.trim()
      ? [link.motherName, link.facilityName, link.note ?? ''].join(' ').toLowerCase().includes(search.trim().toLowerCase())
      : true,
  );

  useEffect(() => {
    document.title = 'My patients · Mama Care';
  }, []);

  const accept = async (link: CareLink): Promise<void> => {
    await careLinkRepo.update(link.id, { status: 'active' });
    await logAudit('record-update', 'care_links', link.id, `Accepted care link with ${link.motherName}`);
    void run();
  };

  const decline = async (link: CareLink): Promise<void> => {
    await careLinkRepo.update(link.id, { status: 'revoked' });
    void run();
  };

  return (
    <StaffShell portal="Healthcare Portal">
      <StaffPageHeader
        title="My patients"
        description="Mothers who have shared their care with you. Requests you have made appear under “Awaiting confirmation” until the mother accepts."
        actions={
          <Button variant="secondary" size="sm" onClick={() => navigate('/provider/appointments')} icon={<CalendarDays className="size-4" aria-hidden />}>
            Appointments
          </Button>
        }
      />

      <Card className="card-pad mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl
            value={view}
            onChange={setView}
            ariaLabel="Patient list"
            options={[
              { value: 'active', label: 'In my care', count: active.length },
              { value: 'requested', label: 'Awaiting confirmation', count: requested.length },
            ]}
          />
          <SearchInput value={search} onValueChange={setSearch} placeholder="Search by name or facility" className="w-full sm:max-w-xs" />
        </div>
      </Card>

      {error ? <ErrorState title="Your caseload could not be loaded" message={error} onRetry={retryable ? run : undefined} /> : null}
      {loading ? <LoadingRows rows={4} /> : null}

      {!loading && !error && filtered.length === 0 ? (
        <EmptyState
          icon={<Users className="size-6" aria-hidden />}
          title={view === 'active' ? 'No patients yet' : 'No pending requests'}
          description={
            view === 'active'
              ? 'A mother links you from her pregnancy tracker — that is the only route in. Ask her to do it at her next visit, and she keeps control of what you can see.'
              : 'Requests you make appear here until the mother accepts or declines them.'
          }
          action={
            view === 'active' ? (
              <Link to="/provider/education" className="btn btn-secondary btn-sm">
                Write education for my patients
              </Link>
            ) : undefined
          }
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {filtered.map((link) => (
          <Card key={link.id} className="card-pad">
            <div className="flex items-start gap-3">
              <Avatar name={link.motherName} size="md" />
              <div className="min-w-0 flex-1">
                <h3 className="card-title">{link.motherName}</h3>
                <p className="mt-0.5 text-xs text-ink-500">
                  Linked {relativeTime(link.createdAt)} · {link.grantedBy === 'mother' ? 'she linked you' : 'you requested access'}
                  {link.facilityName ? ` · ${link.facilityName}` : ''}
                </p>
                {link.note ? <p className="mt-1.5 text-sm text-ink-600">{link.note}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {link.status === 'active' ? (
                    <>
                      <Button variant="primary" size="sm" onClick={() => navigate(`/provider/patients/${link.motherUserId}`)}>
                        Open record
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/provider/messages?to=${link.motherUserId}&name=${encodeURIComponent(link.motherName)}`)}
                        icon={<MessageSquare className="size-4" aria-hidden />}
                      >
                        Message
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="primary" size="sm" onClick={() => void accept(link)}>
                        Mark as accepted
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void decline(link)} icon={<X className="size-4" aria-hidden />}>
                        Withdraw
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <Badge tone={link.status === 'active' ? 'green' : 'amber'}>{link.status}</Badge>
            </div>
          </Card>
        ))}
      </div>

      <Card className="card-pad mt-6 border-ink-200 bg-ink-50">
        <h3 className="card-title">Access rules on this screen</h3>
        <ul className="checklist mt-2 text-sm">
          <li>You see only mothers with an active care link naming you.</li>
          <li>Their private journal and personal documents are excluded — there is no setting that exposes them.</li>
          <li>Opening a record is logged: who, what, when.</li>
          <li>If a mother revokes the link, this list and the record close immediately.</li>
        </ul>
      </Card>
    </StaffShell>
  );
}

/* ── Individual record ─────────────────────────────────────────────────── */

export function PatientDetailPage() {
  const { patientId = '' } = useParams();
  const { actor } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const uid = actor?.uid ?? '';
  const [tab, setTab] = useState('summary');
  const [observationOpen, setObservationOpen] = useState(false);

  const { data: links } = useAsync(() => careLinkRepo.forProvider(), { deps: [uid], immediate: Boolean(uid) });
  const link = (links ?? []).find((candidate) => candidate.motherUserId === patientId) ?? null;
  const hasAccess = link?.status === 'active';

  const { data: profile, loading: profileLoading } = useAsync(
    async () => {
      if (!hasAccess) return null;
      const { profileRepo } = await import('@/services/repositories');
      const all = await profileRepo.list(500);
      return (all.rows ?? []).find((row: UserProfile) => row.uid === patientId) ?? null;
    },
    { deps: [hasAccess, patientId], immediate: hasAccess },
  );

  const { data: pregnancy, loading: pregnancyLoading } = useAsync(
    () => (hasAccess ? pregnancyRepo.current(patientId) : Promise.resolve(null)),
    { deps: [hasAccess, patientId], immediate: hasAccess },
  );
  const { data: appointments } = useAsync(
    () => (hasAccess ? appointmentRepo.list(patientId, { includePast: true }) : Promise.resolve([] as Appointment[])),
    { deps: [hasAccess, patientId], immediate: hasAccess },
  );
  const { data: observations } = useAsync(
    () => (hasAccess ? observationRepo.list(patientId) : Promise.resolve([] as Observation[])),
    { deps: [hasAccess, patientId], immediate: hasAccess },
  );
  const { data: babies } = useAsync(
    () => (hasAccess ? babyRepo.list(patientId) : Promise.resolve([] as Baby[])),
    { deps: [hasAccess, patientId], immediate: hasAccess },
  );

  const ga = useMemo(
    () => (pregnancy ? gestationalAge({ lmpDate: pregnancy.lmpDate, eddDate: pregnancy.eddDate }) : null),
    [pregnancy],
  );

  useEffect(() => {
    if (hasAccess && patientId) void logAudit('record-update', 'users', patientId, 'Opened patient record');
    if (profile) document.title = `${profile.fullName} · Mama Care`;
  }, [hasAccess, patientId, profile]);

  const revoke = async (): Promise<void> => {
    if (!link) return;
    const ok = await confirm({
      title: `End access to ${link.motherName}'s record?`,
      message:
        'The care link is revoked. You will lose access immediately, and she can link you again later if she chooses. Use this when she is no longer in your care.',
      confirmLabel: 'Revoke access',
      tone: 'danger',
    });
    if (!ok) return;
    await careLinkRepo.update(link.id, { status: 'revoked' });
    await logAudit('record-update', 'care_links', link.id, `Revoked access to ${link.motherName}`);
    toast.success('Access ended');
    navigate('/provider/patients');
  };

  if (!hasAccess) {
    return (
      <StaffShell portal="Healthcare Portal">
        <StaffPageHeader title="Patient record" />
        <EmptyState
          icon={<Lock className="size-6" aria-hidden />}
          title="You do not have access to this record"
          description="A provider sees a patient only when that patient has an active care link naming them. If this is your patient, ask her to link you from her tracker — or request access and wait for her to accept."
          action={
            <div className="actions-wrap justify-center">
              <Link to="/provider/patients" className="btn btn-primary btn-sm">
                Back to my patients
              </Link>
            </div>
          }
        />
      </StaffShell>
    );
  }

  if (profileLoading || pregnancyLoading) {
    return (
      <StaffShell portal="Healthcare Portal">
        <StaffPageHeader title="Patient record" />
        <LoadingRows rows={4} />
      </StaffShell>
    );
  }

  const allAppointments = (appointments ?? []).slice().sort((a, b) => b.date.localeCompare(a.date));
  const upcoming = allAppointments.filter((appointment) => appointment.date >= toIsoDate(new Date()) && appointment.status === 'scheduled');
  const allObservations = (observations ?? []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const babyList = babies ?? [];

  return (
    <StaffShell portal="Healthcare Portal">
      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/provider/patients')} icon={<ArrowLeft className="size-4" aria-hidden />}>
          My patients
        </Button>
      </div>

      <StaffPageHeader
        title={profile?.fullName ?? link?.motherName ?? 'Patient'}
        description={
          <>
            {profile?.phone ? `${profile.phone} · ` : ''}
            {profile?.dateOfBirth ? `${ageFromDob(profile.dateOfBirth) ?? '—'} years · ` : ''}
            {ga && ga.valid ? `${formatGestationalAge(ga)} (${trimesterLabel(ga)})` : pregnancy?.status === 'delivered' ? 'Delivered — postnatal' : 'No pregnancy record'}
          </>
        }
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate(`/provider/messages?to=${patientId}&name=${encodeURIComponent(profile?.fullName ?? link?.motherName ?? '')}`)}
              icon={<MessageSquare className="size-4" aria-hidden />}
            >
              Message
            </Button>
            <Button variant="outline-danger" size="sm" onClick={() => void revoke()}>
              End access
            </Button>
          </>
        }
      />

      <Card className="card-pad mb-4">
        <div className="flex flex-wrap items-start gap-4">
          <Avatar name={profile?.fullName ?? link?.motherName ?? 'Patient'} src={profile?.photoUrl} size="lg" />
          <div className="min-w-0 flex-1">
            <KeyValue
              columns={3}
              items={[
                { label: 'Email', value: profile?.email ?? '—' },
                { label: 'Phone', value: profile?.phone ?? 'Not provided' },
                { label: 'Country', value: profile?.country ?? '—' },
                { label: 'Language', value: profile?.language ?? 'en' },
                {
                  label: 'Emergency contact',
                  value: profile?.emergencyContact
                    ? `${profile.emergencyContact.name} · ${profile.emergencyContact.relationship} · ${profile.emergencyContact.phone}`
                    : 'Not provided',
                },
                { label: 'Care linked', value: link ? formatDate(link.createdAt, 'long') : '—' },
              ]}
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-ink-50 px-3 py-2">
          <Lock className="size-3.5 shrink-0 text-ink-500" aria-hidden />
          <p className="text-xs text-ink-600">
            Excluded from your view: her private journal, personal documents and messages with other providers. Opening this
            record was logged.
          </p>
        </div>
      </Card>

      <Tabs
        value={tab}
        onChange={setTab}
        ariaLabel="Patient record sections"
        items={[
          { id: 'summary', label: 'Summary' },
          { id: 'appointments', label: 'Appointments', count: allAppointments.length },
          { id: 'observations', label: 'Observations', count: allObservations.length },
          { id: 'babies', label: 'Babies & immunization', count: babyList.length },
        ]}
      />

      {tab === 'summary' ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card className="card-pad">
            <SectionHeading eyebrow="Obstetric" title="Pregnancy" />
            {!pregnancy ? (
              <p className="mt-2 text-sm text-ink-600">No pregnancy record. She may not have entered her dates yet.</p>
            ) : (
              <>
                <KeyValue
                  columns={2}
                  items={[
                    { label: 'Status', value: pregnancy.status, tone: 'strong' },
                    { label: 'Gestational age', value: ga && ga.valid ? formatGestationalAge(ga) : 'Dates needed', tone: 'strong' },
                    { label: 'Trimester', value: ga && ga.valid ? trimesterLabel(ga) : '—' },
                    { label: 'Estimated due date', value: pregnancy.eddDate ? formatDate(pregnancy.eddDate, 'long') : '—' },
                    { label: 'Last menstrual period', value: pregnancy.lmpDate ? formatDate(pregnancy.lmpDate, 'long') : '—' },
                    { label: 'Dating method', value: datingLabel(pregnancy.datingMethod) },
                    { label: 'Gravida / para', value: `${pregnancy.previousPregnancies} / ${pregnancy.previousLiveBirths}` },
                    { label: 'Delivered', value: pregnancy.deliveryDate ? formatDate(pregnancy.deliveryDate, 'long') : '—' },
                  ]}
                />
                {pregnancy.notes ? <p className="mt-3 text-sm text-ink-600">{pregnancy.notes}</p> : null}
                {ga && ga.valid && ga.weeks >= 40 ? (
                  <p className="alert alert-warn mt-3 flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    At or past the estimated due date. Confirm her plan for labour and whether induction assessment is needed.
                  </p>
                ) : null}
              </>
            )}
          </Card>

          <div className="space-y-4">
            <Card className="card-pad">
              <SectionHeading eyebrow="Next" title="Upcoming appointments" />
              {upcoming.length === 0 ? (
                <p className="mt-2 text-sm text-ink-600">Nothing booked.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {upcoming.slice(0, 4).map((appointment) => (
                    <li key={appointment.id} className="flex items-center justify-between gap-3 rounded-lg border border-ink-200 px-3 py-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink-800">{APPOINTMENT_KIND_LABELS[appointment.kind]}</span>
                        <span className="block truncate text-xs text-ink-500">
                          {formatDate(appointment.date, 'long')}
                          {appointment.time ? ` at ${formatTime(appointment.time)}` : ''} · {appointment.facilityName}
                        </span>
                      </span>
                      <Badge tone="neutral">{daysBetween(new Date(), new Date(appointment.date))} d</Badge>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3">
                <Link to="/provider/appointments" className="btn btn-secondary btn-sm">
                  Manage appointments
                </Link>
              </div>
            </Card>

            <Card className="card-pad">
              <SectionHeading eyebrow="Recent" title="Latest observations" />
              {allObservations.length === 0 ? (
                <p className="mt-2 text-sm text-ink-600">Nothing recorded.</p>
              ) : (
                <ul className="mt-2 divide-y divide-ink-100">
                  {allObservations.slice(0, 5).map((observation) => (
                    <li key={observation.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-ink-800">
                          {observation.label}
                          {observation.value ? <span className="ml-2 tnum font-semibold">{observation.value}{observation.unit ? ` ${observation.unit}` : ''}</span> : null}
                        </span>
                        <span className="block text-xs text-ink-500">
                          {formatDate(observation.createdAt, 'day')} · {observation.recordedBy === 'provider' ? 'provider' : 'self-recorded'}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3">
                <Button variant="primary" size="sm" onClick={() => setObservationOpen(true)} icon={<Plus className="size-4" aria-hidden />}>
                  Record an observation
                </Button>
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === 'appointments' ? (
        <Card className="card-pad mt-4">
          <SectionHeading eyebrow="History" title="All appointments" />
          {allAppointments.length === 0 ? (
            <EmptyState className="mt-3" icon={<ClipboardList className="size-6" aria-hidden />} title="No appointments recorded" description="Appointments she adds appear here once your care link is active." />
          ) : (
            <div className="mt-4">
              <Timeline
                items={allAppointments.map((appointment) => ({
                  title: (
                    <span className="flex flex-wrap items-center gap-2">
                      {APPOINTMENT_KIND_LABELS[appointment.kind]}
                      <Badge tone={appointment.status === 'completed' ? 'green' : appointment.status === 'missed' ? 'red' : 'brand'}>{appointment.status}</Badge>
                    </span>
                  ),
                  meta: `${formatDate(appointment.date, 'long')}${appointment.time ? ` at ${formatTime(appointment.time)}` : ''} · ${appointment.facilityName}`,
                  detail: [appointment.purpose, appointment.clinicianNotes, appointment.testResults ? `Tests: ${appointment.testResults}` : null]
                    .filter(Boolean)
                    .join(' — '),
                  tone: appointment.status === 'completed' ? 'green' : appointment.status === 'missed' ? 'red' : 'brand',
                }))}
              />
            </div>
          )}
        </Card>
      ) : null}

      {tab === 'observations' ? (
        <Card className="card-pad mt-4">
          <SectionHeading
            eyebrow="Measurements & symptoms"
            title="Observations"
            description="Recorded by her at home or by a clinician at a visit. Stored exactly as entered — Mama Care does not interpret readings."
            actions={
              <Button variant="primary" size="sm" onClick={() => setObservationOpen(true)} icon={<Activity className="size-4" aria-hidden />}>
                Record an observation
              </Button>
            }
          />
          {allObservations.length === 0 ? (
            <EmptyState className="mt-3" icon={<Activity className="size-6" aria-hidden />} title="Nothing recorded" description="Add weight, blood pressure, fundal height or a symptom she reported at this visit." />
          ) : (
            <ul className="mt-3 divide-y divide-ink-100">
              {allObservations.map((observation) => {
                const bp = parseBloodPressure(observation.value);
                return (
                  <li key={observation.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink-800">
                        {observation.label}
                        {observation.value ? (
                          <span className="ml-2 tnum font-semibold text-ink-900">
                            {observation.value}
                            {observation.unit ? <span className="ml-0.5 text-xs font-normal text-ink-500">{observation.unit}</span> : null}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {formatDate(observation.createdAt, 'long')} · {relativeTime(observation.createdAt)} ·{' '}
                        {observation.recordedBy === 'provider' ? 'recorded by a provider' : 'self-recorded'}
                        {observation.weekNumber ? ` · week ${observation.weekNumber}` : ''}
                        {bp ? ` · ${bp.systolic}/${bp.diastolic}` : ''}
                      </p>
                      {observation.notes ? <p className="mt-1 text-xs text-ink-600">{observation.notes}</p> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      ) : null}

      {tab === 'babies' ? (
        <div className="mt-4 space-y-4">
          {babyList.length === 0 ? (
            <Card className="card-pad">
              <EmptyState icon={<BabyIcon className="size-6" aria-hidden />} title="No baby record" description="If she has delivered, she adds the baby from her own app and the immunization schedule is generated from the date of birth." />
            </Card>
          ) : (
            babyList.map((baby) => (
              <BabyImmunizationCard key={baby.id} baby={baby} />
            ))
          )}
        </div>
      ) : null}

      <ProviderObservationModal
        open={observationOpen}
        patientId={patientId}
        pregnancyId={pregnancy?.id ?? null}
        weekNumber={ga && ga.valid ? ga.weeks : null}
        onClose={() => setObservationOpen(false)}
        onSaved={() => {
          setObservationOpen(false);
          toast.success('Observation recorded', 'It is visible to the patient and to you.');
          navigate(`/provider/patients/${patientId}`, { replace: true });
        }}
      />
    </StaffShell>
  );
}

function BabyImmunizationCard({ baby }: { baby: Baby }) {
  const { data: doses, loading } = useAsync(() => immunizationRepo.list(baby.id), { deps: [baby.id] });
  const records = useMemo<ImmunizationRecord[]>(() => doses ?? [], [doses]);
  const given = records.filter((dose) => dose.status === 'given');
  const overdue = records.filter((dose) => dose.status === 'upcoming' && dose.scheduledDate < toIsoDate(new Date()));

  return (
    <Card className="card-pad">
      <SectionHeading
        eyebrow={formatDate(baby.dateOfBirth, 'long')}
        title={baby.name}
        description={`${given.length} of ${records.length} scheduled doses given${overdue.length > 0 ? ` · ${overdue.length} overdue` : ''}`}
      />
      {loading ? <LoadingRows className="mt-3" rows={3} /> : null}
      {!loading && records.length === 0 ? (
        <p className="mt-2 text-sm text-ink-600">No immunization schedule generated yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="table-base">
            <caption className="caption">Immunization record for {baby.name}</caption>
            <thead>
              <tr>
                <th className="table-th">Vaccine</th>
                <th className="table-th">Dose</th>
                <th className="table-th">Scheduled</th>
                <th className="table-th">Given</th>
                <th className="table-th">Status</th>
              </tr>
            </thead>
            <tbody>
              {records.map((dose) => (
                <tr key={dose.id} className="table-row">
                  <td className="table-td font-medium text-ink-800">{dose.vaccineName}</td>
                  <td className="table-td">{dose.dose}</td>
                  <td className="table-td">
                    {formatDate(dose.scheduledDate, 'day')}
                    <span className="block text-xs text-ink-500">{dose.scheduledAgeLabel}</span>
                  </td>
                  <td className="table-td">{dose.givenDate ? formatDate(dose.givenDate, 'day') : '—'}</td>
                  <td className="table-td">
                    <Badge
                      tone={
                        dose.status === 'given' ? 'green' : dose.status === 'upcoming' && dose.scheduledDate < toIsoDate(new Date()) ? 'red' : 'neutral'
                      }
                    >
                      {dose.status === 'upcoming' && dose.scheduledDate < toIsoDate(new Date()) ? 'overdue' : dose.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 flex items-start gap-2 text-xs text-ink-500">
        <Syringe className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Only the mother marks a dose as given, from her own app. This view is read-only so the record stays hers.
      </p>
    </Card>
  );
}

function ProviderObservationModal({
  open,
  patientId,
  pregnancyId,
  weekNumber,
  onClose,
  onSaved,
}: {
  open: boolean;
  patientId: string;
  pregnancyId: string | null;
  weekNumber: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<Observation['kind']>('blood-pressure');
  const [label, setLabel] = useState('Blood pressure');
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('mmHg');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const choose = (next: Observation['kind']): void => {
    setKind(next);
    const defaults: Record<string, { label: string; unit: string }> = {
      'blood-pressure': { label: 'Blood pressure', unit: 'mmHg' },
      weight: { label: 'Weight', unit: 'kg' },
      height: { label: 'Height', unit: 'cm' },
      hb: { label: 'Haemoglobin', unit: 'g/dL' },
      glucose: { label: 'Blood glucose', unit: 'mmol/L' },
      'fundal-height': { label: 'Fundal height', unit: 'cm' },
      symptom: { label: 'Symptom reported', unit: '' },
      other: { label: 'Clinical note', unit: '' },
    };
    const chosen = defaults[next] ?? { label: 'Observation', unit: '' };
    setLabel(chosen.label);
    setUnit(chosen.unit);
  };

  useEffect(() => {
    if (!open) return;
    setValue('');
    setNotes('');
    setErrors({});
  }, [open]);

  const submit = async (): Promise<void> => {
    const result = validate(observationSchema, {
      kind,
      label,
      value,
      unit,
      notes,
      recordedBy: 'provider',
      appointmentId: '',
    });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const parsed = kind === 'blood-pressure' ? parseBloodPressure(result.value.value) : null;
      await observationRepo.create({
        userId: patientId,
        pregnancyId,
        kind: result.value.kind,
        label: result.value.label,
        value: result.value.value,
        systolic: parsed?.systolic ?? null,
        diastolic: parsed?.diastolic ?? null,
        unit: result.value.unit || null,
        weekNumber,
        recordedBy: 'provider',
        appointmentId: null,
        notes: result.value.notes || null,
      } as Omit<Observation, 'id' | 'createdAt' | 'updatedAt'>);
      await logAudit('record-create', 'observations', patientId, `${result.value.label} recorded by provider`);
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
      title="Record an observation"
      description="Stored as entered, attributed to you, and visible to the patient. Mama Care does not interpret readings or flag values."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void submit()} loading={saving}>Save observation</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="What did you measure or note?" htmlFor="po-kind">
          <Select
            id="po-kind"
            value={kind}
            onChange={(event) => choose(event.target.value as Observation['kind'])}
            options={[
              { value: 'blood-pressure', label: 'Blood pressure' },
              { value: 'weight', label: 'Weight' },
              { value: 'fundal-height', label: 'Fundal height' },
              { value: 'hb', label: 'Haemoglobin' },
              { value: 'glucose', label: 'Blood glucose' },
              { value: 'height', label: 'Height' },
              { value: 'symptom', label: 'Symptom reported' },
              { value: 'other', label: 'Clinical note' },
            ]}
          />
        </Field>
        <FieldGrid columns={2}>
          <Field label="Label" htmlFor="po-label" error={errors.label} required>
            <TextInput id="po-label" value={label} onValueChange={setLabel} invalid={Boolean(errors.label)} />
          </Field>
          <Field label="Unit" htmlFor="po-unit" optional>
            <TextInput id="po-unit" value={unit} onValueChange={setUnit} placeholder="e.g. mmHg" />
          </Field>
        </FieldGrid>
        <Field
          label="Reading or note"
          htmlFor="po-value"
          error={errors.value}
          required
          hint={kind === 'blood-pressure' ? 'For example 118/76 — stored exactly as written.' : undefined}
        >
          <TextInput id="po-value" value={value} onValueChange={setValue} invalid={Boolean(errors.value)} />
        </Field>
        <Field label="Clinical note (optional)" htmlFor="po-notes">
          <TextArea id="po-notes" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Context, advice given, or what to watch for." />
        </Field>
        {errors.form ? <p className="alert alert-error">{errors.form}</p> : null}
        <p className="flex items-start gap-2 text-xs text-ink-500">
          <Stethoscope className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          This is not a prescription. Medicine changes belong in her clinic record and on her paper card.
        </p>
      </div>
    </Modal>
  );
}
