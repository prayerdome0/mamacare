import { FAQS } from '@/config/site-content';

export function FaqList() {
  return (
    <dl className="grid gap-3 lg:grid-cols-2">
      {FAQS.map((faq) => (
        <details key={faq.q} className="card group p-0 open:shadow-[var(--shadow-pop)]">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-4 p-4 text-[0.92rem] font-semibold text-ink-900 marker:hidden">
            <span className="min-w-0">{faq.q}</span>
            <span
              aria-hidden
              className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-ink-100 text-ink-500 transition-transform group-open:rotate-45"
            >
              +
            </span>
          </summary>
          <p className="muted px-4 pt-0 pb-4 leading-relaxed">{faq.a}</p>
        </details>
      ))}
    </dl>
  );
}
