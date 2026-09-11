import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, KeyRound, LogIn, UserPlus } from 'lucide-react';
import { AuthLayout } from '@/routes/auth/auth-layout';
import { Button } from '@/components/ui/button';
import { CheckboxRow, Field, PasswordInput, TextInput } from '@/components/ui/form';
import { NoticeState } from '@/components/ui/display';
import { useForm } from '@/hooks/use-form';
import { signInSchema } from '@/lib/validation';
import { useSession } from '@/providers/app-providers';
import { useToast } from '@/components/ui/toast';
import { DEMO_ACCOUNTS } from '@/services/demo/dataset';

export default function SignInPage() {
  const { signIn, providerKind } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const redirectTo = (location.state as { from?: string } | null)?.from;

  const form = useForm(signInSchema, { email: '', password: '' });
  const [remember, setRemember] = useState(() => localStorage.getItem('mamacare.remember') !== '0');

  const submit = async () => {
    const result = await form.submit(async (values) => {
      localStorage.setItem('mamacare.remember', remember ? '1' : '0');
      const actor = await signIn(values.email, values.password, remember);
      if (actor.accountStatus === 'PENDING_APPROVAL') {
        navigate('/pending-approval', { replace: true });
        return;
      }
      navigate(redirectTo ?? (actor.role === 'ADMIN' ? '/admin' : actor.role === 'MOTHER' ? '/home' : '/app'), { replace: true });
    });
    if (!result.ok) toast.error(new Error(form.formError ?? ''), 'Sign in failed');
  };

  const showDemo = providerKind === 'local';

  return (
    <AuthLayout
      title="Sign in to MAMA CARE"
      intro="Staff use the same sign-in as mothers. Your role decides what you can open."
      image="clinicEnvironment"
      panelTitle="Before you sign in"
      panelPoints={[
        { label: 'Health-worker accounts are approved', detail: 'A supervisor or administrator confirms every new staff account before it can read a single patient record.' },
        { label: 'Nothing is stored on the browser alone', detail: 'Records live in your facility project. A signed-out device keeps no patient content.' },
        { label: 'Sessions end on inactivity', detail: 'A shared clinic device signs out after 30 idle minutes so the next user does not inherit the screen.' },
      ]}
      footer={
        <p className="muted text-center">
          Need an account?{' '}
          <Link to="/register" className="font-semibold text-brand-800 hover:underline">
            Register here
          </Link>
        </p>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="space-y-4"
        noValidate
      >
        {form.formError ? <NoticeState tone="error" title="We could not sign you in">{form.formError}</NoticeState> : null}

        <Field label="Work email or phone" error={form.errors.email} required htmlFor="email">
          <TextInput
            id="email"
            type="email"
            autoComplete="username"
            value={form.values.email}
            onValueChange={(email) => form.setField('email', email)}
            onBlur={() => form.blur('email')}
            invalid={Boolean(form.errors.email)}
            placeholder="you@facility.health"
          />
        </Field>

        <Field label="Password" error={form.errors.password} required htmlFor="password">
          <PasswordInput
            id="password"
            autoComplete="current-password"
            value={form.values.password}
            onChange={(event) => form.setField('password', event.target.value)}
            onBlur={() => form.blur('password')}
            invalid={Boolean(form.errors.password)}
          />
        </Field>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <CheckboxRow checked={remember} onChange={setRemember} label="Keep me signed in on this device" />
          <Link to="/forgot-password" className="inline-flex items-center gap-1.5 text-[0.82rem] font-semibold text-brand-800 hover:underline">
            <KeyRound className="size-3.5" aria-hidden />
            Forgot password
          </Link>
        </div>

        <Button type="submit" block size="lg" loading={form.submitting} icon={<LogIn className="size-4" aria-hidden />}>
          {form.submitting ? 'Signing in…' : 'Sign in'}
        </Button>

        <p className="caption text-center">
          Trouble signing in? Ask your facility administrator to confirm your account is active and assigned to your facility.
        </p>
      </form>

      {showDemo ? (
        <div className="mt-6 border-t border-ink-200 pt-5">
          <p className="micro mb-2">Evaluation build — seeded accounts (password shown once at set-up)</p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {DEMO_ACCOUNTS.slice(0, 6).map((account) => (
              <button
                key={account.email}
                type="button"
                onClick={() => {
                  form.setValues({ email: account.email, password: account.password });
                }}
                className="flex items-center justify-between gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[0.8rem] font-semibold text-ink-800">{account.role.replace(/_/g, ' ')}</span>
                  <span className="block truncate text-[0.72rem] text-ink-500">{account.email}</span>
                </span>
                <ArrowRight className="size-3.5 shrink-0 text-ink-400" aria-hidden />
              </button>
            ))}
          </div>
          <p className="caption mt-2">
            Choosing one fills the form; the password is the seeded demonstration password, not a credential stored in this page’s code
            beyond the seeding module.
          </p>
        </div>
      ) : null}

      <div className="mt-5 flex justify-center">
        <Link to="/register" className="btn btn-quiet btn-sm">
          <UserPlus className="size-4" aria-hidden />
          Create an account
        </Link>
      </div>
    </AuthLayout>
  );
}
