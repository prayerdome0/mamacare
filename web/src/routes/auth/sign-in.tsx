/**
 * Sign in.
 *
 * One form for every role — where you land afterwards depends on who you are.
 * When the app is running without a hosted backend it says so, and offers the four
 * seeded demo accounts, because pretending otherwise would waste a person's time.
 */

import { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { useForm } from '@/hooks/use-form';
import { signInSchema, type SignInValues } from '@/lib/validation';
import { useSession } from '@/providers/app-providers';
import { homeForRole } from '@/routes/guards';
import { AuthShell } from '@/components/layout/auth-shell';
import { Button } from '@/components/ui/button';
import { CheckboxRow, Field, PasswordInput, TextInput } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';

export default function SignInPage() {
  const { signIn } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const form = useForm<SignInValues>(signInSchema, { email: '', password: '', remember: true });
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

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to continue your clinical tracker, appointments, records and care."
      image="hero"
      alt="A healthcare professional and mother at an antenatal care visit"
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
    </AuthShell>
  );
}
