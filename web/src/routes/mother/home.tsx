/**
 * Mother home — the screen that answers "what do I need to know today?"
 *
 * Order matters here: the thing that could hurt someone comes first, then today's
 * tasks, then the journey, then everything else. Nothing on this screen requires
 * scrolling to find an emergency route.
 */

import { useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Baby,
  BookOpen,
  CalendarDays,
  ChevronRight,
  MapPin,
  MessageCircle,
  NotebookPen,
  Pill,
  Plus,
  Syringe,
} from 'lucide-react';
import { useAsync } from '@/hooks';
import { useMotherContext, firstName, greeting, type MotherContext } from '@/hooks/use-mother';
import { immunizationRepo, reminderRepo } from '@/services/repositories';
import { weekGuide } from '@/config/weekly-guide';
import { formatBabyAge, ageInMonths } from '@/config/baby-development';
import { formatDate, relativeTime } from '@/lib/utils';
import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { DueDateCard, NextAppointmentStrip, TrimesterTrack, WeekRing } from '@/components/pregnancy/pregnancy-widgets';
import { EmergencyButton } from '@/components/emergency/emergency-panel';
import { Button } from '@/components/ui/button';
import { Card, SectionHeading } from '@/components/ui/card';
import { Badge, EmptyState, LoadingRows } from '@/components/ui/display';
import { useToast } from '@/components/ui/toast';

export default function MotherHome() {
  const mother = useMotherContext();
  const navigate = useNavigate();
  const toast = useToast();
  const { activeBaby } = mother;

  const { data: nextVaccine } = useAsync(
    () => (activeBaby ? immunizationRepo.nextDue(activeBaby.id) : Promise.resolve(null)),
    { deps: [activeBaby?.id], immediate: Boolean(activeBaby) },
  );

  const guide = useMemo(() => (mother.ga ? weekGuide(mother.ga.weeks) : null), [mother.ga]);

  useEffect(() => {
    document.title = mother.mode === 'setup' ? 'Set up your journey · Mama Care' : 'Home · Mama Care';
  }, [mother.mode]);

  const markTaken = async (id: string, title: string): Promise<void> => {
    try {
      await reminderRepo.markTaken(id);
      toast.success('Recorded', `${title} marked as taken.`);
      mother.refresh();
    } catch {
      toast.error('That did not save', 'Check your connection and try again.');
    }
  };

  return (
    <AppShell>
      <PageHeader
        title={`${greeting()}, ${firstName(mother.profile?.fullName ?? 'Mama')}`}
        description={
          mother.mode === 'setup'
            ? 'Add your pregnancy dates or your baby’s details and this page will fill in around them.'
            : mother.mode === 'postnatal'
              ? 'You are in Mother & Baby mode. Your pregnancy record is kept, and the baby screens are now front and centre.'
              : `Today is ${formatDate(new Date(), 'long')}.`
        }
        actions={<EmergencyButton onClick={() => navigate('/app/emergency')} />}
      />

      {mother.loading ? <LoadingRows rows={4} /> : null}
      {mother.error ? <p className="alert alert-error">{mother.error}</p> : null}

      {!mother.loading && mother.mode === 'setup' ? <SetupPrompt mother={mother} /> : null}

      {!mother.loading && mother.mode !== 'setup' ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <Card className="card-pad">
              <div className="flex flex-wrap items-center gap-6">
                <WeekRing ga={mother.ga} />
                <div className="min-w-0 flex-1">
                  {mother.mode === 'pregnancy' && mother.ga ? (
                    <>
                      <p className="micro">This week</p>
                      <p className="mt-1 text-lg font-bold text-ink-900">
                        Week {mother.ga.weeks}
                        <span className="text-ink-500"> · {mother.ga.days} day{mother.ga.days === 1 ? '' : 's'}</span>
                      </p>
                      <p className="mt-1 text-sm text-ink-600">
                        Trimester {mother.ga.trimester} · your baby is about the size of {guide?.size ?? 'a seed'}
                      </p>
                      {guide?.milestone ? (
                        <p className="mt-2">
                          <Badge tone="green">{guide.milestone}</Badge>
                        </p>
                      ) : null}
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Link to="/app/guide" className="btn btn-primary btn-sm">
                          Open this week’s guide
                        </Link>
                        <Link to="/app/pregnancy" className="btn btn-secondary btn-sm">
                          Tracker details
                        </Link>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="micro">Mother & Baby mode</p>
                      <p className="mt-1 text-lg font-bold text-ink-900">
                        {activeBaby ? activeBaby.name : 'Your baby'}
                      </p>
                      <p className="mt-1 text-sm text-ink-600">
                        {activeBaby ? formatBabyAge(activeBaby.dateOfBirth) : 'Add your baby to start the record.'}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Link to="/app/baby" className="btn btn-primary btn-sm">
                          Open baby record
                        </Link>
                        <Link to="/app/pregnancy" className="btn btn-secondary btn-sm">
                          Pregnancy record
                        </Link>
                      </div>
                    </>
                  )}
                </div>
              </div>
              {mother.mode === 'pregnancy' ? (
                <div className="mt-5 border-t border-ink-100 pt-4">
                  <TrimesterTrack ga={mother.ga} />
                </div>
              ) : null}
            </Card>

            {mother.nextAppointment ? (
              <NextAppointmentStrip
                date={mother.nextAppointment.date}
                time={mother.nextAppointment.time}
                facilityName={mother.nextAppointment.facilityName}
                purpose={mother.nextAppointment.purpose}
              />
            ) : (
              <Card className="card-pad">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="card-title">No appointment booked yet</p>
                    <p className="mt-1 text-sm text-ink-600">
                      Add your next antenatal visit and Mama Care will remind you ahead of it.
                    </p>
                  </div>
                  <Link to="/app/appointments" className="btn btn-primary btn-sm">
                    <Plus className="size-4" aria-hidden /> Add appointment
                  </Link>
                </div>
              </Card>
            )}

            {guide && mother.mode === 'pregnancy' ? (
              <Card className="card-pad">
                <SectionHeading eyebrow={`Week ${guide.week}`} title="What is happening" />
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="micro">Your baby</p>
                    <p className="mt-1 text-sm leading-relaxed text-ink-700">{guide.baby}</p>
                  </div>
                  <div>
                    <p className="micro">Your body</p>
                    <p className="mt-1 text-sm leading-relaxed text-ink-700">{guide.body}</p>
                  </div>
                </div>
                <div className="mt-4">
                  <Link to="/app/guide" className="btn btn-secondary btn-sm">
                    Read the full week <ChevronRight className="size-4" aria-hidden />
                  </Link>
                </div>
              </Card>
            ) : null}

            {activeBaby && nextVaccine ? (
              <Card className="card-pad border-brand-200 bg-brand-50/40">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="micro flex items-center gap-1.5">
                      <Syringe className="size-3.5" aria-hidden /> Next immunization
                    </p>
                    <p className="mt-1 text-base font-semibold text-ink-900">
                      {nextVaccine.vaccineName} · {nextVaccine.dose}
                    </p>
                    <p className="mt-1 text-sm text-ink-600">
                      Due {formatDate(nextVaccine.scheduledDate, 'long')} ({nextVaccine.scheduledAgeLabel}) ·{' '}
                      {relativeTime(nextVaccine.scheduledDate)}
                    </p>
                  </div>
                  <Link to="/app/baby" className="btn btn-primary btn-sm">
                    Immunization card
                  </Link>
                </div>
              </Card>
            ) : null}
          </div>

          <div className="space-y-4">
            <Card className="card-pad">
              <SectionHeading eyebrow="Today" title={mother.dueToday.length > 0 ? 'Due today' : 'Nothing due today'} />
              {mother.dueToday.length === 0 ? (
                <p className="mt-2 text-sm text-ink-600">
                  No medication or supplements are scheduled for today.{' '}
                  <Link to="/app/reminders" className="font-medium text-brand-800 hover:underline">
                    Manage reminders
                  </Link>
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {mother.dueToday.slice(0, 4).map((reminder) => (
                    <li key={reminder.id} className="flex items-center justify-between gap-3 rounded-lg border border-ink-100 px-3 py-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink-800">{reminder.title}</span>
                        <span className="block truncate text-xs text-ink-500">
                          {[reminder.medicine, reminder.dose, reminder.times.join(', ')].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <Button variant="secondary" size="sm" onClick={() => void markTaken(reminder.id, reminder.title)}>
                        Taken
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3">
                <Link to="/app/reminders" className="btn btn-ghost btn-sm">
                  All reminders
                </Link>
              </div>
            </Card>

            <DueDateCard
              ga={mother.ga}
              eddDate={mother.pregnancy?.eddDate ?? null}
              lmpDate={mother.pregnancy?.lmpDate ?? null}
              datingMethod={mother.pregnancy?.datingMethod}
            />

            {mother.unreadNotifications > 0 ? (
              <Card className="card-pad">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="card-title">{mother.unreadNotifications} unread notification{mother.unreadNotifications === 1 ? '' : 's'}</p>
                    <p className="mt-1 text-sm text-ink-600">Reminders, appointment changes and messages.</p>
                  </div>
                  <Link to="/app/notifications" className="btn btn-secondary btn-sm">
                    Open
                  </Link>
                </div>
              </Card>
            ) : null}

            <Card className="card-pad">
              <SectionHeading eyebrow="Shortcuts" title="Go straight to" />
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  { to: '/app/pregnancy', label: 'Tracker', icon: <CalendarDays className="size-4" aria-hidden /> },
                  { to: '/app/baby', label: 'My baby', icon: <Baby className="size-4" aria-hidden /> },
                  { to: '/app/learn', label: 'Learn', icon: <BookOpen className="size-4" aria-hidden /> },
                  { to: '/app/journal', label: 'Journal', icon: <NotebookPen className="size-4" aria-hidden /> },
                  { to: '/app/facilities', label: 'Facilities', icon: <MapPin className="size-4" aria-hidden /> },
                  { to: '/app/messages', label: 'Messages', icon: <MessageCircle className="size-4" aria-hidden /> },
                  { to: '/app/reminders', label: 'Reminders', icon: <Pill className="size-4" aria-hidden /> },
                  { to: '/app/emergency', label: 'Emergency', icon: <EmergencyDot />, danger: true },
                ].map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={
                      item.danger
                        ? 'flex items-center gap-2 rounded-lg border border-[var(--color-risk-red-border)] bg-[var(--color-risk-red-soft)] px-3 py-2.5 text-sm font-semibold text-ink-800'
                        : 'flex items-center gap-2 rounded-lg border border-ink-200 px-3 py-2.5 text-sm font-semibold text-ink-700 hover:border-brand-300'
                    }
                  >
                    <span className={item.danger ? 'text-[var(--color-risk-red)]' : 'text-brand-700'}>{item.icon}</span>
                    {item.label}
                  </Link>
                ))}
              </div>
            </Card>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

function EmergencyDot() {
  return <span className="grid size-4 place-items-center rounded-full bg-[var(--color-risk-red)] text-[0.6rem] font-bold text-white">!</span>;
}

function SetupPrompt({ mother }: { mother: MotherContext }) {
  const activeBaby = mother.activeBaby;
  const babyAge = activeBaby ? ageInMonths(activeBaby.dateOfBirth) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="card-pad border-brand-200 bg-brand-50/40">
        <Badge tone="brand">Step one</Badge>
        <h2 className="card-title mt-3">Tell Mama Care where you are</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-700">
          Enter the first day of your last period, or your due date from a scan or clinic card. That single date drives the
          weekly guide, the appointment suggestions and the reminders — and you can correct it later.
        </p>
        <ul className="checklist mt-3">
          <li>Not sure of your dates? Skip them and add them after your next visit.</li>
          <li>Already had your baby? Add the baby instead — the app switches to Mother &amp; Baby mode.</li>
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/app/pregnancy" className="btn btn-primary btn-sm">
            Set up my pregnancy
          </Link>
          <Link to="/app/baby" className="btn btn-secondary btn-sm">
            Add my baby
          </Link>
        </div>
      </Card>

      <div className="space-y-4">
        <Card className="card-pad">
          <h2 className="card-title">What you can use right now</h2>
          <p className="mt-1 text-sm text-ink-600">
            These do not need your dates, so start with whichever is useful today.
          </p>
          <div className="mt-3 grid gap-2">
            {[
              { to: '/app/learn', label: 'Education library', detail: 'Pregnancy, labour, postnatal, newborn and breastfeeding' },
              { to: '/app/emergency', label: 'Warning signs & emergency numbers', detail: 'What means go now, and what means be seen today' },
              { to: '/app/facilities', label: 'Find a facility', detail: 'Maternity services, hours and how to get there' },
              { to: '/app/reminders', label: 'Medication reminders', detail: 'Only what a clinician has prescribed' },
            ].map((item) => (
              <Link key={item.to} to={item.to} className="flex items-center justify-between gap-3 rounded-lg border border-ink-200 px-3 py-2.5 hover:border-brand-300">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink-800">{item.label}</span>
                  <span className="block truncate text-xs text-ink-500">{item.detail}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-ink-400" aria-hidden />
              </Link>
            ))}
          </div>
        </Card>

        {babyAge ? (
          <Card className="card-pad">
            <h2 className="card-title">Baby already added</h2>
            <p className="mt-1 text-sm text-ink-600">
              {activeBaby?.name} is {babyAge.months} month{babyAge.months === 1 ? '' : 's'} old. Open the baby record for
              growth notes and the immunization card.
            </p>
            <div className="mt-3">
              <Link to="/app/baby" className="btn btn-secondary btn-sm">
                Open baby record
              </Link>
            </div>
          </Card>
        ) : null}

        <EmptyState
          title="Nothing is shared with anyone yet"
          description="You can link a provider or invite a partner later, from Settings. Until you do, this record is visible only to you."
        />
      </div>
    </div>
  );
}
