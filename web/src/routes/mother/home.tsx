import { Link } from 'react-router-dom';
import { Bell, BookOpen, CalendarClock, HeartPulse, ShieldCheck } from 'lucide-react';
import { AppShell } from '@/components/layout/shell';
import { Card, KeyValue } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingRows, NoticeState, ProgressBar, RiskBadge } from '@/components/ui/display';
import { DangerSignsCard, NoRecordNotice, useMotherRecord } from '@/routes/mother/shared';
import { useAsync } from '@/hooks';
import { services } from '@/services/session-store';
import { formatDate, toIsoDate } from '@/lib/utils';
import { shortGestationalAge } from '@/lib/obstetrics';

/**
 * What a mother sees first: how far along the clinic has dated her, when she is
 * next expected, the signs that mean “go today”, and reading for this stage.
 * Nothing here interprets a result — the explanation belongs to her clinician.
 */
export default function MotherHome() {
  const { motherId, chart, overview } = useMotherRecord();
  const reading = useAsync(async () => (motherId ? services().data.listEducation('MOTHER', null) : []), { deps: [motherId] });

  if (!motherId) {
    return (
      <AppShell title="My pregnancy">
        <NoRecordNotice />
      </AppShell>
    );
  }

  if ((chart.loading && !chart.data) || (overview.loading && !overview.data)) {
    return (
      <AppShell title="My pregnancy">
        <Card>
          <LoadingRows rows={4} />
        </Card>
      </AppShell>
    );
  }

  if (chart.error || !chart.data || !overview.data) {
    return (
      <AppShell
        title="My pregnancy"
        actions={
          <Button size="sm" variant="secondary" onClick={() => void chart.run()}>
            Try again
          </Button>
        }
      >
        <ErrorState
          title="We could not load your record"
          message={`${chart.error ?? 'It is not available right now.'} Nothing is wrong with your record — this is a connection problem.`}
          onRetry={() => {
            void chart.run();
            void overview.run();
          }}
        />
      </AppShell>
    );
  }

  const { mother, visits } = chart.data;
  const summary = overview.data;
  const ga = summary.ga;
  const today = toIsoDate(new Date());
  const unresolved = summary.openAlerts;
  const forHer = (reading.data ?? []).slice(0, 3);

  return (
    <AppShell
      title={`Hello, ${mother.fullName.split(' ')[0]}`}
      subtitle={ga.valid ? `${shortGestationalAge(ga)} weeks · ${ga.trimester}${ga.trimester === 1 ? 'st' : ga.trimester === 2 ? 'nd' : 'rd'} trimester` : 'Your dating is being confirmed by the clinic'}
    >
      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <Card title="Your pregnancy" description="Everything here is what your clinic wrote down at your visits.">
            <div className="mb-4">
              <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                <p className="micro">How far along</p>
                <p className="text-[0.86rem] font-semibold text-ink-900 tnum">{ga.valid ? `${shortGestationalAge(ga)} weeks` : 'Not dated yet'}</p>
              </div>
              <ProgressBar value={ga.progressPct} label="Your journey to the due date" size="md" />
              <p className="caption mt-1.5">
                Expected delivery date {formatDate(summary.edd)}. Dates can move by a few days after a scan — your clinic will tell you if yours changes.
              </p>
            </div>

            <KeyValue
              columns={2}
              items={[
                { label: 'Next appointment', value: summary.nextAppointment ? `${formatDate(summary.nextAppointment.scheduledFor)} at ${summary.nextAppointment.time}` : 'Not booked', tone: 'strong' },
                { label: 'Last visit', value: summary.lastVisit ? formatDate(summary.lastVisit.visitDate) : 'None recorded' },
                { label: 'Visits attended', value: visits.filter((row) => row.visitDate <= today).length },
                { label: 'Care level recorded', value: <RiskBadge level={mother.riskLevel ?? 'GREEN'} /> },
              ]}
            />

            {!summary.nextAppointment ? (
              <div className="mt-3">
                <NoticeState tone="warning" title="You have no next visit booked" compact>
                  Please call the clinic and arrange one. Keeping your visits is how problems are found early — and most problems are easy to treat when they
                  are found soon.
                </NoticeState>
              </div>
            ) : null}
          </Card>

          {visits.length > 0 ? (
            <Card title="What your clinic measured" description="Your numbers, as recorded. Your midwife explains what they mean for you.">
              <ul className="divide-y divide-ink-100">
                {visits.slice(0, 4).map((visit) => (
                  <li key={visit.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div>
                      <p className="text-[0.88rem] font-semibold text-ink-900">{formatDate(visit.visitDate)}</p>
                      <p className="caption mt-0.5">
                        {visit.gestationalAge.weeks} weeks {visit.gestationalAge.days} days ·{' '}
                        {visit.visitType === 'BOOKING' ? 'first visit' : visit.visitType.replace(/_/g, ' ').toLowerCase()}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[0.82rem] text-ink-700 tnum">
                      <span>BP {visit.vitals.systolicBp ? `${visit.vitals.systolicBp}/${visit.vitals.diastolicBp ?? '—'}` : '—'}</span>
                      <span>Weight {visit.vitals.weightKg ? `${visit.vitals.weightKg} kg` : '—'}</span>
                      <span>Baby’s heartbeat {visit.vitals.fetalHeartRate ?? '—'}</span>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-3">
                <Link to="/home/records" className="btn btn-secondary btn-sm">
                  See my full record
                </Link>
              </div>
            </Card>
          ) : (
            <Card>
              <EmptyState
                icon={<HeartPulse className="size-5" aria-hidden />}
                title="Your first visit has not been recorded"
                description="At your first antenatal visit the midwife records how far along you are, checks your blood pressure and blood, and starts this record. Bring your health card if you have one."
              />
            </Card>
          )}

          <DangerSignsCard />
        </div>

        <div className="space-y-4">
          {unresolved.length > 0 ? (
            <Card title="Your clinic would like to see you">
              <NoticeState tone="warning" title="Please contact your clinic today" compact>
                They recorded something they want to check with you in person. Call the facility or come to the antenatal clinic. If you have any of the danger
                signs listed on this page, go now — do not wait.
              </NoticeState>
            </Card>
          ) : null}

          {summary.reminders.length > 0 ? (
            <Card title="Reminders from your clinic">
              <ul className="space-y-2.5">
                {summary.reminders.map((reminder) => (
                  <li
                    key={reminder.label}
                    className={`rounded-lg border p-3 ${
                      reminder.tone === 'critical'
                        ? 'border-[var(--color-risk-red-border)] bg-[var(--color-risk-red-soft)]'
                        : reminder.tone === 'warning'
                          ? 'border-[var(--color-risk-amber-border)] bg-[var(--color-risk-amber-soft)]'
                          : 'border-ink-200 bg-ink-50'
                    }`}
                  >
                    <p className="text-[0.86rem] font-semibold text-ink-900">{reminder.label}</p>
                    <p className="caption mt-0.5">{reminder.detail}</p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card title="Next appointment" actions={<Link to="/home/appointments" className="text-[0.78rem] font-semibold text-brand-800 hover:underline">All</Link>}>
            {summary.nextAppointment ? (
              <div className="space-y-1.5">
                <p className="text-[1rem] font-semibold text-ink-900">{formatDate(summary.nextAppointment.scheduledFor)}</p>
                <p className="muted">
                  {summary.nextAppointment.time} · {summary.nextAppointment.reason?.trim() || 'Routine antenatal visit'}
                </p>
                <p className="caption">
                  {summary.daysUntilAppointment === null
                    ? 'This visit has passed'
                    : summary.daysUntilAppointment === 0
                      ? 'Today'
                      : summary.daysUntilAppointment === 1
                        ? 'Tomorrow'
                        : `In ${summary.daysUntilAppointment} days`}
                </p>
                <ul className="mt-2 space-y-1 text-[0.84rem] text-ink-700">
                  <li>· Bring your health card.</li>
                  <li>· Write down what you want to ask.</li>
                  <li>· Come with someone if that helps you.</li>
                </ul>
              </div>
            ) : (
              <EmptyState icon={<CalendarClock className="size-5" aria-hidden />} title="Nothing booked yet" description="Ask the clinic before you leave next time — or call them now." />
            )}
          </Card>

          <Card title="Reading for this stage" description="Short pieces your clinic published for you.">
            {reading.loading ? (
              <LoadingRows rows={2} />
            ) : forHer.length === 0 ? (
              <p className="text-[0.86rem] text-ink-600">Nothing published in your language yet. Ask your midwife — reading never replaces asking.</p>
            ) : (
              <ul className="space-y-2.5">
                {forHer.map((item) => (
                  <li key={item.id}>
                    <Link
                      to={`/home/education?open=${item.id}`}
                      className="group flex items-start gap-2.5 rounded-lg border border-ink-200 p-2.5 transition-colors hover:border-brand-300 hover:bg-brand-50/40"
                    >
                      <span className="min-w-0">
                        <span className="block text-[0.86rem] font-semibold text-ink-900">{item.title}</span>
                        <span className="caption mt-0.5 block line-clamp-2">{item.summary}</span>
                        <span className="caption mt-1 block">
                          {item.language} · {item.readingMinutes} min
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3">
              <Link to="/home/education" className="btn btn-secondary btn-sm w-full">
                <BookOpen className="size-4" aria-hidden /> All my reading
              </Link>
            </div>
          </Card>

          <Card title="Messages">
            <p className="text-[0.86rem] text-ink-600">
              Reminders and notes from your clinic arrive here. Keep this app on your phone so you do not miss a visit.
            </p>
            <div className="mt-3">
              <Link to="/home/notifications" className="btn btn-secondary btn-sm">
                <Bell className="size-4" aria-hidden /> Open my messages
              </Link>
            </div>
          </Card>

          <Card title="Who can see your record">
            <p className="text-[0.86rem] leading-relaxed text-ink-600">
              Your clinic’s staff, and you. Nobody else — not other patients, not the public pages of this site. Access is enforced by the database rules and
              every read or change is logged.
            </p>
            <p className="caption mt-2 flex items-start gap-1.5">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-[var(--color-risk-green)]" aria-hidden />
              If something looks wrong, tell the clinic: corrections are added to the record, never quietly overwritten.
            </p>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
