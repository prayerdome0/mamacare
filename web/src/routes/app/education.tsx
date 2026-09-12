import { useMemo, useState } from 'react';
import { BookOpen, GraduationCap, Pencil, Plus, RefreshCw } from 'lucide-react';
import { AppShell } from '@/components/layout/shell';
import { useNavScope } from '@/components/layout/nav-scope';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, ErrorState, NoticeState } from '@/components/ui/display';
import { ChipMultiSelect, Field, SearchInput, Select, TextArea, TextInput } from '@/components/ui/form';
import { DataTable, type Column } from '@/components/ui/table';
import { FormDialog } from '@/components/forms/form-dialog';
import { ImageUploader } from '@/components/media/image-uploader';
import { useConfirm, useSession } from '@/providers/app-providers';
import { useDebouncedValue, useLiveQuery } from '@/hooks';
import { useForm } from '@/hooks/use-form';
import { useToast } from '@/components/ui/toast';
import { services } from '@/services/session-store';
import { educationSchema } from '@/lib/validation';
import { formatDate, formatTime } from '@/lib/utils';
import {
  EDUCATION_STAGES,
  EDUCATION_STAGE_LABELS,
  EDUCATION_TOPICS,
  PREFERRED_LANGUAGES,
  type EducationResource,
} from '@/types/domain';
import type { ImageUploadResult } from '@/components/media/image-uploader';

/**
 * The education library. Content is authored here and read by mothers in their
 * own language; a published item is immutable in spirit but editable in place,
 * and every save is audited by the data layer.
 */
export default function EducationPage() {
  const { link: navLink } = useNavScope();
  const { actor, permissions } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const [term, setTerm] = useState('');
  const [stage, setStage] = useState<'ALL' | (typeof EDUCATION_STAGES)[number]>('ALL');
  const [editing, setEditing] = useState<EducationResource | 'new' | null>(null);
  const search = useDebouncedValue(term, 200);

  const live = useLiveQuery('education', { orderBy: { field: 'updatedAt', direction: 'desc' }, limit: 200 });

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (live.data as EducationResource[]).filter((item) => {
      if (stage !== 'ALL' && item.stage !== stage) return false;
      if (needle && !`${item.title} ${item.summary} ${item.topics.join(' ')}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [live.data, search, stage]);

  const publish = async (item: EducationResource, status: 'DRAFT' | 'PUBLISHED') => {
    const ok = await confirm({
      title: status === 'PUBLISHED' ? 'Publish this reading?' : 'Move back to draft?',
      message:
        status === 'PUBLISHED'
          ? 'It becomes available to every mother and health worker in the selected audience and language.'
          : 'Mothers will no longer see it. Health workers can still open it while it is being revised.',
      confirmLabel: status === 'PUBLISHED' ? 'Publish' : 'Move to draft',
    });
    if (!ok) return;
    try {
      await services().data.saveEducationResource({ ...item, status });
      toast.success(status === 'PUBLISHED' ? 'Published' : 'Moved to draft', item.title);
      void live.refresh();
    } catch (error) {
      toast.error(error, 'Could not update the resource');
    }
  };

  const columns: Column<EducationResource>[] = [
    {
      key: 'title',
      header: 'Reading',
      render: (row) => (
        <div className="flex items-start gap-2.5">
          {row.coverImageUrl ? (
            <img src={row.coverImageUrl} alt="" className="size-11 shrink-0 rounded-lg object-cover ring-1 ring-ink-200" loading="lazy" />
          ) : (
            <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-ink-100 text-ink-400" aria-hidden>
              <BookOpen className="size-4" />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-[0.88rem] font-semibold text-ink-900">{row.title}</p>
            <p className="caption mt-0.5 line-clamp-2">{row.summary}</p>
          </div>
        </div>
      ),
      sortValue: (row) => row.title,
    },
    {
      key: 'topics',
      header: 'Topics',
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.topics.slice(0, 3).map((topic) => (
            <Badge key={topic} tone="brand">
              {topic}
            </Badge>
          ))}
          {row.topics.length > 3 ? <Badge tone="neutral">+{row.topics.length - 3}</Badge> : null}
        </div>
      ),
      hideBelow: 'lg',
    },
    {
      key: 'audience',
      header: 'For',
      render: (row) => (
        <div className="text-[0.82rem] text-ink-700">
          <p>{row.audience.map((item) => (item === 'MOTHER' ? 'Mothers' : 'Health workers')).join(' · ')}</p>
          <p className="caption">
            {row.language} · {row.readingMinutes} min · {EDUCATION_STAGE_LABELS[row.stage]}
          </p>
        </div>
      ),
      hideBelow: 'md',
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <div className="space-y-1">
          <Badge tone={row.status === 'PUBLISHED' ? 'green' : 'neutral'}>{row.status === 'PUBLISHED' ? 'Published' : 'Draft'}</Badge>
          <p className="caption">{formatDate(row.updatedAt)}</p>
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) =>
        permissions.canManageEducation ? (
          <div className="flex justify-end gap-1.5">
            <Button size="sm" variant="secondary" onClick={() => setEditing(row)} icon={<Pencil className="size-3.5" aria-hidden />}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void publish(row, row.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED')}>
              {row.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
            </Button>
          </div>
        ) : (
          <span className="caption">{formatTime(row.updatedAt)}</span>
        ),
    },
  ];

  return (
    <AppShell
      title="Education"
      subtitle={`${rows.length} item${rows.length === 1 ? '' : 's'} · ${(live.data as EducationResource[]).filter((row) => row.status === 'PUBLISHED').length} published`}
      actions={
        <>
          <Button size="sm" variant="secondary" loading={live.loading} onClick={() => void live.refresh()} icon={<RefreshCw className="size-4" aria-hidden />}>
            Refresh
          </Button>
          {permissions.canManageEducation ? (
            <Button size="sm" onClick={() => setEditing('new')} icon={<Plus className="size-4" aria-hidden />}>
              New reading
            </Button>
          ) : null}
        </>
      }
    >
      {live.error ? <div className="mb-4"><ErrorState message={live.error} onRetry={() => void live.refresh()} /></div> : null}

      <Card className="mb-4" bodyClassName="p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SearchInput value={term} onValueChange={setTerm} placeholder="Search titles, summaries or topics" className="min-w-[14rem] max-w-sm flex-1" />
          <Select
            value={stage}
            className="w-52"
            options={[
              { value: 'ALL', label: 'Any stage' },
              ...EDUCATION_STAGES.map((key) => ({ value: key, label: EDUCATION_STAGE_LABELS[key] })),
            ]}
            onValueChange={(value) => setStage(value as typeof stage)}
          />
        </div>
      </Card>

      <Card bodyClassName="p-0">
        {rows.length === 0 && !live.loading ? (
          <EmptyState
            icon={<GraduationCap className="size-5" aria-hidden />}
            title="No reading material yet"
            description="Write short, practical pieces in the languages your mothers read. Each one is tagged with topics and the stage of pregnancy it applies to."
            action={
              permissions.canManageEducation ? (
                <Button onClick={() => setEditing('new')}>
                  Write the first piece
                </Button>
              ) : null
            }
          />
        ) : (
          <DataTable rows={rows} columns={columns} rowKey={(row) => row.id} loading={live.loading} dense pageSize={20} caption="Education library" />
        )}
      </Card>

      {!permissions.canManageEducation ? (
        <div className="mt-4">
          <NoticeState tone="info" title="Read-only" compact>
            Your role can read and assign material, but only supervisors and administrators publish it. That keeps clinical content reviewed.
          </NoticeState>
        </div>
      ) : null}

      {editing ? (
        <EducationEditor
          resource={editing === 'new' ? null : editing}
          facilityId={actor?.facilityId ?? null}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void live.refresh();
          }}
        />
      ) : null}
    </AppShell>
  );
}

function EducationEditor({
  resource,
  facilityId,
  onClose,
  onSaved,
}: {
  resource: EducationResource | null;
  facilityId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const form = useForm(educationSchema, {
    title: resource?.title ?? '',
    summary: resource?.summary ?? '',
    body: resource?.body ?? '',
    language: resource?.language ?? 'English',
    topics: resource?.topics ?? [],
    audience: resource?.audience ?? ['MOTHER'],
    stage: resource?.stage ?? 'GENERAL',
    status: resource?.status ?? 'DRAFT',
    facilityId: resource?.facilityId ?? facilityId ?? '',
  });
  const [cover, setCover] = useState<ImageUploadResult | null>(
    resource?.coverImageUrl || resource?.coverImagePublicId
      ? { publicId: resource.coverImagePublicId ?? null, secureUrl: resource.coverImageUrl ?? null }
      : null,
  );
  const topics = form.values.topics ?? [];
  const toggleTopic = (topic: string) =>
    form.setField('topics', topics.includes(topic) ? topics.filter((item) => item !== topic) : [...topics, topic]);
  const audience = form.values.audience ?? [];
  const toggleAudience = (item: 'MOTHER' | 'HEALTH_WORKER') =>
    form.setField(
      'audience',
      (audience.includes(item) ? audience.filter((row) => row !== item) : [...audience, item]) as ('MOTHER' | 'HEALTH_WORKER')[],
    );

  const submit = async () => {
    await form.submit(async (values) => {
      const saved = await services().data.saveEducationResource({
        id: resource?.id,
        title: values.title,
        summary: values.summary,
        body: values.body,
        language: values.language,
        topics: values.topics,
        audience: values.audience as EducationResource['audience'],
        stage: values.stage as EducationResource['stage'],
        status: values.status as 'DRAFT' | 'PUBLISHED',
        facilityId: values.facilityId || null,
        coverImageUrl: cover?.secureUrl ?? null,
        coverImagePublicId: cover?.publicId ?? null,
      });
      toast.success(resource ? 'Reading updated' : 'Reading created', saved.title);
      onSaved();
    });
  };

  return (
    <FormDialog
      open
      onClose={onClose}
      onSubmit={() => void submit()}
      title={resource ? 'Edit reading material' : 'New reading material'}
      description="Plain language, one idea per paragraph, and no dosage instructions that should come from a clinician."
      submitting={form.submitting}
      dirty={form.dirty}
      formError={form.formError}
      submitLabel={resource ? 'Save changes' : 'Create'}
      size="lg"
    >
      <div className="space-y-4">
        <Field label="Title" error={form.errors.title} required>
          <TextInput value={form.values.title} onValueChange={(value) => form.setField('title', value)} onBlur={() => form.blur('title')} invalid={Boolean(form.errors.title)} placeholder="Four danger signs to watch for at 32 weeks" />
        </Field>
        <Field label="Summary" error={form.errors.summary} required hint="Shown in lists and to the mother before she opens it.">
          <TextArea rows={2} value={form.values.summary} onValueChange={(value) => form.setField('summary', value)} onBlur={() => form.blur('summary')} invalid={Boolean(form.errors.summary)} />
        </Field>
        <Field label="Content" error={form.errors.body} required hint="Plain text. Use short paragraphs and numbered steps.">
          <TextArea rows={12} value={form.values.body} onValueChange={(value) => form.setField('body', value)} onBlur={() => form.blur('body')} invalid={Boolean(form.errors.body)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Language" error={form.errors.language} required>
            <Select
              value={form.values.language}
              options={PREFERRED_LANGUAGES.map((language) => ({ value: language, label: language }))}
              onValueChange={(value) => form.setField('language', value)}
              placeholder={null}
            />
          </Field>
          <Field label="Stage" error={form.errors.stage} required>
            <Select
              value={form.values.stage}
              options={EDUCATION_STAGES.map((key) => ({ value: key, label: EDUCATION_STAGE_LABELS[key] }))}
              onValueChange={(value) => form.setField('stage', value as EducationResource['stage'])}
              placeholder={null}
            />
          </Field>
          <Field label="Status" error={form.errors.status} required>
            <Select
              value={form.values.status}
              options={[
                { value: 'DRAFT', label: 'Draft — staff only' },
                { value: 'PUBLISHED', label: 'Published' },
              ]}
              onValueChange={(value) => form.setField('status', value as 'DRAFT' | 'PUBLISHED')}
              placeholder={null}
            />
          </Field>
        </div>
        <Field label="Audience" error={form.errors.audience} required>
          <ChipMultiSelect
            options={[
              { value: 'MOTHER', label: 'Mothers' },
              { value: 'HEALTH_WORKER', label: 'Health workers' },
            ]}
            values={audience}
            onToggle={(value) => toggleAudience(value as 'MOTHER' | 'HEALTH_WORKER')}
          />
        </Field>
        <Field label="Topics" error={form.errors.topics} required hint="Used to match reading to the pregnancy stage on the mother’s plan.">
          <ChipMultiSelect options={EDUCATION_TOPICS.map((topic) => ({ value: topic, label: topic }))} values={topics} onToggle={toggleTopic} />
        </Field>
        <Field label="Cover image" optional hint="Stored in mamacare/education. Optional — lists fall back to an icon.">
          <ImageUploader value={cover} onChange={setCover} folder="education" />
        </Field>
      </div>
    </FormDialog>
  );
}
