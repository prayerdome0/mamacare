/**
 * My baby.
 *
 * Three things a mother actually needs after birth: who this baby is and how old
 * they are, what is coming up in the national immunization schedule, and whether
 * what she is seeing is normal. Everything else on this screen supports those.
 *
 * Immunization dates are generated from the date of birth using the Zambia EPI
 * routine schedule, then stored as records so "given", "missed" and the batch
 * number survive a reinstall. Marking a dose given is a record of what a clinic
 * did — never a recommendation to skip or add one.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Baby as BabyIcon,
  CalendarCheck,
  Check,
  Pencil,
  Plus,
  Ruler,
  Syringe,
  Trash2,
  Weight,
} from 'lucide-react';
import {useAsync} from '@/hooks';
import { useMotherContext } from '@/hooks/use-mother';
import { babyRepo, immunizationRepo, observationRepo } from '@/services/repositories';
import { useConfirm, useSession } from '@/providers/app-providers';
import { babySchema, validate } from '@/lib/validation';
import { REVIEWED, SCHEDULE_LABEL, AFTER_VACCINATION } from '@/config/immunization';
import { ageInMonths, formatBabyAge } from '@/config/baby-development';
import { formatDate, relativeTime, toIsoDate } from '@/lib/utils';
import { type Baby, type BabySex, type ImmunizationRecord, type Observation } from '@/types/domain';
import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { ImageUploader, type ImageUploadResult } from '@/components/media/image-uploader';
import { Button } from '@/components/ui/button';
import { Card, KeyValue, SectionHeading, StatCard } from '@/components/ui/card';
import { Badge, EmptyState, ErrorState, LoadingRows } from '@/components/ui/display';
import { Field, FieldGrid, NumberField, Select, TextArea, TextInput } from '@/components/ui/form';
import { Modal } from '@/components/ui/overlay';
import { Tabs, Timeline } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

const SEX_LABELS: Record<BabySex, string> = { female: 'Girl', male: 'Boy', undisclosed: 'Not recorded' };

const STATUS_TONE: Record<ImmunizationRecord['status'], 'green' | 'brand' | 'red' | 'neutral'> = {
  given: 'green',
  upcoming: 'brand',
  missed: 'red',
  skipped: 'neutral',
};

export default function BabyPage() {
  const mother = useMotherContext();
  const { actor } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const uid = actor?.uid ?? '';

  const [tab, setTab] = useState('overview');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Baby | null>(null);
  const [doseFor, setDoseFor] = useState<ImmunizationRecord | null>(null);
  const [growthOpen, setGrowthOpen] = useState(false);

  const activeBaby = mother.activeBaby;
  const babies = mother.babies;

  const { data: doses, loading: dosesLoading, error: dosesError, run: reloadDoses } = useAsync(
    async () => {
      if (!activeBaby) return [] as ImmunizationRecord[];
      /* Generating the schedule on first open is what makes the card useful on
       * day one — the mother does not have to enter eleven dates by hand. */
      return immunizationRepo.ensureSchedule(activeBaby);
    },
    { deps: [activeBaby?.id], immediate: Boolean(activeBaby) },
  );

  const { data: observations, run: reloadObservations } = useAsync(
    () => (uid ? observationRepo.list(uid) : Promise.resolve([] as Observation[])),
    { deps: [uid, activeBaby?.id], immediate: Boolean(uid) },
  );

  const growth = useMemo(
    () =>
      (observations ?? []).filter(
        (observation) =>
          activeBaby &&
          (observation.kind === 'weight' || observation.kind === 'height') &&
          observation.label.startsWith(activeBaby.name),
      ),
    [observations, activeBaby],
  );

  useEffect(() => {
    document.title = activeBaby ? `${activeBaby.name} · Mama Care` : 'My baby · Mama Care';
  }, [activeBaby]);

  const removeBaby = async (baby: Baby): Promise<void> => {
    const ok = await confirm({
      title: `Remove ${baby.name}'s record?`,
      message:
        'The baby profile and its immunization records are deleted. This cannot be undone from the app. If you only want to correct something, edit the record instead.',
      confirmLabel: 'Remove record',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const schedule = await immunizationRepo.list(baby.id);
      for (const dose of schedule) await immunizationRepo.remove(dose.id);
      await babyRepo.remove(baby.id);
      toast.success('Record removed');
      mother.refresh();
    } catch {
      toast.error('That did not delete');
    }
  };

  if (!mother.loading && babies.length === 0) {
    return (
      <AppShell>
        <PageHeader
          title="My baby"
          description="Add your baby and Mama Care will keep their immunization card, growth notes and development stage in one place."
        />
        <EmptyState
          icon={<BabyIcon className="size-6" aria-hidden />}
          title="No baby added yet"
          description="You need only a name and a date of birth. Everything else — the immunization schedule, the development stage — is generated from that."
          action={
            <Button variant="primary" size="sm" onClick={() => setFormOpen(true)} icon={<Plus className="size-4" aria-hidden />}>
              Add my baby
            </Button>
          }
        />
        <Card className="card-pad mt-6 border-ink-200 bg-ink-50">
          <h3 className="card-title">Still pregnant?</h3>
          <p className="mt-1 text-sm text-ink-600">
            The baby screens are for after birth. Before then, your weekly guide and tracker are on the pregnancy screens.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/app/pregnancy" className="btn btn-secondary btn-sm">
              Pregnancy tracker
            </Link>
            <Link to="/app/guide" className="btn btn-ghost btn-sm">
              Weekly guide
            </Link>
          </div>
        </Card>
        <BabyFormModal
          open={formOpen}
          baby={null}
          pregnancyId={mother.pregnancy?.id ?? null}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            mother.refresh();
          }}
        />
      </AppShell>
    );
  }

  if (mother.loading) {
    return (
      <AppShell>
        <PageHeader title="My baby" />
        <LoadingRows rows={4} />
      </AppShell>
    );
  }

  const schedule = doses ?? [];
  const given = schedule.filter((dose) => dose.status === 'given');
  const nextDose = schedule.find((dose) => dose.status === 'upcoming' && dose.scheduledDate >= toIsoDate(new Date())) ?? schedule.find((dose) => dose.status === 'upcoming') ?? null;
  const age = activeBaby ? ageInMonths(activeBaby.dateOfBirth) : null;

  return (
    <AppShell>
      <PageHeader
        title={activeBaby ? activeBaby.name : 'My baby'}
        description={activeBaby ? `${formatBabyAge(activeBaby.dateOfBirth)} · born ${formatDate(activeBaby.dateOfBirth, 'long')}` : undefined}
        badge={age ? <Badge tone="brand">{age.months} month{age.months === 1 ? '' : 's'}</Badge> : undefined}
        actions={
          <>
            {activeBaby ? (
              <Button variant="secondary" size="sm" onClick={() => setEditing(activeBaby)} icon={<Pencil className="size-4" aria-hidden />}>
                Edit
              </Button>
            ) : null}
            <Button variant="primary" size="sm" onClick={() => setFormOpen(true)} icon={<Plus className="size-4" aria-hidden />}>
              Add baby
            </Button>
          </>
        }
      />

      {babies.length > 1 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {babies.map((baby) => (
            <button
              key={baby.id}
              type="button"
              className={cn('chip', baby.id === activeBaby?.id && 'chip-active')}
              aria-pressed={baby.id === activeBaby?.id}
              onClick={() => mother.setActiveBabyId(baby.id)}
            >
              {baby.name} · {formatBabyAge(baby.dateOfBirth)}
            </button>
          ))}
        </div>
      ) : null}

      {!activeBaby ? null : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Age"
              value={age ? `${age.months} mo` : '—'}
              hint={age && age.days > 0 ? `${age.days} day${age.days === 1 ? '' : 's'}` : undefined}
              icon={<BabyIcon className="size-4" aria-hidden />}
            />
            <StatCard
              label="Doses given"
              value={given.length}
              hint={`of ${schedule.length} scheduled`}
              icon={<Syringe className="size-4" aria-hidden />}
              tone="green"
            />
            <StatCard
              label="Next due"
              value={nextDose ? nextDose.vaccineName.split(' ')[0] ?? '—' : '—'}
              hint={nextDose ? `${nextDose.dose} · ${formatDate(nextDose.scheduledDate, 'day')}` : 'Schedule complete'}
              icon={<CalendarCheck className="size-4" aria-hidden />}
              tone="brand"
            />
          </div>

          <div className="mt-6">
          <Tabs
            value={tab}
            onChange={setTab}
            ariaLabel="Baby sections"
            items={[
              { id: 'overview', label: 'Overview' },
              { id: 'immunization', label: 'Immunization card', count: schedule.length },
              { id: 'growth', label: 'Growth notes', count: growth.length },
            ]}
          />
          </div>

          {tab === 'overview' ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <div className="space-y-4">
                <Card className="card-pad">
                  <div className="flex flex-wrap items-start gap-4">
                    {activeBaby.photoUrl ? (
                      <img src={activeBaby.photoUrl} alt={activeBaby.name} className="size-20 rounded-xl object-cover" />
                    ) : (
                      <span className="avatar-lg bg-brand-600 text-brand-50" aria-hidden>
                        {activeBaby.name.slice(0, 1)}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <KeyValue
                        columns={2}
                        items={[
                          { label: 'Name', value: activeBaby.name, tone: 'strong' },
                          { label: 'Date of birth', value: formatDate(activeBaby.dateOfBirth, 'long'), tone: 'strong' },
                          { label: 'Sex', value: SEX_LABELS[activeBaby.sex] },
                          { label: 'Birth weight', value: activeBaby.birthWeightKg ? `${activeBaby.birthWeightKg} kg` : '—' },
                          { label: 'Birth length', value: activeBaby.birthLengthCm ? `${activeBaby.birthLengthCm} cm` : '—' },
                          { label: 'Head circumference', value: activeBaby.headCircumferenceCm ? `${activeBaby.headCircumferenceCm} cm` : '—' },
                        ]}
                      />
                      {activeBaby.birthNotes ? <p className="mt-3 text-sm text-ink-600">{activeBaby.birthNotes}</p> : null}
                    </div>
                  </div>
                </Card>

                <Card className="card-pad">
                  <SectionHeading eyebrow="Right now" title="Development stage" />
                  <p className="mt-2 text-sm text-ink-600">
                    {activeBaby.name} is {formatBabyAge(activeBaby.dateOfBirth)}. The guide opens on the stage they are in
                    — feeding, sleep, what they are learning, and the things worth mentioning at a clinic visit.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link to="/app/guide" className="btn btn-primary btn-sm">
                      Open the baby guide
                    </Link>
                    <Link to="/app/learn/newborn" className="btn btn-secondary btn-sm">
                      Newborn care articles
                    </Link>
                  </div>
                </Card>

                <Card className="card-pad border-[var(--color-risk-red-border)] bg-[var(--color-risk-red-soft)]">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 size-5 shrink-0 text-[var(--color-risk-red)]" aria-hidden />
                    <div>
                      <h3 className="card-title">Newborn danger signs</h3>
                      <p className="mt-1 text-sm text-ink-700">
                        Not feeding, fast or difficult breathing, fever or a low temperature, unusual sleepiness,
                        convulsions, a swollen or red umbilical stump, or yellow palms and soles — go to a facility now.
                      </p>
                      <div className="mt-3">
                        <Link to="/app/emergency" className="btn btn-danger btn-sm">
                          Full list & what to do
                        </Link>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>

              <div className="space-y-4">
                {nextDose ? (
                  <Card className="card-pad border-brand-200 bg-brand-50/40">
                    <p className="micro">Next immunization</p>
                    <p className="mt-1 text-base font-bold text-ink-900">
                      {nextDose.vaccineName} · {nextDose.dose}
                    </p>
                    <p className="mt-1 text-sm text-ink-600">
                      {nextDose.scheduledAgeLabel} · due {formatDate(nextDose.scheduledDate, 'long')} ({relativeTime(nextDose.scheduledDate)})
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button variant="primary" size="sm" onClick={() => setTab('immunization')}>
                        Open card
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setDoseFor(nextDose)} icon={<Check className="size-4" aria-hidden />}>
                        Mark given
                      </Button>
                    </div>
                  </Card>
                ) : null}

                <Card className="card-pad">
                  <h3 className="card-title">Postnatal checks</h3>
                  <ul className="checklist mt-2">
                    <li>Mother and baby are both checked within 24 hours of birth, and again at 3–6 days.</li>
                    <li>The six-week postnatal visit covers you and the baby together.</li>
                    <li>Exclusive breastfeeding for the first six months, unless a clinician advises otherwise.</li>
                  </ul>
                  <div className="mt-3">
                    <Link to="/app/appointments" className="btn btn-secondary btn-sm">
                      Add a postnatal appointment
                    </Link>
                  </div>
                </Card>

                <Card className="card-pad">
                  <h3 className="card-title">Keep the paper card too</h3>
                  <p className="mt-1 text-sm text-ink-600">
                    This screen is a copy for you. Clinics ask for the Under-Five growth and immunization card, so keep the
                    physical card safe and bring it to every visit.
                  </p>
                </Card>

                <Card className="card-pad border-ink-200">
                  <h3 className="card-title">Remove this record</h3>
                  <p className="mt-1 text-xs text-ink-600">
                    Deletes {activeBaby.name}'s profile and immunization records from Mama Care.
                  </p>
                  <div className="mt-3">
                    <Button variant="outline-danger" size="sm" onClick={() => void removeBaby(activeBaby)} icon={<Trash2 className="size-4" aria-hidden />}>
                      Remove baby record
                    </Button>
                  </div>
                </Card>
              </div>
            </div>
          ) : null}

          {tab === 'immunization' ? (
            <div className="mt-4 space-y-4">
              <Card className="card-pad">
                <SectionHeading
                  eyebrow={SCHEDULE_LABEL}
                  title="Immunization card"
                  description={`Generated from ${activeBaby.name}'s date of birth. Reviewed against national guidance (${REVIEWED}). Mark each dose when a clinic gives it.`}
                />
                {dosesError ? <ErrorState className="mt-3" title="The schedule could not be generated" message={dosesError} onRetry={reloadDoses} /> : null}
                {dosesLoading ? <LoadingRows className="mt-3" rows={5} /> : null}
              </Card>

              {!dosesLoading && schedule.length > 0 ? (
                <Card className="card-pad">
                  <Timeline
                    items={schedule.map((dose) => {
                      const overdue = dose.status === 'upcoming' && dose.scheduledDate < toIsoDate(new Date());
                      return {
                        title: (
                          <span className="flex flex-wrap items-center gap-2">
                            {dose.vaccineName} · {dose.dose}
                            <Badge tone={dose.status === 'given' ? 'green' : overdue ? 'red' : 'neutral'}>
                              {dose.status === 'given' ? 'Given' : overdue ? 'Overdue' : 'Upcoming'}
                            </Badge>
                          </span>
                        ),
                        meta: `${dose.scheduledAgeLabel} · ${formatDate(dose.scheduledDate, 'long')}${dose.givenDate ? ` · given ${formatDate(dose.givenDate, 'long')}` : ''}${dose.facilityName ? ` · ${dose.facilityName}` : ''}`,
                        detail: dose.notes ?? undefined,
                        tone: dose.status === 'given' ? 'green' : overdue ? 'red' : 'brand',
                        icon: dose.status === 'given' ? <Check className="size-3" aria-hidden /> : undefined,
                      };
                    })}
                  />
                  <div className="mt-4 overflow-x-auto">
                    <table className="table-base">
                      <caption className="caption">Doses recorded for {activeBaby.name}</caption>
                      <thead>
                        <tr>
                          <th className="table-th">Vaccine</th>
                          <th className="table-th">Dose</th>
                          <th className="table-th">Age</th>
                          <th className="table-th">Scheduled</th>
                          <th className="table-th">Status</th>
                          <th className="table-th text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {schedule.map((dose) => (
                          <tr key={dose.id} className="table-row">
                            <td className="table-td font-medium text-ink-800">{dose.vaccineName}</td>
                            <td className="table-td">{dose.dose}</td>
                            <td className="table-td">{dose.scheduledAgeLabel}</td>
                            <td className="table-td">{formatDate(dose.scheduledDate, 'day')}</td>
                            <td className="table-td">
                              <Badge tone={STATUS_TONE[dose.status] ?? 'neutral'}>
                                {dose.status === 'given' ? `Given ${dose.givenDate ? formatDate(dose.givenDate, 'day') : ''}`.trim() : dose.status}
                              </Badge>
                            </td>
                            <td className="table-td text-right">
                              {dose.status === 'given' ? (
                                <Button variant="ghost" size="sm" onClick={() => setDoseFor(dose)}>
                                  Edit
                                </Button>
                              ) : (
                                <Button variant="secondary" size="sm" onClick={() => setDoseFor(dose)}>
                                  Mark given
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-3">
                <Card className="card-pad">
                  <h3 className="card-title">Normal afterwards</h3>
                  <ul className="checklist mt-2">
                    {AFTER_VACCINATION.common.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </Card>
                <Card className="card-pad">
                  <h3 className="card-title">How to comfort</h3>
                  <ul className="checklist mt-2">
                    {AFTER_VACCINATION.comfort.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </Card>
                <Card className="card-pad border-[var(--color-risk-red-border)] bg-[var(--color-risk-red-soft)]">
                  <h3 className="card-title">Seek care if</h3>
                  <ul className="mt-2 space-y-1.5">
                    {AFTER_VACCINATION.seekCare.map((item) => (
                      <li key={item} className="flex gap-2 text-sm text-ink-800">
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--color-risk-red)]" aria-hidden />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3">
                    <Link to="/app/emergency" className="btn btn-danger btn-sm">
                      Emergency guidance
                    </Link>
                  </div>
                </Card>
              </div>
            </div>
          ) : null}

          {tab === 'growth' ? (
            <div className="mt-4 space-y-4">
              <Card className="card-pad">
                <SectionHeading
                  eyebrow="Between visits"
                  title="Growth notes"
                  description="Weight and length recorded at a clinic, or at home if you have a scale. Mama Care stores the numbers; a clinician plots them on a growth chart."
                  actions={
                    <Button variant="primary" size="sm" onClick={() => setGrowthOpen(true)} icon={<Plus className="size-4" aria-hidden />}>
                      Add measurement
                    </Button>
                  }
                />
                {growth.length === 0 ? (
                  <EmptyState
                    className="mt-3"
                    icon={<Weight className="size-6" aria-hidden />}
                    title="No measurements yet"
                    description="Add the birth weight from the clinic card, then each weight taken at a visit. The trend matters more than any single number."
                  />
                ) : (
                  <ul className="mt-3 divide-y divide-ink-100">
                    {growth.map((entry) => (
                      <li key={entry.id} className="flex items-center justify-between gap-3 py-2">
                        <span className="min-w-0">
                          <span className="flex items-center gap-2 text-sm font-medium text-ink-800">
                            {entry.kind === 'weight' ? <Weight className="size-4 text-brand-700" aria-hidden /> : <Ruler className="size-4 text-brand-700" aria-hidden />}
                            {entry.value}
                            {entry.unit ? <span className="text-xs text-ink-500">{entry.unit}</span> : null}
                          </span>
                          <span className="mt-0.5 block text-xs text-ink-500">
                            {formatDate(entry.createdAt, 'long')} · {entry.recordedBy === 'provider' ? 'at a clinic' : 'recorded by you'}
                            {entry.notes ? ` · ${entry.notes}` : ''}
                          </span>
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Delete measurement"
                          onClick={async () => {
                            await observationRepo.remove(entry.id);
                            void reloadObservations();
                          }}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card className="card-pad border-ink-200 bg-ink-50">
                <p className="text-sm leading-relaxed text-ink-700">
                  A single weight cannot tell you whether a baby is thriving. Clinicians look at the curve over time,
                  feeding, and how the baby behaves. If feeding is going badly, or the baby is losing weight, go to a
                  clinic rather than waiting for the next measurement.
                </p>
              </Card>
            </div>
          ) : null}
        </>
      )}

      <BabyFormModal
        open={formOpen}
        baby={null}
        pregnancyId={mother.pregnancy?.id ?? null}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          mother.refresh();
        }}
      />

      <BabyFormModal
        open={Boolean(editing)}
        baby={editing}
        pregnancyId={mother.pregnancy?.id ?? null}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          mother.refresh();
        }}
      />

      <DoseModal
        dose={doseFor}
        babyName={activeBaby?.name ?? ''}
        onClose={() => setDoseFor(null)}
        onSaved={() => {
          setDoseFor(null);
          void reloadDoses();
        }}
      />

      <GrowthModal
        open={growthOpen}
        baby={activeBaby}
        uid={uid}
        onClose={() => setGrowthOpen(false)}
        onSaved={() => {
          setGrowthOpen(false);
          void reloadObservations();
        }}
      />
    </AppShell>
  );
}

/* ── Baby form ─────────────────────────────────────────────────────────── */

function BabyFormModal({
  open,
  baby,
  pregnancyId,
  onClose,
  onSaved,
}: {
  open: boolean;
  baby: Baby | null;
  pregnancyId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [sex, setSex] = useState<BabySex>('female');
  const [birthWeightKg, setBirthWeightKg] = useState('');
  const [birthLengthCm, setBirthLengthCm] = useState('');
  const [headCircumferenceCm, setHeadCircumferenceCm] = useState('');
  const [birthNotes, setBirthNotes] = useState('');
  const [photo, setPhoto] = useState<ImageUploadResult | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(baby?.name ?? '');
    setDateOfBirth(baby?.dateOfBirth ?? toIsoDate(new Date()));
    setSex(baby?.sex ?? 'female');
    setBirthWeightKg(baby?.birthWeightKg ? String(baby.birthWeightKg) : '');
    setBirthLengthCm(baby?.birthLengthCm ? String(baby.birthLengthCm) : '');
    setHeadCircumferenceCm(baby?.headCircumferenceCm ? String(baby.headCircumferenceCm) : '');
    setBirthNotes(baby?.birthNotes ?? '');
    setPhoto(baby?.photoUrl ? { publicId: baby.photoPublicId, secureUrl: baby.photoUrl } : null);
    setErrors({});
  }, [open, baby]);

  const submit = async (): Promise<void> => {
    const result = validate(babySchema, {
      name,
      dateOfBirth,
      sex,
      birthWeightKg: birthWeightKg || undefined,
      birthLengthCm: birthLengthCm || undefined,
      headCircumferenceCm: headCircumferenceCm || undefined,
      birthNotes,
    });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setSaving(true);
    const value = result.value;
    const payload = {
      name: value.name,
      dateOfBirth: value.dateOfBirth,
      sex: value.sex,
      birthWeightKg: value.birthWeightKg ?? null,
      birthLengthCm: value.birthLengthCm ?? null,
      headCircumferenceCm: value.headCircumferenceCm ?? null,
      birthNotes: value.birthNotes || null,
      photoUrl: photo?.secureUrl ?? null,
      photoPublicId: photo?.publicId ?? null,
      pregnancyId,
    };
    try {
      if (baby) {
        await babyRepo.update(baby.id, payload);
        toast.success('Baby record updated', value.name);
      } else {
        const created = await babyRepo.create(payload);
        /* The schedule is generated immediately so the card is useful on day one. */
        await immunizationRepo.ensureSchedule(created);
        toast.success('Baby added', `${value.name}'s immunization card is ready.`);
      }
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
      title={baby ? `Edit ${baby.name}` : 'Add your baby'}
      description="Name and date of birth are enough. The immunization schedule and development stage are generated from the date."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={saving}>
            {baby ? 'Save changes' : 'Add baby'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FieldGrid columns={2}>
          <Field label="Baby's name" htmlFor="baby-name" error={errors.name} required>
            <TextInput id="baby-name" value={name} onValueChange={setName} placeholder="e.g. Mutale" invalid={Boolean(errors.name)} />
          </Field>
          <Field label="Date of birth" htmlFor="baby-dob" error={errors.dateOfBirth} required>
            <TextInput
              id="baby-dob"
              type="date"
              value={dateOfBirth}
              max={toIsoDate(new Date())}
              onValueChange={setDateOfBirth}
              invalid={Boolean(errors.dateOfBirth)}
            />
          </Field>
        </FieldGrid>

        <Field label="Sex" htmlFor="baby-sex">
          <Select
            id="baby-sex"
            value={sex}
            onChange={(event) => setSex(event.target.value as BabySex)}
            options={[
              { value: 'female', label: SEX_LABELS.female },
              { value: 'male', label: SEX_LABELS.male },
              { value: 'undisclosed', label: SEX_LABELS.undisclosed },
            ]}
          />
        </Field>

        <FieldGrid columns={3}>
          <NumberField label="Birth weight" unit="kg" value={birthWeightKg} onValueChange={setBirthWeightKg} min={0.3} max={8} step={0.01} error={errors.birthWeightKg} placeholder="3.2" />
          <NumberField label="Birth length" unit="cm" value={birthLengthCm} onValueChange={setBirthLengthCm} min={20} max={70} step={0.1} error={errors.birthLengthCm} placeholder="49" />
          <NumberField label="Head circumference" unit="cm" value={headCircumferenceCm} onValueChange={setHeadCircumferenceCm} min={15} max={50} step={0.1} error={errors.headCircumferenceCm} placeholder="34" />
        </FieldGrid>

        <Field label="Birth notes (optional)" htmlFor="baby-notes" hint="Anything from the birth record worth keeping — place of birth, complications, feeding at birth.">
          <TextArea id="baby-notes" rows={3} value={birthNotes} onChange={(event) => setBirthNotes(event.target.value)} />
        </Field>

        <ImageUploader
          folder="profiles"
          label="Baby photo"
          value={photo}
          onChange={setPhoto}
          ratio="1 / 1"
          hint="Optional. Stored privately in your Mama Care account, not in the public image library."
        />

        {errors.form ? <p className="alert alert-error">{errors.form}</p> : null}
      </div>
    </Modal>
  );
}

/* ── Immunization dose ─────────────────────────────────────────────────── */

function DoseModal({ dose, babyName, onClose, onSaved }: { dose: ImmunizationRecord | null; babyName: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [givenDate, setGivenDate] = useState('');
  const [facilityName, setFacilityName] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [status, setStatus] = useState<ImmunizationRecord['status']>('given');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!dose) return;
    setGivenDate(dose.givenDate ?? toIsoDate(new Date()));
    setFacilityName(dose.facilityName ?? '');
    setBatchNumber(dose.batchNumber ?? '');
    setStatus(dose.status === 'upcoming' ? 'given' : dose.status);
    setNotes(dose.notes ?? '');
    setError(null);
  }, [dose]);

  if (!dose) return null;

  const submit = async (): Promise<void> => {
    if (status === 'given' && !givenDate) {
      setError('Enter the date the dose was given.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (status === 'given') {
        await immunizationRepo.markGiven(dose.id, {
          givenDate,
          facilityName: facilityName.trim() || null,
          batchNumber: batchNumber.trim() || null,
        });
        if (notes.trim()) await immunizationRepo.update(dose.id, { notes: notes.trim() });
        toast.success('Dose recorded', `${dose.vaccineName} · ${dose.dose}`);
      } else {
        await immunizationRepo.update(dose.id, {
          status,
          givenDate: null,
          notes: notes.trim() || dose.notes,
          facilityName: facilityName.trim() || null,
        });
        toast.success(`Marked as ${status}`);
      }
      onSaved();
    } catch {
      setError('That did not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(dose)}
      onClose={onClose}
      title={`${dose.vaccineName} · ${dose.dose}`}
      description={`${babyName} · scheduled at ${dose.scheduledAgeLabel} (${formatDate(dose.scheduledDate, 'long')}). Record what the clinic did.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Status" htmlFor="dose-status">
          <Select
            id="dose-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as ImmunizationRecord['status'])}
            options={[
              { value: 'given', label: 'Given' },
              { value: 'upcoming', label: 'Still upcoming' },
              { value: 'missed', label: 'Missed — will catch up' },
              { value: 'skipped', label: 'Skipped on clinical advice' },
            ]}
          />
        </Field>

        {status === 'given' ? (
          <Field label="Date given" htmlFor="dose-date" error={error ?? undefined} required>
            <TextInput id="dose-date" type="date" value={givenDate} max={toIsoDate(new Date())} onValueChange={setGivenDate} invalid={Boolean(error)} />
          </Field>
        ) : null}

        <FieldGrid columns={2}>
          <Field label="Facility" htmlFor="dose-facility" optional>
            <TextInput id="dose-facility" value={facilityName} onValueChange={setFacilityName} placeholder="e.g. Chelstone Clinic" />
          </Field>
          <Field label="Batch number" htmlFor="dose-batch" optional hint="From the card, if it was written down.">
            <TextInput id="dose-batch" value={batchNumber} onValueChange={setBatchNumber} />
          </Field>
        </FieldGrid>

        <Field label="Notes" htmlFor="dose-notes" optional>
          <TextArea id="dose-notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="e.g. mild fever that evening, settled by morning." />
        </Field>

        {error ? <p className="alert alert-error">{error}</p> : null}

        <p className="text-xs text-ink-500">
          Only record a dose that a health worker actually gave. If a dose was missed, mark it missed — the catch-up
          schedule is decided by the clinic, not by this app.
        </p>
      </div>
    </Modal>
  );
}

/* ── Growth ────────────────────────────────────────────────────────────── */

function GrowthModal({ open, baby, uid, onClose, onSaved }: { open: boolean; baby: Baby | null; uid: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [kind, setKind] = useState<'weight' | 'height'>('weight');
  const [value, setValue] = useState('');
  const [notes, setNotes] = useState('');
  const [recordedBy, setRecordedBy] = useState<'self' | 'provider'>('provider');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setValue('');
    setNotes('');
    setError(null);
  }, [open]);

  const submit = async (): Promise<void> => {
    if (!baby) return;
    const number = Number(value.replace(',', '.'));
    if (!value.trim() || Number.isNaN(number) || number <= 0) {
      setError('Enter the measurement as a number.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await observationRepo.create({
        userId: uid,
        pregnancyId: baby.pregnancyId,
        kind,
        label: `${baby.name} — ${kind === 'weight' ? 'weight' : 'length'}`,
        value: String(number),
        systolic: null,
        diastolic: null,
        unit: kind === 'weight' ? 'kg' : 'cm',
        weekNumber: null,
        recordedBy,
        appointmentId: null,
        notes: notes.trim() || null,
      } as Omit<Observation, 'id' | 'createdAt' | 'updatedAt'>);
      toast.success('Measurement saved', `${number} ${kind === 'weight' ? 'kg' : 'cm'}`);
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
      title="Add a measurement"
      description="Store the number exactly as it was measured. Mama Care does not plot or interpret growth curves."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={saving}>
            Save measurement
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="What are you recording?" htmlFor="growth-kind">
          <Select
            id="growth-kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as 'weight' | 'height')}
            options={[
              { value: 'weight', label: 'Weight (kg)' },
              { value: 'height', label: 'Length / height (cm)' },
            ]}
          />
        </Field>
        <NumberField
          label={kind === 'weight' ? 'Weight' : 'Length'}
          unit={kind === 'weight' ? 'kg' : 'cm'}
          value={value}
          onValueChange={setValue}
          min={0.3}
          max={kind === 'weight' ? 40 : 130}
          step={0.01}
          error={error}
          placeholder={kind === 'weight' ? '4.6' : '56'}
        />
        <Field label="Who measured it?" htmlFor="growth-by">
          <Select
            id="growth-by"
            value={recordedBy}
            onChange={(event) => setRecordedBy(event.target.value as 'self' | 'provider')}
            options={[
              { value: 'provider', label: 'At a clinic' },
              { value: 'self', label: 'At home' },
            ]}
          />
        </Field>
        <Field label="Notes" htmlFor="growth-notes" optional>
          <TextArea id="growth-notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="e.g. weighed after feeding." />
        </Field>
        {error ? <p className="alert alert-error">{error}</p> : null}
      </div>
    </Modal>
  );
}
