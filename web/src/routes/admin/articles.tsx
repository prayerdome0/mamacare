/**
 * Administrator — education content.
 *
 * Publishing is the one content action a provider cannot take, and this is where it
 * happens. The screen keeps the review window visible because guidance goes stale
 * quietly: an article written against 2021 national guidance still reads perfectly
 * in 2026, which is exactly why it needs a date-driven prompt rather than a
 * human remembering.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Archive,
  ArchiveRestore,
  BookOpen,
  CheckCircle2,
  Download,
  Eye,
  Newspaper,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useAsync } from '@/hooks';
import { articleRepo, settingsRepo } from '@/services/repositories';
import { logAudit } from '@/services/audit';
import { useConfirm, useSession } from '@/providers/app-providers';
import { downloadBlob, formatDate, relativeTime, toCsv, toIsoDate, truncate } from '@/lib/utils';
import { ARTICLE_CATEGORY_LABELS, type Article, type ArticleCategory } from '@/types/domain';
import { ArticleBlocks, ArticleEditor } from '@/routes/provider/education';
import { StaffPageHeader, StaffShell } from '@/components/layout/staff-shell';
import { Button } from '@/components/ui/button';
import { Card, SectionHeading, StatCard } from '@/components/ui/card';
import { Badge, ErrorState, LoadingRows } from '@/components/ui/display';
import { SearchInput, Select } from '@/components/ui/form';
import { Modal } from '@/components/ui/overlay';
import { DataTable, type Column } from '@/components/ui/table';
import { SegmentedControl } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';

type StatusFilter = Article['status'] | 'ALL';

export default function AdminArticles() {
  const { actor } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const [status, setStatus] = useState<StatusFilter>('draft');
  const [category, setCategory] = useState<ArticleCategory | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Article | null>(null);
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState<Article | null>(null);

  const { data: articles, loading, error, retryable, run } = useAsync(() => articleRepo.library({ includeDrafts: true }), { immediate: true });
  const { data: settings } = useAsync(() => settingsRepo.get(), { immediate: true });

  const rows = useMemo<Article[]>(() => articles ?? [], [articles]);
  const reviewDays = settings?.contentReviewReminderDays ?? 365;

  const ageInDays = (article: Article): number => {
    const stamp = article.reviewedAt ?? article.updatedAt ?? article.createdAt;
    if (!stamp) return 0;
    return (Date.now() - new Date(stamp).getTime()) / 86_400_000;
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows
      .filter((article) => {
        if (status !== 'ALL' && article.status !== status) return false;
        if (category !== 'ALL' && article.category !== category) return false;
        if (!term) return true;
        return [article.title, article.summary, article.authorName, article.tags.join(' ')].join(' ').toLowerCase().includes(term);
      })
      .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  }, [rows, status, category, search]);

  const counts = useMemo(
    () => ({
      total: rows.length,
      published: rows.filter((article) => article.status === 'published').length,
      drafts: rows.filter((article) => article.status === 'draft').length,
      archived: rows.filter((article) => article.status === 'archived').length,
      builtin: rows.filter((article) => article.builtin).length,
      stale: rows.filter((article) => article.status === 'published' && ageInDays(article) > reviewDays).length,
      unreviewed: rows.filter((article) => !article.reviewedBy).length,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, reviewDays],
  );

  useEffect(() => {
    document.title = 'Articles · Mama Care admin';
  }, []);

  const publish = async (article: Article): Promise<void> => {
    const ok = await confirm({
      title: `Publish “${truncate(article.title, 48)}”?`,
      message: `It becomes visible immediately to ${article.audience === 'public' ? 'everyone, including people who are not signed in' : article.audience === 'mother' ? 'signed-in mothers' : 'providers only'}. Your name is recorded as the reviewer, and the review clock restarts today.`,
      confirmLabel: 'Publish now',
    });
    if (!ok) return;
    await articleRepo.publish(article.id, actor?.displayName ?? 'Administrator');
    toast.success('Published', 'The review window starts today.');
    void run();
  };

  const archive = async (article: Article): Promise<void> => {
    const ok = await confirm({
      title: `Archive “${truncate(article.title, 48)}”?`,
      message: 'It stops appearing in Learn and on the public site but stays in the library. Archive rather than delete — a mother may have bookmarked it.',
      confirmLabel: 'Archive',
    });
    if (!ok) return;
    await articleRepo.update(article.id, { status: 'archived' });
    await logAudit('record-update', 'articles', article.id, 'Archived');
    toast.success('Archived');
    void run();
  };

  const restore = async (article: Article): Promise<void> => {
    await articleRepo.update(article.id, { status: 'draft' });
    await logAudit('record-update', 'articles', article.id, 'Moved back to draft');
    toast.success('Moved to drafts', 'Edit it, then publish again when it is right.');
    void run();
  };

  const remove = async (article: Article): Promise<void> => {
    const ok = await confirm({
      title: `Delete “${truncate(article.title, 48)}”?`,
      message:
        'Permanent. Anyone holding a link gets a “not found” page. Built-in articles cannot be deleted — override them by publishing your own version with the same slug.',
      confirmLabel: 'Delete article',
      tone: 'danger',
    });
    if (!ok) return;
    await articleRepo.remove(article.id);
    await logAudit('record-delete', 'articles', article.id, article.title);
    toast.success('Article deleted');
    void run();
  };

  const exportCsv = async (): Promise<void> => {
    const csv = toCsv(
      ['Title', 'Slug', 'Category', 'Audience', 'Language', 'Week', 'Status', 'Author', 'Reviewed by', 'Reviewed at', 'Read minutes', 'Tags'],
      rows.map((article) => [
        article.title,
        article.slug,
        ARTICLE_CATEGORY_LABELS[article.category],
        article.audience,
        article.language,
        article.weekNumber ?? '',
        article.status,
        article.authorName,
        article.reviewedBy ?? '',
        article.reviewedAt ?? '',
        article.readMinutes,
        article.tags.join(' | '),
      ]),
    );
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `mamacare-articles-${toIsoDate(new Date())}.csv`);
    await logAudit('data-export', 'articles', actor?.uid ?? null, `Exported ${rows.length} articles`);
    toast.success('Export ready');
  };

  const columns: Column<Article>[] = [
    {
      key: 'title',
      header: 'Article',
      sortValue: (row) => row.title,
      render: (row) => (
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <button type="button" className="truncate text-sm font-medium text-ink-800 hover:underline" onClick={() => setPreview(row)}>
              {row.title}
            </button>
            {row.builtin ? <Badge tone="blue">built-in</Badge> : null}
            {row.weekNumber ? <Badge tone="purple">week {row.weekNumber}</Badge> : null}
          </span>
          <span className="mt-0.5 block truncate text-xs text-ink-500">{row.summary}</span>
        </span>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      width: '10rem',
      hideBelow: 'md',
      sortValue: (row) => row.category,
      render: (row) => <Badge tone="neutral">{ARTICLE_CATEGORY_LABELS[row.category]}</Badge>,
    },
    {
      key: 'audience',
      header: 'Audience',
      width: '8rem',
      hideBelow: 'lg',
      render: (row) => <span className="text-xs text-ink-600">{row.audience}</span>,
    },
    {
      key: 'review',
      header: 'Review',
      width: '9rem',
      hideBelow: 'lg',
      sortValue: (row) => ageInDays(row),
      render: (row) => {
        const days = Math.round(ageInDays(row));
        const stale = row.status === 'published' && days > reviewDays;
        return (
          <span className="block text-xs">
            <span className={stale ? 'font-semibold text-[var(--color-risk-red)]' : 'text-ink-600'}>{days} days</span>
            <span className="block text-ink-500">{row.reviewedBy ? truncate(row.reviewedBy, 22) : 'never reviewed'}</span>
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      width: '8rem',
      sortValue: (row) => row.status,
      render: (row) => <Badge tone={row.status === 'published' ? 'green' : row.status === 'draft' ? 'amber' : 'neutral'}>{row.status}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '15rem',
      render: (row) => (
        <div className="actions-wrap justify-end">
          <Button variant="ghost" size="sm" onClick={() => setPreview(row)} aria-label={`Preview ${row.title}`} icon={<Eye className="size-4" aria-hidden />} />
          <Button variant="secondary" size="sm" onClick={() => { setEditing(row); setCreating(false); }} aria-label={`Edit ${row.title}`} icon={<Pencil className="size-4" aria-hidden />} />
          {row.status === 'draft' ? (
            <Button variant="primary" size="sm" onClick={() => void publish(row)} icon={<CheckCircle2 className="size-4" aria-hidden />}>
              Publish
            </Button>
          ) : row.status === 'published' ? (
            <Button variant="ghost" size="sm" onClick={() => void archive(row)} icon={<Archive className="size-4" aria-hidden />}>
              Archive
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => void restore(row)} icon={<ArchiveRestore className="size-4" aria-hidden />}>
              To draft
            </Button>
          )}
          {!row.builtin ? (
            <Button variant="ghost" size="sm" onClick={() => void remove(row)} aria-label={`Delete ${row.title}`} icon={<Trash2 className="size-4" aria-hidden />} />
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <StaffShell portal="Admin Dashboard">
      <StaffPageHeader
        title="Education articles"
        description="Everything a mother can read, plus the drafts clinicians are waiting on you to publish."
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => void run()} icon={<RefreshCw className="size-4" aria-hidden />}>
              Refresh
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void exportCsv()} icon={<Download className="size-4" aria-hidden />}>
              Export
            </Button>
            <Button variant="primary" size="sm" onClick={() => { setCreating(true); setEditing(null); }} icon={<Plus className="size-4" aria-hidden />}>
              New article
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="In the library" value={counts.total} icon={<BookOpen className="size-4" aria-hidden />} hint={`${counts.builtin} built-in`} onClick={() => setStatus('ALL')} />
        <StatCard label="Published" value={counts.published} icon={<Newspaper className="size-4" aria-hidden />} tone="green" onClick={() => setStatus('published')} />
        <StatCard label="Drafts waiting" value={counts.drafts} icon={<Pencil className="size-4" aria-hidden />} tone={counts.drafts > 0 ? 'amber' : 'default'} onClick={() => setStatus('draft')} />
        <StatCard
          label={`Past ${reviewDays}-day review`}
          value={counts.stale}
          icon={<TriangleAlert className="size-4" aria-hidden />}
          tone={counts.stale > 0 ? 'red' : 'green'}
          onClick={() => setStatus('published')}
        />
      </div>

      {counts.stale > 0 ? (
        <Card className="card-pad mt-4 border-[var(--color-risk-red-border)] bg-[var(--color-risk-red-soft)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="card-title">{counts.stale} published article{counts.stale === 1 ? ' is' : 's are'} past the review window</h3>
              <p className="mt-1 text-sm text-ink-700">
                Guidance changes — doses, thresholds, referral criteria. Re-check these against current Ministry of Health and
                WHO material, then publish again to restart the clock. The window is {reviewDays} days and can be changed in
                Settings.
              </p>
            </div>
            <Link to="/admin/settings" className="btn btn-secondary btn-sm">Change the window</Link>
          </div>
        </Card>
      ) : null}

      <Card className="card-pad mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl
            value={status}
            onChange={setStatus}
            ariaLabel="Article status"
            options={[
              { value: 'draft', label: 'Drafts', count: counts.drafts },
              { value: 'published', label: 'Published', count: counts.published },
              { value: 'archived', label: 'Archived', count: counts.archived },
              { value: 'ALL', label: 'All', count: counts.total },
            ]}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Select
              aria-label="Filter by category"
              value={category}
              onChange={(event) => setCategory(event.target.value as ArticleCategory | 'ALL')}
              options={[
                { value: 'ALL', label: 'All categories' },
                ...(Object.keys(ARTICLE_CATEGORY_LABELS) as ArticleCategory[]).map((value) => ({ value, label: ARTICLE_CATEGORY_LABELS[value] })),
              ]}
              className="w-auto min-w-[11rem]"
            />
            <SearchInput value={search} onValueChange={setSearch} placeholder="Search title, author or tag" className="w-full sm:max-w-xs" />
          </div>
        </div>
      </Card>

      <Card className="card-pad mt-4">
        {error ? <ErrorState title="Articles could not be loaded" message={error} onRetry={retryable ? run : undefined} /> : null}
        {loading ? <LoadingRows rows={6} /> : null}
        {!loading && !error ? (
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(row) => row.slug}
            caption="Education library, newest first"
            pageSize={20}
            emptyTitle={counts.drafts === 0 && status === 'draft' ? 'No drafts waiting' : 'Nothing matches'}
            emptyDescription={
              counts.drafts === 0 && status === 'draft'
                ? 'Providers write drafts from their own portal; when one arrives it lands here for review and publishing.'
                : 'Try another status or category.'
            }
            emptyAction={
              status === 'draft' ? (
                <Button variant="primary" size="sm" onClick={() => { setCreating(true); setEditing(null); }}>
                  Write one yourself
                </Button>
              ) : undefined
            }
          />
        ) : null}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="card-pad">
          <SectionHeading eyebrow="Editorial standard" title="Before you publish" />
          <ul className="checklist mt-2 text-sm">
            <li>Does it tell a mother what to <em>do</em>, not just what something is?</li>
            <li>Are the numbers current — doses, thresholds, visit timing — and sourced?</li>
            <li>Is the language plain enough to read on a small screen, in one sitting?</li>
            <li>Does it say when to go to a facility, and never diagnose?</li>
            <li>Would it still be right if read in six months? If not, set a shorter review window.</li>
          </ul>
        </Card>
        <Card className="card-pad">
          <SectionHeading eyebrow="Built-ins" title="Shipped content" />
          <p className="mt-2 text-sm text-ink-600">
            {counts.builtin} articles ship with the app, written against Zambia's antenatal, EPI and postnatal guidance. They
            cannot be deleted. To correct or localise one, publish your own version with the same slug — yours replaces it
            everywhere, including the weekly guide.
          </p>
          <div className="mt-3">
            <Button variant="secondary" size="sm" onClick={() => { setStatus('ALL'); setCategory('ALL'); setSearch(''); }}>
              Show the whole library
            </Button>
          </div>
          <p className="mt-3 text-xs text-ink-500">
            {counts.unreviewed} article{counts.unreviewed === 1 ? ' has' : 's have'} no reviewer recorded — usually a built-in or
            an unfinished draft.
          </p>
        </Card>
      </div>

      <ArticleEditor
        open={creating || Boolean(editing)}
        article={editing}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={() => { setCreating(false); setEditing(null); void run(); }}
      />

      <Modal
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        size="lg"
        title={preview?.title ?? 'Preview'}
        description={
          preview
            ? `${ARTICLE_CATEGORY_LABELS[preview.category]} · ${preview.audience} · ${preview.readMinutes} min read · ${preview.status}${preview.reviewedAt ? ` · reviewed ${formatDate(preview.reviewedAt, 'day')}` : ''}`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setPreview(null)}>Close</Button>
            {preview ? (
              <Link to={`/learn/${preview.slug}`} className="btn btn-secondary btn-sm">
                Open as a reader sees it
              </Link>
            ) : null}
          </>
        }
      >
        {preview ? (
          <>
            <p className="lede">{preview.summary}</p>
            <p className="mt-2 text-xs text-ink-500">
              By {preview.authorName || 'Mama Care'} · last updated {relativeTime(preview.updatedAt ?? preview.createdAt)}
              {preview.tags.length > 0 ? ` · ${preview.tags.join(', ')}` : ''}
            </p>
            <div className="mt-4">
              <ArticleBlocks blocks={preview.blocks} />
            </div>
          </>
        ) : null}
      </Modal>
    </StaffShell>
  );
}
