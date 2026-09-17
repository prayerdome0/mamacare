/**
 * Weekly guide.
 *
 * The 42-week pregnancy guide plus the postnatal baby-development stages. It opens
 * on the week the mother is actually in — not on week one — because a guide that
 * makes you search for your own week is a guide you stop opening.
 *
 * Every week carries the questions worth asking at a visit. That list exists because
 * a three-minute consultation is not enough time to think of them there.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ArrowRight, BookOpen, ChevronDown, Moon, Sparkles, Utensils } from 'lucide-react';
import {useAsync} from '@/hooks';
import { useMotherContext } from '@/hooks/use-mother';
import { articleRepo } from '@/services/repositories';
import { ALL_WEEKS, TRIMESTER_RANGES, weekGuide } from '@/config/weekly-guide';
import { BABY_STAGES, SAFE_SLEEP, ageInMonths, formatBabyAge, stageForAgeInMonths } from '@/config/baby-development';
import { formatGestationalAge } from '@/lib/obstetrics';
import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { ArticleCard } from '@/components/content/article-view';
import { TrimesterTrack } from '@/components/pregnancy/pregnancy-widgets';
import { Button } from '@/components/ui/button';
import { Card, SectionHeading } from '@/components/ui/card';
import { Badge, EmptyState, LoadingRows, RiskBadge } from '@/components/ui/display';
import { Select } from '@/components/ui/form';
import { SegmentedControl } from '@/components/ui/tabs';
import type { Article, ArticleCategory } from '@/types/domain';

export default function WeeklyGuidePage() {
  const mother = useMotherContext();
  const [week, setWeek] = useState<number | null>(null);
  const [view, setView] = useState<'pregnancy' | 'baby'>('pregnancy');

  const currentWeek = mother.ga?.weeks ?? null;
  const selectedWeek = week ?? currentWeek ?? 1;
  const guide = useMemo(() => weekGuide(selectedWeek), [selectedWeek]);
  const trimester = TRIMESTER_RANGES.find((range) => selectedWeek >= range.from && selectedWeek <= range.to);

  const { data: weekArticles, loading: articlesLoading } = useAsync(
    () => articleRepo.byWeek(selectedWeek),
    { deps: [selectedWeek] },
  );
  const { data: postnatalArticles } = useAsync(
    () => Promise.all([articleRepo.byCategory('postnatal' as ArticleCategory), articleRepo.byCategory('newborn' as ArticleCategory), articleRepo.byCategory('breastfeeding' as ArticleCategory)]),
    { deps: [], immediate: mother.mode === 'postnatal' || view === 'baby' },
  );

  useEffect(() => {
    if (mother.mode === 'postnatal') setView('baby');
  }, [mother.mode]);

  useEffect(() => {
    document.title =
      view === 'baby' ? 'Baby development · Mama Care' : `Week ${selectedWeek} guide · Mama Care`;
  }, [selectedWeek, view]);

  const baby = mother.activeBaby;
  const babyAge = baby ? ageInMonths(baby.dateOfBirth) : null;
  const stage = babyAge ? stageForAgeInMonths(babyAge.months) : null;
  const postnatal = useMemo<Article[]>(
    () => (postnatalArticles ?? []).flat().filter((article, index, all) => all.findIndex((other) => other.id === article.id) === index).slice(0, 6),
    [postnatalArticles],
  );

  return (
    <AppShell>
      <PageHeader
        title="Weekly guide"
        description={
          mother.ga
            ? `You are ${formatGestationalAge(mother.ga)} today. This guide opens on your week — browse any other week below.`
            : 'Browse any week of pregnancy, or switch to the baby stages. Add your dates in the tracker and this page will open on your week automatically.'
        }
        badge={mother.ga ? <Badge tone="brand">Week {mother.ga.weeks}</Badge> : undefined}
        actions={
          <SegmentedControl
            value={view}
            onChange={setView}
            ariaLabel="Guide view"
            options={[
              { value: 'pregnancy', label: 'Pregnancy' },
              { value: 'baby', label: 'Baby' },
            ]}
          />
        }
      />

      {view === 'pregnancy' ? (
        <>
          <Card className="card-pad">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="section-eyebrow">{trimester?.label ?? 'Pregnancy'}</p>
                <h2 className="display-2">Week {guide.week}</h2>
                <p className="mt-1 text-sm text-ink-600">Your baby is about the size of {guide.size}.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={selectedWeek <= 1}
                  onClick={() => setWeek(Math.max(1, selectedWeek - 1))}
                  icon={<ArrowLeft className="size-4" aria-hidden />}
                  aria-label="Previous week"
                >
                  Prev
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={selectedWeek >= 42}
                  onClick={() => setWeek(Math.min(42, selectedWeek + 1))}
                  iconRight={<ArrowRight className="size-4" aria-hidden />}
                  aria-label="Next week"
                >
                  Next
                </Button>
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
              <label className="block">
                <span className="label">Jump to a week</span>
                <Select
                  value={String(selectedWeek)}
                  onChange={(event) => setWeek(Number(event.target.value))}
                  options={ALL_WEEKS.map((item) => ({
                    value: String(item.week),
                    label: `Week ${item.week}${currentWeek === item.week ? ' · you are here' : ''}`,
                  }))}
                />
              </label>
              {currentWeek ? (
                <Button variant="ghost" size="sm" className="self-end" onClick={() => setWeek(currentWeek)}>
                  Back to my week ({currentWeek})
                </Button>
              ) : null}
            </div>

            <div className="mt-5">
              <TrimesterTrack ga={mother.ga} />
            </div>
          </Card>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card className="card-pad">
              <h3 className="card-title">Your baby this week</h3>
              <p className="mt-2 leading-relaxed text-ink-700">{guide.baby}</p>
            </Card>
            <Card className="card-pad">
              <h3 className="card-title">Your body this week</h3>
              <p className="mt-2 leading-relaxed text-ink-700">{guide.body}</p>
            </Card>
          </div>

          {guide.milestone ? (
            <Card className="card-pad mt-4 border-green-200 bg-green-50">
              <div className="flex items-start gap-3">
                <Sparkles className="mt-0.5 size-5 shrink-0 text-green-700" aria-hidden />
                <div>
                  <h3 className="card-title">{guide.milestone}</h3>
                  <p className="mt-1 text-sm text-ink-700">
                    Milestones like this are worth noting — and worth telling your family about.
                  </p>
                </div>
              </div>
            </Card>
          ) : null}

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card className="card-pad">
              <SectionHeading eyebrow="At your visit" title="Questions worth asking" />
              <ul className="checklist mt-3">
                {guide.ask.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-ink-500">
                Consultations are short. Reading these beforehand is the difference between leaving with answers and
                leaving with questions.
              </p>
            </Card>

            <Card className="card-pad">
              <SectionHeading eyebrow="This trimester" title="Habits that help" />
              <ul className="checklist mt-3">
                {guide.habits.map((habit) => (
                  <li key={habit}>{habit}</li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to="/app/reminders" className="btn btn-secondary btn-sm">
                  Medication reminders
                </Link>
                <Link to="/app/journal" className="btn btn-ghost btn-sm">
                  Note how I feel
                </Link>
              </div>
            </Card>
          </div>

          {guide.warnings.length > 0 ? (
            <Card className="card-pad mt-4 border-[var(--color-risk-amber-border)] bg-[var(--color-risk-amber-soft)]">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-[var(--color-risk-amber)]" aria-hidden />
                <div className="min-w-0">
                  <h3 className="card-title">Watch for this in week {guide.week}</h3>
                  <ul className="mt-2 space-y-2">
                    {guide.warnings.map((sign) => (
                      <li key={sign.title}>
                        <span className="flex flex-wrap items-center gap-2">
                          <RiskBadge level={sign.level} short />
                          <span className="text-sm font-semibold text-ink-800">{sign.title}</span>
                        </span>
                        <span className="mt-0.5 block text-sm text-ink-700">{sign.detail}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3">
                    <Link to="/app/emergency" className="btn btn-danger btn-sm">
                      All warning signs & what to do
                    </Link>
                  </div>
                </div>
              </div>
            </Card>
          ) : null}

          <div className="mt-8">
            <SectionHeading eyebrow="Reading" title={`Articles for week ${guide.week}`} />
            {articlesLoading ? <LoadingRows className="mt-4" rows={2} /> : null}
            {!articlesLoading && (weekArticles ?? []).length === 0 ? (
              <EmptyState
                className="mt-4"
                icon={<BookOpen className="size-6" aria-hidden />}
                title="No article is attached to this week yet"
                description="The library is organised by topic as well as by week — everything is still available to read."
                action={
                  <Link to="/app/learn" className="btn btn-secondary btn-sm">
                    Browse the library
                  </Link>
                }
              />
            ) : null}
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(weekArticles ?? []).map((article) => (
                <ArticleCard key={article.id} article={article} to={`/app/learn/${article.slug}`} />
              ))}
            </div>
          </div>
        </>
      ) : (
        <BabyView
          stage={stage}
          ageLabel={baby ? formatBabyAge(baby.dateOfBirth) : null}
          babyName={baby?.name ?? null}
          months={babyAge?.months ?? 0}
          articles={postnatal}
          hasBaby={Boolean(baby)}
        />
      )}
    </AppShell>
  );
}

function BabyView({
  stage,
  ageLabel,
  babyName,
  months,
  articles,
  hasBaby,
}: {
  stage: ReturnType<typeof stageForAgeInMonths> | null;
  ageLabel: string | null;
  babyName: string | null;
  months: number;
  articles: Article[];
  hasBaby: boolean;
}) {
  const [openStage, setOpenStage] = useState<string | null>(stage?.label ?? null);

  if (!hasBaby || !stage) {
    return (
      <Card className="card-pad">
        <EmptyState
          icon={<BookOpen className="size-6" aria-hidden />}
          title="Add your baby to open the right stage"
          description="The baby guide is organised by age in months. Add your baby's date of birth and Mama Care will open on the stage they are in — you can still browse every stage below."
          action={
            <Link to="/app/baby" className="btn btn-primary btn-sm">
              Add my baby
            </Link>
          }
        />
        <div className="mt-6 space-y-2">
          {BABY_STAGES.map((item) => (
            <StageCard key={item.label} stage={item} open={openStage === item.label} onToggle={() => setOpenStage(openStage === item.label ? null : item.label)} />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card className="card-pad border-brand-200 bg-brand-50/40">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="micro">{babyName ?? 'Your baby'}</p>
            <p className="mt-1 text-lg font-bold text-ink-900">{ageLabel}</p>
            <p className="mt-1 text-sm text-ink-600">{stage.label}</p>
          </div>
          <Link to="/app/baby" className="btn btn-primary btn-sm">
            Open baby record
          </Link>
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="card-pad">
          <div className="flex items-center gap-2">
            <Utensils className="size-4 text-brand-700" aria-hidden />
            <h3 className="card-title">Feeding</h3>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-ink-700">{stage.feeding}</p>
        </Card>
        <Card className="card-pad">
          <div className="flex items-center gap-2">
            <Moon className="size-4 text-brand-700" aria-hidden />
            <h3 className="card-title">Sleep</h3>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-ink-700">{stage.sleep}</p>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="card-pad">
          <h3 className="card-title">What they are learning</h3>
          <ul className="checklist mt-2">
            {stage.development.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Card>
        <Card className="card-pad">
          <h3 className="card-title">Play that helps</h3>
          <ul className="checklist mt-2">
            {stage.play.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="card-pad mt-4 border-[var(--color-risk-amber-border)] bg-[var(--color-risk-amber-soft)]">
        <h3 className="card-title">Raise these with a health worker</h3>
        <p className="mt-1 text-sm text-ink-700">
          Every baby develops at their own pace. These are the things worth mentioning at a clinic visit — not a checklist
          of failures.
        </p>
        <ul className="mt-3 space-y-1.5">
          {stage.talkToProvider.map((item) => (
            <li key={item} className="flex gap-2 text-sm text-ink-800">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--color-risk-amber)]" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/app/emergency" className="btn btn-danger btn-sm">
            Newborn warning signs
          </Link>
          <Link to="/app/baby" className="btn btn-secondary btn-sm">
            Immunization card
          </Link>
        </div>
      </Card>

      <Card className="card-pad mt-4">
        <h3 className="card-title">Safe sleep — at every stage</h3>
        <ul className="checklist mt-2">
          {SAFE_SLEEP.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Card>

      <div className="mt-8">
        <SectionHeading eyebrow="All stages" title="Browse by age" />
        <div className="mt-4 space-y-2">
          {BABY_STAGES.map((item) => (
            <StageCard
              key={item.label}
              stage={item}
              open={openStage === item.label}
              current={item.label === stage.label}
              months={months}
              onToggle={() => setOpenStage(openStage === item.label ? null : item.label)}
            />
          ))}
        </div>
      </div>

      {articles.length > 0 ? (
        <div className="mt-8">
          <SectionHeading eyebrow="Reading" title="Postnatal & newborn articles" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((article) => (
              <ArticleCard key={article.id} article={article} to={`/app/learn/${article.slug}`} />
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

function StageCard({
  stage,
  open,
  onToggle,
  current,
  months,
}: {
  stage: (typeof BABY_STAGES)[number];
  open: boolean;
  onToggle: () => void;
  current?: boolean;
  months?: number;
}) {
  const isCurrent = current ?? (months !== undefined && months >= stage.months[0] && months < stage.months[1]);
  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-ink-800">{stage.label}</span>
          {isCurrent ? <Badge tone="brand">Current stage</Badge> : null}
        </span>
        <ChevronDown className={`size-4 shrink-0 text-ink-500 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open ? (
        <div className="border-t border-ink-100 px-4 py-3">
          <p className="text-sm text-ink-700">
            <strong className="font-semibold text-ink-900">Feeding: </strong>
            {stage.feeding}
          </p>
          <p className="mt-2 text-sm text-ink-700">
            <strong className="font-semibold text-ink-900">Sleep: </strong>
            {stage.sleep}
          </p>
          <p className="micro mt-3">Learning</p>
          <ul className="checklist mt-1">
            {stage.development.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="micro mt-3">Play</p>
          <ul className="checklist mt-1">
            {stage.play.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
