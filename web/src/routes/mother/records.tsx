import { useState } from 'react';
import { ChevronDown, FileText, FolderOpen } from 'lucide-react';
import { AppShell } from '@/components/layout/shell';
import { Card, KeyValue } from '@/components/ui/card';
import { Badge, EmptyState, ErrorState, LoadingRows, NoticeState } from '@/components/ui/display';
import { SegmentedControl, Timeline } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { NoRecordNotice, useMotherRecord } from '@/routes/mother/shared';
import { cn, formatDate, humanize } from '@/lib/utils';
import { openDocument, openReport } from '@/services/media/media-service';
import { useToast } from '@/components/ui/toast';
import { DANGER_SIGN_LABELS } from '@/types/domain';
import type { DocumentRecord } from '@/types/domain';

/**
 * Her record: the visits the clinic saved, the documents and reports addressed to
 * her. Observations are shown as recorded, with the explanation belonging to the
 * midwife rather than to a screen.
 */
export default function MotherRecords() {
  const { motherId, chart } = useMotherRecord();
  const [tab, setTab] = useState<'visits' | 'papers'>('visits');
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();

  if (!motherId) {
    return (
      <AppShell title="My records">
        <NoRecordNotice />
      </AppShell>
    );
  }

  if (chart.loading && !chart.data) {
    return (
      <AppShell title="My records">
        <Card>
          <LoadingRows rows={4} />
        </Card>
      </AppShell>
    );
  }

  if (chart.error || !chart.data) {
    return (
      <AppShell
        title="My records"
        actions={
          <Button size="sm" variant="secondary" onClick={() => void chart.run()}>
            Try again
          </Button>
        }
      >
        <ErrorState message={chart.error ?? 'Your record is not available right now.'} onRetry={() => void chart.run()} title="Your records did not load" />
      </AppShell>
    );
  }

  const { visits, documents, reports, activePregnancy } = chart.data;
  const openFile = async (kind: 'document' | 'report', row: DocumentRecord | { id: string }) => {
    setBusy(`${kind}:${row.id}`);
    try {
      const url =
        kind === 'document'
          ? await openDocument(row as DocumentRecord, { purpose: 'view' })
          : await openReport(row as never);
      window.open(url, '_blank', 'noopener');
    } catch (error) {
      toast.error(error, 'This file could not be opened');
    } finally {
      setBusy(null);
    }
  };

  return (
    <AppShell
      title="My records"
      subtitle={
        activePregnancy
          ? `Pregnancy recorded ${formatDate(activePregnancy.bookedAt ?? activePregnancy.createdAt)} · due date ${formatDate(activePregnancy.eddDate)}`
          : 'No pregnancy is recorded on this account yet'
      }
    >
      <div className="mb-4">
        <SegmentedControl
          ariaLabel="Which part of your record"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'visits', label: 'Visits', count: visits.length },
            { value: 'papers', label: 'Documents & reports', count: documents.length + reports.length },
          ]}
        />
      </div>

      {tab === 'visits' ? (
        visits.length === 0 ? (
          <Card>
            <EmptyState
              title="No visits recorded yet"
              description="Your first antenatal visit starts the record. Everything the midwife writes — how far along you are, your blood pressure, your baby’s heartbeat — will appear here."
            />
          </Card>
        ) : (
          <div className="space-y-4">
            <Card title="Your visits" description="Tap a visit to see what was measured and what was discussed.">
              <Timeline
                items={visits.map((visit) => {
                  const expanded = open === visit.id;
                  return {
                    title: (
                      <button
                        type="button"
                        onClick={() => setOpen(expanded ? null : visit.id)}
                        className="flex w-full items-start justify-between gap-3 text-left"
                        aria-expanded={expanded}
                      >
                        <span className="min-w-0">
                          <span className="block text-[0.9rem] font-semibold text-ink-900">
                            {visit.visitType === 'BOOKING' ? 'First visit' : humanize(visit.visitType)} · {formatDate(visit.visitDate)}
                          </span>
                          <span className="caption mt-0.5 block">
                            {visit.gestationalAge.weeks} weeks {visit.gestationalAge.days} days ·{' '}
                            {visit.vitals.systolicBp && visit.vitals.diastolicBp ? `blood pressure ${visit.vitals.systolicBp}/${visit.vitals.diastolicBp}` : 'blood pressure not recorded'} ·{' '}
                            {visit.vitals.weightKg ? `weight ${visit.vitals.weightKg} kg` : 'weight not recorded'}
                          </span>
                        </span>
                        <ChevronDown className={cn('mt-1 size-4 shrink-0 text-ink-400 transition-transform', expanded && 'rotate-180')} aria-hidden />
                      </button>
                    ),
                    meta: null,
                    tone: visit.riskLevelAfter === 'GREEN' ? ('green' as const) : ('amber' as const),
                    detail: expanded ? (
                      <div className="mt-2 space-y-3 rounded-lg border border-ink-200 bg-white p-3">
                        <KeyValue
                          columns={2}
                          dense
                          items={[
                            { label: 'Blood pressure', value: visit.vitals.systolicBp && visit.vitals.diastolicBp ? `${visit.vitals.systolicBp}/${visit.vitals.diastolicBp} mmHg` : '—' },
                            { label: 'Pulse', value: visit.vitals.pulse ? `${visit.vitals.pulse} /min` : '—' },
                            { label: 'Temperature', value: visit.vitals.temperatureC ? `${visit.vitals.temperatureC} °C` : '—' },
                            { label: 'Weight', value: visit.vitals.weightKg ? `${visit.vitals.weightKg} kg` : '—' },
                            { label: 'Baby’s heartbeat', value: visit.vitals.fetalHeartRate ? `${visit.vitals.fetalHeartRate} /min` : 'Not listened to at this visit' },
                            { label: 'Womb height', value: visit.vitals.fundalHeightCm ? `${visit.vitals.fundalHeightCm} cm` : '—' },
                            { label: 'Urine test', value: visit.vitals.urineProtein ? `protein ${humanize(visit.vitals.urineProtein)}` : 'Not tested' },
                            { label: 'Blood test', value: visit.vitals.haemoglobinGdl ? `haemoglobin ${visit.vitals.haemoglobinGdl} g/dL` : 'Not recorded' },
                          ]}
                        />
                        <div>
                          <p className="micro mb-1">Signs you reported</p>
                          {visit.dangerSigns.reported.length > 0 ? (
                            <ul className="flex flex-wrap gap-1.5">
                              {visit.dangerSigns.reported.map((key) => (
                                <li key={key}>
                                  <Badge tone="amber">{DANGER_SIGN_LABELS[key]}</Badge>
                                </li>
                              ))}
                              {visit.dangerSigns.otherNote ? <Badge tone="neutral">Other: {visit.dangerSigns.otherNote}</Badge> : null}
                            </ul>
                          ) : visit.dangerSigns.noneReported ? (
                            <p className="text-[0.84rem] text-ink-600">You told the clinic you had none of the danger signs.</p>
                          ) : (
                            <p className="text-[0.84rem] text-ink-500">You were not asked at this visit.</p>
                          )}
                        </div>
                        {visit.counselling.length > 0 ? (
                          <div>
                            <p className="micro mb-1">What was discussed</p>
                            <ul className="list-disc space-y-0.5 pl-4 text-[0.84rem] text-ink-700">
                              {visit.counselling.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {visit.note ? (
                          <div>
                            <p className="micro mb-1">Note from your clinic</p>
                            <p className="text-[0.86rem] leading-relaxed text-ink-700">{visit.note}</p>
                          </div>
                        ) : null}
                        {visit.medications.length > 0 ? (
                          <div>
                            <p className="micro mb-1">What you were given</p>
                            <ul className="list-disc space-y-0.5 pl-4 text-[0.84rem] text-ink-700">
                              {visit.medications.map((medication) => (
                                <li key={medication.id}>
                                  {medication.name}
                                  {medication.dose ? ` ${medication.dose}` : ''}
                                  {medication.frequency ? ` · ${medication.frequency}` : ''}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        <p className="caption">
                          These are the numbers your clinic measured. What they mean for you is explained by the midwife or doctor who took them — this page does
                          not interpret them.
                        </p>
                      </div>
                    ) : null,
                  };
                })}
              />
            </Card>

            <NoticeState tone="info" title="Something look wrong?" compact>
              If a number or a date is not what you remember, tell the midwife at your next visit. Records can be corrected, and the correction is kept in the
              history so nothing is quietly changed.
            </NoticeState>
          </div>
        )
      ) : (
        <div className="space-y-4">
          <Card title="Documents" description="Results and letters your clinic shared with you." bodyClassName="p-0">
            {documents.length === 0 ? (
              <EmptyState icon={<FolderOpen className="size-5" aria-hidden />} title="No documents yet" description="Lab results and referral letters your clinic sends will appear here." />
            ) : (
              <ul className="divide-y divide-ink-100">
                {documents.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-3.5">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <FileText className="mt-0.5 size-4 shrink-0 text-ink-400" aria-hidden />
                      <div className="min-w-0">
                        <p className="truncate text-[0.88rem] font-semibold text-ink-900">{row.name}</p>
                        <p className="caption mt-0.5">
                          {humanize(row.category)} · {formatDate(row.uploadedAt)}
                        </p>
                      </div>
                    </div>
                    <Button size="sm" variant="secondary" loading={busy === `document:${row.id}`} onClick={() => void openFile('document', row)}>
                      Open
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="My reports" description="A summary of your pregnancy you can print or show to another clinic." bodyClassName="p-0">
            {reports.length === 0 ? (
              <EmptyState title="No reports yet" description="Ask your clinic to prepare a pregnancy summary — they can generate one during your visit." />
            ) : (
              <ul className="divide-y divide-ink-100">
                {reports.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-3.5">
                    <div className="min-w-0">
                      <p className="truncate text-[0.88rem] font-semibold text-ink-900">{row.title}</p>
                      <p className="caption mt-0.5">
                        Prepared {formatDate(row.generatedAt)} · {row.generatedByName}
                      </p>
                    </div>
                    <Button size="sm" variant="secondary" loading={busy === `report:${row.id}`} disabled={row.status !== 'GENERATED'} onClick={() => void openFile('report', row)}>
                      Open
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </AppShell>
  );
}
