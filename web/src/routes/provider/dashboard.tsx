/**
 * Provider dashboard.
 *
 * A clinician opens this between consultations, so it answers three questions
 * immediately: who do I see today, who needs chasing, and what is waiting for a
 * reply. Everything shown comes through care links — a patient who has not shared
 * their care is not on this screen at all, and no query here can reach them.
 */

import { useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  MessageSquare,
  Stethoscope,
  UserPlus,
  Users,
} from 'lucide-react';
import { useAsync } from '@/hooks';
import { appointmentRepo, careLinkRepo, messageRepo, pregnancyRepo, providerRepo } from '@/services/repositories';
import { useSession } from '@/providers/app-providers';
import { daysBetween, formatDate, formatTime, isSameDay, relativeTime, toIsoDate } from '@/lib/utils';
import { formatGestationalAge, gestationalAge } from '@/lib/obstetrics';
import { APPOINTMENT_KIND_LABELS, PROFESSION_LABELS, type Appointment, type Pregnancy, type UserProfile } from '@/types/domain';
import { StaffPageHeader, StaffShell } from '@/components/layout/staff-shell';
import { Button } from '@/components/ui/button';
import { Card, SectionHeading, StatCard } from '@/components/ui/card';
import { Avatar, Badge, EmptyState, ErrorState, LoadingRows } from '@/components/ui/display';
import { Timeline } from '@/components/ui/tabs';

interface PatientRow {
  profile: UserProfile;
  pregnancy: Pregnancy | null;
  weeks: number | null;
  gaLabel: string | null;
  lastAppointment: Appointment | null;
  nextAppointment: Appointment | null;
}

export default function ProviderDashboard() {
  const { actor } = useSession();
  const navigate = useNavigate();
  const uid = actor?.uid ?? '';

  const { data: patients, loading, error, retryable, run } = useAsync(() => careLinkRepo.myPatients(), {
    deps: [uid],
    immediate: Boolean(uid),
  });
  const { data: appointments } = useAsync(() => appointmentRepo.forProvider(), { deps: [uid], immediate: Boolean(uid) });
  const { data: threads } = useAsync(() => (uid ? messageRepo.threads(uid) : Promise.resolve([])), { deps: [uid], immediate: Boolean(uid) });
  const { data: provider } = useAsync(() => providerRepo.mine(), { deps: [uid], immediate: Boolean(uid) });

  /* Pregnancy records are fetched per patient: policy checks each read, so a link
   * that has been revoked stops returning data immediately. */
  const { data: pregnancies } = useAsync(async () => {
    const rows = (patients ?? []) as UserProfile[];
    const entries = await Promise.all(
      rows.map(async (profile) => [profile.uid, await pregnancyRepo.current(profile.uid).catch(() => null)] as const),
    );
    return new Map(entries);
  }, { deps: [patients], immediate: Boolean(patients?.length) });

  const allAppointments = useMemo<Appointment[]>(() => appointments ?? [], [appointments]);

  const rows = useMemo<PatientRow[]>(() => {
    const list = (patients ?? []) as UserProfile[];
    return list
      .map((profile) => {
        const pregnancy = pregnancies?.get(profile.uid) ?? null;
        const ga = pregnancy ? gestationalAge({ lmpDate: pregnancy.lmpDate, eddDate: pregnancy.eddDate }) : null;
        const mine = allAppointments.filter((appointment) => appointment.userId === profile.uid);
        const past = mine.filter((appointment) => appointment.date < toIsoDate(new Date()));
        const future = mine.filter((appointment) => appointment.date >= toIsoDate(new Date()));
        return {
          profile,
          pregnancy,
          weeks: ga && ga.valid ? ga.weeks : null,
          gaLabel: ga && ga.valid ? formatGestationalAge(ga) : null,
          lastAppointment: past.sort((a, b) => b.date.localeCompare(a.date))[0] ?? null,
          nextAppointment: future.sort((a, b) => a.date.localeCompare(b.date))[0] ?? null,
        };
      })
      .sort((a, b) => (b.weeks ?? 0) - (a.weeks ?? 0));
  }, [patients, pregnancies, allAppointments]);

  const today = toIsoDate(new Date());
  const todaysAppointments = allAppointments
    .filter((appointment) => isSameDay(appointment.date, new Date()))
    .sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99'));
  const weekAppointments = allAppointments.filter((appointment) => {
    const diff = daysBetween(new Date(), new Date(appointment.date));
    return diff >= 0 && diff <= 7;
  });
  const unread = (threads ?? []).reduce((count, thread) => count + thread.unread, 0);

  const needsAttention = useMemo(
    () =>
      rows.filter((row) => {
        if (!row.pregnancy || row.pregnancy.status !== 'active') return false;
        if ((row.weeks ?? 0) >= 40) return true;
        if (!row.nextAppointment && (row.weeks ?? 0) >= 28) return true;
        if (row.lastAppointment && daysBetween(new Date(row.lastAppointment.date), new Date()) > 45) return true;
        return false;
      }),
    [rows],
  );

  useEffect(() => {
    document.title = 'Provider dashboard · Mama Care';
  }, []);

  const nameFor = (row: PatientRow) => row.profile.fullName;

  return (
    <StaffShell portal="Healthcare Portal">
      <StaffPageHeader
        title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${actor?.displayName?.split(' ')[0] ?? 'Doctor'}`}
        description={
          provider
            ? `${provider.title ? `${provider.title} · ` : ''}${PROFESSION_LABELS[provider.profession]} · ${provider.facilityName}`
            : 'Patients who have shared their care with you appear here. Nobody else does.'
        }
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => navigate('/provider/messages')} icon={<MessageSquare className="size-4" aria-hidden />}>
              Messages{unread > 0 ? ` (${unread})` : ''}
            </Button>
            <Button variant="primary" size="sm" onClick={() => navigate('/provider/patients')} icon={<Users className="size-4" aria-hidden />}>
              My patients
            </Button>
          </>
        }
      />

      {provider && provider.status !== 'approved' ? (
        <Card className="card-pad mb-4 border-[var(--color-risk-amber-border)] bg-[var(--color-risk-amber-soft)]">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="amber">Awaiting verification</Badge>
            <p className="text-sm text-ink-700">
              Your licence is still being checked by an administrator. You can view patients who have linked their care to
              you, but your profile is not in the public directory yet.
            </p>
          </div>
        </Card>
      ) : null}

      {error ? <ErrorState title="Your patient list could not be loaded" message={error} onRetry={retryable ? run : undefined} /> : null}
      {loading ? <LoadingRows rows={4} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Patients in my care" value={rows.length} icon={<Users className="size-4" aria-hidden />} onClick={() => navigate('/provider/patients')} />
        <StatCard label="Today's appointments" value={todaysAppointments.length} icon={<CalendarDays className="size-4" aria-hidden />} tone={todaysAppointments.length > 0 ? 'brand' : 'default'} onClick={() => navigate('/provider/appointments')} />
        <StatCard label="Next 7 days" value={weekAppointments.length} icon={<Clock className="size-4" aria-hidden />} onClick={() => navigate('/provider/appointments')} />
        <StatCard
          label="Needs attention"
          value={needsAttention.length}
          icon={<AlertTriangle className="size-4" aria-hidden />}
          tone={needsAttention.length > 0 ? 'amber' : 'green'}
          onClick={() => navigate('/provider/patients')}
        />
      </div>

      {!loading && rows.length === 0 ? (
        <Card className="card-pad mt-6">
          <EmptyState
            icon={<Stethoscope className="size-6" aria-hidden />}
            title="No patients have shared their care with you yet"
            description="A mother links you from her tracker, or you can request access from the patient screen and she confirms it. Until a link is active you cannot see any record — that is the whole point of the system."
            action={
              <div className="actions-wrap justify-center">
                <Link to="/provider/patients" className="btn btn-primary btn-sm">
                  Request access to a patient
                </Link>
                <Link to="/providers" className="btn btn-secondary btn-sm">
                  See the public directory
                </Link>
              </div>
            }
          />
        </Card>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="card-pad">
            <SectionHeading
              eyebrow={formatDate(new Date(), 'long')}
              title="Today's schedule"
              actions={
                <Link to="/provider/appointments" className="btn btn-secondary btn-sm">
                  All appointments
                </Link>
              }
            />
            {todaysAppointments.length === 0 ? (
              <p className="mt-2 text-sm text-ink-600">Nothing is booked with you today.</p>
            ) : (
              <ul className="mt-3 divide-y divide-ink-100">
                {todaysAppointments.map((appointment) => {
                  const patient = rows.find((row) => row.profile.uid === appointment.userId);
                  return (
                    <li key={appointment.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="w-14 shrink-0 text-sm font-semibold text-ink-800 tnum">
                          {appointment.time ? formatTime(appointment.time) : '—'}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-ink-800">
                            {patient ? nameFor(patient) : appointment.userId}
                          </span>
                          <span className="block truncate text-xs text-ink-500">
                            {APPOINTMENT_KIND_LABELS[appointment.kind]} · {appointment.purpose}
                            {patient?.gaLabel ? ` · ${patient.gaLabel}` : ''}
                          </span>
                        </span>
                      </div>
                      <div className="actions-wrap">
                        <Badge tone={appointment.status === 'completed' ? 'green' : appointment.status === 'missed' ? 'red' : 'neutral'}>
                          {appointment.status}
                        </Badge>
                        {patient ? (
                          <Button variant="ghost" size="sm" onClick={() => navigate(`/provider/patients/${patient.profile.uid}`)}>
                            Open record
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card className="card-pad">
            <SectionHeading eyebrow="Clinical" title="Needs attention" description="Post-dates pregnancies, third-trimester patients with nothing booked, and anyone not seen in over six weeks." />
            {needsAttention.length === 0 ? (
              <p className="mt-2 flex items-center gap-2 text-sm text-ink-600">
                <CheckCircle2 className="size-4 text-[var(--color-risk-green)]" aria-hidden />
                Everyone in your care has a plan. Nothing is overdue.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {needsAttention.map((row) => (
                  <li key={row.profile.uid} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--color-risk-amber-border)] bg-[var(--color-risk-amber-soft)] px-3 py-2">
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-800">
                        {nameFor(row)}
                        {row.gaLabel ? <Badge tone={ (row.weeks ?? 0) >= 40 ? 'red' : 'amber'}>{row.gaLabel}</Badge> : null}
                      </span>
                      <span className="mt-0.5 block text-xs text-ink-600">
                        {(row.weeks ?? 0) >= 40
                          ? 'At or past the estimated due date — confirm she has a plan for labour.'
                          : row.nextAppointment
                            ? `Last seen ${row.lastAppointment ? relativeTime(row.lastAppointment.date) : '—'}.`
                            : 'No appointment booked in the third trimester.'}
                      </span>
                    </span>
                    <div className="actions-wrap">
                      <Button variant="secondary" size="sm" onClick={() => navigate(`/provider/patients/${row.profile.uid}`)}>
                        Open
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => navigate(`/provider/messages?to=${row.profile.uid}&name=${encodeURIComponent(row.profile.fullName)}`)}>
                        Message
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="card-pad">
            <SectionHeading
              eyebrow="My caseload"
              title="Patients by stage"
              actions={
                <Link to="/provider/patients" className="btn btn-ghost btn-sm">
                  View all
                </Link>
              }
            />
            {rows.length === 0 ? (
              <p className="mt-2 text-sm text-ink-600">No linked patients.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {rows.slice(0, 6).map((row) => (
                  <li key={row.profile.uid}>
                    <Link
                      to={`/provider/patients/${row.profile.uid}`}
                      className="flex items-center gap-3 rounded-lg border border-ink-200 px-3 py-2 hover:border-brand-300"
                    >
                      <Avatar name={row.profile.fullName} src={row.profile.photoUrl} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink-800">{nameFor(row)}</span>
                        <span className="block truncate text-xs text-ink-500">
                          {row.gaLabel ?? (row.pregnancy?.status === 'delivered' ? 'Delivered — postnatal' : 'No pregnancy record')}
                          {row.nextAppointment ? ` · next ${formatDate(row.nextAppointment.date, 'day')}` : ''}
                        </span>
                      </span>
                      {row.pregnancy?.status === 'delivered' ? <Badge tone="green">Postnatal</Badge> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="card-pad">
            <SectionHeading eyebrow="Inbox" title="Messages" />
            {unread === 0 ? (
              <p className="mt-2 text-sm text-ink-600">Nothing unread. Threads are not monitored in real time — an emergency never comes through here.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {(threads ?? [])
                  .filter((thread) => thread.unread > 0)
                  .slice(0, 4)
                  .map((thread) => (
                    <li key={thread.peerId}>
                      <Link to={`/provider/messages?to=${thread.peerId}&name=${encodeURIComponent(thread.peerName)}`} className="block rounded-lg border border-ink-200 px-3 py-2 hover:border-brand-300">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-ink-800">{thread.peerName}</span>
                          <Badge tone="red">{thread.unread}</Badge>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-ink-500">{thread.last.body}</span>
                      </Link>
                    </li>
                  ))}
              </ul>
            )}
            <div className="mt-3">
              <Link to="/provider/messages" className="btn btn-secondary btn-sm">
                Open messages
              </Link>
            </div>
          </Card>

          <Card className="card-pad">
            <SectionHeading eyebrow="Quick actions" title="Common tasks" />
            <div className="mt-3 grid gap-2">
              {[
                { to: '/provider/patients', label: 'Find or request a patient', icon: <UserPlus className="size-4" aria-hidden /> },
                { to: '/provider/appointments', label: 'Add or complete an appointment', icon: <CalendarDays className="size-4" aria-hidden /> },
                { to: '/provider/education', label: 'Write education for my patients', icon: <FileText className="size-4" aria-hidden /> },
                { to: '/provider/reports', label: 'Cohort summary & export', icon: <Users className="size-4" aria-hidden /> },
              ].map((item) => (
                <Link key={item.to} to={item.to} className="flex items-center gap-2 rounded-lg border border-ink-200 px-3 py-2.5 text-sm font-medium text-ink-700 hover:border-brand-300">
                  <span className="text-brand-700">{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </div>
          </Card>

          <Card className="card-pad border-ink-200 bg-ink-50">
            <h3 className="card-title">What you can and cannot see</h3>
            <ul className="checklist mt-2 text-sm">
              <li>Only patients with an active care link to you.</li>
              <li>Never a patient's private journal — that is excluded by design.</li>
              <li>Every access to a record is written to the audit log.</li>
              <li>A patient can revoke your access at any time, and it stops immediately.</li>
            </ul>
          </Card>
        </div>
      </div>

      {rows.length > 0 ? (
        <Card className="card-pad mt-6">
          <SectionHeading eyebrow="Recent activity" title="Latest appointments across your caseload" />
          <div className="mt-4">
            <Timeline
              items={allAppointments
                .slice()
                .sort((a, b) => b.date.localeCompare(a.date))
                .slice(0, 8)
                .map((appointment) => {
                  const patient = rows.find((row) => row.profile.uid === appointment.userId);
                  return {
                    title: `${patient ? nameFor(patient) : 'Patient'} · ${APPOINTMENT_KIND_LABELS[appointment.kind]}`,
                    meta: `${formatDate(appointment.date, 'long')} · ${appointment.facilityName} · ${appointment.status}`,
                    detail: appointment.clinicianNotes ?? appointment.purpose,
                    tone: appointment.status === 'completed' ? 'green' : appointment.status === 'missed' ? 'red' : 'brand',
                  };
                })}
            />
          </div>
        </Card>
      ) : null}
    </StaffShell>
  );
}
