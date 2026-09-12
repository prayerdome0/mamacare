import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { AuthLayout } from '@/routes/auth/auth-layout';
import { Button } from '@/components/ui/button';
import { Field, PasswordInput, TextInput } from '@/components/ui/form';
import { NoticeState } from '@/components/ui/display';
import { useForm } from '@/hooks/use-form';
import { resetPasswordSchema } from '@/lib/validation';
import { services } from '@/services/session-store';
import { useToast } from '@/components/ui/toast';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const urlCode = params.get('oobCode') ?? params.get('code') ?? '';
  const [code, setCode] = useState(urlCode);
  const [submitting, setSubmitting] = useState(false);
  const registry = services();

  const form = useForm(resetPasswordSchema, { newPassword: '', confirmPassword: '' });
  const needsCode = registry.auth.kind === 'local' || Boolean(params.get('code'));

  const submit = async () => {
    setSubmitting(true);
    try {
      await form.submit(async (values) => {
        if (needsCode) {
          if (!code.trim()) throw new Error('Enter the recovery code from the email or the reset screen.');
          await registry.auth.confirmReset(code.trim(), values.newPassword);
        } else {
          // Firebase completes the reset through the link's out-of-band code; when
          // the user arrives without one we treat the new password as an update on
          // the current session.
          await registry.auth.changePassword(null, values.newPassword).catch(async () => {
            throw new Error('Open the reset link from your email to complete this step, or sign in first.');
          });
        }
      });
      toast.success('Password updated', 'Sign in with your new password.');
      navigate('/signin', { replace: true });
    } catch (error) {
      toast.error(error, 'The password was not changed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Choose a new password"
      intro={needsCode ? 'Enter the recovery code with your new password.' : 'Set the new password, then sign in again on every device.'}
      image="clinicEnvironment"
      panelTitle="A password that survives a clinic"
      panelPoints={[
        { label: 'Length beats symbols', detail: 'Eight characters with a letter and a number is the minimum; a phrase you can type one-handed is better.' },
        { label: 'Never share a facility login', detail: 'Every clinical entry is attributed to a named person. A shared password makes that impossible and is a data-protection breach.' },
        { label: 'Change it when someone leaves', detail: 'Administrators can revoke sessions, which forces a sign-in everywhere at once.' },
      ]}
      footer={
        <p className="muted text-center">
          <Link to="/signin" className="font-semibold text-brand-800 hover:underline">
            Back to sign in
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
        {needsCode ? (
          <Field label="Recovery code" required htmlFor="code" hint="Six to twelve characters, shown in the reset email or on the previous screen in device mode.">
            <TextInput
              id="code"
              value={code}
              onValueChange={(value) => setCode(value.toUpperCase())}
              placeholder="A1B2-C3D4"
              autoComplete="one-time-code"
              autoFocus
            />
          </Field>
        ) : null}

        <Field label="New password" error={form.errors.newPassword} required htmlFor="newPassword" hint="At least 10 characters, with an uppercase letter, a lowercase letter and a number.">
          <PasswordInput
            id="newPassword"
            autoComplete="new-password"
            value={form.values.newPassword}
            onChange={(event) => form.setField('newPassword', event.target.value)}
            onBlur={() => form.blur('newPassword')}
            invalid={Boolean(form.errors.newPassword)}
          />
        </Field>

        <Field label="Confirm new password" error={form.errors.confirmPassword} required htmlFor="confirmPassword">
          <PasswordInput
            id="confirmPassword"
            autoComplete="new-password"
            value={form.values.confirmPassword}
            onChange={(event) => form.setField('confirmPassword', event.target.value)}
            onBlur={() => form.blur('confirmPassword')}
            invalid={Boolean(form.errors.confirmPassword)}
          />
        </Field>

        {form.formError ? <NoticeState tone="error" title="The password was not changed">{form.formError}</NoticeState> : null}

        <Button type="submit" block size="lg" loading={submitting || form.submitting} icon={<KeyRound className="size-4" aria-hidden />}>
          Update password
        </Button>
      </form>
    </AuthLayout>
  );
}
