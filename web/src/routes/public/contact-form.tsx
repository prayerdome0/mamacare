import { useState } from 'react';
import { z } from 'zod';
import { CheckCircle2, Send } from 'lucide-react';
import { api } from '@/services/api/client';
import { mailtoHref } from '@/lib/utils';
import { SITE } from '@/config/site-content';
import { Button } from '@/components/ui/button';
import { Field, Select, TextArea, TextInput } from '@/components/ui/form';
import { NoticeState } from '@/components/ui/display';

/**
 * Public enquiry form.
 *
 * It never accepts patient information, and it is not a clinical channel — the
 * copy says so in two places. Delivery goes through the API service (which rate
 * limits, validates again, and holds no PII beyond the sender) when it is
 * reachable; otherwise the form hands the user a pre-filled mailto link instead
 * of pretending the message was sent.
 */

const schema = z.object({
  name: z.string().trim().min(2, 'Please tell us who you are.'),
  email: z.string().trim().min(3, 'Enter an email address we can reply to.').email('That does not look like an email address.'),
  organisation: z.string().trim().max(120).optional().or(z.literal('')),
  topic: z.enum(['DEPLOYMENT', 'CLINICAL_GOVERNANCE', 'DATA_PROTECTION', 'SUPPORT', 'OTHER']),
  message: z
    .string()
    .trim()
    .min(20, 'Please add a little more detail (at least 20 characters).')
    .max(2500, 'Please keep the message under 2,500 characters.'),
  /** Honeypot: bots fill it, people never see it. */
  company_website: z.string().max(0).optional(),
});

type Values = { name: string; email: string; organisation: string; topic: z.infer<typeof schema>['topic']; message: string };

const TOPICS = [
  { value: 'DEPLOYMENT', label: 'Deploying at a facility' },
  { value: 'CLINICAL_GOVERNANCE', label: 'Clinical governance and alert rules' },
  { value: 'DATA_PROTECTION', label: 'Data protection and security review' },
  { value: 'SUPPORT', label: 'Support for an existing installation' },
  { value: 'OTHER', label: 'Something else' },
] as const;

export function ContactForm({ compact = false }: { compact?: boolean }) {
  const [values, setValues] = useState<Values>({ name: '', email: '', organisation: '', topic: 'DEPLOYMENT', message: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'unavailable' | 'failed'>('idle');
  const [detail, setDetail] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = schema.safeParse({ ...values, company_website: '' });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[issue.path.join('.') || 'form'] = issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setState('sending');
    try {
      const result = await api.request<{ accepted?: boolean; mailtoFallback?: boolean }>('/contact', {
        authenticated: false,
        method: 'POST',
        body: { ...values, honeypot: '' },
        timeoutMs: 15_000,
      });
      if (result.accepted) {
        setState('sent');
        setValues({ name: '', email: '', organisation: '', topic: 'DEPLOYMENT', message: '' });
        return;
      }
      setState('unavailable');
    } catch {
      // The API may not be deployed at all. That is a configuration state, not a
      // user error, so we explain it and offer the mail route.
      setState('unavailable');
      setDetail(null);
    }
  };

  if (state === 'sent') {
    return (
      <NoticeState tone="success" title="Message received" actions={<Button variant="secondary" size="sm" onClick={() => setState('idle')}>Send another</Button>}>
        Thank you. We reply within two working days from {SITE.org.email}. If you did not include a phone number, the reply will come by
        email only.
      </NoticeState>
    );
  }

  const mailtoBody = [
    `Topic: ${TOPICS.find((topic) => topic.value === values.topic)?.label ?? values.topic}`,
    `Name: ${values.name}`,
    values.organisation ? `Organisation: ${values.organisation}` : null,
    `Reply to: ${values.email}`,
    '',
    values.message,
  ]
    .filter(Boolean)
    .join('\n');

  if (state === 'unavailable') {
    return (
      <NoticeState
        tone="warning"
        title="This installation has no message endpoint configured"
        actions={
          <div className="flex flex-wrap gap-2">
            <a className="btn btn-primary btn-sm" href={mailtoHref(SITE.org.email, `MAMA CARE enquiry — ${values.topic}`)} target="_blank" rel="noreferrer">
              Open in email app
            </a>
            <Button variant="secondary" size="sm" onClick={() => setState('idle')}>
              Back to the form
            </Button>
          </div>
        }
      >
        Your message has stayed on this device. The contact form posts to the MAMA CARE API service (<code>/api/contact</code>), which
        validates and rate limits enquiries — start it with <code>npm --prefix server run dev</code>, or set{' '}
        <code>VITE_API_BASE_URL</code>. Meanwhile, write to {SITE.org.email}.
      </NoticeState>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className={compact ? 'space-y-4' : 'space-y-5'}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" error={errors.name} required>
          <TextInput value={values.name} onValueChange={(name) => setValues((v) => ({ ...v, name }))} autoComplete="name" invalid={Boolean(errors.name)} />
        </Field>
        <Field label="Email for the reply" error={errors.email} required>
          <TextInput type="email" value={values.email} onValueChange={(email) => setValues((v) => ({ ...v, email }))} autoComplete="email" invalid={Boolean(errors.email)} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Facility or organisation" optional error={errors.organisation}>
          <TextInput value={values.organisation} onValueChange={(organisation) => setValues((v) => ({ ...v, organisation }))} autoComplete="organization" />
        </Field>
        <Field label="Topic" error={errors.topic}>
          <Select options={TOPICS.map((topic) => ({ value: topic.value, label: topic.label }))} value={values.topic} onValueChange={(topic) => setValues((v) => ({ ...v, topic: topic as Values['topic'] }))} />
        </Field>
      </div>
      <Field
        label="Message"
        error={errors.message}
        required
        hint={`${values.message.trim().length}/2,500 characters. Please do not include patient names, IDs or clinical results.`}
      >
        <TextArea
          rows={compact ? 5 : 7}
          value={values.message}
          onValueChange={(message) => setValues((v) => ({ ...v, message }))}
          invalid={Boolean(errors.message)}
          placeholder="We run a health post with about 120 deliveries a month and currently keep antenatal records on paper…"
        />
      </Field>

      {errors.form ? <NoticeState tone="error" title={errors.form} /> : null}
      {detail ? <p className="field-error">{detail}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="caption max-w-sm">
          Sending posts your enquiry to this deployment’s API service. We use it only to reply — see{' '}
          <a href="#privacy" className="font-semibold text-brand-800 hover:underline">
            privacy and data
          </a>
          .
        </p>
        <Button type="submit" loading={state === 'sending'} icon={<Send className="size-4" aria-hidden />}>
          {state === 'sending' ? 'Sending…' : 'Send message'}
        </Button>
      </div>

      {mailtoBody ? (
        <p className="caption flex items-center gap-1.5 border-t border-ink-100 pt-3">
          <CheckCircle2 className="size-3.5 text-brand-600" aria-hidden />
          Prefer email?{' '}
          <a href={mailtoHref(SITE.org.email, `MAMA CARE enquiry — ${values.topic}`)} className="font-semibold text-brand-800 hover:underline">
            Use your email app
          </a>
        </p>
      ) : null}
    </form>
  );
}
