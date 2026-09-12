import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Info, KeyRound, LogIn, UserPlus } from 'lucide-react';
import { AuthLayout } from '@/routes/auth/auth-layout';
import { Button } from '@/components/ui/button';
import { CheckboxRow, Field, PasswordInput, TextInput } from '@/components/ui/form';
import { NoticeState } from '@/components/ui/display';
import { useForm } from '@/hooks/use-form';
import { signInSchema, EMAIL_PATTERN } from '@/lib/validation';
import { useSession } from '@/providers/app-providers';
import { useToast } from '@/components/ui/toast';
import { safeLocal, safeSession, storageAvailable } from '@/lib/storage';
import { DEMO_ACCOUNTS } from '@/services/demo/dataset';

/** Where an account should land, by stored role. Admin → /admin, mother → /home, staff → /app. */
const dashboardFor = (role: string): string => (role === 'ADMIN' ? '/admin' : role === 'MOTHER' ? '/home' : '/app');

export default function SignInPage() {
  const { signIn, providerKind } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const redirectTo = (location.state as { from?: string } | null)?.from;

  const form = useForm(signInSchema, { email: '', password: '' });
  // Storage access is wrapped: private windows and partitioned frames refuse it,
  // and a refused write must never break the sign-in screen.
  const [remember, setRemember] = useState(() => safeLocal.get('mamacare.remember') !== '0');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const pending = safeSession.get('mamacare.session.notice');
    if (pending === 'idle-timeout') {
      setNotice('You were signed out after 30 minutes of inactivity. Sign in again to continue.');
      safeSession.remove('mamacare.session.notice');
    }
  }, []);

  const submit = async () => {
    const result = await form.submit(async (values) => {
      safeLocal.set('mamacare.remember', remember ? '1' : '0');
      const actor = await signIn(values.email, values.password, remember);
      if (actor.accountStatus === 'PENDING_APPROVAL') {
        navigate('/pending-approval', { replace: true });
        return;
      }
      if (actor.claimSyncNotice) {
        toast.info('Signed in with limited access', actor.claimSyncNotice);
      }
      navigate(redirectTo ?? dashboardFor(actor.role), { replace: true });
    });
    if (!result.ok) toast.error(new Error(form.formError ?? ''), 'Sign in failed');
  };

  const showDemo = providerKind === 'local';
  const emailLooksUnregistered = Boolean(form.errors.email === undefined && form.values.email && EMAIL_PATTERN.test(form.values.email) && form.formError);

  return (
    <AuthLayout
      title="Sign in to MAMA CARE"
      intro="Staff and mothers use the same sign-in. Your stored role decides which dashboard opens — mothers see their own record, staff see their facility."
      image="clinicEnvironment"
      panelTitle="Before you sign in"
      panelPoints={[
        { label: 'Health-worker accounts are approved', detail: 'A supervisor or administrator confirms every new staff account before it can read a single patient record.' },
        { label: 'The role comes from the database', detail: 'Your account document decides what opens: administrator, supervisor, midwife, nurse, community health worker or mother.' },
        { label: 'Sessions end on inactivity', detail: 'A shared clinic device signs out after 30 idle minutes so the next user does not inherit the screen.' },
      ]}
      footer={
        <p className="muted text-center">
          Need an account?{' '}
          <Link to="/register" className="font-semibold text-brand-800 hover:underline">
            Register here — it is open to everyone
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
        {notice ? (
          <NoticeState tone="info" title="Session ended">
            {notice}
          </NoticeState>
        ) : null}

        {form.formError ? (
          <NoticeState
            tone="error"
            title="We could not sign you in"
            actions={
              emailLooksUnregistered ? (
                <Link to="/register" className="text-[0.8rem] font-semibold text-brand-800 hover:underline">
                  Create an account with this address
                </Link>
              ) : (
                <Link to="/forgot-password" className="text-[0.8rem] font-semibold text-brand-800 hover:underline">
                  Reset the password instead
                </Link>
              )
            }
          >
            {form.formError}
          </NoticeState>
        ) : null}

        <Field label="Email address" error={form.errors.email} required htmlFor="email">
          <TextInput
            id="email"
            type="email"
            autoComplete="username"
            value={form.values.email}
            onValueChange={(email) => form.setField('email', email)}
            onBlur={() => form.blur('email')}
            invalid={Boolean(form.errors.email)}
            placeholder="you@example.com"
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

        {!storageAvailable() ? (
          <NoticeState tone="warning" title="This browser is blocking local storage" compact>
            You can still sign in for this visit, but you will be signed out when the tab closes. A normal (not private) window keeps the session.
          </NoticeState>
        ) : null}

        <p className="caption text-center">
          Trouble signing in? Ask your facility administrator to confirm your account is active and assigned to your facility.
        </p>
      </form>

      {showDemo ? (
        <div className="mt-6 border-t border-ink-200 pt-5">
          <p className="micro mb-2 flex items-center gap-1.5">
            <Info className="size-3.5" aria-hidden />
            Evaluation build — seeded accounts (no project configured)
          </p>
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
            Choosing one fills the form. These accounts exist only in this browser’s device store; a deployment with a Firebase project
            shows no seeded accounts.
          </p>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Link to="/register" className="btn btn-quiet btn-sm">
          <UserPlus className="size-4" aria-hidden />
          Create an account
        </Link>
        <Link to="/" className="btn btn-quiet btn-sm">
          Browse the public site
        </Link>
      </div>
    </AuthLayout>
  );
}
