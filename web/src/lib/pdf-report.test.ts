import { describe, it, expect } from 'vitest';
import { generateHealthcareReportPdf, formatReportFilename } from './pdf-report';
import type { HealthcareReport } from '@/types/domain';

describe('formatReportFilename', () => {
  it('formats filename with standard year-sequence pattern', () => {
    const filename = formatReportFilename('CR-2026-0042');
    expect(filename).toBe('MamaCare_Report_2026-0042.pdf');
  });

  it('handles custom report strings safely without illegal characters', () => {
    const filename = formatReportFilename('REP/2026:01');
    expect(filename).toBe('MamaCare_Report_REP-2026-01.pdf');
  });
});

describe('generateHealthcareReportPdf', () => {
  const sampleReport: HealthcareReport = {
    id: 'rep_test_01',
    reportNumber: 'CR-2026-0042',
    title: 'Antenatal Consultation Clinical Summary',
    reportType: 'antenatal-summary',
    facilityId: 'chama-district-hospital',
    facilityName: 'Chama District Hospital',
    patientId: 'patient_test_01',
    patientName: 'Miriam Phiri',
    generatedBy: 'provider_test_01',
    generatedByName: 'Sr. Beatrice Banda, RN',
    generatedByRole: 'NURSE',
    status: 'final',
    documentUrl: null,
    documentPublicId: null,
    createdAt: '2026-09-17T10:00:00.000Z',
    updatedAt: '2026-09-17T10:00:00.000Z',
    metadata: {
      dateOfVisit: '2026-09-17',
      diagnosisSummary: 'Third trimester routine antenatal checkup. Fetal heartbeat regular and active.',
      clinicalNotes: 'Maternal vital signs stable. Advised on danger signs and birth preparedness plan.',
      observations: [
        { name: 'Blood Pressure', value: '118/76', unit: 'mmHg' },
        { name: 'Weight', value: '64.5', unit: 'kg' },
        { name: 'Fundal Height', value: '32', unit: 'cm' },
        { name: 'Haemoglobin', value: '12.1', unit: 'g/dL' },
      ],
      prescriptions: ['Ferrous sulphate 200mg OD', 'Folic acid 5mg OD'],
      nextAppointmentDate: '2026-10-01',
    },
  };

  it('generates a valid jsPDF instance without exceptions', () => {
    const doc = generateHealthcareReportPdf(sampleReport);
    expect(doc).toBeDefined();
    const blob = doc.output('blob');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(100);
  });

  it('handles reports with missing optional fields gracefully', () => {
    const minimalReport: HealthcareReport = {
      id: 'rep_test_min',
      reportNumber: 'CR-2026-0099',
      title: 'Clinical Visit Report',
      reportType: 'clinical-visit',
      facilityId: 'chama-district-hospital',
      facilityName: 'Chama District Hospital',
      patientId: 'patient_test_02',
      patientName: 'Jane Doe',
      generatedBy: 'provider_test_02',
      generatedByName: 'Dr. Tembo',
      generatedByRole: 'PROVIDER',
      status: 'final',
      documentUrl: null,
      documentPublicId: null,
      createdAt: '2026-09-17T10:00:00.000Z',
      updatedAt: '2026-09-17T10:00:00.000Z',
      metadata: {
        dateOfVisit: '2026-09-17',
      },
    };

    const doc = generateHealthcareReportPdf(minimalReport);
    expect(doc).toBeDefined();
    const blob = doc.output('blob');
    expect(blob.size).toBeGreaterThan(100);
  });
});
