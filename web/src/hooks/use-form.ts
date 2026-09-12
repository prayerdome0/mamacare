import { useCallback, useMemo, useRef, useState } from 'react';
import type { ZodType } from 'zod';
import { toAppError } from '@/lib/errors';

/**
 * Minimal form state machine shared by every form in the product: values,
 * per-field errors, dirty/touched tracking, zod validation on submit (and
 * on-blur for already-invalid fields), and a single submitting guard so a
 * double-tap can never record a clinical entry twice.
 */
export type FormErrors = Record<string, string>;

export interface UseFormResult<T extends Record<string, unknown>> {
  values: T;
  errors: FormErrors;
  touched: Record<string, boolean>;
  dirty: boolean;
  submitting: boolean;
  formError: string | null;
  setField: <K extends keyof T & string>(key: K, value: T[K]) => void;
  setValues: (patch: Partial<T>) => void;
  blur: (key: string) => void;
  reset: (values?: T) => void;
  setError: (message: string | null) => void;
  setFieldErrors: (errors: FormErrors) => void;
  validateNow: () => FormErrors;
  submit: (handler: (values: T) => Promise<void> | void) => Promise<{ ok: boolean }>;
}

export function useForm<T extends Record<string, unknown>>(schema: ZodType<T>, initial: T): UseFormResult<T> {
  const [values, setValues] = useState<T>(initial);
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const initialRef = useRef(initial);
  const busy = useRef(false);

  const dirty = useMemo(() => JSON.stringify(values) !== JSON.stringify(initialRef.current), [values]);

  const setField = useCallback<UseFormResult<T>['setField']>((key, value) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);

  const setValuesPatched = useCallback((patch: Partial<T>) => {
    setValues((current) => ({ ...current, ...patch }));
  }, []);

  const validateNow = useCallback((): FormErrors => {
    const result = schema.safeParse(values);
    if (result.success) return {};
    const next: FormErrors = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_form';
      if (!next[key]) next[key] = issue.message;
    }
    return next;
  }, [schema, values]);

  const blur = useCallback(
    (key: string) => {
      setTouched((current) => ({ ...current, [key]: true }));
      // Re-validate a field that has already failed, so corrections are visible
      // before submit.
      setErrors((current) => {
        if (!current[key]) return current;
        const result = schema.safeParse(values);
        if (result.success) {
          const next = { ...current };
          delete next[key];
          return next;
        }
        const found = result.error.issues.find((issue) => issue.path.join('.') === key);
        const next = { ...current };
        if (found) next[key] = found.message;
        else delete next[key];
        return next;
      });
    },
    [schema, values],
  );

  const submit = useCallback<UseFormResult<T>['submit']>(
    async (handler) => {
      if (busy.current) return { ok: false };
      const validation = validateNow();
      setErrors(validation);
      setTouched(Object.keys(values).reduce<Record<string, boolean>>((acc, key) => ({ ...acc, [key]: true }), {}));
      if (Object.keys(validation).length > 0) {
        setFormError('Check the highlighted fields before saving.');
        return { ok: false };
      }
      busy.current = true;
      setSubmitting(true);
      setFormError(null);
      try {
        await handler(values);
        initialRef.current = values;
        return { ok: true };
      } catch (error) {
        const mapped = toAppError(error);
        setFormError(mapped.message);
        if (mapped.fieldErrors) setErrors(mapped.fieldErrors);
        return { ok: false };
      } finally {
        busy.current = false;
        setSubmitting(false);
      }
    },
    [validateNow, values],
  );

  return {
    values,
    errors,
    touched,
    dirty,
    submitting,
    formError,
    setField,
    setValues: setValuesPatched,
    blur,
    reset: (next) => {
      const base = next ?? initialRef.current;
      initialRef.current = base;
      setValues(base);
      setErrors({});
      setTouched({});
      setFormError(null);
    },
    setError: setFormError,
    setFieldErrors: setErrors,
    validateNow,
    submit,
  };
}
