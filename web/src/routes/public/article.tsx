/**
 * Single article page.
 *
 * Handles both `/learn/:slug` for an article and `/learn/:category` for a topic
 * landing page, so the footer links and the in-app "read more" links can point at
 * one route. A missing article is a real 404 with a way forward, never a blank page.
 */

import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Flag, Share2 } from 'lucide-react';
import { useAsync } from '@/hooks';
import { articleRepo, reportRepo } from '@/services/repositories';
import { useSession } from '@/providers/app-providers';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/providers/app-providers';
import { ArticleCard, ArticleView } from '@/components/content/article-view';
import { PublicShell } from '@/components/layout/public-shell';
import { CATEGORY_PATHS } from '@/routes/public/learn';
import { CategoryPage } from '@/routes/public/learn';
import { Button } from '@/components/ui/button';
import { Card, SectionHeading } from '@/components/ui/card';
import { EmptyState, LoadingRows } from '@/components/ui/display';

export default function ArticlePage() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const { actor } = useSession();
  const toast = useToast();
  const confirm = useConfirm();

  const category = CATEGORY_PATHS[slug];
  const { data, loading } = useAsync(() => articleRepo.bySlug(slug), { deps: [slug], immediate: !category });

  useEffect(() => {
    if (data) document.title = `${data.title} · Mama Care`;
  }, [data]);

  if (category) {
    return (
      <PublicShell>
        <CategoryPage category={category} />
      </PublicShell>
    );
  }

  if (loading) {
    return (
      <PublicShell>
        <div className="shell py-10">
          <LoadingRows rows={4} />
        </div>
      </PublicShell>
    );
  }

  if (!data) {
    return (
      <PublicShell>
        <div className="shell py-14">
          <EmptyState
            title="We could not find that article"
            description="It may have been renamed or unpublished. The whole library is one tap away."
            action={
              <Link to="/learn" className="btn btn-primary btn-sm">
                Browse the library
              </Link>
            }
          />
        </div>
      </PublicShell>
    );
  }

  const share = async (): Promise<void> => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
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
      title: 'Report this content',
      message:
        'Tell us if something here is wrong, unclear or potentially harmful. A Mama Care administrator reviews every report. This does not remove the article immediately.',
      confirmLabel: 'Send report',
    });
    if (!ok) return;
    await reportRepo.submit({
      targetType: 'article',
      targetId: data.id,
      targetLabel: data.title,
      reason: 'Content concern raised by a reader',
    });
    toast.success('Report sent', 'Thank you — an administrator will review it.');
  };

  return (
    <PublicShell>
      <div className="shell py-8">
        <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm">
          <Link to="/learn" className="inline-flex items-center gap-1.5 text-ink-600 hover:text-brand-800">
            <ArrowLeft className="size-4" aria-hidden />
            Education library
          </Link>
          <span className="text-ink-300">/</span>
          <span className="text-ink-500">{data.category}</span>
        </nav>

        <ArticleView
          article={data}
          footer={
            <div className="actions-wrap">
              <Button variant="secondary" size="sm" onClick={() => void share()} icon={<Share2 className="size-4" aria-hidden />}>
                Share
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void report()} icon={<Flag className="size-4" aria-hidden />}>
                Report a concern
              </Button>
              {!actor ? (
                <Button variant="primary" size="sm" onClick={() => navigate('/register')}>
                  Save your pregnancy week
                </Button>
              ) : (
                <Button variant="primary" size="sm" onClick={() => navigate('/app/guide')}>
                  Open my weekly guide
                </Button>
              )}
            </div>
          }
        />

        <Related slug={data.slug} category={data.category} />
      </div>
    </PublicShell>
  );
}

function Related({ slug, category }: { slug: string; category: string }) {
  const { data } = useAsync(() => articleRepo.byCategory(category as never), { deps: [category] });
  const related = (data ?? []).filter((article) => article.slug !== slug).slice(0, 3);
  if (related.length === 0) return null;

  return (
    <section className="mt-12">
      <SectionHeading eyebrow="Keep reading" title={`More on ${category.replace(/-/g, ' ')}`} />
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {related.map((article) => (
          <ArticleCard key={article.id} article={article} />
        ))}
      </div>
      <Card className="card-pad mt-6">
        <p className="text-sm text-ink-600">
          Reading is only half of it. Record your dates and Mama Care will show you the right week automatically, remind
          you about appointments, and keep your questions in one place.
        </p>
        <div className="mt-3">
          <Link to="/register" className="btn btn-primary btn-sm">
            Create a free account
          </Link>
        </div>
      </Card>
    </section>
  );
}
