/**
 * Education library (public).
 *
 * The built-in library and any articles published in the database are merged here,
 * so a clinic can add its own content and it appears beside the shipped material.
 * Filtering is by category, by pregnancy week and by free text, and every card says
 * how long the article takes to read — a mother on a phone in a queue needs to know
 * whether she has time.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookOpen, Search, Sparkles } from 'lucide-react';
import { useAsync } from '@/hooks';
import { articleRepo } from '@/services/repositories';
import { weekGuide } from '@/config/weekly-guide';
import { ARTICLE_CATEGORY_LABELS, type Article, type ArticleCategory } from '@/types/domain';
import { AppImage } from '@/components/media/app-image';
import { PublicHero } from '@/components/layout/public-shell';
import { ArticleCard } from '@/components/content/article-view';
import { Card, SectionHeading } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/display';
import { SearchInput } from '@/components/ui/form';
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

/** Paths that mean "show me a category", not "show me an article". */
export const CATEGORY_PATHS: Record<string, ArticleCategory> = {
  pregnancy: 'pregnancy',
  nutrition: 'nutrition',
  antenatal: 'antenatal-care',
  'antenatal-care': 'antenatal-care',
  activity: 'activity',
  rest: 'rest',
  wellbeing: 'wellbeing',
  labour: 'labour',
  postnatal: 'postnatal',
  newborn: 'newborn',
  breastfeeding: 'breastfeeding',
  immunization: 'immunization',
};

export default function LearnPage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const { data, loading, error, retryable, run } = useAsync(() => articleRepo.library(), { deps: [] });

  const category = (params.get('category') as ArticleCategory | null) ?? null;
  const week = params.get('week') ? Number(params.get('week')) : null;

  const articles = useMemo<Article[]>(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return articles
      .filter((article) => (category ? article.category === category : true))
      .filter((article) => (week ? article.weekNumber === week : true))
      .filter((article) =>
        term
          ? article.title.toLowerCase().includes(term) ||
            article.summary.toLowerCase().includes(term) ||
            article.tags.some((tag) => tag.toLowerCase().includes(term))
          : true,
      );
  }, [articles, category, week, search]);

  useEffect(() => {
    document.title = category
      ? `${ARTICLE_CATEGORY_LABELS[category]} · Mama Care`
      : week
        ? `Week ${week} · Mama Care`
        : 'Health education · Mama Care';
  }, [category, week]);

  const currentWeekGuide = week ? weekGuide(week) : null;

  const setCategory = (next: ArticleCategory | null): void => {
    const params2 = new URLSearchParams();
    if (next) params2.set('category', next);
    setParams(params2, { replace: true });
  };

  return (
    <>
      <PublicHero
        eyebrow="Health education"
        title="Reliable information, in plain language"
        lede="Pregnancy, labour, postnatal recovery, breastfeeding, newborn care and immunization — written for mothers and reviewed by maternal-health professionals. Everything here is free and works offline once opened."
        image={<AppImage name="education" alt="A health educator speaking with a group of mothers" ratio="4 / 3" />}
      >
        <SearchInput value={search} onValueChange={setSearch} placeholder="Search the library" className="max-w-sm" />
      </PublicHero>

      <section className="shell py-8">
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <Chip active={category === null && week === null} onClick={() => setCategory(null)}>
            All topics
          </Chip>
          {CATEGORY_ORDER.map((item) => (
            <Chip key={item} active={category === item} onClick={() => setCategory(item)}>
              {ARTICLE_CATEGORY_LABELS[item]}
            </Chip>
          ))}
        </div>

        {week ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-600">
              Showing content for <strong className="text-ink-900">week {week}</strong>
              {currentWeekGuide ? ` · ${currentWeekGuide.size}` : ''}
            </p>
            <Link to="/learn" className="btn btn-ghost btn-sm">
              Clear week filter
            </Link>
          </div>
        ) : null}

        <div className="mt-6">
          {loading ? <LoadingRows rows={6} /> : null}
          {error && !loading ? (
            <ErrorState
              title="The library could not be loaded"
              message={error}
              onRetry={retryable ? run : undefined}
            />
          ) : null}
          {!loading && !error && filtered.length === 0 ? (
            <EmptyState
              icon={<BookOpen className="size-6" aria-hidden />}
              title="No articles match that search"
              description="Try another topic, or clear the filters to see the whole library."
            />
          ) : null}
          {!loading && !error && filtered.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </div>
          ) : null}
        </div>

        {!category && !week && !loading && !error ? (
          <div className="mt-12">
            <SectionHeading eyebrow="Start here" title="The four things most mothers ask about" />
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { slug: 'first-antenatal-visit', label: 'Your first antenatal visit' },
                { slug: 'danger-signs-in-pregnancy', label: 'Danger signs in pregnancy' },
                { slug: 'signs-labour-has-started', label: 'How to tell labour has started' },
                { slug: 'breastfeeding-basics', label: 'Breastfeeding basics' },
              ].map((item) => {
                const article = articles.find((entry) => entry.slug === item.slug);
                return article ? (
                  <Link key={item.slug} to={`/learn/${item.slug}`} className="card card-pad group transition-shadow hover:shadow-[var(--shadow-pop)]">
                    <Sparkles className="size-5 text-brand-700" aria-hidden />
                    <p className="mt-2.5 text-[0.95rem] font-semibold text-ink-900 group-hover:text-brand-800">{item.label}</p>
                    <p className="mt-1 line-clamp-2 text-[0.82rem] text-ink-600">{article.summary}</p>
                  </Link>
                ) : null;
              })}
            </div>
          </div>
        ) : null}
      </section>
    </>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn('chip shrink-0', active && 'chip-active')}>
      {children}
    </button>
  );
}

/** Category landing page, e.g. /learn/immunization. */
export function CategoryPage({ category }: { category: ArticleCategory }) {
  const { data, loading } = useAsync(() => articleRepo.byCategory(category), { deps: [category] });
  const articles = data ?? [];
  return (
    <section className="shell py-10">
      <SectionHeading eyebrow="Health education" title={ARTICLE_CATEGORY_LABELS[category]} />
      {loading ? <LoadingRows rows={3} /> : null}
      {!loading && articles.length === 0 ? (
        <Card className="card-pad mt-6">
          <EmptyState title="Nothing published in this topic yet" description="Check back soon, or browse the whole library." />
          <div className="mt-4">
            <Link to="/learn" className="btn btn-secondary btn-sm">
              Browse the library
            </Link>
          </div>
        </Card>
      ) : null}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {articles.map((article) => (
          <ArticleCard key={article.id} article={article} />
        ))}
      </div>
    </section>
  );
}
