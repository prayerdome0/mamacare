import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, FileText, FolderOpen, RefreshCw, Trash2, Upload } from 'lucide-react';
import { AppShell } from '@/components/layout/shell';
import { useNavScope } from '@/components/layout/nav-scope';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/table';
import { Badge, EmptyState, ErrorState, NoticeState, ProgressBar } from '@/components/ui/display';
import { Field, SearchInput, Select, TextArea } from '@/components/ui/form';
import { useConfirm, useSession } from '@/providers/app-providers';
import { services } from '@/services/session-store';
import { useAsync, useDebouncedValue, useLiveQuery } from '@/hooks';
import { useToast } from '@/components/ui/toast';
import { deleteDocument, openDocument, uploadDocument, cloudinaryStatus } from '@/services/media/media-service';
import { documentMetaSchema, MAX_DOCUMENT_BYTES } from '@/lib/validation';
import { formatBytes, formatDate } from '@/lib/utils';
import { DOCUMENT_CATEGORY_LABELS, type DocumentCategory, type DocumentRecord, type Mother } from '@/types/domain';

/**
 * Document register. Files never live in the database: the bytes go to the
 * configured media store under `mamacare/documents/...` and only the metadata —
 * plus who may read it — is written to the record.
 */
export default function DocumentsPage() {
  const { link: navLink } = useNavScope();
  const navigate = useNavigate();
  const { actor, permissions } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const [term, setTerm] = useState('');
  const [category, setCategory] = useState<'ALL' | DocumentCategory>('ALL');
  const search = useDebouncedValue(term, 200);
  const [busy, setBusy] = useState<string | null>(null);
  const storage = cloudinaryStatus();

  const live = useLiveQuery('documents', {
    where: [],
    orderBy: { field: 'uploadedAt', direction: 'desc' },
    limit: 300,
  });
  const roster = useLiveQuery('mothers', { where: [], orderBy: { field: 'createdAt', direction: 'desc' }, limit: 500 });
  const mothersById = useMemo(() => new Map((roster.data as Mother[]).map((row) => [row.id, row])), [roster.data]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (live.data as DocumentRecord[]).filter((row) => {
      if (!row.deletedAt && category !== 'ALL' && row.category !== category) return false;
      if (needle) {
        const mother = mothersById.get(row.motherId ?? '');
        const haystack = `${row.name} ${row.description ?? ''} ${mother?.fullName ?? ''} ${mother?.patientId ?? ''}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [live.data, category, search, mothersById]);

  const columns: Column<DocumentRecord>[] = [
    {
      key: 'name',
      header: 'Document',
      render: (row) => (
        <div className="flex items-start gap-2">
          <FileText className="mt-0.5 size-4 shrink-0 text-ink-400" aria-hidden />
          <div className="min-w-0">
            <p className="truncate text-[0.88rem] font-semibold text-ink-900">{row.name}</p>
            <p className="caption mt-0.5 line-clamp-1">{row.description || DOCUMENT_CATEGORY_LABELS[row.category]}</p>
          </div>
        </div>
      ),
      sortValue: (row) => row.name,
    },
    {
      key: 'mother',
      header: 'Linked to',
      render: (row) => {
        const mother = row.motherId ? mothersById.get(row.motherId) : null;
        return mother ? (
          <button type="button" onClick={() => navigate(`${navLink('/mothers')}/${mother.id}?tab=documents`)} className="text-left text-[0.84rem] font-medium text-brand-800 hover:underline">
            {mother.fullName}
            <span className="block caption">{mother.patientId}</span>
          </button>
        ) : (
          <span className="text-[0.84rem] text-ink-500">{row.facilityId ? 'Facility document' : 'Personal document'}</span>
        );
      },
      hideBelow: 'md',
    },
    {
      key: 'meta',
      header: 'Size & version',
      render: (row) => (
        <span className="text-[0.82rem] text-ink-600 tnum">
          {formatBytes(row.sizeBytes)} · v{row.version}
        </span>
      ),
      hideBelow: 'lg',
    },
    {
      key: 'access',
      header: 'Access',
      render: (row) => (
        <Badge tone={row.accessMode === 'PUBLIC_READ' ? 'neutral' : 'brand'}>{row.accessMode === 'PUBLIC_READ' ? 'Public link' : 'Signed access only'}</Badge>
      ),
      hideBelow: 'lg',
    },
    {
      key: 'uploaded',
      header: 'Added',
      render: (row) => (
        <div>
          <p className="text-[0.84rem] text-ink-700">{formatDate(row.uploadedAt)}</p>
          <p className="caption">{row.uploadedByName}</p>
        </div>
      ),
      hideBelow: 'sm',
      sortValue: (row) => row.uploadedAt,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            loading={busy === row.id}
            onClick={async () => {
              setBusy(row.id);
              try {
                const url = await openDocument(row, { purpose: 'view' });
                window.open(url, '_blank', 'noopener');
                void live.refresh();
              } catch (error) {
                toast.error(error, 'The file could not be opened');
              } finally {
                setBusy(null);
              }
            }}
            icon={<Download className="size-3.5" aria-hidden />}
          >
            Open
          </Button>
          {permissions.canUploadDocuments && row.uploadedBy === actor?.uid ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy === row.id}
              onClick={async () => {
                const ok = await confirm({
                  title: 'Delete this document?',
                  message: `${row.name} will be removed from media storage and hidden from the register. The action is audited.`,
                  confirmLabel: 'Delete',
                  tone: 'danger',
                });
                if (!ok) return;
                setBusy(row.id);
                try {
                  await deleteDocument(row);
                  toast.success('Document deleted', row.name);
                  void live.refresh();
                } catch (error) {
                  toast.error(error, 'Delete failed');
                } finally {
                  setBusy(null);
                }
              }}
              icon={<Trash2 className="size-3.5" aria-hidden />}
            >
              Delete
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <AppShell
      title="Documents"
      subtitle={`${rows.length} file${rows.length === 1 ? '' : 's'} you are allowed to see`}
      actions={
        <Button size="sm" variant="secondary" loading={live.loading} onClick={() => void live.refresh()} icon={<RefreshCw className="size-4" aria-hidden />}>
          Refresh
        </Button>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="order-2 xl:order-1">
          {live.error ? <div className="mb-4"><ErrorState message={live.error} onRetry={() => void live.refresh()} /></div> : null}
          <Card bodyClassName="p-0" title="Document register" description="Every row links to stored bytes plus the access list. Sensitive clinical documents are never publicly deliverable.">
            {rows.length === 0 && !live.loading ? (
              <EmptyState
                icon={<FolderOpen className="size-5" aria-hidden />}
                title="No documents in this view"
                description="Upload a lab result, referral letter or scanned maternal card to start the register."
              />
            ) : (
              <DataTable rows={rows} columns={columns} rowKey={(row) => row.id} loading={live.loading} dense pageSize={20} caption="Documents" />
            )}
          </Card>
        </div>

        <div className="order-1 xl:order-2">
          {permissions.canUploadDocuments ? <UploadPanel onUploaded={() => void live.refresh()} /> : (
            <Card title="Uploads are restricted">
              <p className="text-[0.86rem] text-ink-600">Your role can read documents but not add them. Midwives, nurses, CHWs, supervisors and administrators can upload.</p>
            </Card>
          )}

          <Card className="mt-4" title="Storage">
            <NoticeState
              tone={storage.enabled && storage.preset ? 'success' : 'warning'}
              title={storage.enabled && storage.preset ? 'Cloudinary is configured' : 'Cloudinary is not configured'}
              compact
            >
              {storage.enabled && storage.preset
                ? 'Uploads go straight to your Cloudinary account under the mamacare/ folder tree, with a transform-backed delivery URL. The API secret stays on the server.'
                : 'Files are stored on this device so the whole workflow stays testable. Set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET to switch delivery to Cloudinary — no screen changes.'}
            </NoticeState>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function UploadPanel({ onUploaded }: { onUploaded: () => void }) {
  const { actor } = useSession();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const roster = useAsync(() => services().data.motherRoster(actor?.facilityId ?? null), {});
  const [category, setCategory] = useState<DocumentCategory>('MEDICAL');
  const [motherId, setMotherId] = useState('');
  const [description, setDescription] = useState('');
  const [name, setName] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File) => {
    setError(null);
    const parsed = documentMetaSchema.safeParse({
      name: name.trim() || file.name.replace(/\.[^.]+$/, ''),
      category,
      description: description.trim(),
      motherId: motherId || undefined,
      facilityId: actor?.facilityId ?? undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the document details.');
      return;
    }
    setProgress(0);
    try {
      const { record } = await uploadDocument(file, {
        category: parsed.data.category,
        name: parsed.data.name,
        description: parsed.data.description || null,
        motherId: motherId || null,
        facilityId: parsed.data.facilityId ?? null,
        ownerUserId: actor?.uid ?? null,
        onProgress: (percent) => setProgress(percent),
      });
      toast.success('Document uploaded', `${record.name} · ${formatBytes(record.sizeBytes)}`);
      setName('');
      setDescription('');
      if (inputRef.current) inputRef.current.value = '';
      onUploaded();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The upload failed.');
      toast.error(caught, 'Upload failed');
    } finally {
      setProgress(null);
    }
  };

  return (
    <Card title="Upload a document" description="Validated before it leaves the device: type, size and a name for the register.">
      <div className="space-y-3">
        <Field label="Document name" error={error ?? undefined} hint="Defaults to the file name.">
          <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ultrasound report — 28 weeks" />
        </Field>
        <Field label="Category" hint="Sets who may read it and which Cloudinary folder is used.">
          <Select
            value={category}
            options={(Object.keys(DOCUMENT_CATEGORY_LABELS) as DocumentCategory[]).map((key) => ({ value: key, label: DOCUMENT_CATEGORY_LABELS[key] }))}
            onValueChange={(value) => setCategory(value as DocumentCategory)}
            placeholder={null}
          />
        </Field>
        <Field label="Link to mother" optional hint="Leave empty for facility-level documents such as protocols or audit outputs.">
          <Select
            value={motherId}
            placeholder={roster.loading ? 'Loading the roster…' : 'Not linked to a patient'}
            options={(roster.data ?? []).map((mother) => ({ value: mother.id, label: `${mother.fullName} — ${mother.patientId}` }))}
            onValueChange={setMotherId}
          />
        </Field>
        <Field label="Note" optional>
          <TextArea rows={2} value={description} onValueChange={setDescription} placeholder="Result received from the district laboratory." />
        </Field>

        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.txt,application/pdf,image/*,text/plain"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void pick(file);
          }}
        />
        <Button className="w-full" loading={progress !== null} onClick={() => inputRef.current?.click()} icon={<Upload className="size-4" aria-hidden />}>
          Choose a file
        </Button>
        {progress !== null ? <ProgressBar value={progress} label="Transferring" /> : null}
        <p className="caption">
          {`Maximum ${formatBytes(MAX_DOCUMENT_BYTES)}. The browser talks to the media service, never to Cloudinary with a signed request — signatures come from the API, which holds the secret.`}
        </p>
      </div>
    </Card>
  );
}
