import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { FormDialog, FormSection } from '@/components/forms/form-dialog';
import { CheckboxRow, Field, NumberField, Select, TextArea, TextInput } from '@/components/ui/form';
import { NoticeState } from '@/components/ui/display';
import { useAsync } from '@/hooks';
import { useForm } from '@/hooks/use-form';
import { useConfirm, useSession } from '@/providers/app-providers';
import { useToast } from '@/components/ui/toast';
import { motherSchema, pregnancySchema } from '@/lib/validation';
import { services } from '@/services/session-store';
import { eddFromLmp, gestationalAge, shortGestationalAge } from '@/lib/obstetrics';
import { toIsoDate } from '@/lib/utils';

/**
 * Staff registration of a mother and her current pregnancy.
 *
 * The patient ID is allocated by the server-side sequence (never derived from a
 * name), dating is captured once and everything downstream recalculates from it,
 * and consent is a required, versioned entry — registration is blocked without it.
 */

const RISK_FACTORS = [
  { value: 'AGE_UNDER_18', label: 'Age under 18' },
  { value: 'AGE_OVER_35', label: 'Age 35 or over' },
  { value: 'PARA_OVER_4', label: 'Four or more previous births' },
  { value: 'PREVIOUS_CSECTION', label: 'Previous caesarean' },
  { value: 'MULTIPLE_PREGNANCY', label: 'Multiple pregnancy' },
  { value: 'HYPERTENSION', label: 'Known hypertension' },
  { value: 'DIABETES', label: 'Known diabetes' },
  { value: 'HIV', label: 'Living with HIV' },
  { value: 'TB', label: 'Tuberculosis treatment' },
  { value: 'ANAEMIA', label: 'Anaemia in a previous pregnancy' },
  { value: 'SHORT_INTERVAL', label: 'Less than two years since last birth' },
];

const PREVIOUS_COMPLICATIONS = [
  { value: 'PRE_ECLAMPSIA', label: 'Pre-eclampsia / eclampsia' },
  { value: 'PPH', label: 'Heavy bleeding after birth' },
  { value: 'PRETERM', label: 'Birth before 37 weeks' },
  { value: 'STILLBIRTH', label: 'Previous stillbirth' },
  { value: 'TRANSFUSION', label: 'Blood transfusion' },
  { value: 'BREECH', label: 'Malpresentation / version' },
  { value: 'GDM', label: 'Diabetes in a previous pregnancy' },
];

const LANGUAGES = ['English', 'Nyanja', 'Bemba', 'Tonga', 'Lozi'];

export function RegisterMotherDialog({
  open,
  onClose,
  onRegistered,
}: {
  open: boolean;
  onClose: () => void;
  onRegistered?: (motherId: string) => void;
}) {
  const { actor } = useSession();
  const confirm = useConfirm();
  const toast = useToast();
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [consentMode, setConsentMode] = useState<'SELF' | 'REPRESENTATIVE' | 'VERBAL'>('SELF');
  const [createLogin, setCreateLogin] = useState(false);
  const [chwUserId, setChwUserId] = useState('');

  const facilities = useAsync(() => services().data.allFacilities(), { immediate: open });
  const staff = useAsync(
    async () => {
      const { listStaffForFacility } = await import('@/services/admin/user-admin');
      return listStaffForFacility(actor?.facilityId ?? null, ['COMMUNITY_HEALTH_WORKER']);
    },
    { immediate: open, deps: [actor?.facilityId] },
  );

  const mother = useForm(motherSchema, {
    fullName: '',
    dateOfBirth: '',
    ageYears: '' as unknown as number,
    phone: '',
    alternatePhone: '',
    address: '',
    community: '',
    chiefName: '',
    landmark: '',
    emergencyName: '',
    emergencyRelation: 'Spouse',
    emergencyPhone: '',
    preferredLanguage: 'English',
    literacyLevel: 'PRIMARY',
    maritalStatus: 'MARRIED',
    occupation: '',
    husbandName: '',
    husbandPhone: '',
    bloodGroup: '',
    allergies: '',
    chronicConditions: [],
    registrationFacilityId: actor?.facilityId ?? '',
    assignedChwUserId: '',
    catchmentArea: '',
    consentAccepted: false as unknown as true,
  });

  const pregnancy = useForm(pregnancySchema, {
    gravida: 1 as unknown as number,
    para: 0 as unknown as number,
    livingChildren: 0 as unknown as number,
    lmpDate: '',
    eddDate: '',
    datingMethod: 'LMP',
    confirmedAt: '',
    gestationalWeeks: '' as unknown as number,
    gestationalDays: 0 as unknown as number,
    previousCesarean: false,
    gestationCount: 1,
    previousComplications: [],
    riskFactors: [],
    notes: '',
  });

  const dating = useMemo(() => {
    const ga = gestationalAge({
      lmpDate: pregnancy.values.lmpDate || null,
      eddDate: pregnancy.values.eddDate || null,
      documented:
        pregnancy.values.gestationalWeeks !== undefined && Number.isFinite(Number(pregnancy.values.gestationalWeeks))
          ? { weeks: Number(pregnancy.values.gestationalWeeks), days: Number(pregnancy.values.gestationalDays ?? 0), at: new Date().toISOString() }
          : null,
    });
    const edd = pregnancy.values.lmpDate && !pregnancy.values.eddDate ? eddFromLmp(pregnancy.values.lmpDate) : pregnancy.values.eddDate || null;
    return { ga, edd };
  }, [pregnancy.values]);

  const facilityOptions = useMemo(
    () =>
      (facilities.data ?? [])
        .filter((facility) => facility.active)
        .map((facility) => ({ value: facility.id, label: `${facility.name} — ${facility.district}` })),
    [facilities.data],
  );

  const dirty = mother.dirty || pregnancy.dirty || consentAccepted;

  const toggle = (list: string[], value: string): string[] => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

  const submit = async () => {
    const result = await mother.submit(async () => {
      await pregnancy.validateNow();
      const pregnancyErrors = pregnancy.validateNow();
      if (Object.keys(pregnancyErrors).length > 0) {
        pregnancy.setFieldErrors(pregnancyErrors);
        throw new Error('Check the pregnancy details — the dating, gravida and para fields.');
      }
      if (!consentAccepted) throw new Error('Consent must be recorded before a patient can be registered.');

      const created = await services().data.registerMother({
        ...mother.values,
        ageYears: mother.values.ageYears ? Number(mother.values.ageYears) : null,
        dateOfBirth: mother.values.dateOfBirth || null,
        assignedChwUserId: chwUserId || null,
        consent: {
          accepted: true,
          version: '1.0',
          acceptedAt: new Date().toISOString(),
          acceptedBy: actor?.uid ?? '',
          language: mother.values.preferredLanguage,
          mode: consentMode,
        },
        createPatientLogin: createLogin,
        pregnancy: {
          ...pregnancy.values,
          lmpDate: pregnancy.values.lmpDate || null,
          eddDate: pregnancy.values.eddDate || null,
          confirmedAt: pregnancy.values.confirmedAt || null,
          gestationalWeeks: pregnancy.values.gestationalWeeks ? Number(pregnancy.values.gestationalWeeks) : null,
          gestationalDays: pregnancy.values.gestationalDays ? Number(pregnancy.values.gestationalDays) : null,
          notes: pregnancy.values.notes || null,
        },
      });

      toast.success('Mother registered', `Patient ID ${created.mother.patientId} — record opened with its booking visit.`);
      onRegistered?.(created.mother.id);
      onClose();
    });
    if (!result.ok) toast.error(new Error(mother.formError ?? ''), 'Registration failed');
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Register a mother"
      description="Staff-recorded entry. The patient ID is allocated automatically and never derived from a name."
      submitLabel="Register and open record"
      submitting={mother.submitting}
      dirty={dirty}
      onSubmit={submit}
      confirmDiscard={() =>
        confirm({
          title: 'Discard this registration?',
          message: 'Nothing has been saved. The form will be cleared.',
          confirmLabel: 'Discard',
          tone: 'danger',
        })
      }
      notice={{
        tone: 'info',
        title: 'Consent is part of registration',
        body: (
          <>
            Record the mother’s agreement to hold her pregnancy details before saving.{' '}
            <Link to="/privacy" className="font-semibold text-brand-800 hover:underline" target="_blank">
              What is stored and who reads it
            </Link>
            .
          </>
        ),
      }}
    >
      <FormSection title="Identity and contact" columns={2}>
        <Field label="Full name" error={mother.errors.fullName} required>
          <TextInput value={mother.values.fullName} onValueChange={(value) => mother.setField('fullName', value)} onBlur={() => mother.blur('fullName')} invalid={Boolean(mother.errors.fullName)} />
        </Field>
        <Field label="Phone number" error={mother.errors.phone} required hint="Used for reminders and follow-up. Must be unique to this record.">
          <TextInput inputMode="tel" value={mother.values.phone} onValueChange={(value) => mother.setField('phone', value)} onBlur={() => mother.blur('phone')} invalid={Boolean(mother.errors.phone)} placeholder="0971234567" />
        </Field>
        <Field label="Date of birth" optional error={mother.errors.dateOfBirth}>
          <TextInput type="date" max={toIsoDate(new Date())} value={mother.values.dateOfBirth ?? ''} onValueChange={(value) => mother.setField('dateOfBirth', value)} onBlur={() => mother.blur('dateOfBirth')} />
        </Field>
        <Field label="Age (years)" optional error={mother.errors.ageYears} hint="Fill either the date of birth or the age — age is used when dates are unknown.">
          <NumberField label=" " value={String(mother.values.ageYears ?? '')} onValueChange={(value) => mother.setField('ageYears', value as unknown as number)} min={10} max={60} />
        </Field>
        <Field label="Alternate phone" optional error={mother.errors.alternatePhone}>
          <TextInput inputMode="tel" value={mother.values.alternatePhone ?? ''} onValueChange={(value) => mother.setField('alternatePhone', value)} />
        </Field>
        <Field label="Preferred language" error={mother.errors.preferredLanguage} required>
          <Select value={mother.values.preferredLanguage} options={LANGUAGES.map((language) => ({ value: language, label: language }))} onValueChange={(value) => mother.setField('preferredLanguage', value)} />
        </Field>
      </FormSection>

      <FormSection title="Where she lives" description="Location drives the catchment list and community health worker assignment." columns={2}>
        <Field label="Facility of registration" error={mother.errors.registrationFacilityId} required>
          {facilities.loading ? (
            <p className="hint">Loading facilities…</p>
          ) : facilityOptions.length === 0 ? (
            <NoticeState tone="warning" title="No facilities are configured" compact>
              An administrator must create at least one facility before registrations can be saved.{' '}
              <Link to="/admin/facilities" className="font-semibold text-brand-800 hover:underline">Open facilities</Link>
            </NoticeState>
          ) : (
            <Select value={mother.values.registrationFacilityId} options={facilityOptions} onValueChange={(value) => mother.setField('registrationFacilityId', value)} invalid={Boolean(mother.errors.registrationFacilityId)} />
          )}
        </Field>
        <Field label="Community / area" error={mother.errors.community} required>
          <TextInput value={mother.values.community} onValueChange={(value) => mother.setField('community', value)} onBlur={() => mother.blur('community')} invalid={Boolean(mother.errors.community)} />
        </Field>
        <Field label="Address or plot" optional>
          <TextInput value={mother.values.address ?? ''} onValueChange={(value) => mother.setField('address', value)} />
        </Field>
        <Field label="Chief / ward" optional>
          <TextInput value={mother.values.chiefName ?? ''} onValueChange={(value) => mother.setField('chiefName', value)} />
        </Field>
        <Field label="Landmark" optional hint="Helps outreach workers find the home.">
          <TextInput value={mother.values.landmark ?? ''} onValueChange={(value) => mother.setField('landmark', value)} />
        </Field>
        <Field label="Catchment area" optional>
          <TextInput value={mother.values.catchmentArea ?? ''} onValueChange={(value) => mother.setField('catchmentArea', value)} />
        </Field>
        <Field label="Assigned community health worker" optional>
          <Select
            value={chwUserId}
            placeholder="Not assigned"
            options={(staff.data ?? []).map((user) => ({ value: user.id, label: `${user.fullName}${user.facilityId ? '' : ' (unassigned)'}` }))}
            onValueChange={setChwUserId}
          />
        </Field>
        <Field label="Literacy level" optional hint="Chooses the reading level of mother-facing material.">
          <Select
            value={mother.values.literacyLevel ?? 'PRIMARY'}
            options={[
              { value: 'NONE', label: 'No formal schooling' },
              { value: 'PRIMARY', label: 'Primary' },
              { value: 'SECONDARY', label: 'Secondary' },
              { value: 'TERTIARY', label: 'Tertiary' },
            ]}
            onValueChange={(value) => mother.setField('literacyLevel', value as never)}
          />
        </Field>
      </FormSection>

      <FormSection title="Support and clinical background" columns={2}>
        <Field label="Emergency contact name" optional>
          <TextInput value={mother.values.emergencyName ?? ''} onValueChange={(value) => mother.setField('emergencyName', value)} />
        </Field>
        <Field label="Relationship" optional>
          <Select
            value={mother.values.emergencyRelation ?? 'Spouse'}
            options={['Spouse', 'Parent', 'Sibling', 'Friend', 'Neighbour', 'Other'].map((value) => ({ value, label: value }))}
            onValueChange={(value) => mother.setField('emergencyRelation', value)}
          />
        </Field>
        <Field label="Emergency contact phone" optional error={mother.errors.emergencyPhone}>
          <TextInput inputMode="tel" value={mother.values.emergencyPhone ?? ''} onValueChange={(value) => mother.setField('emergencyPhone', value)} />
        </Field>
        <Field label="Marital status" optional>
          <Select
            value={mother.values.maritalStatus ?? 'MARRIED'}
            options={['SINGLE', 'MARRIED', 'COHABITING', 'DIVORCED', 'WIDOWED'].map((value) => ({ value, label: value.charAt(0) + value.slice(1).toLowerCase() }))}
            onValueChange={(value) => mother.setField('maritalStatus', value as never)}
          />
        </Field>
        <Field label="Occupation" optional>
          <TextInput value={mother.values.occupation ?? ''} onValueChange={(value) => mother.setField('occupation', value)} />
        </Field>
        <Field label="Husband / partner phone" optional error={mother.errors.husbandPhone}>
          <TextInput inputMode="tel" value={mother.values.husbandPhone ?? ''} onValueChange={(value) => mother.setField('husbandPhone', value)} />
        </Field>
        <Field label="Blood group" optional>
          <TextInput value={mother.values.bloodGroup ?? ''} onValueChange={(value) => mother.setField('bloodGroup', value)} placeholder="O+" />
        </Field>
        <Field label="Known allergies" optional>
          <TextInput value={mother.values.allergies ?? ''} onValueChange={(value) => mother.setField('allergies', value)} placeholder="Penicillin (rash)" />
        </Field>
      </FormSection>

      <FormSection title="This pregnancy" description="Dating drives the gestational age, the due date and the visit schedule.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Gravida (times pregnant)" error={pregnancy.errors.gravida} required>
            <NumberField label=" " value={String(pregnancy.values.gravida ?? '')} onValueChange={(value) => pregnancy.setField('gravida', value as unknown as number)} min={1} max={20} />
          </Field>
          <Field label="Para (births)" error={pregnancy.errors.para}>
            <NumberField label=" " value={String(pregnancy.values.para ?? '')} onValueChange={(value) => pregnancy.setField('para', value as unknown as number)} min={0} max={20} />
          </Field>
          <Field label="Gestation count" optional hint="Select more than one for twins or triplets.">
            <Select
              value={String(pregnancy.values.gestationCount)}
              options={[
                { value: '1', label: 'Singleton' },
                { value: '2', label: 'Twins' },
                { value: '3', label: 'Triplets' },
              ]}
              onValueChange={(value) => pregnancy.setField('gestationCount', Number(value) as 1 | 2 | 3)}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Last menstrual period" error={pregnancy.errors.lmpDate} optional>
            <TextInput type="date" max={toIsoDate(new Date())} value={pregnancy.values.lmpDate ?? ''} onValueChange={(value) => pregnancy.setField('lmpDate', value)} onBlur={() => pregnancy.blur('lmpDate')} />
          </Field>
          <Field label="Estimated due date" error={pregnancy.errors.eddDate} optional hint="Calculated from the LMP if left blank.">
            <TextInput type="date" value={pregnancy.values.eddDate ?? ''} onValueChange={(value) => pregnancy.setField('eddDate', value)} />
          </Field>
          <Field label="Dating method" error={pregnancy.errors.datingMethod}>
            <Select
              value={pregnancy.values.datingMethod}
              options={[
                { value: 'LMP', label: 'Last menstrual period' },
                { value: 'ULTRASOUND', label: 'Ultrasound' },
                { value: 'CLINICAL', label: 'Clinical assessment' },
              ]}
              onValueChange={(value) => pregnancy.setField('datingMethod', value as never)}
            />
          </Field>
          <Field label="Measured gestational age" optional hint="Weeks from an ultrasound or examination, if known.">
            <div className="flex gap-2">
              <TextInput inputMode="numeric" value={String(pregnancy.values.gestationalWeeks ?? '')} onValueChange={(value) => pregnancy.setField('gestationalWeeks', value as unknown as number)} placeholder="wks" />
              <TextInput inputMode="numeric" value={String(pregnancy.values.gestationalDays ?? '')} onValueChange={(value) => pregnancy.setField('gestationalDays', value as unknown as number)} placeholder="days" />
            </div>
          </Field>
        </div>

        <p className="hint flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-brand-50/70 px-3 py-2 !text-brand-900">
          <span className="micro !text-brand-800">From these dates</span>
          <span className="font-semibold">Gestational age {shortGestationalAge(dating.ga)}</span>
          <span aria-hidden className="text-brand-400">•</span>
          <span className="font-semibold">EDD {dating.edd ? toIsoDate(dating.edd) : 'not derived'}</span>
          {dating.ga.valid ? null : <span className="text-[var(--color-risk-amber-text)]">Provide a date or a measured gestational age to enable tracking.</span>}
        </p>

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <p className="label">Risk factors present</p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {RISK_FACTORS.map((factor) => (
                <CheckboxRow
                  key={factor.value}
                  tone="warning"
                  checked={pregnancy.values.riskFactors.includes(factor.value)}
                  onChange={() => pregnancy.setField('riskFactors', toggle(pregnancy.values.riskFactors, factor.value))}
                  label={factor.label}
                />
              ))}
            </div>
          </div>
          <div>
            <p className="label">Complications in a previous pregnancy</p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {PREVIOUS_COMPLICATIONS.map((complication) => (
                <CheckboxRow
                  key={complication.value}
                  tone="warning"
                  checked={pregnancy.values.previousComplications.includes(complication.value)}
                  onChange={() => pregnancy.setField('previousComplications', toggle(pregnancy.values.previousComplications, complication.value))}
                  label={complication.label}
                />
              ))}
            </div>
            <div className="mt-2">
              <CheckboxRow
                checked={pregnancy.values.previousCesarean}
                onChange={(previousCesarean) => pregnancy.setField('previousCesarean', previousCesarean)}
                label="Previous caesarean birth"
                tone="danger"
                description="Sets a standing amber flag for labour monitoring."
              />
            </div>
          </div>
        </div>

        <Field label="Notes on this pregnancy" optional error={pregnancy.errors.notes}>
          <TextArea rows={3} value={pregnancy.values.notes ?? ''} onValueChange={(value) => pregnancy.setField('notes', value)} />
        </Field>
      </FormSection>

      <FormSection title="Consent and account" description="Nothing is recorded without it; the version is stored with the entry.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="How consent was given" error={null}>
            <Select
              value={consentMode}
              options={[
                { value: 'SELF', label: 'Signed or marked by the mother' },
                { value: 'VERBAL', label: 'Given verbally, witnessed by staff' },
                { value: 'REPRESENTATIVE', label: 'Given by a representative' },
              ]}
              onValueChange={(value) => setConsentMode(value as typeof consentMode)}
            />
          </Field>
          <div className="space-y-2 pt-1">
            <CheckboxRow
              checked={consentAccepted}
              onChange={(next) => {
                setConsentAccepted(next);
                mother.setField('consentAccepted', next as unknown as true);
              }}
              tone="danger"
              label="Consent to record maternal health information was given and explained"
              description="The mother knows what is stored, that her facility can read it, and that she may ask for it to be corrected or stopped."
            />
            {mother.errors.consentAccepted ? <p className="field-error">{mother.errors.consentAccepted}</p> : null}
            <CheckboxRow
              checked={createLogin}
              onChange={setCreateLogin}
              label="Create a mother portal login"
              description="Sends the account link so she can see her own dates, reminders and results."
            />
          </div>
        </div>
        {createLogin ? (
          <NoticeState tone="info" title="Patient login needs an email address">
            The portal account is created against the email on this record. Ask the mother for an address she can access, or leave this
            unchecked and create the login later from her profile.
          </NoticeState>
        ) : null}
        <NoticeState tone="warning" title="Enter what was measured, not what was assumed">
          <span className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              This form writes a clinical record. Do not complete observations on someone’s behalf — leave a value blank if it was not taken,
              so gaps stay visible in coverage reports.
            </span>
          </span>
        </NoticeState>
      </FormSection>
    </FormDialog>
  );
}
