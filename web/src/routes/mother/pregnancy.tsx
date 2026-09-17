/**
 * Pregnancy tracker.
 *
 * Before setup this is a form; after setup it is the record: how far along, how the
 * dates were derived, the routine antenatal schedule, the observations recorded
 * between visits, a fetal-movement counter, and the care team the mother has
 * chosen to share with.
 *
 * Two things are deliberately loud about their limits. Every calculated date is
 * labelled as an estimate with its source, and "record delivery" is a change the
 * mother makes about her own life — not a clinical event the app decides.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  Baby,
  CalendarPlus,
  Check,
  Footprints,
  Pencil,
  Plus,
  Stethoscope,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import {useAsync} from '@/hooks';
import { useMotherContext } from '@/hooks/use-mother';
import {
  appointmentRepo,
  careLinkRepo,
  observationRepo,
  pregnancyRepo,
  providerRepo,
} from '@/services/repositories';
import { useConfirm, useSession } from '@/providers/app-providers';
import { ROUTINE_ANC_SCHEDULE, eddFromLmp, formatGestationalAge, gestationalAge, suggestNextAppointment } from '@/lib/obstetrics';
import { parseBloodPressure, pregnancySetupSchema, validate } from '@/lib/validation';
import { daysBetween, formatDate, relativeTime, toIsoDate } from '@/lib/utils';
import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { DueDateCard, KickCounter, TrimesterTrack, WeekRing, datingLabel } from '@/components/pregnancy/pregnancy-widgets';
import { Button } from '@/components/ui/button';
import { Card, KeyValue, SectionHeading } from '@/components/ui/card';
import { Badge, EmptyState, LoadingRows } from '@/components/ui/display';
import { Field, FieldGrid, Select, TextArea, TextInput } from '@/components/ui/form';
import { Modal } from '@/components/ui/overlay';
import { Timeline } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import type { CareLink, Observation, Pregnancy } from '@/types/domain';

const OBSERVATION_KINDS: { value: Observation['kind']; label: string; unit?: string }[] = [
  { value: 'weight', label: 'Weight', unit: 'kg' },
  { value: 'blood-pressure', label: 'Blood pressure', unit: 'mmHg' },
  { value: 'fundal-height', label: 'Fundal height', unit: 'cm' },
  { value: 'hb', label: 'Haemoglobin', unit: 'g/dL' },
  { value: 'glucose', label: 'Blood glucose', unit: 'mmol/L' },
  { value: 'height', label: 'Height', unit: 'cm' },
  { value: 'symptom', label: 'Symptom I noticed' },
  { value: 'mood', label: 'How I am feeling' },
  { value: 'other', label: 'Something else' },
];

export default function PregnancyTrackerPage() {
  const mother = useMotherContext();
  const { actor } = useSession();

  useEffect(() => {
    document.title = 'Pregnancy tracker · Mama Care';
  }, []);

  if (mother.loading) {
    return (
      <AppShell>
        <PageHeader title="Pregnancy tracker" />
        <LoadingRows rows={4} />
      </AppShell>
    );
  }

  if (!mother.pregnancy) {
    return (
      <AppShell>
        <PageHeader
          title="Set up your pregnancy"
          description="One date is enough to start. Everything else — the week number, the due date, the visit schedule — is calculated from it, and you can change any of it later."
        />
        <SetupForm onDone={() => mother.refresh()} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Tracker pregnancy={mother.pregnancy} onChanged={() => mother.refresh()} uid={actor?.uid ?? null} />
    </AppShell>
  );
}

/* ── Setup ─────────────────────────────────────────────────────────────── */

function SetupForm({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [lmpDate, setLmpDate] = useState('');
  const [eddDate, setEddDate] = useState('');
  const [datingMethod, setDatingMethod] = useState<Pregnancy['datingMethod']>('lmp');
  const [previousPregnancies, setPreviousPregnancies] = useState('0');
  const [previousLiveBirths, setPreviousLiveBirths] = useState('0');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const preview = useMemo(() => {
    if (!lmpDate && !eddDate) return null;
    const ga = gestationalAge({ lmpDate: lmpDate || null, eddDate: eddDate || null });
    if (!ga.valid) return null;
    return { ga, edd: eddDate || (lmpDate ? eddFromLmp(lmpDate) : null) };
  }, [lmpDate, eddDate]);

  const submit = async (): Promise<void> => {
    setSaving(true);
    setFormError(null);
    const result = validate(pregnancySetupSchema, {
      lmpDate,
      eddDate,
      datingMethod,
      previousPregnancies: Number(previousPregnancies || 0),
      previousLiveBirths: Number(previousLiveBirths || 0),
    });
    if (!result.ok) {
      setErrors(result.errors);
      setSaving(false);
      return;
    }
    setErrors({});
    try {
      const value = result.value;
      await pregnancyRepo.create({
        lmpDate: value.lmpDate || null,
        eddDate: value.eddDate || (value.lmpDate ? eddFromLmp(value.lmpDate) : null),
        datingMethod: value.datingMethod,
        previousPregnancies: value.previousPregnancies ?? 0,
        previousLiveBirths: value.previousLiveBirths ?? 0,
      });
      toast.success('Tracker started', 'Your weekly guide is ready.');
      onDone();
      navigate('/app/pregnancy', { replace: true });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'That did not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <Card className="card-pad">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          noValidate
          className="space-y-4"
        >
          <Field
            label="First day of your last period"
            htmlFor="lmpDate"
            error={errors.lmpDate}
            hint="This is how most clinics date a pregnancy. Leave it blank if you only have a due date."
          >
            <TextInput
              id="lmpDate"
              type="date"
              value={lmpDate}
              max={new Date().toISOString().slice(0, 10)}
              onValueChange={(value) => {
                setLmpDate(value);
                if (value && datingMethod === 'lmp') setEddDate(eddFromLmp(value));
              }}
              invalid={Boolean(errors.lmpDate)}
            />
          </Field>

          <Field
            label="Expected due date"
            htmlFor="eddDate"
            error={errors.eddDate}
            hint="From a scan or your clinic card. If it differs from the calculation, this date is used."
          >
            <TextInput
              id="eddDate"
              type="date"
              value={eddDate}
              onValueChange={(value) => {
                setEddDate(value);
                if (value && datingMethod === 'lmp') setDatingMethod('ultrasound');
              }}
              invalid={Boolean(errors.eddDate)}
            />
          </Field>

          <Field label="How were your dates determined?" htmlFor="datingMethod">
            <Select
              id="datingMethod"
              value={datingMethod}
              onChange={(event) => setDatingMethod(event.target.value as Pregnancy['datingMethod'])}
              options={[
                { value: 'lmp', label: 'From my last period' },
                { value: 'ultrasound', label: 'From an ultrasound scan' },
                { value: 'clinician', label: 'Given by a clinician' },
                { value: 'unknown', label: 'Not sure yet' },
              ]}
            />
          </Field>

          <FieldGrid columns={2}>
            <Field label="Previous pregnancies" htmlFor="previousPregnancies" optional hint="Including this one? No — pregnancies before this one.">
              <TextInput
                id="previousPregnancies"
                type="number"
                inputMode="numeric"
                min={0}
                max={20}
                value={previousPregnancies}
                onValueChange={setPreviousPregnancies}
              />
            </Field>
            <Field label="Previous live births" htmlFor="previousLiveBirths" optional>
              <TextInput
                id="previousLiveBirths"
                type="number"
                inputMode="numeric"
                min={0}
                max={20}
                value={previousLiveBirths}
                onValueChange={setPreviousLiveBirths}
              />
            </Field>
          </FieldGrid>

          {formError ? <p className="alert alert-error">{formError}</p> : null}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={saving}>
              {saving ? 'Saving…' : 'Start my tracker'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => navigate('/app/baby')}>
              I have already had my baby
            </Button>
          </div>
        </form>
      </Card>

      <div className="space-y-4">
        <Card className="card-pad">
          <SectionHeading eyebrow="Preview" title="What Mama Care will calculate" />
          {preview ? (
            <>
              <div className="mt-3 flex justify-center">
                <WeekRing ga={preview.ga} size={140} />
              </div>
              <div className="mt-4">
              <KeyValue
                columns={1}
                items={[
                  { label: 'Gestational age', value: formatGestationalAge(preview.ga), tone: 'strong' },
                  { label: 'Estimated due date', value: preview.edd ? formatDate(preview.edd, 'long') : '—', tone: 'strong' },
                  { label: 'Trimester', value: `Trimester ${preview.ga.trimester}` },
                  { label: 'Weeks to go', value: String(Math.max(0, 40 - preview.ga.weeks)) },
                ]}
              />
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-ink-600">
              Enter a date and the calculation appears here before you save anything.
            </p>
          )}
        </Card>

        <Card className="card-pad border-ink-200 bg-ink-50">
          <h3 className="card-title">Dates are estimates</h3>
          <p className="mt-1 text-sm text-ink-600">
            Only about one pregnancy in twenty delivers on the estimated date. A clinician's assessment — especially an
            early scan — always takes precedence, and you can update these dates at any time.
          </p>
          <div className="mt-3">
            <Link to="/learn/antenatal-care" className="btn btn-secondary btn-sm">
              Why antenatal visits matter
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ── The record itself ─────────────────────────────────────────────────── */

function Tracker({
  pregnancy,
  onChanged,
  uid,
}: {
  pregnancy: Pregnancy;
  onChanged: () => void;
  uid: string | null;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();

  const [editOpen, setEditOpen] = useState(false);
  const [observationOpen, setObservationOpen] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [careOpen, setCareOpen] = useState(false);

  const ga = useMemo(
    () =>
      gestationalAge({
        lmpDate: pregnancy.lmpDate,
        eddDate: pregnancy.eddDate,
        asOf: pregnancy.status === 'delivered' && pregnancy.deliveryDate ? new Date(pregnancy.deliveryDate) : new Date(),
      }),
    [pregnancy],
  );

  const { data: observations, loading: observationsLoading, run: reloadObservations } = useAsync(
    () => (uid ? observationRepo.list(uid) : Promise.resolve([] as Observation[])),
    { deps: [uid], immediate: Boolean(uid) },
  );
  const { data: careLinks, run: reloadCare } = useAsync(() => careLinkRepo.mine(), { deps: [uid] });

  const delivered = pregnancy.status === 'delivered';
  const ended = pregnancy.status === 'ended';
  const daysToEdd = pregnancy.eddDate ? daysBetween(new Date(), new Date(pregnancy.eddDate)) : null;

  const nextVisit = useMemo(() => {
    if (delivered || ended || !ga.valid) return null;
    return suggestNextAppointment({ eddDate: pregnancy.eddDate, ga });
  }, [delivered, ended, ga, pregnancy.eddDate]);

  const endPregnancy = async (): Promise<void> => {
    const ok = await confirm({
      title: 'End this pregnancy record',
      message:
        'Use this if the pregnancy ended without a birth — a miscarriage, stillbirth or termination. The record is kept so your history stays complete, but the tracker stops counting weeks. This cannot be undone from the app.',
      confirmLabel: 'End the record',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await pregnancyRepo.endPregnancy(pregnancy.id, 'Ended by the mother from the tracker');
      toast.success('Record closed', 'We are sorry. Support information is in the library if you want it.');
      onChanged();
    } catch {
      toast.error('That did not save');
    }
  };

  const removeObservation = async (observation: Observation): Promise<void> => {
    const ok = await confirm({
      title: 'Delete this entry',
      message: `${observation.label}${observation.value ? ` — ${observation.value}${observation.unit ?? ''}` : ''}. This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    await observationRepo.remove(observation.id);
    toast.success('Entry deleted');
    void reloadObservations();
  };

  const bookSuggested = async (): Promise<void> => {
    if (!nextVisit) return;
    try {
      await appointmentRepo.create({
        kind: 'antenatal',
        date: nextVisit,
        facilityName: 'My facility',
        purpose: `Routine antenatal visit around week ${ga.weeks + Math.max(1, Math.round(daysBetween(new Date(), new Date(nextVisit)) / 7))}`,
      });
      toast.success('Appointment added', formatDate(nextVisit, 'long'));
      navigate('/app/appointments');
    } catch {
      toast.error('That did not save');
    }
  };

  const rows = (observations ?? []).slice(0, 12);

  return (
    <>
      <PageHeader
        title={delivered ? 'Pregnancy record' : ended ? 'Pregnancy record (closed)' : 'Pregnancy tracker'}
        description={
          delivered
            ? `Delivered ${pregnancy.deliveryDate ? formatDate(pregnancy.deliveryDate, 'long') : ''}. Your pregnancy record is kept; the baby screens are now the main view.`
            : ended
              ? pregnancy.notes ?? 'This record has been closed.'
              : `${formatGestationalAge(ga)} · ${datingLabel(pregnancy.datingMethod)}`
        }
        badge={delivered ? <Badge tone="green">Delivered</Badge> : ended ? <Badge tone="neutral">Closed</Badge> : <Badge tone="brand">Trimester {ga.trimester}</Badge>}
        actions={
          <>
            {!delivered && !ended ? (
              <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)} icon={<Pencil className="size-4" aria-hidden />}>
                Edit dates
              </Button>
            ) : null}
            {!delivered && !ended ? (
              <Button variant="primary" size="sm" onClick={() => setDeliveryOpen(true)} icon={<Baby className="size-4" aria-hidden />}>
                I have delivered
              </Button>
            ) : null}
            {delivered ? (
              <Button variant="primary" size="sm" onClick={() => navigate('/app/baby')} icon={<Baby className="size-4" aria-hidden />}>
                Baby record
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="card-pad">
            <div className="flex flex-wrap items-center gap-6">
              <WeekRing ga={ga} />
              <div className="min-w-0 flex-1">
                <KeyValue
                  columns={2}
                  items={[
                    { label: 'Gestational age', value: ga.valid ? formatGestationalAge(ga) : 'Dates needed', tone: 'strong' },
                    { label: 'Estimated due date', value: pregnancy.eddDate ? formatDate(pregnancy.eddDate, 'long') : '—', tone: 'strong' },
                    { label: 'Last menstrual period', value: pregnancy.lmpDate ? formatDate(pregnancy.lmpDate, 'long') : '—' },
                    { label: 'Dating method', value: datingLabel(pregnancy.datingMethod) },
                    { label: 'Weeks remaining', value: daysToEdd !== null && daysToEdd > 0 ? String(daysToEdd / 7 | 0) : '—' },
                    { label: 'Previous pregnancies', value: `${pregnancy.previousPregnancies} (${pregnancy.previousLiveBirths} live births)` },
                  ]}
                />
                <p className="mt-3 text-xs text-ink-500">
                  All dates are estimates. A clinician's assessment always takes precedence — you can update them at any
                  time.
                </p>
              </div>
            </div>
            {!delivered && !ended ? (
              <div className="mt-5 border-t border-ink-100 pt-4">
                <TrimesterTrack ga={ga} />
              </div>
            ) : null}
          </Card>

          <Card className="card-pad">
            <SectionHeading
              eyebrow="Routine care"
              title="Antenatal visit schedule"
              description="The routine milestones for a normal pregnancy in Zambia. Your clinic may schedule more visits — add those yourself."
              actions={
                nextVisit ? (
                  <Button variant="secondary" size="sm" onClick={() => void bookSuggested()} icon={<CalendarPlus className="size-4" aria-hidden />}>
                    Book {formatDate(nextVisit, 'day')}
                  </Button>
                ) : undefined
              }
            />
            <div className="mt-4">
              <Timeline
                items={ROUTINE_ANC_SCHEDULE.map((visit) => {
                  const done = ga.valid && ga.weeks >= visit.weeks;
                  const isNext = !done && ga.valid && ROUTINE_ANC_SCHEDULE.find((candidate) => candidate.weeks > ga.weeks)?.weeks === visit.weeks;
                  return {
                    title: (
                      <span className="flex flex-wrap items-center gap-2">
                        Week {visit.weeks} · {visit.label}
                        {isNext ? <Badge tone="brand">Next</Badge> : null}
                        {done ? <Badge tone="green">Passed</Badge> : null}
                      </span>
                    ),
                    meta: pregnancy.lmpDate || pregnancy.eddDate ? aroundDate(pregnancy, visit.weeks) : undefined,
                    tone: done ? 'green' : isNext ? 'brand' : 'default',
                    icon: done ? <Check className="size-3" aria-hidden /> : undefined,
                  };
                })}
              />
            </div>
            <p className="mt-3 text-xs text-ink-500">
              Dates shown are calculated from your dates and are approximate. Confirm with your facility.
            </p>
          </Card>

          <Card className="card-pad">
            <SectionHeading
              eyebrow="Between visits"
              title="My observations"
              description="Record what a clinician measured at a visit, or what you noticed yourself. Mama Care stores it; it never interprets it."
              actions={
                <Button variant="primary" size="sm" onClick={() => setObservationOpen(true)} icon={<Plus className="size-4" aria-hidden />}>
                  Add entry
                </Button>
              }
            />
            {observationsLoading ? <LoadingRows className="mt-3" rows={3} /> : null}
            {!observationsLoading && rows.length === 0 ? (
              <EmptyState
                className="mt-3"
                icon={<Activity className="size-6" aria-hidden />}
                title="Nothing recorded yet"
                description="Weight, blood pressure, fundal height or a symptom you noticed — anything you want to remember for your next visit."
              />
            ) : null}
            <ul className="mt-3 divide-y divide-ink-100">
              {rows.map((observation) => {
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
                        {observation.recordedBy === 'provider' ? 'recorded by a provider' : 'recorded by you'}
                        {observation.weekNumber ? ` · week ${observation.weekNumber}` : ''}
                        {bp ? ' · shown as recorded, not interpreted' : ''}
                      </p>
                      {observation.notes ? <p className="mt-1 text-xs text-ink-600">{observation.notes}</p> : null}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => void removeObservation(observation)} aria-label={`Delete ${observation.label}`}>
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>

        <div className="space-y-4">
          <DueDateCard
            ga={ga}
            eddDate={pregnancy.eddDate}
            lmpDate={pregnancy.lmpDate}
            datingMethod={pregnancy.datingMethod}
          />

          {!delivered && !ended ? (
            <Card className="card-pad">
              <SectionHeading eyebrow="Fetal movement" title="Kick counter" />
              <p className="mt-1 text-sm text-ink-600">
                Counting movements is a way of noticing a change, not a test you can pass or fail. If movements reduce or
                stop, contact your facility — do not wait for the next count.
              </p>
              <div className="mt-3">
                <KickCounter
                  saving={false}
                  onSave={async ({ count, minutes, at }) => {
                    await observationRepo.create({
                      userId: uid ?? '',
                      pregnancyId: pregnancy.id,
                      kind: 'fetal-movement',
                      label: `Movements in ${minutes} min`,
                      value: String(count),
                      systolic: null,
                      diastolic: null,
                      unit: null,
                      weekNumber: ga.valid ? ga.weeks : null,
                      recordedBy: 'self',
                      appointmentId: null,
                      notes: null,
                      createdAt: at,
                      updatedAt: at,
                    } as Omit<Observation, 'id'>);
                    toast.success('Movement count saved', `${count} movements in ${minutes} minutes.`);
                    void reloadObservations();
                  }}
                />
              </div>
              <p className="mt-3 flex items-start gap-2 text-xs text-ink-500">
                <Footprints className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                Saved to your observations so you can show the pattern at your next visit.
              </p>
            </Card>
          ) : null}

          <Card className="card-pad">
            <SectionHeading
              eyebrow="Sharing"
              title="My care team"
              description="Only people you link can see this record. Your journal stays private no matter what."
              actions={
                !delivered ? (
                  <Button variant="secondary" size="sm" onClick={() => setCareOpen(true)} icon={<UserPlus className="size-4" aria-hidden />}>
                    Link a provider
                  </Button>
                ) : undefined
              }
            />
            {(careLinks ?? []).length === 0 ? (
              <EmptyState
                className="mt-2"
                icon={<Stethoscope className="size-6" aria-hidden />}
                title="Nobody is linked"
                description="Link the midwife or doctor who cares for you and they will see your pregnancy record, appointments and observations."
              />
            ) : (
              <ul className="mt-3 space-y-2">
                {(careLinks ?? []).map((link: CareLink) => (
                  <li key={link.id} className="flex items-start justify-between gap-3 rounded-lg border border-ink-100 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-800">{link.providerName}</p>
                      <p className="truncate text-xs text-ink-500">
                        {link.facilityName} · {link.status === 'active' ? 'active' : link.status === 'requested' ? 'awaiting confirmation' : 'revoked'}
                      </p>
                    </div>
                    {link.status !== 'revoked' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          const ok = await confirm({
                            title: `Remove ${link.providerName}?`,
                            message: 'They will lose access to your record immediately. You can link them again later.',
                            confirmLabel: 'Remove access',
                            tone: 'danger',
                          });
                          if (!ok) return;
                          await careLinkRepo.update(link.id, { status: 'revoked' });
                          toast.success('Access removed');
                          void reloadCare();
                        }}
                      >
                        <X className="size-4" aria-hidden />
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {!delivered && !ended ? (
            <Card className="card-pad border-ink-200">
              <h3 className="card-title">If this pregnancy ended without a birth</h3>
              <p className="mt-1 text-sm text-ink-600">
                You can close the record so the tracker stops counting. It stays in your history, and nothing is deleted.
              </p>
              <div className="mt-3">
                <Button variant="outline-danger" size="sm" onClick={() => void endPregnancy()}>
                  Close this record
                </Button>
              </div>
            </Card>
          ) : null}
        </div>
      </div>

      <EditDatesModal
        open={editOpen}
        pregnancy={pregnancy}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false);
          onChanged();
        }}
      />

      <ObservationModal
        open={observationOpen}
        pregnancyId={pregnancy.id}
        weekNumber={ga.valid ? ga.weeks : null}
        uid={uid}
        onClose={() => setObservationOpen(false)}
        onSaved={() => {
          setObservationOpen(false);
          void reloadObservations();
        }}
      />

      <DeliveryModal
        open={deliveryOpen}
        pregnancy={pregnancy}
        onClose={() => setDeliveryOpen(false)}
        onSaved={() => {
          setDeliveryOpen(false);
          onChanged();
          navigate('/app/baby');
        }}
      />

      <LinkProviderModal
        open={careOpen}
        onClose={() => setCareOpen(false)}
        onLinked={() => {
          setCareOpen(false);
          void reloadCare();
        }}
      />
    </>
  );
}

/** Approximate calendar date for a routine visit, from whichever anchor exists. */
function aroundDate(pregnancy: Pregnancy, week: number): string {
  const anchor = pregnancy.lmpDate ? new Date(pregnancy.lmpDate) : pregnancy.eddDate ? new Date(new Date(pregnancy.eddDate).getTime() - 280 * 86_400_000) : null;
  if (!anchor) return '';
  const date = new Date(anchor.getTime() + week * 7 * 86_400_000);
  const diff = daysBetween(new Date(), date);
  return `${formatDate(date, 'long')} · ${diff >= 0 ? `in ${diff} days` : `${Math.abs(diff)} days ago`}`;
}

/* ── Modals ────────────────────────────────────────────────────────────── */

function EditDatesModal({
  open,
  pregnancy,
  onClose,
  onSaved,
}: {
  open: boolean;
  pregnancy: Pregnancy;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [lmpDate, setLmpDate] = useState(pregnancy.lmpDate ?? '');
  const [eddDate, setEddDate] = useState(pregnancy.eddDate ?? '');
  const [datingMethod, setDatingMethod] = useState(pregnancy.datingMethod);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async (): Promise<void> => {
    const result = validate(pregnancySetupSchema, {
      lmpDate,
      eddDate,
      datingMethod,
      previousPregnancies: pregnancy.previousPregnancies,
      previousLiveBirths: pregnancy.previousLiveBirths,
    });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await pregnancyRepo.update(pregnancy.id, {
        lmpDate: result.value.lmpDate || null,
        eddDate: result.value.eddDate || null,
        datingMethod: result.value.datingMethod,
      });
      toast.success('Dates updated', 'The week number and schedule have been recalculated.');
      onSaved();
    } catch {
      toast.error('That did not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit your pregnancy dates"
      description="Use this when a scan changes your due date, or when you remember your dates differently."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={saving}>
            Save dates
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="First day of your last period" htmlFor="edit-lmp" error={errors.lmpDate}>
          <TextInput id="edit-lmp" type="date" value={lmpDate} onValueChange={setLmpDate} invalid={Boolean(errors.lmpDate)} />
        </Field>
        <Field label="Expected due date" htmlFor="edit-edd" error={errors.eddDate}>
          <TextInput id="edit-edd" type="date" value={eddDate} onValueChange={setEddDate} invalid={Boolean(errors.eddDate)} />
        </Field>
        <Field label="How were these dates determined?" htmlFor="edit-method">
          <Select
            id="edit-method"
            value={datingMethod}
            onChange={(event) => setDatingMethod(event.target.value as Pregnancy['datingMethod'])}
            options={[
              { value: 'lmp', label: 'From my last period' },
              { value: 'ultrasound', label: 'From an ultrasound scan' },
              { value: 'clinician', label: 'Given by a clinician' },
              { value: 'unknown', label: 'Not sure' },
            ]}
          />
        </Field>
      </div>
    </Modal>
  );
}

function ObservationModal({
  open,
  pregnancyId,
  weekNumber,
  uid,
  onClose,
  onSaved,
}: {
  open: boolean;
  pregnancyId: string;
  weekNumber: number | null;
  uid: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [kind, setKind] = useState<Observation['kind']>('weight');
  const [value, setValue] = useState('');
  const [notes, setNotes] = useState('');
  const [recordedBy, setRecordedBy] = useState<'self' | 'provider'>('self');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unit = OBSERVATION_KINDS.find((option) => option.value === kind)?.unit ?? null;

  const submit = async (): Promise<void> => {
    setError(null);
    const label = OBSERVATION_KINDS.find((option) => option.value === kind)?.label ?? 'Observation';
    if (!value.trim()) {
      setError('Enter the reading or what you noticed.');
      return;
    }
    if (kind === 'blood-pressure' && !parseBloodPressure(value.trim())) {
      setError('Blood pressure should look like 120/80. It is stored exactly as written — Mama Care does not interpret it.');
      return;
    }
    setSaving(true);
    try {
      const bp = kind === 'blood-pressure' ? parseBloodPressure(value.trim()) : null;
      await observationRepo.create({
        userId: uid ?? '',
        pregnancyId,
        kind,
        label,
        value: value.trim(),
        systolic: bp?.systolic ?? null,
        diastolic: bp?.diastolic ?? null,
        unit,
        weekNumber,
        recordedBy,
        appointmentId: null,
        notes: notes.trim() || null,
      } as Omit<Observation, 'id' | 'createdAt' | 'updatedAt'>);
      toast.success('Entry saved', `${label}: ${value.trim()}${unit ? ` ${unit}` : ''}`);
      setValue('');
      setNotes('');
      onSaved();
    } catch {
      setError('That did not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add an observation"
      description="Mama Care records what you enter and never interprets it. Show these entries at your next visit."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={saving}>
            Save entry
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="What are you recording?" htmlFor="obs-kind">
          <Select
            id="obs-kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as Observation['kind'])}
            options={OBSERVATION_KINDS.map((option) => ({ value: option.value, label: option.label }))}
          />
        </Field>

        <Field
          label={kind === 'symptom' || kind === 'mood' ? 'Describe it' : 'Reading'}
          htmlFor="obs-value"
          hint={kind === 'blood-pressure' ? 'For example 118/76' : unit ? `In ${unit}` : undefined}
        >
          <TextInput
            id="obs-value"
            value={value}
            onValueChange={setValue}
            inputMode={unit ? 'decimal' : 'text'}
            placeholder={kind === 'blood-pressure' ? '118/76' : kind === 'weight' ? '68.5' : 'e.g. mild ankle swelling in the evening'}
          />
        </Field>

        <Field label="Who recorded it?" htmlFor="obs-by">
          <Select
            id="obs-by"
            value={recordedBy}
            onChange={(event) => setRecordedBy(event.target.value as 'self' | 'provider')}
            options={[
              { value: 'self', label: 'Me, at home' },
              { value: 'provider', label: 'A healthcare provider, at a visit' },
            ]}
          />
        </Field>

        <Field label="Notes (optional)" htmlFor="obs-notes">
          <TextArea id="obs-notes" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Anything that helps you remember the context." />
        </Field>

        {error ? <p className="alert alert-error">{error}</p> : null}

        <p className="text-xs text-ink-500">
          A reading outside what you expect is not a diagnosis. If you are worried — especially about blood pressure,
          bleeding or reduced movement — contact your facility.
        </p>
      </div>
    </Modal>
  );
}

function DeliveryModal({
  open,
  pregnancy,
  onClose,
  onSaved,
}: {
  open: boolean;
  pregnancy: Pregnancy;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [deliveryDate, setDeliveryDate] = useState(toIsoDate(new Date()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setError(null);
    if (!deliveryDate) {
      setError('Enter the date your baby was born.');
      return;
    }
    if (daysBetween(new Date(deliveryDate), new Date()) < 0) {
      setError('That date is in the future.');
      return;
    }
    setSaving(true);
    try {
      await pregnancyRepo.recordDelivery(pregnancy.id, deliveryDate);
      toast.success('Congratulations', 'Mama Care has switched to Mother & Baby mode.');
      onSaved();
    } catch {
      setError('That did not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Your baby has been born"
      description="This switches Mama Care to Mother & Baby mode: the pregnancy record is kept, and the baby screens take over."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Not yet
          </Button>
          <Button onClick={() => void submit()} loading={saving}>
            Save and continue
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Date of birth" htmlFor="delivery-date" error={error ?? undefined}>
          <TextInput
            id="delivery-date"
            type="date"
            value={deliveryDate}
            max={toIsoDate(new Date())}
            onValueChange={setDeliveryDate}
            invalid={Boolean(error)}
          />
        </Field>
        <p className="text-sm text-ink-600">
          Next you can add your baby's name, weight and length, and Mama Care will generate the national immunization
          schedule from the date of birth.
        </p>
        {error ? <p className="alert alert-error">{error}</p> : null}
      </div>
    </Modal>
  );
}

function LinkProviderModal({ open, onClose, onLinked }: { open: boolean; onClose: () => void; onLinked: () => void }) {
  const { actor } = useSession();
  const toast = useToast();
  const { data: directory, loading } = useAsync(() => providerRepo.directory(), { deps: [], immediate: open });
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    const provider = (directory ?? []).find((candidate) => candidate.id === selected);
    if (!provider) {
      setError('Choose a provider from the list.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await careLinkRepo.create({
        motherUserId: actor?.uid ?? '',
        motherName: actor?.displayName ?? '',
        providerUserId: provider.userId,
        providerId: provider.id,
        providerName: provider.fullName,
        facilityId: provider.facilityId,
        facilityName: provider.facilityName,
        grantedBy: 'mother',
        status: provider.userId ? 'active' : 'requested',
        note: note.trim() || null,
      } as Omit<CareLink, 'id' | 'createdAt' | 'updatedAt'>);
      toast.success(
        'Care linked',
        provider.userId
          ? `${provider.fullName} can now see your pregnancy record.`
          : 'Your request was recorded. It becomes active once this provider has an account.',
      );
      setSelected(null);
      setNote('');
      onLinked();
    } catch {
      setError('That did not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Link a healthcare provider"
      description="They will see your pregnancy record, appointments and observations — never your journal. You can remove access at any time."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={saving} disabled={!selected}>
            Link provider
          </Button>
        </>
      }
    >
      {loading ? <LoadingRows rows={3} /> : null}
      {!loading && (directory ?? []).length === 0 ? (
        <EmptyState
          title="No verified providers yet"
          description="Providers appear here once an administrator has verified them. You can also ask your clinic to register."
        />
      ) : null}
      {!loading && (directory ?? []).length > 0 ? (
        <div className="space-y-4">
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {(directory ?? []).map((provider) => (
              <label
                key={provider.id}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${selected === provider.id ? 'border-brand-500 bg-brand-50' : 'border-ink-200'}`}
              >
                <input
                  type="radio"
                  name="provider"
                  value={provider.id}
                  checked={selected === provider.id}
                  onChange={() => setSelected(provider.id)}
                  className="mt-1 size-4 accent-brand-700"
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink-800">{provider.fullName}</span>
                  <span className="block truncate text-xs text-ink-500">
                    {provider.title ? `${provider.title} · ` : ''}
                    {provider.facilityName}
                  </span>
                  {provider.userId ? null : <Badge tone="amber">No account yet</Badge>}
                </span>
              </label>
            ))}
          </div>
          <Field label="Note for them (optional)" htmlFor="care-note">
            <TextArea id="care-note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. I attend the Tuesday antenatal clinic." />
          </Field>
          {error ? <p className="alert alert-error">{error}</p> : null}
        </div>
      ) : null}
    </Modal>
  );
}
