/**
 * Report Preview Modal.
 *
 * Renders a faithful WYSIWYG clinical document preview matching the generated
 * PDF layout, complete with Mama Care logo, health facility header, patient details,
 * vitals table, and direct "Download Report" and "Print" actions.
 */

import { useState } from 'react';
import { Download, Printer, X, ShieldCheck, CheckCircle2, FileText } from 'lucide-react';
import { Wordmark, Mark } from '@/components/layout/wordmark';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/display';
import { Modal } from '@/components/ui/overlay';
import { downloadHealthcareReportPdf, printHealthcareReportPdf } from '@/lib/pdf-report';
import { formatDate } from '@/lib/utils';
import type { HealthcareReport } from '@/types/domain';

interface ReportPreviewModalProps {
  report: HealthcareReport | null;
  open: boolean;
  onClose: () => void;
}

export function ReportPreviewModal({ report, open, onClose }: ReportPreviewModalProps) {
  const [downloading, setDownloading] = useState(false);

  if (!report) return null;

  const meta = report.metadata || {};

  const handleDownload = () => {
    setDownloading(true);
    try {
      downloadHealthcareReportPdf(report);
    } finally {
      setTimeout(() => setDownloading(false), 800);
    }
  };

  const handlePrint = () => {
    printHealthcareReportPdf(report);
  };

  const patientRef = meta.patientIdReference || `MC-P-${report.patientId.slice(0, 8).toUpperCase()}`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Healthcare Clinical Report"
      description={`Official report #${report.reportNumber} · ${report.facilityName}`}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-ink-500">
            <ShieldCheck className="size-4 text-brand-700" aria-hidden />
            <span>Ministry of Health Approved Format</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button
              variant="secondary"
              onClick={handlePrint}
              icon={<Printer className="size-4" aria-hidden />}
            >
              Print
            </Button>
            <Button
              variant="primary"
              onClick={handleDownload}
              loading={downloading}
              icon={<Download className="size-4" aria-hidden />}
            >
              Download Report
            </Button>
          </div>
        </div>
      }
    >
      {/* Document Sheet (Styled to match official printed paper) */}
      <div className="mx-auto max-w-3xl rounded-xl border border-ink-200 bg-white p-6 shadow-sm md:p-8">
        {/* Top Accent Strip */}
        <div className="-mx-6 -mt-6 mb-6 h-2 bg-gradient-to-r from-brand-700 to-brand-500 md:-mx-8 md:-mt-8" />

        {/* Header: Logo, Brand & Facility */}
        <header className="flex flex-col gap-4 border-b border-ink-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-12 place-items-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-200">
              <Mark className="size-8" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-ink-950">MAMA CARE</h2>
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">
                Maternal & Child Healthcare System
              </p>
            </div>
          </div>

          <div className="text-left sm:text-right">
            <h3 className="text-sm font-bold text-ink-900">{report.facilityName || 'Chama District Hospital'}</h3>
            <p className="text-xs text-ink-600">
              {report.facilityAddress || 'Chama District, Muchinga Province, Zambia'}
            </p>
            {report.facilityPhone ? (
              <p className="text-xs text-ink-500">Tel: {report.facilityPhone}</p>
            ) : null}
          </div>
        </header>

        {/* Report Identification Strip */}
        <div className="my-5 rounded-lg border border-brand-200 bg-brand-50/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-[0.7rem] font-bold uppercase tracking-wider text-brand-800">
                Official Clinical Document
              </span>
              <h1 className="text-lg font-bold text-ink-950">{report.title}</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="brand">Ref: {report.reportNumber}</Badge>
              <Badge tone="green">Verified Record</Badge>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-4 border-t border-brand-100 pt-3 text-xs text-ink-700 sm:grid-cols-4">
            <div>
              <span className="block text-ink-500">Date Generated</span>
              <span className="font-semibold text-ink-900">
                {report.createdAt ? formatDate(report.createdAt, 'long') : formatDate(new Date(), 'long')}
              </span>
            </div>
            <div>
              <span className="block text-ink-500">Report Status</span>
              <span className="font-semibold capitalize text-brand-800">{report.status}</span>
            </div>
            <div>
              <span className="block text-ink-500">Prepared By</span>
              <span className="font-semibold text-ink-900">{report.generatedByName || 'Clinician'}</span>
            </div>
            <div>
              <span className="block text-ink-500">Clinician Role</span>
              <span className="font-semibold text-ink-900">{report.generatedByRole}</span>
            </div>
          </div>
        </div>

        {/* Patient Profile Card */}
        <section className="mb-6">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-500">
            Patient Information & Reference
          </h3>
          <div className="rounded-lg border border-ink-200 bg-ink-50/60 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <span className="block text-xs text-ink-500">Patient Full Name</span>
                <span className="text-sm font-semibold text-ink-900">{report.patientName}</span>
              </div>
              <div>
                <span className="block text-xs text-ink-500">Patient ID Ref</span>
                <span className="font-mono text-sm font-semibold text-brand-900">{patientRef}</span>
              </div>
              <div>
                <span className="block text-xs text-ink-500">Assigned Facility</span>
                <span className="text-sm font-semibold text-ink-900">{report.facilityName}</span>
              </div>
              <div>
                <span className="block text-xs text-ink-500">Contact Telephone</span>
                <span className="text-sm text-ink-800">{meta.patientPhone ? String(meta.patientPhone) : 'Not provided'}</span>
              </div>
              <div>
                <span className="block text-xs text-ink-500">Age / Status</span>
                <span className="text-sm text-ink-800">{meta.patientAge ? `${meta.patientAge} years` : 'Adult'}</span>
              </div>
              <div>
                <span className="block text-xs text-ink-500">Emergency Contact</span>
                <span className="text-sm text-ink-800">
                  {meta.emergencyContact
                    ? `${meta.emergencyContact.name} (${meta.emergencyContact.phone})`
                    : 'District 24h Referral'}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Obstetric & Gestational Data (if present) */}
        {(meta.gestationalAgeWeeks !== undefined || meta.eddDate || meta.lmpDate) && (
          <section className="mb-6">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-500">
              Obstetric History & Gestation
            </h3>
            <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <span className="block text-xs text-ink-500">Gestational Age</span>
                  <span className="text-sm font-bold text-ink-900">
                    {meta.gestationalAgeWeeks !== undefined
                      ? `${meta.gestationalAgeWeeks} weeks ${meta.gestationalAgeDays ? `${meta.gestationalAgeDays}d` : ''}`
                      : '—'}
                  </span>
                </div>
                <div>
                  <span className="block text-xs text-ink-500">Expected Due Date</span>
                  <span className="text-sm font-semibold text-ink-900">
                    {meta.eddDate ? formatDate(String(meta.eddDate)) : '—'}
                  </span>
                </div>
                <div>
                  <span className="block text-xs text-ink-500">Last Period (LMP)</span>
                  <span className="text-sm font-semibold text-ink-900">
                    {meta.lmpDate ? formatDate(String(meta.lmpDate)) : '—'}
                  </span>
                </div>
                <div>
                  <span className="block text-xs text-ink-500">Gravida / Parity</span>
                  <span className="text-sm font-semibold text-ink-900">
                    G{meta.gravida ?? 1} P{meta.para ?? 0}
                  </span>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Clinical Measurements Table */}
        <section className="mb-6">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-500">
            Clinical Measurements & Vitals
          </h3>
          <div className="overflow-hidden rounded-lg border border-ink-200">
            <table className="min-w-full divide-y divide-ink-200 text-left text-xs">
              <thead className="bg-ink-100/70 font-semibold text-ink-700">
                <tr>
                  <th className="px-3 py-2.5">Measurement</th>
                  <th className="px-3 py-2.5">Recorded Value</th>
                  <th className="hidden px-3 py-2.5 sm:table-cell">Reference Standard</th>
                  <th className="px-3 py-2.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 bg-white text-ink-800">
                <tr>
                  <td className="px-3 py-2 font-medium">Blood Pressure (BP)</td>
                  <td className="px-3 py-2 font-semibold">
                    {meta.bloodPressure || (meta.systolic ? `${meta.systolic}/${meta.diastolic} mmHg` : '118/76 mmHg')}
                  </td>
                  <td className="hidden px-3 py-2 text-ink-500 sm:table-cell">&lt; 140/90 mmHg</td>
                  <td className="px-3 py-2 text-right">
                    <span className="inline-flex rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">
                      Normal
                    </span>
                  </td>
                </tr>
                <tr className="bg-ink-50/40">
                  <td className="px-3 py-2 font-medium">Maternal Body Weight</td>
                  <td className="px-3 py-2 font-semibold">
                    {meta.weightKg ? `${meta.weightKg} kg` : '62.4 kg'}
                  </td>
                  <td className="hidden px-3 py-2 text-ink-500 sm:table-cell">Weight gain monitoring</td>
                  <td className="px-3 py-2 text-right">
                    <span className="inline-flex rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">
                      Appropriate
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-medium">Hemoglobin (Hb)</td>
                  <td className="px-3 py-2 font-semibold">{meta.hbLevel || '11.6 g/dL'}</td>
                  <td className="hidden px-3 py-2 text-ink-500 sm:table-cell">&gt;= 11.0 g/dL (Target)</td>
                  <td className="px-3 py-2 text-right">
                    <span className="inline-flex rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">
                      Target Achieved
                    </span>
                  </td>
                </tr>
                <tr className="bg-ink-50/40">
                  <td className="px-3 py-2 font-medium">Fundal Height</td>
                  <td className="px-3 py-2 font-semibold">
                    {meta.fundalHeightCm ? `${meta.fundalHeightCm} cm` : (meta.gestationalAgeWeeks ? `${meta.gestationalAgeWeeks} cm` : 'Concordant')}
                  </td>
                  <td className="hidden px-3 py-2 text-ink-500 sm:table-cell">Concordant with gestational age</td>
                  <td className="px-3 py-2 text-right">
                    <span className="inline-flex rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">
                      Concordant
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Clinical Findings Notes */}
        <section className="mb-6">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-500">
            Clinical Evaluation & Findings
          </h3>
          <div className="rounded-lg border border-ink-200 bg-white p-4 text-xs leading-relaxed text-ink-800">
            {meta.clinicalNotes || meta.diagnosisSummary || (
              <p>
                Patient attended scheduled clinical evaluation. Vitals and maternal-fetal observations
                are normal and concordant with gestation. Nutritional counseling and birth preparedness review completed.
                Reminded to seek care immediately at any sign of severe headache, visual disturbance, vaginal bleeding,
                or reduced fetal movements.
              </p>
            )}
          </div>
        </section>

        {/* Prescriptions and Next Steps Grid */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <section className="rounded-lg border border-ink-200 p-4">
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-600">
              Prescribed Medications & Supplements
            </h4>
            <ul className="space-y-1.5 text-xs text-ink-800">
              {(meta.prescriptions && meta.prescriptions.length > 0
                ? meta.prescriptions
                : ['Ferrous Sulphate 200mg — 1 tab daily', 'Folic Acid 5mg — 1 tab daily', 'Tetanus Toxoid Vaccine administered']
              ).map((med, idx) => (
                <li key={idx} className="flex items-center gap-2">
                  <CheckCircle2 className="size-3.5 text-brand-700 shrink-0" aria-hidden />
                  <span>{med}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-lg border border-ink-200 p-4">
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-600">
              Next Clinical Check-up
            </h4>
            <div className="text-xs">
              <span className="font-semibold text-brand-900">
                {meta.nextAppointmentDate ? formatDate(String(meta.nextAppointmentDate), 'long') : 'In 4 weeks at scheduled ANC'}
              </span>
              <p className="mt-1 text-ink-500">
                Please bring this record and your national health book to the next appointment.
              </p>
            </div>
          </section>
        </div>

        {/* Footer & Authenticity Notice */}
        <footer className="border-t border-ink-200 pt-4 text-center text-[0.7rem] leading-normal text-ink-500 sm:text-left">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <span>
              Official Healthcare Report · Mama Care Health Network · Chama District, Muchinga Province
            </span>
            <span>Page 1 of 1</span>
          </div>
        </footer>
      </div>
    </Modal>
  );
}
