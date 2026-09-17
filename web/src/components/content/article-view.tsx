/**
 * Article renderer.
 *
 * The editor produces structured blocks rather than raw HTML, so this component can
 * render content without ever using `dangerouslySetInnerHTML`. A note block carries
 * a tone (info / warning / danger) and is styled accordingly — a danger note is the
 * same red used everywhere else for "seek care", so the visual language is
 * consistent across the app.
 */

import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, BookOpen, Clock3, ShieldCheck, Stethoscope } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import { ARTICLE_CATEGORY_LABELS, type Article, type ArticleBlock } from '@/types/domain';
import { SHORT_DISCLAIMER } from '@/config/site-content';
import { Badge } from '@/components/ui/display';
import { AppImage } from '@/components/media/app-image';
import type { AppImageKey } from '@/services/media/app-images';

const CATEGORY_IMAGE: Record<string, AppImageKey> = {
  pregnancy: 'hero',
  nutrition: 'education',
  'antenatal-care': 'antenatal-consultation',
  activity: 'outreach',
  rest: 'mother-newborn',
  wellbeing: 'community-health-worker',
  labour: 'midwife',
  postnatal: 'mother-newborn',
  newborn: 'newborn-weighing',
  breastfeeding: 'mother-newborn',
  immunization: 'newborn-weighing',
};

export function ArticleView({ article, footer }: { article: Article; footer?: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="brand" icon={<BookOpen className="size-3" aria-hidden />}>
            {ARTICLE_CATEGORY_LABELS[article.category]}
          </Badge>
          {article.weekNumber ? <Badge tone="neutral">Week {article.weekNumber}</Badge> : null}
          <span className="inline-flex items-center gap-1 text-xs text-ink-500">
            <Clock3 className="size-3.5" aria-hidden />
            {article.readMinutes} min read
          </span>
          {article.builtin ? <Badge tone="neutral">Mama Care library</Badge> : null}
        </div>

        <h1 className="display-2 mt-3">{article.title}</h1>
        <p className="lede mt-2">{article.summary}</p>

        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
          <span>By {article.authorName}</span>
          {article.reviewedBy ? (
            <span className="inline-flex items-center gap-1">
              <Stethoscope className="size-3.5" aria-hidden />
              Reviewed by {article.reviewedBy}
              {article.reviewedAt ? ` · ${formatDate(article.reviewedAt, 'short')}` : ''}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[var(--color-risk-amber)]">
              <AlertTriangle className="size-3.5" aria-hidden />
              Awaiting professional review
            </span>
          )}
        </p>
      </header>

      {article.imageUrl || !article.builtin ? (
        <AppImage
          src={article.imageUrl}
          name={CATEGORY_IMAGE[article.category]}
          alt={article.title}
          className="mt-6"
          ratio="16 / 9"
        />
      ) : (
        <AppImage name={CATEGORY_IMAGE[article.category]} alt={article.title} className="mt-6" ratio="16 / 9" />
      )}

      <div className="prose-mamacare mt-7">
        {article.blocks.map((block, index) => (
          <Block key={index} block={block} />
        ))}
      </div>

      <div className="mt-8 rounded-lg border border-ink-200 bg-ink-50 p-4 text-xs leading-relaxed text-ink-600">
        <p className="flex items-center gap-1.5 font-semibold text-ink-800">
          <ShieldCheck className="size-4 text-brand-700" aria-hidden />
          {SHORT_DISCLAIMER}
        </p>
        <p className="mt-1.5">
          If you are worried about your health or your baby's health, contact a qualified healthcare professional. In an
          emergency, seek medical assistance immediately — see the{' '}
          <Link to="/emergency" className="font-semibold text-[var(--color-risk-red)] underline underline-offset-2">
            emergency page
          </Link>
          .
        </p>
      </div>

      {footer ? <div className="mt-6">{footer}</div> : null}
    </article>
  );
}

function Block({ block }: { block: ArticleBlock }) {
  switch (block.type) {
    case 'heading':
      return block.level === 2 ? <h2 className="mt-8 mb-2 text-[1.2rem] font-bold text-ink-900">{block.text}</h2> : <h3>{block.text}</h3>;
    case 'paragraph':
      return <p>{block.text}</p>;
    case 'list':
      return block.ordered ? (
        <ol>
          {block.items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ol>
      ) : (
        <ul>
          {block.items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      );
    case 'note':
      return (
        <div
          className={cn(
            'my-5 rounded-lg border px-4 py-3 text-[0.9rem] leading-relaxed',
            block.tone === 'danger'
              ? 'border-[var(--color-risk-red-border)] bg-[var(--color-risk-red-soft)] text-ink-800'
              : block.tone === 'warning'
                ? 'border-[var(--color-risk-amber-border)] bg-[var(--color-risk-amber-soft)] text-ink-800'
                : 'border-[var(--color-info-border)] bg-[var(--color-info-soft)] text-ink-800',
          )}
          role={block.tone === 'danger' ? 'alert' : undefined}
        >
          <p className="flex items-start gap-2">
            {block.tone !== 'info' ? <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> : null}
            <span>{block.text}</span>
          </p>
        </div>
      );
    default:
      return <Fragment />;
  }
}

/** Compact card for article lists. */
export function ArticleCard({ article, to }: { article: Article; to?: string }) {
  const href = to ?? `/learn/${article.slug}`;
  return (
    <Link
      to={href}
      className="card group flex flex-col overflow-hidden transition-shadow hover:shadow-[var(--shadow-pop)] focus-visible:shadow-[var(--shadow-pop)]"
    >
      <AppImage name={CATEGORY_IMAGE[article.category]} src={article.imageUrl} alt="" ratio="16 / 9" rounded={false} />
      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="brand">{ARTICLE_CATEGORY_LABELS[article.category]}</Badge>
          {article.weekNumber ? <Badge tone="neutral">Week {article.weekNumber}</Badge> : null}
          {article.status !== 'published' ? <Badge tone="amber">{article.status}</Badge> : null}
        </div>
        <h3 className="mt-2.5 text-[0.98rem] leading-snug font-semibold text-ink-900 group-hover:text-brand-800">
          {article.title}
        </h3>
        <p className="mt-1.5 line-clamp-3 flex-1 text-[0.85rem] leading-relaxed text-ink-600">{article.summary}</p>
        <p className="mt-3 flex items-center gap-1 text-xs text-ink-500">
          <Clock3 className="size-3.5" aria-hidden />
          {article.readMinutes} min read
        </p>
      </div>
    </Link>
  );
}

export const categoryImage = (category: string): AppImageKey => CATEGORY_IMAGE[category] ?? 'education';
