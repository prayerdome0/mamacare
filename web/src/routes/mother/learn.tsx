/**
 * Learn — the education hub inside the app.
 *
 * The public library is organised for browsing. This one is organised for *her*:
 * it opens with the topic that matches her current week or her baby's stage, keeps
 * a saved list that works offline, and puts the warning signs one tap away from
 * every article.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Bookmark, BookmarkCheck, BookOpen, Flag, Search, Share2, Sparkles } from 'lucide-react';
import {useAsync, useLocalState} from '@/hooks';
import { useMotherContext } from '@/hooks/use-mother';
import { articleRepo, reportRepo } from '@/services/repositories';
import { useConfirm, useSession } from '@/providers/app-providers';
import { weekGuide } from '@/config/weekly-guide';
import { formatBabyAge, ageInMonths } from '@/config/baby-development';
import { ARTICLE_CATEGORY_LABELS, type Article, type ArticleCategory } from '@/types/domain';
import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { ArticleCard, ArticleView, categoryImage } from '@/components/content/article-view';
import { AppImage } from '@/components/media/app-image';
import { Button } from '@/components/ui/button';
import { Card, SectionHeading } from '@/components/ui/card';
import { Badge, EmptyState, ErrorState, LoadingRows } from '@/components/ui/display';
import { SearchInput } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

const CATEGORY_ORDER: ArticleCategory[] = [
  'pregnancy',
  'antenatal-care',
  'nutrition',
  'activity',
  'rest',
  'wellbeing',
  'labour',
  'postnatal',
  'breastfeeding',
  'newborn',
  'immunization',
];

export default function MotherLearnPage() {
  const { slug } = useParams();
  if (slug) return <ArticleReader slug={slug} />;
  return <Library />;
}

/* ── Library ───────────────────────────────────────────────────────────── */

function Library() {
  const mother = useMotherContext();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<ArticleCategory | ''>('');
  const [onlySaved, setOnlySaved] = useState(false);
  const [saved, setSaved] = useLocalState<string[]>('mamacare.savedArticles', []);

  const { data, loading, error, retryable, run } = useAsync(() => articleRepo.library({ audience: 'public' }), { deps: [] });
  const articles = useMemo<Article[]>(() => data ?? [], [data]);

  const relevantCategory: ArticleCategory | null = useMemo(() => {
    if (mother.mode === 'pregnancy' && mother.ga) {
      if (mother.ga.weeks < 14) return 'pregnancy';
      if (mother.ga.weeks < 28) return 'nutrition';
      if (mother.ga.weeks < 36) return 'antenatal-care';
      return 'labour';
    }
    if (mother.mode === 'postnatal') {
      const months = mother.activeBaby ? ageInMonths(mother.activeBaby.dateOfBirth).months : 0;
      return months < 6 ? 'breastfeeding' : 'newborn';
    }
    return null;
  }, [mother.mode, mother.ga, mother.activeBaby]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return articles
      .filter((article) => (category ? article.category === category : true))
      .filter((article) => (onlySaved ? saved.includes(article.id) : true))
      .filter((article) =>
        needle
          ? [article.title, article.summary, ...article.tags].join(' ').toLowerCase().includes(needle)
          : true,
      );
  }, [articles, category, onlySaved, saved, search]);

  const forMyWeek = useMemo(() => {
    if (!mother.ga) return [];
    return articles.filter((article) => article.weekNumber === mother.ga!.weeks).slice(0, 3);
  }, [articles, mother.ga]);

  const savedArticles = useMemo(() => articles.filter((article) => saved.includes(article.id)), [articles, saved]);

  useEffect(() => {
    document.title = 'Learn · Mama Care';
  }, []);

  const toggleSaved = (article: Article): void => {
    setSaved((current) => (current.includes(article.id) ? current.filter((id) => id !== article.id) : [...current, article.id]));
  };

  return (
    <AppShell>
      <PageHeader
        title="Learn"
        description={
          mother.mode === 'pregnancy' && mother.ga
            ? `Topics for week ${mother.ga.weeks}, plus the whole library. Anything you open stays available offline on this device.`
            : mother.mode === 'postnatal' && mother.activeBaby
              ? `Topics for ${mother.activeBaby.name} at ${formatBabyAge(mother.activeBaby.dateOfBirth)}, plus your own recovery.`
              : 'Reliable information on pregnancy, birth, recovery and newborn care — free, and written for Zambia.'
        }
        actions={
          <Link to="/app/emergency" className="btn btn-danger btn-sm">
            <AlertTriangle className="size-4" aria-hidden /> Warning signs
          </Link>
        }
      />

      {relevantCategory ? (
        <Card className="card-pad mb-4 border-brand-200 bg-brand-50/40">
          <div className="flex flex-wrap items-start gap-4">
            <AppImage name={categoryImage(relevantCategory)} alt="" ratio="4 / 3" className="hidden w-40 shrink-0 rounded-lg sm:block" />
            <div className="min-w-0 flex-1">
              <Badge tone="brand">
                <Sparkles className="size-3" aria-hidden /> For you right now
              </Badge>
              <h2 className="card-title mt-2">{ARTICLE_CATEGORY_LABELS[relevantCategory]}</h2>
              <p className="mt-1 text-sm text-ink-600">
                {mother.mode === 'pregnancy'
                  ? `Week ${mother.ga?.weeks ?? ''} — ${weekGuide(mother.ga?.weeks ?? 1).size}. This topic matters most at this stage.`
                  : 'Your baby is in the first months, when feeding and sleep are the two things families ask about most.'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="primary" size="sm" onClick={() => setCategory(relevantCategory)}>
                  Read {ARTICLE_CATEGORY_LABELS[relevantCategory]}
                </Button>
                {mother.mode === 'pregnancy' ? (
                  <Link to="/app/guide" className="btn btn-secondary btn-sm">
                    This week’s guide
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      {forMyWeek.length > 0 ? (
        <div className="mb-6">
          <SectionHeading eyebrow={`Week ${mother.ga?.weeks ?? ''}`} title="Attached to your week" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {forMyWeek.map((article) => (
              <SavedArticleCard key={article.id} article={article} saved={saved.includes(article.id)} onToggle={() => toggleSaved(article)} />
            ))}
          </div>
        </div>
      ) : null}

      <Card className="card-pad">
        <SearchInput value={search} onValueChange={setSearch} placeholder="Search the library — malaria, iron, labour, feeding" />
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button type="button" className={cn('chip', category === '' && 'chip-active')} aria-pressed={category === ''} onClick={() => setCategory('')}>
            All topics
          </button>
          {CATEGORY_ORDER.map((item) => (
            <button
              key={item}
              type="button"
              className={cn('chip', category === item && 'chip-active')}
              aria-pressed={category === item}
              onClick={() => setCategory(item)}
            >
              {ARTICLE_CATEGORY_LABELS[item]}
            </button>
          ))}
          <button
            type="button"
            className={cn('chip', onlySaved && 'chip-active')}
            aria-pressed={onlySaved}
            onClick={() => setOnlySaved((value) => !value)}
          >
            <Bookmark className="size-3.5" aria-hidden /> Saved ({saved.length})
          </button>
        </div>
      </Card>

      {error ? <ErrorState className="mt-4" title="The library could not be loaded" message={error} onRetry={retryable ? run : undefined} /> : null}
      {loading ? <LoadingRows className="mt-4" rows={3} /> : null}

      {!loading && !error && filtered.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={onlySaved ? <Bookmark className="size-6" aria-hidden /> : <Search className="size-6" aria-hidden />}
          title={onlySaved && saved.length === 0 ? 'Nothing saved yet' : 'Nothing matches that search'}
          description={
            onlySaved && saved.length === 0
              ? 'Tap the bookmark on any article to keep it here. Saved articles are the ones you are most likely to want without data.'
              : 'Try a different word — for example “malaria”, “iron”, “labour” or “feeding”.'
          }
          action={
            onlySaved ? (
              <Button variant="secondary" size="sm" onClick={() => setOnlySaved(false)}>
                Browse everything
              </Button>
            ) : undefined
          }
        />
      ) : null}

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((article) => (
          <SavedArticleCard key={article.id} article={article} saved={saved.includes(article.id)} onToggle={() => toggleSaved(article)} />
        ))}
      </div>

      {savedArticles.length > 0 && !onlySaved ? (
        <div className="mt-8">
          <SectionHeading eyebrow="Offline" title="Saved for later" description="These stay readable on this device even with no connection." />
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {savedArticles.slice(0, 3).map((article) => (
              <SavedArticleCard key={article.id} article={article} saved onToggle={() => toggleSaved(article)} />
            ))}
          </div>
        </div>
      ) : null}

      <Card className="card-pad mt-8 border-ink-200 bg-ink-50">
        <h3 className="card-title">About this library</h3>
        <p className="mt-1 text-sm leading-relaxed text-ink-700">
          Built-in articles follow national and WHO guidance and are written for a general audience — they cannot account
          for your own history. Content added by clinics is reviewed by a qualified maternal-health professional before it
          is published, and the reviewer is named on the article.
        </p>
        <p className="mt-2 text-sm text-ink-600">
          Reading is not a diagnosis. If something here makes you worried about yourself or your baby, contact your
          facility — that is always the right move.
        </p>
      </Card>
    </AppShell>
  );
}

function SavedArticleCard({ article, saved, onToggle }: { article: Article; saved: boolean; onToggle: () => void }) {
  return (
    <div className="relative">
      <ArticleCard article={article} to={`/app/learn/${article.slug}`} />
      <button
        type="button"
        onClick={onToggle}
        aria-label={saved ? `Remove ${article.title} from saved` : `Save ${article.title} for offline reading`}
        aria-pressed={saved}
        className={cn(
          'absolute top-2 right-2 grid size-8 place-items-center rounded-full border bg-white/95 shadow-[var(--shadow-card)] transition-colors',
          saved ? 'border-brand-400 text-brand-700' : 'border-ink-200 text-ink-500 hover:text-brand-700',
        )}
      >
        {saved ? <BookmarkCheck className="size-4" aria-hidden /> : <Bookmark className="size-4" aria-hidden />}
      </button>
    </div>
  );
}

/* ── Reader ────────────────────────────────────────────────────────────── */

function ArticleReader({ slug }: { slug: string }) {
  const { actor } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [saved, setSaved] = useLocalState<string[]>('mamacare.savedArticles', []);

  const { data, loading, error } = useAsync(() => articleRepo.bySlug(slug), { deps: [slug] });
  const { data: related, loading: relatedLoading } = useAsync(
    () => (data ? articleRepo.byCategory(data.category) : Promise.resolve([] as Article[])),
    { deps: [data?.category], immediate: Boolean(data) },
  );

  useEffect(() => {
    if (data) document.title = `${data.title} · Mama Care`;
  }, [data]);

  if (loading) {
    return (
      <AppShell>
        <LoadingRows rows={4} />
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell>
        <EmptyState
          className="my-8"
          icon={<BookOpen className="size-6" aria-hidden />}
          title="That article is not available"
          description="It may have been renamed or unpublished. The rest of the library is one tap away."
          action={
            <Link to="/app/learn" className="btn btn-primary btn-sm">
              Back to the library
            </Link>
          }
        />
      </AppShell>
    );
  }

  const isSaved = saved.includes(data.id);
  const others = (related ?? []).filter((article) => article.id !== data.id).slice(0, 3);

  const share = async (): Promise<void> => {
    const url = `${window.location.origin}/learn/${data.slug}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: data.title, text: data.summary, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success('Link copied', 'Share it with someone who needs it.');
    } catch {
      toast.info('Sharing is not available in this browser.');
    }
  };

  const report = async (): Promise<void> => {
    const ok = await confirm({
      title: 'Report a concern about this article',
      message:
        'Tell us if something here is wrong, unclear or potentially harmful. An administrator reviews every report. Reporting does not remove the article immediately.',
      confirmLabel: 'Send report',
    });
    if (!ok) return;
    await reportRepo.submit({
      targetType: 'article',
      targetId: data.id,
      targetLabel: data.title,
      reason: 'Content concern raised by a mother in the app',
      details: actor ? `Raised by ${actor.displayName}` : null,
    });
    toast.success('Report sent', 'Thank you — an administrator will review it.');
  };

  return (
    <AppShell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/app/learn')} icon={<ArrowLeft className="size-4" aria-hidden />}>
          Library
        </Button>
        <div className="actions-wrap">
          <Button
            variant={isSaved ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => {
              setSaved((current) => (isSaved ? current.filter((id) => id !== data.id) : [...current, data.id]));
              toast.success(isSaved ? 'Removed from saved' : 'Saved for offline reading', data.title);
            }}
            icon={isSaved ? <BookmarkCheck className="size-4" aria-hidden /> : <Bookmark className="size-4" aria-hidden />}
          >
            {isSaved ? 'Saved' : 'Save offline'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void share()} icon={<Share2 className="size-4" aria-hidden />}>
            Share
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void report()} icon={<Flag className="size-4" aria-hidden />}>
            Report
          </Button>
        </div>
      </div>

      <ArticleView article={data} />

      <Card className="card-pad mt-6 border-[var(--color-risk-amber-border)] bg-[var(--color-risk-amber-soft)]">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-[var(--color-risk-amber)]" aria-hidden />
          <div>
            <h3 className="card-title">Reading is not a diagnosis</h3>
            <p className="mt-1 text-sm text-ink-700">
              This article is written for a general audience and cannot account for your own history. If something you read
              makes you worried about yourself or your baby, contact your facility — and if a warning sign is present, go
              now rather than waiting to read more.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link to="/app/emergency" className="btn btn-danger btn-sm">
                Warning signs & what to do
              </Link>
              <Link to="/app/messages" className="btn btn-secondary btn-sm">
                Ask my provider
              </Link>
            </div>
          </div>
        </div>
      </Card>

      <div className="mt-8">
        <SectionHeading eyebrow="Keep reading" title={`More on ${ARTICLE_CATEGORY_LABELS[data.category]}`} />
        {relatedLoading ? <LoadingRows className="mt-4" rows={2} /> : null}
        {!relatedLoading && others.length === 0 ? (
          <p className="mt-3 text-sm text-ink-600">
            Nothing else in this topic yet. <Link to="/app/learn" className="font-medium text-brand-800 hover:underline">Browse the whole library</Link>.
          </p>
        ) : null}
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {others.map((article) => (
            <SavedArticleCard
              key={article.id}
              article={article}
              saved={saved.includes(article.id)}
              onToggle={() => setSaved((current) => (current.includes(article.id) ? current.filter((id) => id !== article.id) : [...current, article.id]))}
            />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
