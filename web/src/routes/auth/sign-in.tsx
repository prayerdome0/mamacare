/**
 * Sign in.
 *
 * One form for every role — where you land afterwards depends on who you are.
 * When the app is running without a hosted backend it says so, and offers the four
 * seeded demo accounts, because pretending otherwise would waste a person's time.
 */

import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, LogIn, Sparkles } from 'lucide-react';
import { useForm } from '@/hooks/use-form';
import { signInSchema, type SignInValues } from '@/lib/validation';
import { useSession } from '@/providers/app-providers';
import { services } from '@/services/session-store';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@/services/data/local/seed';
import { homeForRole } from '@/routes/guards';
import { AuthShell } from '@/components/layout/auth-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/display';
import { CheckboxRow, Field, PasswordInput, TextInput } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';

export default function SignInPage() {
  const { signIn } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [pendingDemo, setPendingDemo] = useState<string | null>(null);

  const form = useForm<SignInValues>(signInSchema, { email: '', password: '', remember: true });
  const onDevice = services().data.kind === 'local';
  const from = (location.state as { from?: string } | null)?.from;

  useEffect(() => {
    document.title = 'Sign in · Mama Care';
  }, []);

  const complete = (role: Parameters<typeof homeForRole>[0]): void => {
    toast.success('Signed in', 'Welcome back to Mama Care.');
    navigate(from ?? homeForRole(role), { replace: true });
  };

  const onSubmit = async (values: SignInValues): Promise<void> => {
    const actor = await signIn(values.email.trim().toLowerCase(), values.password, values.remember !== false);
    if (actor.status === 'PENDING_APPROVAL') {
      navigate('/pending', { replace: true });
      return;
    }
    complete(actor.role);
  };

  const signInDemo = async (email: string): Promise<void> => {
    setPendingDemo(email);
    form.setError(null);
    try {
      const actor = await signIn(email, DEMO_PASSWORD, false);
      complete(actor.role);
    } catch (error) {
      form.setError(error instanceof Error ? error.message : 'That demo account could not be opened.');
    } finally {
      setPendingDemo(null);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to continue your pregnancy tracker, appointments and reminders."
      image="hero"
      alt="A pregnant woman at an antenatal care visit"
      footer={
        <>
          New to Mama Care?{' '}
          <Link to="/register" className="font-semibold text-brand-800 hover:underline">
            Create a free account
          </Link>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void form.submit(onSubmit);
        }}
        noValidate
        className="space-y-4"
      >
        <Field label="Email address" htmlFor="email" error={form.errors.email} required>
          <TextInput
            id="email"
            name="email"
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

        <Field
          label="Password"
          htmlFor="password"
          error={form.errors.password}
          required
          hint={
            <Link to="/forgot-password" className="font-medium text-brand-800 hover:underline">
              Forgot your password?
            </Link>
          }
        >
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            placeholder="Your password"
            value={form.values.password}
            onValueChange={(value) => form.setField('password', value)}
            onBlur={() => form.blur('password')}
            invalid={Boolean(form.errors.password)}
          />
        </Field>

        <CheckboxRow
          checked={form.values.remember !== false}
          onChange={(checked) => form.setField('remember', checked)}
          label="Keep me signed in on this device"
          description="Turn this off on a shared or clinic computer."
        />

        {form.formError ? <p className="alert alert-error">{form.formError}</p> : null}

        <Button type="submit" className="w-full" disabled={form.submitting} icon={<LogIn className="size-4" aria-hidden />}>
          {form.submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      {onDevice ? (
        <Card className="card-pad mt-6 border-amber-200 bg-amber-50">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="amber">
              <Sparkles className="size-3" aria-hidden /> Demo mode
            </Badge>
            <span className="text-xs text-ink-600">Records are stored in this browser only.</span>
          </div>
          <p className="mt-2 text-sm text-ink-700">
            This deployment has no hosted backend configured, so it is running on this device's storage. Try any of the
            four seeded accounts — password <code className="rounded bg-white px-1 py-0.5 text-xs">{DEMO_PASSWORD}</code>:
          </p>
          <ul className="mt-3 space-y-2">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.email}>
                <button
                  type="button"
                  onClick={() => void signInDemo(account.email)}
                  disabled={Boolean(pendingDemo) || form.submitting}
                  className="group flex w-full items-center justify-between gap-3 rounded-lg border border-ink-200 bg-white px-3 py-2 text-left transition-colors hover:border-brand-400 disabled:opacity-60"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink-800">{account.name}</span>
                    <span className="block truncate text-xs text-ink-500">{account.role}</span>
                  </span>
                  <ArrowRight
                    className="size-4 shrink-0 text-ink-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-700"
                    aria-hidden
                  />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </AuthShell>
  );
}
