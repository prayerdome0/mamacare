import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { AppShell } from '@/components/layout/shell';
import { Card } from '@/components/ui/card';
import { Badge, EmptyState, ErrorState, LoadingRows } from '@/components/ui/display';
import { Modal } from '@/components/ui/overlay';
import { Button } from '@/components/ui/button';
import { useAsync } from '@/hooks';
import { services } from '@/services/session-store';
import { useMotherRecord } from '@/routes/mother/shared';
import { EDUCATION_STAGE_LABELS, type EducationResource } from '@/types/domain';

/**
 * Reading chosen for her: published items addressed to mothers, in her language
 * first, ordered by the stage she is in. Opening a piece records that it was read
 * so her clinic can follow up on what matters.
 */
export default function MotherEducation() {
  const [params, setParams] = useSearchParams();
  const { chart } = useMotherRecord();
  const resources = useAsync(() => services().data.listEducation('MOTHER', null), {});

  const language = chart.data?.mother.preferredLanguage ?? null;
  const weeks = chart.data?.mother.gestationalSnapshot?.weeks ?? null;
  const stage = weeks === null ? 'GENERAL' : weeks < 14 ? 'FIRST_TRIMESTER' : weeks < 28 ? 'SECOND_TRIMESTER' : weeks < 37 ? 'THIRD_TRIMESTER' : 'LABOUR';
  const openId = params.get('open');
  const current = (resources.data ?? []).find((row) => row.id === openId) ?? null;

  useEffect(() => {
    if (openId && current) void services().data.readEducation(current.id).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  const rows = useMemo(() => {
    const all = resources.data ?? [];
    const score = (row: EducationResource) =>
      (language && row.language === language ? 2 : 0) + (row.stage === stage ? 3 : 0) + (row.stage === 'GENERAL' ? 1 : 0);
    return [...all].sort((a, b) => score(b) - score(a) || b.updatedAt.localeCompare(a.updatedAt));
  }, [resources.data, language, stage]);

  const close = () => {
    const next = new URLSearchParams(params);
    next.delete('open');
    setParams(next, { replace: true });
  };

  return (
    <AppShell
      title="Reading for you"
      subtitle={
        language
          ? `Shown in ${language} where possible · ${EDUCATION_STAGE_LABELS[stage as keyof typeof EDUCATION_STAGE_LABELS] ?? 'any time'}`
          : 'Short pieces your clinic has chosen for this stage'
      }
    >
      {resources.error ? <div className="mb-4"><ErrorState message={resources.error} onRetry={() => void resources.run()} /></div> : null}

      {resources.loading && rows.length === 0 ? (
        <Card>
          <LoadingRows rows={3} />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BookOpen className="size-5" aria-hidden />}
            title="Nothing published for you yet"
            description="Your clinic writes short pieces about pregnancy, birth and the first weeks with your baby. Ask your midwife if you would like something explained — reading is never a substitute for asking."
          />
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => {
                  const next = new URLSearchParams(params);
                  next.set('open', row.id);
                  setParams(next, { replace: true });
                }}
                className="card h-full w-full p-4 text-left transition-shadow hover:shadow-[var(--shadow-pop)] focus-visible:ring-2 focus-visible:ring-brand-600/40"
              >
                {row.coverImageUrl ? (
                  <img src={row.coverImageUrl} alt="" loading="lazy" className="mb-3 aspect-[16/9] w-full rounded-lg object-cover ring-1 ring-ink-200" />
                ) : null}
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="brand">{EDUCATION_STAGE_LABELS[row.stage]}</Badge>
                  <Badge tone="neutral">{row.language}</Badge>
                  <Badge tone="neutral">{row.readingMinutes} min</Badge>
                  {language && row.language !== language ? <Badge tone="amber">not in your language</Badge> : null}
                </div>
                <p className="mt-2 text-[0.95rem] font-semibold text-ink-900">{row.title}</p>
                <p className="muted mt-1 text-[0.86rem] leading-relaxed">{row.summary}</p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {current ? (
        <Modal
          open
          onClose={close}
          title={current.title}
          description={`${current.language} · ${current.readingMinutes} minute read`}
          size="lg"
          footer={
            <Button onClick={close} variant="secondary">
              Close
            </Button>
          }
        >
          <article className="prose-mamacare max-w-none">
            {current.body
              .split(/\n{2,}/)
              .map((paragraph, index) => (
                // Reading material is authored by the clinic; it is stored as plain
                // text, so paragraphs are rendered as text and never as HTML.
                <p key={index}>{paragraph}</p>
              ))}
          </article>
          <p className="caption mt-4 border-t border-ink-100 pt-3">
            This is general guidance from your clinic. It does not replace the advice of the midwife or doctor looking after you — if something feels wrong,
            call or come in.
          </p>
        </Modal>
      ) : null}
    </AppShell>
  );
}
