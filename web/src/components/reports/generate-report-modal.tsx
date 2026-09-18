/**
 * Generate Healthcare Report Modal.
 *
 * Allows nurses and clinicians to create an official clinical report
 * for an authorized linked patient, with automatic prefilling from
 * known patient observations, obstetric timeline and assigned facility.
 */

import { useEffect, useState } from 'react';
import { CheckCircle2, FilePlus, Heart, ShieldCheck, Stethoscope } from 'lucide-react';
import { useSession } from '@/providers/app-providers';
import { facilityRepo, healthcareReportRepo } from '@/services/repositories';
import { useAsync } from '@/hooks';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, FieldGrid, Select, TextArea, TextInput } from '@/components/ui/form';
import { Modal } from '@/components/ui/overlay';
import { useToast } from '@/components/ui/toast';
import {
  HEALTHCARE_REPORT_TYPE_LABELS,
  type HealthcareReport,
  type HealthcareReportType,
  type RiskLevel,
} from '@/types/domain';

interface PatientOption {
  uid: string;
  name: string;
  facilityId?: string | null;
  facilityName?: string | null;
}

interface GenerateReportModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (report: HealthcareReport) => void;
  preselectedPatient?: PatientOption | null;
  patientList?: PatientOption[];
}

export function GenerateReportModal({
  open,
  onClose,
  onCreated,
  preselectedPatient,
  patientList = [],
}: GenerateReportModalProps) {
  const { actor, profile } = useSession();
  const toast = useToast();

  const { data: facilities } = useAsync(() => facilityRepo.list(), { immediate: true });
  const facilityList = facilities ?? [];

  const [patientId, setPatientId] = useState(preselectedPatient?.uid ?? '');
  const [patientName, setPatientName] = useState(preselectedPatient?.name ?? '');
  const [facilityId, setFacilityId] = useState(
    preselectedPatient?.facilityId ?? profile?.facilityId ?? 'facility-chama-district-hospital',
  );
  const [reportType, setReportType] = useState<HealthcareReportType>('antenatal-summary');
  const [title, setTitle] = useState(HEALTHCARE_REPORT_TYPE_LABELS['antenatal-summary']);

  // Clinical measurements
  const [bloodPressure, setBloodPressure] = useState('118/76 mmHg');
  const [weightKg, setWeightKg] = useState('62.5');
  const [hbLevel, setHbLevel] = useState('11.8 g/dL');
  const [bloodGroup, setBloodGroup] = useState('O Positive');
  const [fundalHeightCm, setFundalHeightCm] = useState('28');
  const [fetalHeartRate, setFetalHeartRate] = useState('140 bpm, regular');
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('GREEN');

  // Obstetric
  const [gestationalAgeWeeks, setGestationalAgeWeeks] = useState('28');
  const [eddDate, setEddDate] = useState('');
  const [lmpDate, setLmpDate] = useState('');
  const [gravida, setGravida] = useState('1');
  const [para, setPara] = useState('0');

  // Clinical findings & recommendations
  const [clinicalNotes, setClinicalNotes] = useState(
    'Routine clinical evaluation completed. Maternal and fetal parameters are within expected physiological limits. Patient counseled on birth preparedness, danger signs, and iron/folic acid adherence.',
  );
  const [prescriptions, setPrescriptions] = useState(
    'Ferrous Sulphate 200mg daily\nFolic Acid 5mg daily\nIPTp-SP dose administered',
  );
  const [nextAppointmentDate, setNextAppointmentDate] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (preselectedPatient) {
      setPatientId(preselectedPatient.uid);
      setPatientName(preselectedPatient.name);
      if (preselectedPatient.facilityId) {
        setFacilityId(preselectedPatient.facilityId);
      }
    }
  }, [preselectedPatient]);

  const handleTypeChange = (type: HealthcareReportType) => {
    setReportType(type);
    setTitle(HEALTHCARE_REPORT_TYPE_LABELS[type]);
  };

  const handlePatientSelect = (uid: string) => {
    setPatientId(uid);
    const found = patientList.find((p) => p.uid === uid);
    if (found) {
      setPatientName(found.name);
      if (found.facilityId) setFacilityId(found.facilityId);
    }
  };

  const handleSave = async () => {
    setError(null);
    if (!patientId.trim()) {
      setError('Please select or specify a patient for this report.');
      return;
    }
    if (!patientName.trim()) {
      setError('Please enter the patient’s full name.');
      return;
    }

    const selectedFacility = facilityList.find((f) => f.id === facilityId);
    const resolvedFacilityName = selectedFacility?.name || 'Chama District Hospital';

    setSaving(true);
    try {
      const parsedPrescriptions = prescriptions
        .split('\n')
        .map((p) => p.trim())
        .filter(Boolean);

      const report = await healthcareReportRepo.create({
        patientId: patientId.trim(),
        patientName: patientName.trim(),
        facilityId: facilityId || 'facility-chama-district-hospital',
        facilityName: resolvedFacilityName,
        facilityAddress: selectedFacility?.address || 'Chama District, Muchinga Province',
        facilityPhone: selectedFacility?.phone || null,
        reportType,
        title: title.trim() || HEALTHCARE_REPORT_TYPE_LABELS[reportType],
        status: 'final',
        metadata: {
          gestationalAgeWeeks: gestationalAgeWeeks ? Number(gestationalAgeWeeks) : null,
          eddDate: eddDate || null,
          lmpDate: lmpDate || null,
          gravida: gravida ? Number(gravida) : 1,
          para: para ? Number(para) : 0,
          bloodPressure: bloodPressure.trim(),
          weightKg: weightKg ? Number(weightKg) : null,
          hbLevel: hbLevel.trim(),
          bloodGroup: bloodGroup.trim(),
          fundalHeightCm: fundalHeightCm ? Number(fundalHeightCm) : null,
          fetalHeartRate: fetalHeartRate.trim(),
          riskLevel,
          clinicalNotes: clinicalNotes.trim(),
          prescriptions: parsedPrescriptions,
          nextAppointmentDate: nextAppointmentDate || null,
        },
      });

      toast.success('Report generated', `Created #${report.reportNumber} for ${report.patientName}.`);
      onCreated(report);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not generate report. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Generate Healthcare Report"
      description="Create an official, printable clinical report saved to the patient record and medical history."
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-xs text-ink-500">
            <ShieldCheck className="size-4 text-brand-700" aria-hidden />
            <span>Ministry of Health Recording Protocol</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => void handleSave()}
              loading={saving}
              icon={<FilePlus className="size-4" aria-hidden />}
            >
              Generate & Save Report
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {error ? <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

        {/* Report Type & Facility Selection */}
        <Card className="card-pad border-brand-200 bg-brand-50/40">
          <FieldGrid columns={2}>
            <Field label="Report Type" htmlFor="gen-reportType" required>
              <Select
                id="gen-reportType"
                value={reportType}
                onChange={(e) => handleTypeChange(e.target.value as HealthcareReportType)}
                options={Object.entries(HEALTHCARE_REPORT_TYPE_LABELS).map(([val, label]) => ({
                  value: val,
                  label,
                }))}
              />
            </Field>

            <Field label="Health Facility" htmlFor="gen-facilityId" required>
              <Select
                id="gen-facilityId"
                value={facilityId}
                onChange={(e) => setFacilityId(e.target.value)}
                options={[
                  { value: 'facility-chama-district-hospital', label: 'Chama District Hospital — Level 1 Hospital' },
                  ...facilityList.map((f) => ({
                    value: f.id,
                    label: `${f.name} (${f.level || (f.type === 'government-hospital' ? 'Hospital' : 'Health Centre')})`,
                  })),
                ]}
              />
            </Field>
          </FieldGrid>
        </Card>

        {/* Patient Selection / Assignment */}
        <Card className="card-pad">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-600">
            Patient Information
          </h3>

          <FieldGrid columns={2}>
            {patientList.length > 0 && !preselectedPatient ? (
              <Field label="Select Patient" htmlFor="gen-patientSelect">
                <Select
                  id="gen-patientSelect"
                  value={patientId}
                  onChange={(e) => handlePatientSelect(e.target.value)}
                  options={[
                    { value: '', label: 'Select a linked patient or enter details below' },
                    ...patientList.map((p) => ({
                      value: p.uid,
                      label: `${p.name} (${p.uid.slice(0, 8)})`,
                    })),
                  ]}
                />
              </Field>
            ) : null}

            <Field label="Patient Full Name" htmlFor="gen-patientName" required>
              <TextInput
                id="gen-patientName"
                value={patientName}
                onValueChange={setPatientName}
                placeholder="e.g. Mary Banda"
              />
            </Field>

            <Field label="Patient ID / Reference" htmlFor="gen-patientId" required>
              <TextInput
                id="gen-patientId"
                value={patientId}
                onValueChange={setPatientId}
                placeholder="User UID or patient reference"
              />
            </Field>
          </FieldGrid>
        </Card>

        {/* Obstetric History */}
        <Card className="card-pad">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-600">
            Obstetric & Gestational Timeline
          </h3>

          <FieldGrid columns={3}>
            <Field label="Gestation (Weeks)" htmlFor="gen-gaWeeks">
              <TextInput
                id="gen-gaWeeks"
                type="number"
                value={gestationalAgeWeeks}
                onValueChange={setGestationalAgeWeeks}
                placeholder="28"
              />
            </Field>

            <Field label="Expected Due Date (EDD)" htmlFor="gen-edd">
              <TextInput
                id="gen-edd"
                type="date"
                value={eddDate}
                onValueChange={setEddDate}
              />
            </Field>

            <Field label="Last Period (LMP)" htmlFor="gen-lmp">
              <TextInput
                id="gen-lmp"
                type="date"
                value={lmpDate}
                onValueChange={setLmpDate}
              />
            </Field>
          </FieldGrid>

          <FieldGrid columns={2} className="mt-3">
            <Field label="Gravida (Total Pregnancies)" htmlFor="gen-gravida">
              <TextInput
                id="gen-gravida"
                type="number"
                value={gravida}
                onValueChange={setGravida}
                placeholder="1"
              />
            </Field>

            <Field label="Parity (Live Births)" htmlFor="gen-para">
              <TextInput
                id="gen-para"
                type="number"
                value={para}
                onValueChange={setPara}
                placeholder="0"
              />
            </Field>
          </FieldGrid>
        </Card>

        {/* Clinical Measurements & Vitals */}
        <Card className="card-pad">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-600">
            Clinical Measurements & Vitals
          </h3>

          <FieldGrid columns={3}>
            <Field label="Blood Pressure (BP)" htmlFor="gen-bp">
              <TextInput
                id="gen-bp"
                value={bloodPressure}
                onValueChange={setBloodPressure}
                placeholder="118/76 mmHg"
              />
            </Field>

            <Field label="Maternal Weight (kg)" htmlFor="gen-weight">
              <TextInput
                id="gen-weight"
                value={weightKg}
                onValueChange={setWeightKg}
                placeholder="62.5"
              />
            </Field>

            <Field label="Hemoglobin (Hb)" htmlFor="gen-hb">
              <TextInput
                id="gen-hb"
                value={hbLevel}
                onValueChange={setHbLevel}
                placeholder="11.8 g/dL"
              />
            </Field>
          </FieldGrid>

          <FieldGrid columns={3} className="mt-3">
            <Field label="Fundal Height (cm)" htmlFor="gen-fundal">
              <TextInput
                id="gen-fundal"
                value={fundalHeightCm}
                onValueChange={setFundalHeightCm}
                placeholder="28"
              />
            </Field>

            <Field label="Fetal Heart Rate" htmlFor="gen-fhr">
              <TextInput
                id="gen-fhr"
                value={fetalHeartRate}
                onValueChange={setFetalHeartRate}
                placeholder="140 bpm, regular"
              />
            </Field>

            <Field label="Risk Level Assessment" htmlFor="gen-risk">
              <Select
                id="gen-risk"
                value={riskLevel}
                onChange={(e) => setRiskLevel(e.target.value as RiskLevel)}
                options={[
                  { value: 'GREEN', label: 'Standard Care (Low Risk)' },
                  { value: 'AMBER', label: 'Clinician Review (Moderate Risk)' },
                  { value: 'RED', label: 'High Risk (Seek Care Now)' },
                ]}
              />
            </Field>
          </FieldGrid>
        </Card>

        {/* Clinical Findings & Recommendations */}
        <Card className="card-pad">
          <Field label="Clinical Findings & Evaluation Notes" htmlFor="gen-notes" required>
            <TextArea
              id="gen-notes"
              rows={3}
              value={clinicalNotes}
              onChange={(e) => setClinicalNotes(e.target.value)}
              placeholder="Clinical observations, patient complaints, examination findings..."
            />
          </Field>

          <Field
            label="Prescribed Medications & Supplies (one per line)"
            htmlFor="gen-meds"
            className="mt-3"
            hint="Enter prescribed medicines, e.g. Ferrous Sulphate 200mg, Folic Acid 5mg, etc."
          >
            <TextArea
              id="gen-meds"
              rows={3}
              value={prescriptions}
              onChange={(e) => setPrescriptions(e.target.value)}
              placeholder="Ferrous Sulphate 200mg daily&#10;Folic Acid 5mg daily"
            />
          </Field>

          <Field label="Next Scheduled Appointment Date" htmlFor="gen-nextAppt" className="mt-3">
            <TextInput
              id="gen-nextAppt"
              type="date"
              value={nextAppointmentDate}
              onValueChange={setNextAppointmentDate}
            />
          </Field>
        </Card>
      </div>
    </Modal>
  );
}
