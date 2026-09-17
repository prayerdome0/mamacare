/**
 * Password reset request.
 *
 * Firebase sends the reset email. On a device-only deployment there is no mail
 * server, so the page says so and offers the honest alternative rather than
 * pretending an email is on its way.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, Mail } from 'lucide-react';
import { useForm } from '@/hooks/use-form';
import { forgotPasswordSchema, type ForgotPasswordValues } from '@/lib/validation';
import { services } from '@/services/session-store';
import { AuthShell } from '@/components/layout/auth-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, TextInput } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const toast = useToast();
  const form = useForm<ForgotPasswordValues>(forgotPasswordSchema, { email: '' });
  const onDevice = services().data.kind === 'local';

  useEffect(() => {
    document.title = 'Reset your password · Mama Care';
  }, []);

  const onSubmit = async (values: ForgotPasswordValues): Promise<void> => {
    await services().auth.sendPasswordReset(values.email.trim().toLowerCase());
    setSent(true);
    toast.success('Reset link sent', values.email.trim().toLowerCase());
  };

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter the email you registered with and we will send a link to set a new password."
      image="reminder"
      alt="A hand holding a phone showing an appointment reminder"
      footer={
        <>
          Remembered it?{' '}
          <Link to="/sign-in" className="font-semibold text-brand-800 hover:underline">
            Back to sign in
          </Link>
        </>
      }
    >
      {sent ? (
        <Card className="card-pad border-green-200 bg-green-50">
          <span className="grid size-10 place-items-center rounded-xl bg-green-100 text-green-800">
            <Mail className="size-5" aria-hidden />
          </span>
          <h2 className="card-title mt-3">Check your inbox</h2>
          <p className="mt-1 text-sm text-ink-700">
            If an account exists for <strong>{form.values.email}</strong>, a reset link is on its way. It expires after an
            hour. Check your spam folder if it does not appear.
          </p>
          <p className="mt-3 text-xs text-ink-600">
            For your security we do not confirm whether an email address has an account.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/sign-in" className="btn btn-primary btn-sm">
              Back to sign in
            </Link>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setSent(false);
                form.reset();
              }}
            >
              Send again
            </Button>
          </div>
        </Card>
      ) : onDevice ? (
        <Card className="card-pad border-amber-200 bg-amber-50">
          <span className="grid size-10 place-items-center rounded-xl bg-amber-100 text-amber-800">
            <KeyRound className="size-5" aria-hidden />
          </span>
          <h2 className="card-title mt-3">This deployment cannot send email</h2>
          <p className="mt-1 text-sm text-ink-700">
            Mama Care is running on this device's storage with no hosted authentication service, so there is no mail server
            to send a reset link from. Accounts created here keep their password in this browser only.
          </p>
          <ul className="checklist mt-3 text-sm">
            <li>If you still have access to this browser, sign in and change your password from Settings → Security.</li>
            <li>If you have lost access, the records cannot be recovered — create a new account.</li>
            <li>On a hosted deployment with Firebase Authentication configured, this page sends a real reset email.</li>
          </ul>
          <div className="mt-4">
            <Link to="/sign-in" className="btn btn-primary btn-sm">
              Back to sign in
            </Link>
          </div>
        </Card>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void form.submit(onSubmit);
          }}
          noValidate
          className="space-y-4"
        >
          <Field label="Email address" htmlFor="reset-email" error={form.errors.email} required>
            <TextInput
              id="reset-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={form.values.email}
              onValueChange={(value) => form.setField('email', value)}
              onBlur={() => form.blur('email')}
              invalid={Boolean(form.errors.email)}
            />
          </Field>

          {form.formError ? <p className="alert alert-error">{form.formError}</p> : null}

          <Button type="submit" className="w-full" disabled={form.submitting}>
            {form.submitting ? 'Sending…' : 'Send reset link'}
          </Button>

          <p className="text-xs text-ink-500">
            We never ask for your password by email, SMS or phone call. Mama Care staff cannot see it.
          </p>
        </form>
      )}
    </AuthShell>
  );
}
