/**
 * Provider education screen.
 *
 * Clinicians write the guidance their patients actually need — in local language,
 * about local foods, local clinics. The editor works with structured blocks rather
 * than raw HTML: nothing a provider types can execute in a mother's browser, and
 * rendering stays identical in the app, the public site and any future export.
 *
 * Publishing is an administrator action. A provider saves a draft and submits it;
 * the button they see says exactly what will happen next.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Archive,
  BookOpen,
  CheckCircle2,
  Eye,
  FileText,
  Layers,
  ListOrdered,
  Pencil,
  Plus,
  Send,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useAsync } from '@/hooks';
import { articleRepo } from '@/services/repositories';
import { permissionsFor } from '@/services/policy/policy';
import { logAudit } from '@/services/audit';
import { useConfirm, useSession } from '@/providers/app-providers';
import { formatDate, relativeTime, titleCase, toIsoDate, truncate } from '@/lib/utils';
import { ImageUploader, type ImageUploadResult } from '@/components/media/image-uploader';
import {
  ARTICLE_CATEGORY_LABELS,
  LANGUAGES,
  type Article,
  type ArticleBlock,
  type ArticleCategory,
  type ArticleAudience,
  type LanguageCode,
} from '@/types/domain';
import { StaffPageHeader, StaffShell } from '@/components/layout/staff-shell';
import { Button } from '@/components/ui/button';
import { Card, SectionHeading, StatCard } from '@/components/ui/card';
import { Badge, EmptyState, ErrorState, LoadingRows } from '@/components/ui/display';
import { CheckboxRow, Field, FieldGrid, NumberField, Select, TextArea, TextInput } from '@/components/ui/form';
import { Modal } from '@/components/ui/overlay';
import { SegmentedControl, Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || `article-${Date.now().toString(36)}`;

const wordCount = (blocks: ArticleBlock[]): number =>
  blocks.reduce((count, block) => {
    if (block.type === 'list') return count + block.items.join(' ').split(/\s+/).filter(Boolean).length;
    return count + block.text.split(/\s+/).filter(Boolean).length;
  }, 0);

const readMinutes = (blocks: ArticleBlock[]): number => Math.max(1, Math.round(wordCount(blocks) / 190));

export default function ProviderEducation() {
  const { actor } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const permissions = permissionsFor(actor);
  const [tab, setTab] = useState<'drafts' | 'published' | 'library'>('drafts');
  const [editing, setEditing] = useState<Article | null>(null);
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState<Article | null>(null);

  const { data: drafts, loading: draftsLoading, run: refreshDrafts } = useAsync(() => articleRepo.drafts(), { immediate: true });
  const { data: library, loading, error, retryable, run } = useAsync(() => articleRepo.library({ includeDrafts: true }), { immediate: true });

  const all = useMemo<Article[]>(() => library ?? [], [library]);
  const draftRows = useMemo<Article[]>(() => drafts ?? [], [drafts]);
  const publishedRows = all.filter((article) => article.status === 'published' && !article.builtin);
  const builtinRows = all.filter((article) => article.builtin);
  const listed = tab === 'drafts' ? draftRows : tab === 'published' ? publishedRows : builtinRows;

  useEffect(() => {
    document.title = 'Education · Mama Care';
  }, []);

  const publish = async (article: Article): Promise<void> => {
    if (!permissions.canPublishContent) {
      toast.info('Submitted for review', 'An administrator publishes education content so every article is checked before it reaches a mother.');
      return;
    }
    const ok = await confirm({
      title: `Publish “${truncate(article.title, 48)}”?`,
      message: 'It becomes visible in the Learn section and on the public site immediately. Your name is recorded as the reviewer.',
      confirmLabel: 'Publish now',
    });
    if (!ok) return;
    await articleRepo.publish(article.id, actor?.displayName ?? 'Administrator');
    toast.success('Published');
    void run();
    void refreshDrafts();
  };

  const archive = async (article: Article): Promise<void> => {
    const ok = await confirm({
      title: 'Archive this article?',
      message: 'It stops appearing in the Learn section but is kept in the library so it can be restored or referenced later.',
      confirmLabel: 'Archive',
    });
    if (!ok) return;
    await articleRepo.update(article.id, { status: 'archived' });
    await logAudit('record-update', 'articles', article.id, 'Archived');
    toast.success('Archived');
    void run();
    void refreshDrafts();
  };

  const remove = async (article: Article): Promise<void> => {
    const ok = await confirm({
      title: `Delete “${truncate(article.title, 48)}”?`,
      message: 'This removes the draft permanently. A published article should be archived instead so nobody loses a link to it.',
      confirmLabel: 'Delete draft',
      tone: 'danger',
    });
    if (!ok) return;
    await articleRepo.remove(article.id);
    await logAudit('record-delete', 'articles', article.id, article.title);
    toast.success('Draft deleted');
    void run();
    void refreshDrafts();
  };

  return (
    <StaffShell portal="Healthcare Portal">
      <StaffPageHeader
        title="Health education"
        description="Write the guidance your patients need, in the language and the terms they use. Drafts are yours until an administrator publishes them."
        actions={
          <Button variant="primary" size="sm" onClick={() => setCreating(true)} icon={<Plus className="size-4" aria-hidden />}>
            New article
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="My drafts" value={draftRows.length} icon={<FileText className="size-4" aria-hidden />} tone={draftRows.length > 0 ? 'amber' : 'default'} onClick={() => setTab('drafts')} />
        <StatCard label="Published articles" value={publishedRows.length} icon={<CheckCircle2 className="size-4" aria-hidden />} tone="green" onClick={() => setTab('published')} />
        <StatCard label="Built-in library" value={builtinRows.length} icon={<Layers className="size-4" aria-hidden />} onClick={() => setTab('library')} />
      </div>

      <Card className="card-pad mt-4">
        <Tabs
          value={tab}
          onChange={(value) => setTab(value as typeof tab)}
          ariaLabel="Article lists"
          items={[
            { id: 'drafts', label: 'Drafts', count: draftRows.length },
            { id: 'published', label: 'Published', count: publishedRows.length },
            { id: 'library', label: 'Built-in library', count: builtinRows.length },
          ]}
        />
        {error ? <ErrorState className="mt-4" title="The library could not be loaded" message={error} onRetry={retryable ? run : undefined} /> : null}
        {(loading || draftsLoading) && !error ? <LoadingRows className="mt-4" rows={4} /> : null}
        {!loading && !error && listed.length === 0 ? (
          <EmptyState
            className="mt-4"
            icon={<BookOpen className="size-6" aria-hidden />}
            title={tab === 'drafts' ? 'No drafts' : tab === 'published' ? 'Nothing published yet' : 'The built-in library is empty'}
            description={
              tab === 'drafts'
                ? 'Start with something a patient asked you twice this week. Two hundred clear words beat two thousand general ones.'
                : tab === 'published'
                  ? 'When an administrator publishes one of your drafts it appears here with the review date.'
                  : 'Built-in articles ship with the app and can be overridden by publishing your own version with the same slug.'
            }
            action={
              tab === 'drafts' ? (
                <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
                  Write an article
                </Button>
              ) : undefined
            }
          />
        ) : null}

        <ul className="mt-4 space-y-3">
          {listed.map((article) => (
            <li key={article.id} className="rounded-lg border border-ink-200 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="card-title">{article.title}</h3>
                    <Badge tone={article.status === 'published' ? 'green' : article.status === 'archived' ? 'neutral' : 'amber'}>{article.status}</Badge>
                    {article.builtin ? <Badge tone="blue">built-in</Badge> : null}
                    <Badge tone="neutral">{ARTICLE_CATEGORY_LABELS[article.category]}</Badge>
                    {article.weekNumber ? <Badge tone="purple">week {article.weekNumber}</Badge> : null}
                  </div>
                  <p className="mt-1 text-sm text-ink-600">{article.summary}</p>
                  <p className="mt-1.5 text-xs text-ink-500">
                    {article.authorName || 'Unknown author'} · {article.readMinutes} min read ·{' '}
                    {article.reviewedBy ? `reviewed by ${article.reviewedBy} on ${formatDate(article.reviewedAt, 'day')}` : 'not reviewed'} ·{' '}
                    updated {relativeTime(article.updatedAt)}
                  </p>
                </div>
                <div className="actions-wrap">
                  <Button variant="ghost" size="sm" onClick={() => setPreview(article)} icon={<Eye className="size-4" aria-hidden />}>
                    Preview
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => { setEditing(article); setCreating(false); }} icon={<Pencil className="size-4" aria-hidden />}>
                    Edit
                  </Button>
                  {article.status !== 'published' ? (
                    <Button variant="primary" size="sm" onClick={() => void publish(article)} icon={<Send className="size-4" aria-hidden />}>
                      {permissions.canPublishContent ? 'Publish' : 'Submit for review'}
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => void archive(article)} icon={<Archive className="size-4" aria-hidden />}>
                      Archive
                    </Button>
                  )}
                  {!article.builtin && article.status !== 'published' ? (
                    <Button variant="ghost" size="sm" onClick={() => void remove(article)} icon={<Trash2 className="size-4" aria-hidden />} aria-label={`Delete ${article.title}`} />
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {!permissions.canPublishContent ? (
        <Card className="card-pad mt-4 border-[var(--color-risk-amber-border)] bg-[var(--color-risk-amber-soft)]">
          <h3 className="card-title">Review before publishing</h3>
          <p className="mt-1.5 text-sm text-ink-700">
            Providers can write and save; only an administrator publishes. That single rule keeps every article that reaches a
            pregnant woman checked by a second clinician — including the built-in ones, which are attributed to Zambia's
            Ministry of Health and WHO guidance.
          </p>
        </Card>
      ) : null}

      <ArticleEditor
        open={creating || Boolean(editing)}
        article={editing}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={() => { setCreating(false); setEditing(null); void run(); void refreshDrafts(); }}
      />

      <Modal
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={preview?.title ?? 'Preview'}
        description={preview ? `${ARTICLE_CATEGORY_LABELS[preview.category]} · ${preview.readMinutes} min read · audience: ${preview.audience}` : undefined}
        size="lg"
        footer={<Button variant="secondary" onClick={() => setPreview(null)}>Close</Button>}
      >
        {preview ? <ArticleBlocks blocks={preview.blocks} /> : null}
      </Modal>
    </StaffShell>
  );
}

export function ArticleBlocks({ blocks }: { blocks: ArticleBlock[] }) {
  return (
    <div className="prose-mamacare">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          return block.level === 2 ? <h2 key={index}>{block.text}</h2> : <h3 key={index}>{block.text}</h3>;
        }
        if (block.type === 'list') {
          const items = block.items.map((item, i) => <li key={i}>{item}</li>);
          return block.ordered ? <ol key={index}>{items}</ol> : <ul key={index}>{items}</ul>;
        }
        if (block.type === 'note') {
          return (
            <p key={index} className={`alert alert-${block.tone === 'danger' ? 'error' : block.tone}`}>
              {block.text}
            </p>
          );
        }
        return <p key={index}>{block.text}</p>;
      })}
    </div>
  );
}

export function ArticleEditor({
  open,
  article,
  onClose,
  onSaved,
}: {
  open: boolean;
  article: Article | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { actor } = useSession();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [category, setCategory] = useState<ArticleCategory>('antenatal-care');
  const [audience, setAudience] = useState<ArticleAudience>('mother');
  const [language, setLanguage] = useState<LanguageCode>('en');
  const [weekNumber, setWeekNumber] = useState<string>('');
  const [tags, setTags] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [blocks, setBlocks] = useState<ArticleBlock[]>([{ type: 'paragraph', text: '' }]);
  const [cover, setCover] = useState<ImageUploadResult | null>(null);
  const [keepCover, setKeepCover] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(article?.title ?? '');
    setSummary(article?.summary ?? '');
    setCategory(article?.category ?? 'antenatal-care');
    setAudience(article?.audience ?? 'mother');
    setLanguage(article?.language ?? 'en');
    setWeekNumber(article?.weekNumber ? String(article.weekNumber) : '');
    setTags((article?.tags ?? []).join(', '));
    setAuthorName(article?.authorName || actor?.displayName || '');
    setBlocks(article?.blocks?.length ? article.blocks : [{ type: 'paragraph', text: '' }]);
    setCover(article?.imageUrl ? { publicId: article.imagePublicId, secureUrl: article.imageUrl } : null);
    setKeepCover(true);
    setFormError(null);
  }, [open, article, actor?.displayName]);

  const updateBlock = (index: number, patch: Partial<ArticleBlock>): void => {
    setBlocks((current) => current.map((block, i) => (i === index ? ({ ...block, ...patch } as ArticleBlock) : block)));
  };

  const save = async (asDraft: boolean): Promise<void> => {
    setFormError(null);
    if (title.trim().length < 6) { setFormError('Give the article a title of at least six characters.'); return; }
    if (summary.trim().length < 20) { setFormError('The summary needs at least 20 characters — it is what a mother reads before she decides to open it.'); return; }
    const cleanBlocks = blocks
      .map((block) => (block.type === 'list' ? { ...block, items: block.items.filter((item) => item.trim()) } : block))
      .filter((block) => (block.type === 'list' ? block.items.length > 0 : block.text.trim().length > 0));
    if (cleanBlocks.length === 0) { setFormError('Add at least one block of content.'); return; }

    setSaving(true);
    try {
      const week = weekNumber.trim() ? Number(weekNumber) : null;
      const payload = {
        slug: article?.slug ?? slugify(title),
        title: title.trim(),
        summary: summary.trim(),
        category,
        weekNumber: week && week >= 1 && week <= 42 ? week : null,
        audience,
        language,
        blocks: cleanBlocks,
        imageUrl: keepCover ? cover?.secureUrl ?? article?.imageUrl ?? null : null,
        imagePublicId: keepCover ? cover?.publicId ?? article?.imagePublicId ?? null : null,
        tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        status: (article?.status ?? 'draft') as Article['status'],
        authorName: authorName.trim() || actor?.displayName || 'Mama Care contributor',
        reviewedBy: article?.reviewedBy ?? null,
        reviewedAt: article?.reviewedAt ?? null,
        readMinutes: readMinutes(cleanBlocks),
      };
      if (article) {
        await articleRepo.update(article.id, payload);
        await logAudit('record-update', 'articles', article.id, payload.title);
      } else {
        await articleRepo.create(payload);
        await logAudit('record-create', 'articles', slugify(title), payload.title);
      }
      toast.success(asDraft ? 'Draft saved' : 'Saved', asDraft ? 'Only you and other staff can see it until it is published.' : undefined);
      onSaved();
    } catch {
      setFormError('That did not save. Check the connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={article ? 'Edit article' : 'Write an article'}
      description="Structured blocks only — headings, paragraphs, lists and notes. No HTML, no scripts, and the same content renders identically for every reader."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="secondary" onClick={() => void save(true)} loading={saving}>Save draft</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Title" htmlFor="ed-title" required hint="Say what it is about in the words a patient uses.">
          <TextInput id="ed-title" value={title} onValueChange={setTitle} placeholder="e.g. Iron tablets: taking them without feeling sick" />
        </Field>
        <Field label="Summary" htmlFor="ed-summary" required hint="One or two sentences shown in the list.">
          <TextArea id="ed-summary" rows={2} value={summary} onChange={(event) => setSummary(event.target.value)} />
        </Field>
        <FieldGrid columns={3}>
          <Field label="Category" htmlFor="ed-category">
            <Select
              id="ed-category"
              value={category}
              onChange={(event) => setCategory(event.target.value as ArticleCategory)}
              options={(Object.keys(ARTICLE_CATEGORY_LABELS) as ArticleCategory[]).map((value) => ({ value, label: ARTICLE_CATEGORY_LABELS[value] }))}
            />
          </Field>
          <Field label="Audience" htmlFor="ed-audience">
            <Select
              id="ed-audience"
              value={audience}
              onChange={(event) => setAudience(event.target.value as ArticleAudience)}
              options={[
                { value: 'mother', label: 'Mothers (signed in)' },
                { value: 'public', label: 'Everyone (public site)' },
                { value: 'provider', label: 'Providers only' },
              ]}
            />
          </Field>
          <Field label="Language" htmlFor="ed-language">
            <Select
              id="ed-language"
              value={language}
              onChange={(event) => setLanguage(event.target.value as LanguageCode)}
              options={LANGUAGES.map((item) => ({ value: item.code, label: item.available ? item.label : `${item.label} (interface coming soon)` }))}
            />
          </Field>
        </FieldGrid>
        <FieldGrid columns={3}>
          <Field label="Attach to pregnancy week" optional hint="1–42 to show it in the weekly guide.">
            <NumberField label="Week" value={weekNumber} onValueChange={setWeekNumber} min={1} max={42} />
          </Field>
          <Field label="Tags" htmlFor="ed-tags" optional hint="Comma separated.">
            <TextInput id="ed-tags" value={tags} onValueChange={setTags} placeholder="anaemia, iron, nutrition" />
          </Field>
          <Field label="Author" htmlFor="ed-author" required>
            <TextInput id="ed-author" value={authorName} onValueChange={setAuthorName} />
          </Field>
        </FieldGrid>

        <ImageUploader
          folder="education"
          label="Cover image"
          value={cover}
          onChange={setCover}
          hint="Optional. Uploaded to the public media library — never use an image that identifies a patient."
        />
        {article?.imageUrl ? (
          <CheckboxRow
            checked={keepCover}
            onChange={setKeepCover}
            label="Keep the existing cover image"
            description="Untick to remove it when you save."
          />
        ) : null}

        <div>
          <h3 className="card-title">Content</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setBlocks((current) => [...current, { type: 'paragraph', text: '' }])} icon={<FileText className="size-4" aria-hidden />}>
              Paragraph
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setBlocks((current) => [...current, { type: 'heading', text: '', level: 2 }])} icon={<Pencil className="size-4" aria-hidden />}>
              Heading
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setBlocks((current) => [...current, { type: 'list', items: [''] }])} icon={<ListOrdered className="size-4" aria-hidden />}>
              List
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setBlocks((current) => [...current, { type: 'note', text: '', tone: 'info' }])} icon={<TriangleAlert className="size-4" aria-hidden />}>
              Note
            </Button>
          </div>

          <ul className="mt-3 space-y-3">
            {blocks.map((block, index) => (
              <li key={index} className="rounded-lg border border-ink-200 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <Badge tone="neutral">{titleCase(block.type)}</Badge>
                  <div className="actions-wrap">
                    <Button variant="ghost" size="sm" onClick={() => setBlocks((current) => current.filter((_, i) => i !== index))} icon={<Trash2 className="size-3.5" aria-hidden />} aria-label="Remove block" />
                  </div>
                </div>
                {block.type === 'list' ? (
                  <div className="space-y-2">
                    {block.items.map((item, itemIndex) => (
                      <div key={itemIndex} className="flex items-center gap-2">
                        <TextInput
                          value={item}
                          onValueChange={(value) =>
                            updateBlock(index, {
                              items: block.items.map((existing, i) => (i === itemIndex ? value : existing)),
                            } as Partial<ArticleBlock>)
                          }
                          placeholder="One item per line"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Remove item"
                          onClick={() => updateBlock(index, { items: block.items.filter((_, i) => i !== itemIndex) } as Partial<ArticleBlock>)}
                        >
                          ×
                        </Button>
                      </div>
                    ))}
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" size="sm" onClick={() => updateBlock(index, { items: [...block.items, ''] } as Partial<ArticleBlock>)}>
                        Add item
                      </Button>
                      <CheckboxRow
                        checked={Boolean(block.ordered)}
                        onChange={(checked) => updateBlock(index, { ordered: checked } as Partial<ArticleBlock>)}
                        label="Numbered list"
                      />
                    </div>
                  </div>
                ) : block.type === 'heading' ? (
                  <div className="space-y-2">
                    <TextInput value={block.text} onValueChange={(value) => updateBlock(index, { text: value } as Partial<ArticleBlock>)} placeholder="Heading text" />
                    <SegmentedControl
                      value={String(block.level)}
                      onChange={(value) => updateBlock(index, { level: Number(value) === 3 ? 3 : 2 } as Partial<ArticleBlock>)}
                      ariaLabel="Heading level"
                      options={[{ value: '2', label: 'Section' }, { value: '3', label: 'Sub-section' }]}
                    />
                  </div>
                ) : block.type === 'note' ? (
                  <div className="space-y-2">
                    <TextArea rows={2} value={block.text} onChange={(event) => updateBlock(index, { text: event.target.value } as Partial<ArticleBlock>)} placeholder="A safety note, warning or reminder to ask a clinician." />
                    <SegmentedControl
                      value={block.tone}
                      onChange={(value) => updateBlock(index, { tone: value as 'info' | 'warning' | 'danger' } as Partial<ArticleBlock>)}
                      ariaLabel="Note tone"
                      options={[
                        { value: 'info', label: 'Information' },
                        { value: 'warning', label: 'Warning' },
                        { value: 'danger', label: 'Seek care' },
                      ]}
                    />
                  </div>
                ) : (
                  <TextArea rows={4} value={block.text} onChange={(event) => updateBlock(index, { text: event.target.value } as Partial<ArticleBlock>)} placeholder="Write in short sentences. One idea per paragraph." />
                )}
              </li>
            ))}
          </ul>
        </div>

        {formError ? <p className="alert alert-error">{formError}</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-ink-50 px-3 py-2">
          <p className="text-xs text-ink-600">
            {wordCount(blocks)} words · about {readMinutes(blocks)} min read · draft saved {toIsoDate(new Date())}
          </p>
          <Link to="/learn" className="btn btn-ghost btn-sm">
            See how readers view this
          </Link>
        </div>
      </div>
    </Modal>
  );
}
