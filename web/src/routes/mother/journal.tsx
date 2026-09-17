/**
 * Personal health journal.
 *
 * The one collection in Mama Care that is never shared — not with a linked provider,
 * not with an approved supporter. That is stated on the screen itself, because a
 * journal people suspect is being read is a journal people do not write in.
 *
 * It is also the place where "how I am feeling" is allowed to be complicated. Low
 * mood in pregnancy and after birth is common and treatable, and the screen points
 * somewhere real rather than offering advice.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookHeart, Lock, NotebookPen, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import {useAsync} from '@/hooks';
import { useMotherContext } from '@/hooks/use-mother';
import { journalRepo } from '@/services/repositories';
import { useConfirm, useSession } from '@/providers/app-providers';
import { journalSchema, validate } from '@/lib/validation';
import { formatDate, relativeTime, toIsoDate } from '@/lib/utils';
import { type JournalEntry, type JournalMood } from '@/types/domain';
import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, SectionHeading, StatCard } from '@/components/ui/card';
import { Badge, EmptyState, ErrorState, LoadingRows } from '@/components/ui/display';
import { Field, SearchInput, Select, TextArea, TextInput } from '@/components/ui/form';
import { Modal } from '@/components/ui/overlay';
import { SegmentedControl } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

const MOODS: { value: JournalMood; label: string; tone: 'green' | 'brand' | 'neutral' | 'amber' | 'red' }[] = [
  { value: 'great', label: 'Great', tone: 'green' },
  { value: 'good', label: 'Good', tone: 'green' },
  { value: 'okay', label: 'Okay', tone: 'neutral' },
  { value: 'low', label: 'Low', tone: 'amber' },
  { value: 'struggling', label: 'Struggling', tone: 'red' },
];

const moodMeta = (mood: JournalMood | null) => MOODS.find((item) => item.value === mood) ?? null;

export default function JournalPage() {
  const mother = useMotherContext();
  const { actor } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const uid = actor?.uid ?? '';

  const [view, setView] = useState<'all' | 'low'>('all');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, loading, error, retryable, run } = useAsync(() => journalRepo.list(uid), {
    deps: [uid],
    immediate: Boolean(uid),
  });

  const entries = useMemo<JournalEntry[]>(() => data ?? [], [data]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return entries
      .filter((entry) => (view === 'low' ? entry.mood === 'low' || entry.mood === 'struggling' : true))
      .filter((entry) =>
        needle ? [entry.title, entry.body, ...entry.tags].join(' ').toLowerCase().includes(needle) : true,
      );
  }, [entries, view, search]);

  const toughDays = entries.filter((entry) => entry.mood === 'low' || entry.mood === 'struggling').length;
  const lastEntry = entries[0] ?? null;

  useEffect(() => {
    document.title = 'Journal · Mama Care';
  }, []);

  const remove = async (entry: JournalEntry): Promise<void> => {
    const ok = await confirm({
      title: 'Delete this entry',
      message: `“${entry.title}” from ${formatDate(entry.date, 'long')} will be permanently removed.`,
      confirmLabel: 'Delete entry',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await journalRepo.remove(entry.id);
      toast.success('Entry deleted');
      void run();
    } catch {
      toast.error('That did not delete');
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="My journal"
        description="A private place to write down how pregnancy, birth and the first months actually feel — symptoms, worries, questions for the next visit, or nothing at all."
        badge={
          <Badge tone="brand">
            <Lock className="size-3" aria-hidden /> Private to you
          </Badge>
        }
        actions={
          <Button variant="primary" size="sm" onClick={() => setFormOpen(true)} icon={<Plus className="size-4" aria-hidden />}>
            Write an entry
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Entries" value={entries.length} icon={<NotebookPen className="size-4" aria-hidden />} />
        <StatCard
          label="Tough days noted"
          value={toughDays}
          hint={toughDays > 0 ? 'Worth mentioning at your next visit' : undefined}
          icon={<BookHeart className="size-4" aria-hidden />}
          tone={toughDays > 2 ? 'amber' : 'default'}
        />
        <StatCard
          label="Last entry"
          value={lastEntry ? relativeTime(lastEntry.date) : '—'}
          hint={lastEntry ? formatDate(lastEntry.date, 'long') : undefined}
        />
      </div>

      <Card className="card-pad mt-4 border-brand-200 bg-brand-50/40">
        <div className="flex items-start gap-3">
          <Lock className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden />
          <div>
            <h3 className="card-title">Nobody else can read this</h3>
            <p className="mt-1 text-sm text-ink-700">
              Your journal is excluded from everything you share. A provider you have linked sees your pregnancy record,
              appointments and observations. A supporter you have approved sees the categories you switched on. Neither can
              open the journal — there is no setting that changes that.
            </p>
          </div>
        </div>
      </Card>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          value={view}
          onChange={setView}
          ariaLabel="Journal filter"
          options={[
            { value: 'all', label: 'All entries', count: entries.length },
            { value: 'low', label: 'Tough days', count: toughDays },
          ]}
        />
        <SearchInput value={search} onValueChange={setSearch} placeholder="Search my journal" className="w-full sm:max-w-xs" />
      </div>

      {error ? <ErrorState className="mt-4" title="Your journal could not be loaded" message={error} onRetry={retryable ? run : undefined} /> : null}
      {loading ? <LoadingRows className="mt-4" rows={3} /> : null}

      {!loading && !error && entries.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<NotebookPen className="size-6" aria-hidden />}
          title="Your journal is empty"
          description="Write whatever is useful. Some mothers note symptoms and questions for the next visit; others use it on hard days. There is no right way, and nobody else reads it."
          action={
            <Button variant="primary" size="sm" onClick={() => setFormOpen(true)}>
              Write your first entry
            </Button>
          }
        />
      ) : null}

      {!loading && !error && entries.length > 0 && filtered.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<Search className="size-6" aria-hidden />}
          title="Nothing matches that search"
          description="Try a different word, or switch back to all entries."
        />
      ) : null}

      <div className="mt-4 space-y-3">
        {filtered.map((entry) => {
          const mood = moodMeta(entry.mood);
          const isOpen = expanded === entry.id;
          const preview = entry.body.length > 220 && !isOpen ? `${entry.body.slice(0, 220).trimEnd()}…` : entry.body;
          return (
            <Card key={entry.id} className="card-pad">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="card-title">{entry.title}</h3>
                    {mood ? <Badge tone={mood.tone}>{mood.label}</Badge> : null}
                    {entry.private ? (
                      <Badge tone="neutral">
                        <Lock className="size-3" aria-hidden /> Private
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {formatDate(entry.date, 'long')} · {relativeTime(entry.date)}
                    {entry.babyId ? ` · about ${mother.babies.find((baby) => baby.id === entry.babyId)?.name ?? 'baby'}` : ''}
                  </p>
                </div>
                <div className="actions-wrap">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(entry)} aria-label={`Edit ${entry.title}`}>
                    <Pencil className="size-4" aria-hidden />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void remove(entry)} aria-label={`Delete ${entry.title}`}>
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
              </div>

              <p className="mt-3 text-sm leading-relaxed text-ink-700">{preview}</p>
              {entry.body.length > 220 ? (
                <button type="button" className="mt-2 text-xs font-semibold text-brand-800 hover:underline" onClick={() => setExpanded(isOpen ? null : entry.id)}>
                  {isOpen ? 'Show less' : 'Read the whole entry'}
                </button>
              ) : null}

              {entry.tags.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {entry.tags.map((tag) => (
                    <button key={tag} type="button" className="chip" onClick={() => setSearch(tag)}>
                      #{tag}
                    </button>
                  ))}
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>

      {toughDays >= 3 ? (
        <Card className="card-pad mt-6 border-[var(--color-risk-amber-border)] bg-[var(--color-risk-amber-soft)]">
          <h3 className="card-title">You have noted several tough days</h3>
          <p className="mt-1 text-sm leading-relaxed text-ink-700">
            Feeling low during pregnancy or after birth is common, and it is treatable. It is not a failing and it does not
            mean you are a bad mother. Please tell a midwife, nurse or doctor — they hear this often and know what helps.
          </p>
          <p className="mt-2 text-sm text-ink-700">
            If you feel you might harm yourself or your baby, seek help now: go to the nearest facility, or call someone you
            trust and ask them to stay with you.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/app/messages" className="btn btn-primary btn-sm">
              Message my provider
            </Link>
            <Link to="/app/learn/wellbeing" className="btn btn-secondary btn-sm">
              Emotional wellbeing
            </Link>
            <Link to="/app/emergency" className="btn btn-ghost btn-sm">
              Emergency numbers
            </Link>
          </div>
        </Card>
      ) : null}

      <div className="mt-8">
        <SectionHeading eyebrow="Prompts" title="If you do not know what to write" />
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {[
            'What did my body feel like today?',
            'What am I looking forward to?',
            'What am I worried about, and who can I ask?',
            'What did the clinic say at my last visit?',
            'What helped me get through a hard day?',
            'What do I want my supporter to understand?',
          ].map((prompt) => (
            <button
              key={prompt}
              type="button"
              className={cn('rounded-lg border border-ink-200 px-3 py-2.5 text-left text-sm text-ink-700 hover:border-brand-300')}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
                sessionStorage.setItem('mamacare.journalPrompt', prompt);
              }}
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      <JournalFormModal
        open={formOpen || Boolean(editing)}
        entry={editing}
        babies={mother.babies.map((baby) => ({ id: baby.id, name: baby.name }))}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSaved={() => {
          setFormOpen(false);
          setEditing(null);
          void run();
        }}
      />
    </AppShell>
  );
}

function JournalFormModal({
  open,
  entry,
  babies,
  onClose,
  onSaved,
}: {
  open: boolean;
  entry: JournalEntry | null;
  babies: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [date, setDate] = useState(toIsoDate(new Date()));
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [mood, setMood] = useState<JournalMood | ''>('');
  const [tags, setTags] = useState('');
  const [babyId, setBabyId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prompt = sessionStorage.getItem('mamacare.journalPrompt');
    sessionStorage.removeItem('mamacare.journalPrompt');
    if (entry) {
      setDate(entry.date);
      setTitle(entry.title);
      setBody(entry.body);
      setMood(entry.mood ?? '');
      setTags(entry.tags.join(', '));
      setBabyId(entry.babyId ?? '');
    } else {
      setDate(toIsoDate(new Date()));
      setTitle(prompt && prompt.length <= 120 ? prompt : '');
      setBody('');
      setMood('');
      setTags('');
      setBabyId(babies.length === 1 ? (babies[0]?.id ?? '') : '');
    }
    setErrors({});
  }, [open, entry, babies]);

  const submit = async (): Promise<void> => {
    const result = validate(journalSchema, { date, title, body, mood, tags, babyId });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setSaving(true);
    const value = result.value;
    const payload = {
      date: value.date,
      title: value.title,
      body: value.body,
      mood: (value.mood || null) as JournalMood | null,
      tags: value.tags
        ? value.tags
            .split(',')
            .map((tag) => tag.trim().replace(/^#/, ''))
            .filter(Boolean)
        : [],
      babyId: value.babyId || null,
      private: true,
    };
    try {
      if (entry) {
        await journalRepo.update(entry.id, payload);
        toast.success('Entry updated');
      } else {
        await journalRepo.create(payload);
        toast.success('Entry saved', 'Only you can read it.');
      }
      onSaved();
    } catch {
      setErrors({ form: 'That did not save. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={entry ? 'Edit entry' : 'Write an entry'}
      description="Private to you. Nobody else — including a linked provider or an approved supporter — can read the journal."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={saving}>
            {entry ? 'Save changes' : 'Save entry'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Date" htmlFor="journal-date" error={errors.date} required>
          <TextInput id="journal-date" type="date" value={date} max={toIsoDate(new Date())} onValueChange={setDate} invalid={Boolean(errors.date)} />
        </Field>

        <Field label="Title" htmlFor="journal-title" error={errors.title} required>
          <TextInput id="journal-title" value={title} onValueChange={setTitle} placeholder="e.g. Week 28 — tired but okay" invalid={Boolean(errors.title)} />
        </Field>

        <div>
          <span className="label">How are you feeling?</span>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {MOODS.map((item) => (
              <button
                key={item.value}
                type="button"
                className={cn('chip', mood === item.value && 'chip-active')}
                aria-pressed={mood === item.value}
                onClick={() => setMood(mood === item.value ? '' : item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <Field label="Entry" htmlFor="journal-body" error={errors.body} required>
          <TextArea
            id="journal-body"
            rows={8}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Write whatever is useful — how you felt, what happened, what you want to remember or ask about."
            invalid={Boolean(errors.body)}
          />
        </Field>

        {babies.length > 0 ? (
          <Field label="Is this about a baby?" htmlFor="journal-baby" optional>
            <Select
              id="journal-baby"
              value={babyId}
              onChange={(event) => setBabyId(event.target.value)}
              options={[{ value: '', label: 'Not baby-specific' }, ...babies.map((baby) => ({ value: baby.id, label: baby.name }))]}
            />
          </Field>
        ) : null}

        <Field label="Tags" htmlFor="journal-tags" optional hint="Comma separated. Tap a tag later to find entries again.">
          <TextInput id="journal-tags" value={tags} onValueChange={setTags} placeholder="e.g. sleep, back pain, questions" />
        </Field>

        {errors.form ? <p className="alert alert-error">{errors.form}</p> : null}
      </div>
    </Modal>
  );
}
