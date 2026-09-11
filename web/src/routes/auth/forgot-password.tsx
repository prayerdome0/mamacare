import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, MailCheck, ShieldQuestion } from 'lucide-react';
import { AuthLayout } from '@/routes/auth/auth-layout';
import { Button } from '@/components/ui/button';
import { Field, TextInput } from '@/components/ui/form';
import { NoticeState } from '@/components/ui/display';
import { useForm } from '@/hooks/use-form';
import { forgotPasswordSchema } from '@/lib/validation';
import { services } from '@/services/session-store';
import { dataProvider } from '@/config/env';
import { useToast } from '@/components/ui/toast';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [sent, setSent] = useState(false);
  const [localCode, setLocalCode] = useState<string | null>(null);
  const registry = services();
  const form = useForm(forgotPasswordSchema, { email: '' });

  const submit = async () => {
    await form.submit(async (values) => {
      try {
        await registry.auth.resetPassword(values.email);
        setSent(true);
        if (dataProvider === 'local') {
          const { latestRecoveryCode } = await import('@/services/auth/local-auth');
          const code = await latestRecoveryCode(values.email);
          setLocalCode(code?.code ?? null);
        }
      } catch (error) {
        toast.error(error, 'Password reset');
        throw error;
      }
    });
  };

  return (
    <AuthLayout
      title="Reset your password"
      intro="Enter the email you sign in with. If an account exists for it, reset instructions follow."
      image="clinicEnvironment"
      panelTitle="Why we do not say whether an account exists"
      panelPoints={[
        { label: 'Enumeration is a real risk', detail: "A form that answers 'no such user' tells an attacker which emails belong to staff of a health facility. We always reply the same way." },
        { label: 'Reset links expire', detail: 'A Firebase reset link is valid for one hour and is single-use; the device mode code expires after 30 minutes.' },
        { label: 'Password changes end other sessions', detail: 'After changing a password, sign in again on each device so a lost clinic tablet does not keep an old session open.' },
      ]}
      footer={
        <p className="muted text-center">
          Back to{' '}
          <Link to="/signin" className="font-semibold text-brand-800 hover:underline">
            sign in
          </Link>
        </p>
      }
    >
      {sent ? (
        <div className="space-y-4">
          <NoticeState tone="success" title="Check your inbox">
            If an account exists for <strong className="font-semibold text-ink-800">{form.values.email}</strong>, a reset link is on its
            way. It expires within an hour. Also check the spam folder.
          </NoticeState>

          {localCode ? (
            <div className="card p-4">
              <p className="micro mb-1.5 flex items-center gap-1.5">
                <ShieldQuestion className="size-3.5" aria-hidden />
                Device mode — no email transport
              </p>
              <p className="muted">
                This installation has no mail service, so the code is shown once here instead of being emailed. In a Firebase deployment this
                step is a real reset link.
              </p>
              <p className="mt-3 rounded-lg bg-ink-100 px-3 py-2 text-center text-lg font-bold tracking-[0.25em] text-ink-900 tnum">{localCode}</p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate(`/reset-password${localCode ? `?code=${localCode}` : ''}`)} icon={<ArrowRight className="size-4" aria-hidden />}>
              {localCode ? 'Continue with the code' : 'Open the link from your email'}
            </Button>
            <Button variant="secondary" onClick={() => setSent(false)}>
              Use a different email
            </Button>
          </div>

          <p className="caption flex items-start gap-2">
            <MailCheck className="mt-0.5 size-3.5 shrink-0 text-brand-600" aria-hidden />
            Still locked out? Your facility administrator can send a fresh link from the user directory; the request is recorded in the audit
            log.
          </p>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="space-y-4"
          noValidate
        >
          <Field label="Email address" error={form.errors.email} required htmlFor="email">
            <TextInput
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              value={form.values.email}
              onValueChange={(email) => form.setField('email', email)}
              onBlur={() => form.blur('email')}
              invalid={Boolean(form.errors.email)}
            />
          </Field>
          <Button type="submit" block size="lg" loading={form.submitting}>
            {form.submitting ? 'Sending…' : 'Send reset instructions'}
          </Button>
          {form.formError ? <NoticeState tone="error" title="Reset request failed" compact>{form.formError}</NoticeState> : null}
        </form>
      )}
    </AuthLayout>
  );
}
