/**
 * Administrator — media and storage.
 *
 * Two very different kinds of bytes live in this platform and they are stored in
 * different places on purpose. Public imagery (education covers, facility photos,
 * profile pictures) goes to Cloudinary through an unsigned preset. Personal health
 * documents (scans, lab results, birth records) go to Firebase Storage under the
 * owner's uid, are never public, and are deleted when the owner deletes them.
 *
 * The orphan queue exists because an unsigned browser upload cannot be deleted from
 * the browser: when somebody removes an image we record its public id here so an
 * operator can clear it with a signed API call later.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Cloud,
  Database,
  FileText,
  HardDrive,
  ImageOff,
  Images,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { useAsync, useLiveQuery } from '@/hooks';
import { profileRepo } from '@/services/repositories';
import { clearOrphanAsset, listOrphanAssets, purgeClearedOrphans, type OrphanAsset } from '@/services/media/orphans';
import { canAccessDocument, cloudinaryStatus, deleteDocument } from '@/services/media/media-service';
import { diagnostics } from '@/services/session-store';
import { estimateUsage, storageMode, wipe } from '@/services/data/local/store';
import { logAudit } from '@/services/audit';
import { useConfirm, useSession } from '@/providers/app-providers';
import { integrations } from '@/config/env';
import { formatBytes, formatDate, relativeTime } from '@/lib/utils';
import type { DocumentRecord } from '@/types/domain';
import { StaffPageHeader, StaffShell } from '@/components/layout/staff-shell';
import { Button } from '@/components/ui/button';
import { Card, KeyValue, SectionHeading, StatCard } from '@/components/ui/card';
import { Badge, EmptyState, LoadingRows } from '@/components/ui/display';
import { SegmentedControl } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';

const CATEGORY_LABELS: Record<DocumentRecord['category'], string> = {
  scan: 'Ultrasound scan',
  'lab-result': 'Lab result',
  prescription: 'Prescription',
  'birth-record': 'Birth record',
  'immunization-card': 'Immunization card',
  other: 'Other',
};

type Tab = 'documents' | 'orphans' | 'storage';

export default function AdminMedia() {
  const { actor } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>('documents');
  const [orphans, setOrphans] = useState<OrphanAsset[]>([]);
  const [system, setSystem] = useState<Awaited<ReturnType<typeof diagnostics>> | null>(null);
  const [usage, setUsage] = useState<{ usageBytes: number; quotaBytes: number; persisted: boolean } | null>(null);

  const { rows: documentRows, loading: documentsLoading, refresh: refreshDocuments } = useLiveQuery('documents', {
    orderBy: { field: 'createdAt', direction: 'desc' },
    limit: 300,
  });
  const { data: users } = useAsync(() => profileRepo.list(1000), { immediate: true });

  const documents = useMemo<DocumentRecord[]>(() => documentRows as DocumentRecord[], [documentRows]);
  const namesById = useMemo(() => {
    const map = new Map<string, string>();
    for (const user of users?.rows ?? []) map.set(user.uid, user.fullName);
    return map;
  }, [users]);

  const refreshAll = async (): Promise<void> => {
    const [queue, snapshot, estimate] = await Promise.all([listOrphanAssets(), diagnostics(), estimateUsage()]);
    setOrphans(queue);
    setSystem(snapshot);
    setUsage(estimate);
    refreshDocuments();
  };

  useEffect(() => {
    document.title = 'Media & storage · Mama Care admin';
    void refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const media = cloudinaryStatus();

  const stats = useMemo(() => {
    const bytes = documents.reduce((total, item) => total + (item.bytes ?? 0), 0);
    const byCategory = documents.reduce<Record<string, number>>((acc, item) => {
      acc[item.category] = (acc[item.category] ?? 0) + 1;
      return acc;
    }, {});
    return {
      documents: documents.length,
      bytes,
      private: documents.filter((item) => item.accessMode === 'private').length,
      owners: new Set(documents.map((item) => item.userId)).size,
      byCategory,
      pendingOrphans: orphans.filter((item) => !item.cleared).length,
      clearedOrphans: orphans.filter((item) => item.cleared).length,
    };
  }, [documents, orphans]);

  const removeDocument = async (record: DocumentRecord): Promise<void> => {
    const ok = await confirm({
      title: `Delete “${record.title}”?`,
      message:
        'This removes a patient’s personal health document — the file and its record. Only do this if the upload was unlawful, abusive or made in error, and say why. The owner is not notified automatically, so tell them.',
      confirmLabel: 'Delete the document',
      tone: 'danger',
    });
    if (!ok) return;
    const reason = 'Administrator removal';
    await deleteDocument(record);
    await logAudit('record-delete', 'documents', record.id, `${record.title} (${CATEGORY_LABELS[record.category]}) — ${reason}`);
    toast.success('Document deleted', 'The file and its record are gone. This is in the audit log.');
    void refreshAll();
  };

  const clearOrphan = async (orphan: OrphanAsset): Promise<void> => {
    await clearOrphanAsset(orphan.publicId);
    await logAudit('record-update', 'media-orphans', orphan.publicId, 'Marked as cleared on the media host');
    toast.success('Marked cleared', 'Delete it on Cloudinary with a signed call, then purge the queue.');
    void refreshAll();
  };

  const purge = async (): Promise<void> => {
    const ok = await confirm({
      title: 'Purge cleared entries from the queue?',
      message: 'Removes the bookkeeping for assets already marked cleared. Anything still pending is kept.',
      confirmLabel: 'Purge queue',
      tone: 'danger',
    });
    if (!ok) return;
    await purgeClearedOrphans();
    await logAudit('record-delete', 'media-orphans', null, 'Purged cleared orphan assets');
    toast.success('Queue purged');
    void refreshAll();
  };

  const wipeDevice = async (): Promise<void> => {
    const ok = await confirm({
      title: 'Erase all locally stored data on this device?',
      message:
        'In device mode this is the entire database on this browser: accounts, records, documents handles and settings. It cannot be undone. On a Firebase deployment nothing here is the source of truth, but the local cache still goes.',
      confirmLabel: 'Erase everything',
      tone: 'danger',
    });
    if (!ok) return;
    await wipe();
    toast.success('Local data erased', 'Reload the page to start again.');
    void refreshAll();
  };

  return (
    <StaffShell portal="Admin Dashboard">
      <StaffPageHeader
        title="Media & storage"
        description="Where images and documents are kept, what is orphaned, and how much space this deployment is using."
        actions={
          <Button variant="ghost" size="sm" onClick={() => void refreshAll()} icon={<RefreshCw className="size-4" aria-hidden />}>
            Refresh
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Documents stored" value={stats.documents} icon={<FileText className="size-4" aria-hidden />} hint={`${stats.owners} owners · ${formatBytes(stats.bytes)}`} />
        <StatCard label="Private health files" value={stats.private} icon={<ShieldAlert className="size-4" aria-hidden />} tone="brand" hint="Never public, never cached by the CDN" />
        <StatCard
          label="Orphaned media"
          value={stats.pendingOrphans}
          icon={<ImageOff className="size-4" aria-hidden />}
          tone={stats.pendingOrphans > 0 ? 'amber' : 'green'}
          hint={`${stats.clearedOrphans} already cleared`}
          onClick={() => setTab('orphans')}
        />
        <StatCard
          label="Device storage"
          value={usage ? formatBytes(usage.usageBytes) : '—'}
          icon={<HardDrive className="size-4" aria-hidden />}
          hint={usage ? `${formatBytes(usage.quotaBytes)} available · ${usage.persisted ? 'persisted' : 'not persisted'}` : 'checking…'}
          onClick={() => setTab('storage')}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="card-pad">
          <SectionHeading eyebrow="Public imagery" title={media.label} description={media.detail} />
          <div className="mt-3">
            <KeyValue
              columns={1}
              dense
              items={[
                { label: 'Cloudinary', value: integrations.cloudinary.configured ? `Connected (${integrations.cloudinary.cloudName})` : 'Not configured — images fall back to this device' },
                { label: 'Unsigned preset', value: integrations.cloudinary.unsignedPresetConfigured ? 'Configured' : 'Missing' },
                { label: 'Used for', value: 'Education covers, facility photos, profile pictures, branding' },
                { label: 'Never used for', value: 'Scans, lab results, prescriptions or any personal health document' },
              ]}
            />
          </div>
          <p className="mt-3 flex items-start gap-2 text-xs text-ink-500">
            <Cloud className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            An unsigned preset means the browser can upload without holding a secret. It also means the browser cannot delete —
            hence the orphan queue.
          </p>
        </Card>

        <Card className="card-pad">
          <SectionHeading eyebrow="Personal documents" title="Firebase Storage, per owner" description="Scans, lab results, prescriptions, birth records and immunization cards." />
          <div className="mt-3">
            <KeyValue
              columns={1}
              dense
              items={[
                { label: 'Storage bucket', value: integrations.firebase.configured ? 'Configured' : 'Not configured — files stay on this device' },
                { label: 'Path', value: 'mamacare/documents/{uid}/…' },
                { label: 'Access', value: 'Owner only; administrators can see that a file exists and remove it' },
                { label: 'On account deletion', value: 'The owner’s documents are removed with their records' },
                { label: 'Local fallback', value: storageMode() === 'indexeddb' ? 'IndexedDB on this device' : 'Session memory (lost on reload)' },
              ]}
            />
          </div>
        </Card>
      </div>

      <Card className="card-pad mt-4">
        <SegmentedControl
          value={tab}
          onChange={setTab}
          ariaLabel="Media section"
          options={[
            { value: 'documents', label: 'Documents', count: stats.documents },
            { value: 'orphans', label: 'Orphan queue', count: stats.pendingOrphans },
            { value: 'storage', label: 'Storage & data', count: system?.records ?? 0 },
          ]}
        />
      </Card>

      {tab === 'documents' ? (
        <Card className="card-pad mt-4">
          <SectionHeading eyebrow="Everything uploaded" title="Personal health documents" description="Names are shown because you are an administrator; the files themselves are the patient's." />
          {documentsLoading ? <LoadingRows className="mt-3" rows={4} /> : null}
          {!documentsLoading && documents.length === 0 ? (
            <EmptyState
              className="mt-3"
              icon={<Images className="size-6" aria-hidden />}
              title="No documents have been uploaded"
              description="Mothers upload scans and lab results from their profile. Nothing appears here until somebody does."
            />
          ) : null}
          {documents.length > 0 ? (
            <ul className="mt-3 divide-y divide-ink-100">
              {documents.map((record) => (
                <li key={record.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-ink-800">{record.title}</span>
                      <Badge tone="neutral">{CATEGORY_LABELS[record.category]}</Badge>
                      <Badge tone={record.accessMode === 'private' ? 'green' : 'amber'}>{record.accessMode}</Badge>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-ink-500">
                      {namesById.get(record.userId) ?? record.userId} · {formatBytes(record.bytes)} · {record.mimeType} ·{' '}
                      {relativeTime(record.createdAt)}
                      {record.notes ? ` · ${record.notes}` : ''}
                    </span>
                  </span>
                  <div className="actions-wrap">
                    {canAccessDocument(record, actor?.role ?? 'ADMIN', actor?.uid ?? '') ? <Badge tone="blue">you may open this</Badge> : null}
                    <Button variant="outline-danger" size="sm" onClick={() => void removeDocument(record)} icon={<Trash2 className="size-4" aria-hidden />}>
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-3 text-xs text-ink-500">
            Opening somebody's document is not logged as a read here — do not browse files out of curiosity. Deleting is logged
            with your name and the reason.
          </p>
        </Card>
      ) : null}

      {tab === 'orphans' ? (
        <Card className="card-pad mt-4">
          <SectionHeading
            eyebrow="Cleanup"
            title="Orphaned media queue"
            description="Images that were removed from a record but still exist on the media host. Mark them cleared once you have deleted them with a signed API call, then purge the queue."
            actions={
              <Button variant="secondary" size="sm" onClick={() => void purge()} disabled={stats.clearedOrphans === 0}>
                Purge cleared
              </Button>
            }
          />
          {orphans.length === 0 ? (
            <EmptyState
              className="mt-3"
              icon={<ImageOff className="size-6" aria-hidden />}
              title="The queue is empty"
              description="No media is waiting to be cleared. Entries appear when somebody replaces or removes an uploaded image."
            />
          ) : (
            <ul className="mt-3 divide-y divide-ink-100">
              {orphans.map((orphan) => (
                <li key={orphan.publicId} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-ink-800 break-anywhere">{orphan.publicId}</span>
                      {orphan.cleared ? <Badge tone="green">cleared</Badge> : <Badge tone="amber">pending</Badge>}
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-500">
                      Removed {relativeTime(orphan.deletedAt)} · {orphan.deletedBy ?? 'unknown user'}
                    </span>
                  </span>
                  {!orphan.cleared ? (
                    <Button variant="secondary" size="sm" onClick={() => void clearOrphan(orphan)}>
                      Mark cleared
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-ink-500">
            The queue is kept on this device, bounded to the most recent 200 entries. On a multi-administrator deployment, treat
            it as a prompt rather than a system of record.
          </p>
        </Card>
      ) : null}

      {tab === 'storage' ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card className="card-pad">
            <SectionHeading eyebrow="This deployment" title="Where the data lives" />
            <KeyValue
              columns={1}
              dense
              items={[
                { label: 'Data provider', value: system?.provider === 'firebase' ? 'Firebase Firestore' : 'This device (IndexedDB)' },
                { label: 'Writable', value: system?.writable ? 'Yes' : system ? 'Read-only' : 'checking…' },
                { label: 'Records', value: system ? String(system.records) : '—' },
                { label: 'Local storage mode', value: storageMode() },
                { label: 'Browser estimate', value: usage ? `${formatBytes(usage.usageBytes)} of ${formatBytes(usage.quotaBytes)}` : '—' },
                { label: 'Persisted storage', value: usage ? (usage.persisted ? 'Yes — the browser will not evict it casually' : 'No — the browser may evict it under pressure') : '—' },
              ]}
            />
            {system?.perCollection ? (
              <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                {Object.entries(system.perCollection)
                  .filter(([, count]) => count > 0)
                  .sort((a, b) => b[1] - a[1])
                  .map(([name, count]) => (
                    <li key={name} className="flex items-center justify-between gap-2 rounded-lg border border-ink-200 px-3 py-1.5">
                      <span className="truncate text-xs text-ink-600">{name}</span>
                      <Badge tone="neutral">{count}</Badge>
                    </li>
                  ))}
              </ul>
            ) : null}
          </Card>

          <Card className="card-pad">
            <SectionHeading eyebrow="Danger" title="Erase local data" description="For a demonstration device, a shared clinic tablet, or after a bad import." />
            <ul className="checklist mt-2 text-sm">
              <li>In device mode this deletes every account and record on this browser.</li>
              <li>On a Firebase deployment the cloud data is untouched; the local cache is cleared.</li>
              <li>Document files in Firebase Storage are not deleted by this action.</li>
              <li>There is no undo, and nothing is written to the audit log because the log goes too.</li>
            </ul>
            <div className="mt-3">
              <Button variant="outline-danger" size="sm" onClick={() => void wipeDevice()} icon={<Database className="size-4" aria-hidden />}>
                Erase local data
              </Button>
            </div>
            <p className="mt-3 text-xs text-ink-500">
              Last snapshot taken {formatDate(new Date(), 'long')} by {actor?.displayName ?? 'an administrator'}.
            </p>
          </Card>
        </div>
      ) : null}
    </StaffShell>
  );
}
