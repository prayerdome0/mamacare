/**
 * Emergency panel.
 *
 * The most important component in the app. It is deliberately loud: a red header,
 * warning signs grouped by how quickly to act, and phone numbers that dial on tap.
 *
 * It never diagnoses. The wording is "seek care", "get seen today", "go now" —
 * never "you have X". And it always offers the same fallback: if you are unsure
 * whether it is serious, treat it as serious.
 */

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Phone, ShieldQuestion } from 'lucide-react';
import { cn, telHref } from '@/lib/utils';
import { EMERGENCY_CHECKLIST, EMERGENCY_CONTACTS, MEDICAL_DISCLAIMER } from '@/config/site-content';
import { GENERAL_WARNING_SIGNS, NEWBORN_WARNING_SIGNS, POSTNATAL_WARNING_SIGNS, type WarningSign } from '@/config/weekly-guide';
import { Badge } from '@/components/ui/display';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { RiskLevel } from '@/types/domain';

export type EmergencyAudience = 'pregnancy' | 'postnatal' | 'newborn' | 'all';

const TITLES: Record<EmergencyAudience, string> = {
  pregnancy: 'Warning signs in pregnancy',
  postnatal: 'Warning signs after birth',
  newborn: 'Warning signs in newborns',
  all: 'Warning signs',
};

export function EmergencyNumbers({ compact = false }: { compact?: boolean }) {
  return (
    <Card className={cn('card-pad', 'border-[var(--color-risk-red-border)] bg-[var(--color-risk-red-soft)]')}>
      <div className="flex items-start gap-3">
        <Phone className="mt-0.5 size-5 shrink-0 text-[var(--color-risk-red)]" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-ink-900">Call for help</h2>
          <p className="mt-1 text-sm text-ink-700">Tap a number to call. If you cannot reach anyone, go to the nearest facility with a maternity service.</p>
          <ul className={cn('mt-3 grid gap-2', compact ? '' : 'sm:grid-cols-2')}>
            {EMERGENCY_CONTACTS.lines.map((line) => (
              <li key={line.label + line.number}>
                <a
                  href={telHref(line.number)}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-risk-red-border)] bg-white px-3 py-2.5 transition-colors hover:border-[var(--color-risk-red)]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[0.8rem] font-medium text-ink-600">{line.label}</span>
                    <span className="block text-lg font-bold text-ink-900 tnum">{line.number}</span>
                  </span>
                  <Phone className="size-4 shrink-0 text-[var(--color-risk-red)]" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-ink-600">{EMERGENCY_CONTACTS.note}</p>
        </div>
      </div>
    </Card>
  );
}

function SignList({ signs, title, tone }: { signs: WarningSign[]; title: string; tone: RiskLevel }) {
  const red = signs.filter((sign) => sign.level === 'RED');
  const amber = signs.filter((sign) => sign.level === 'AMBER');
  const list = tone === 'RED' ? red : amber;
  if (list.length === 0) return null;

  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        tone === 'RED'
          ? 'border-[var(--color-risk-red-border)] bg-[var(--color-risk-red-soft)]'
          : 'border-[var(--color-risk-amber-border)] bg-[var(--color-risk-amber-soft)]',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[0.98rem] font-bold text-ink-900">{title}</h3>
        <Badge tone={tone === 'RED' ? 'red' : 'amber'}>{tone === 'RED' ? 'Go now' : 'Get seen today'}</Badge>
      </div>
      <ul className="mt-3 space-y-2.5">
        {list.map((sign) => (
          <li key={sign.title} className="flex items-start gap-2.5">
            <AlertTriangle
              className={cn('mt-0.5 size-4 shrink-0', tone === 'RED' ? 'text-[var(--color-risk-red)]' : 'text-[var(--color-risk-amber)]')}
              aria-hidden
            />
            <span className="min-w-0">
              <span className="block text-[0.9rem] font-semibold text-ink-900">{sign.title}</span>
              <span className="mt-0.5 block text-[0.85rem] leading-relaxed text-ink-700">{sign.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EmergencyPanel({
  audience = 'all',
  extraSigns = [],
  showNumbers = true,
  showChecklist = true,
}: {
  audience?: EmergencyAudience;
  extraSigns?: WarningSign[];
  showNumbers?: boolean;
  showChecklist?: boolean;
}) {
  const [checklistOpen, setChecklistOpen] = useState(false);

  const signs: WarningSign[] = [
    ...(audience === 'newborn' ? [] : GENERAL_WARNING_SIGNS),
    ...(audience === 'postnatal' || audience === 'all' ? POSTNATAL_WARNING_SIGNS : []),
    ...(audience === 'newborn' || audience === 'all' ? NEWBORN_WARNING_SIGNS : []),
    ...extraSigns,
  ];

  const red = signs.filter((sign) => sign.level === 'RED');
  const amber = signs.filter((sign) => sign.level === 'AMBER');

  return (
    <div className="space-y-4">
      <div className="rounded-xl border-2 border-[var(--color-risk-red)] bg-[var(--color-risk-red)] p-5 text-white shadow-[var(--shadow-card)]">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-7 shrink-0" aria-hidden />
          <div>
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Seek medical help</h2>
            <p className="mt-1.5 text-[0.92rem] leading-relaxed text-white/92">
              {TITLES[audience]}. Certain symptoms during pregnancy or after delivery need urgent professional
              assessment. Mama Care does not diagnose — this page tells you when to get help and how quickly.
            </p>
            <p className="mt-2 text-[0.92rem] font-semibold">{EMERGENCY_CONTACTS.guidance}</p>
          </div>
        </div>
      </div>

      {showNumbers ? <EmergencyNumbers /> : null}

      <SignList signs={red} title="Go to a facility now" tone="RED" />
      <SignList signs={amber} title="Contact a provider or get seen today" tone="AMBER" />

      {showChecklist ? (
        <Card className="card-pad">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 text-left"
            onClick={() => setChecklistOpen((value) => !value)}
            aria-expanded={checklistOpen}
          >
            <span className="flex items-center gap-2 text-base font-semibold text-ink-900">
              <CheckCircle2 className="size-5 text-brand-700" aria-hidden />
              What to take when you go
            </span>
            <span className="text-xs font-semibold text-brand-700">{checklistOpen ? 'Hide' : 'Show'}</span>
          </button>
          {checklistOpen ? (
            <ul className="mt-3 space-y-1.5 text-sm text-ink-700">
              {EMERGENCY_CHECKLIST.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}

      <div className="rounded-lg border border-ink-200 bg-ink-50 p-4 text-xs leading-relaxed text-ink-600">
        <p className="flex items-start gap-2">
          <ShieldQuestion className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden />
          <span>{MEDICAL_DISCLAIMER}</span>
        </p>
      </div>
    </div>
  );
}

/** The compact red button used in app headers and dashboards. */
export function EmergencyButton({ className, onClick }: { className?: string; onClick?: () => void }) {
  return (
    <Button variant="danger" className={className} onClick={onClick} icon={<AlertTriangle className="size-4" aria-hidden />}>
      Seek medical help
    </Button>
  );
}
