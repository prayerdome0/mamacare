import {
  useId,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { AlertCircle, Check, ChevronDown, Eye, EyeOff, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ── Field chrome ────────────────────────────────────────────────────── */

export interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  optional?: boolean;
  children: ReactNode;
  className?: string;
}

export function Field({ label, htmlFor, hint, error, required, optional, children, className }: FieldProps) {
  return (
    <div className={cn('min-w-0', className)}>
      <label className="label" htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-1 text-[var(--color-risk-red)]">*</span> : null}
        {optional ? <span className="ml-1.5 text-xs font-normal text-ink-400">(optional)</span> : null}
      </label>
      {children}
      {error ? (
        <p className="field-error" role="alert">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p className="hint">{hint}</p>
      ) : null}
    </div>
  );
}

export function FieldRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-4 sm:grid-cols-2', className)}>{children}</div>;
}

export function FieldGrid({ children, columns = 3, className }: { children: ReactNode; columns?: 2 | 3 | 4; className?: string }) {
  const grid = {
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-2 lg:grid-cols-3',
    4: 'sm:grid-cols-2 lg:grid-cols-4',
  }[columns];
  return <div className={cn('grid gap-4', grid, className)}>{children}</div>;
}

/* ── Inputs ──────────────────────────────────────────────────────────── */

type BaseInput = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  invalid?: boolean;
  onValueChange?: (value: string) => void;
  suffix?: ReactNode;
  leading?: ReactNode;
};

export function TextInput({ invalid, className, onValueChange, onChange, suffix, leading, ...rest }: BaseInput) {
  return (
    <div className="relative">
      {leading ? <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-400">{leading}</span> : null}
      <input
        className={cn('input', invalid && 'input-invalid', leading && 'pl-9', suffix && 'pr-10', className)}
        aria-invalid={invalid || undefined}
        onChange={(event) => {
          onChange?.(event);
          onValueChange?.(event.target.value);
        }}
        {...rest}
      />
      {suffix ? <span className="absolute top-1/2 right-3 -translate-y-1/2 text-xs font-medium text-ink-400">{suffix}</span> : null}
    </div>
  );
}

export function PasswordInput({ invalid, className, ...rest }: BaseInput) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        className={cn('input pr-11', invalid && 'input-invalid', className)}
        aria-invalid={invalid || undefined}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-md p-2 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export function TextArea({
  invalid,
  className,
  onValueChange,
  ...rest
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> & {
  invalid?: boolean;
  onValueChange?: (value: string) => void;
  onChange?: (event: ChangeEvent<HTMLTextAreaElement>) => void;
}) {
  return (
    <textarea
      className={cn('textarea', invalid && 'input-invalid', className)}
      aria-invalid={invalid || undefined}
      onChange={(event) => {
        rest.onChange?.(event);
        onValueChange?.(event.target.value);
      }}
      {...rest}
    />
  );
}

export interface Option {
  value: string;
  label: string;
  disabled?: boolean;
  hint?: string;
}

export function Select({
  options,
  invalid,
  placeholder = null,
  className,
  onValueChange,
  ...rest
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'children'> & {
  options: Option[];
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
  invalid?: boolean;
  placeholder?: string | null;
  onValueChange?: (value: string) => void;
}) {
  return (
    <div className="relative">
      <select
        className={cn('select appearance-none pr-9', invalid && 'input-invalid', className)}
        aria-invalid={invalid || undefined}
        onChange={(event) => {
          rest.onChange?.(event);
          onValueChange?.(event.target.value);
        }}
        {...rest}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
    </div>
  );
}

export function CheckboxRow({
  checked,
  onChange,
  label,
  description,
  tone = 'default',
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  tone?: 'default' | 'danger' | 'warning';
  disabled?: boolean;
}) {
  const toneClass =
    tone === 'danger' && checked
      ? 'border-[var(--color-risk-red)] bg-[var(--color-risk-red-soft)]'
      : tone === 'warning' && checked
        ? 'border-[var(--color-risk-amber)] bg-[var(--color-risk-amber-soft)]'
        : checked
          ? 'border-brand-300 bg-brand-50/60'
          : 'border-ink-200 bg-white';
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors',
        toneClass,
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <input
        type="checkbox"
        className="checkbox mt-0.5"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="min-w-0">
        <span className="block text-[0.86rem] font-medium text-ink-800">{label}</span>
        {description ? <span className="mt-0.5 block text-xs leading-snug text-ink-500">{description}</span> : null}
      </span>
    </label>
  );
}

export function RadioGroup({
  name,
  value,
  options,
  onChange,
  columns = 2,
}: {
  name: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  columns?: 1 | 2 | 3;
}) {
  const grid = { 1: 'grid-cols-1', 2: 'grid-cols-1 sm:grid-cols-2', 3: 'grid-cols-1 sm:grid-cols-3' }[columns];
  return (
    <div className={cn('grid gap-2', grid)} role="radiogroup" aria-label={name}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <label
            key={option.value}
            className={cn(
              'flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors',
              active ? 'border-brand-600 bg-brand-50 font-semibold text-brand-900' : 'border-ink-200 bg-white text-ink-700 hover:border-brand-300',
              option.disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              value={option.value}
              checked={active}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
            />
            <span className={cn('grid size-4 place-items-center rounded-full border', active ? 'border-brand-700 bg-brand-700' : 'border-ink-300')}>
              {active ? <span className="size-1.5 rounded-full bg-white" /> : null}
            </span>
            {option.label}
          </label>
        );
      })}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-[0.88rem] font-semibold text-ink-800">{label}</span>
        {description ? <span className="mt-0.5 block text-xs leading-snug text-ink-500">{description}</span> : null}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-50',
          checked ? 'border-brand-700 bg-brand-700' : 'border-ink-300 bg-ink-200',
        )}
      >
        <span
          className={cn(
            'absolute top-1/2 size-4.5 -translate-y-1/2 rounded-full bg-white shadow-sm transition-all',
            checked ? 'left-[calc(100%-1.25rem)]' : 'left-0.5',
          )}
          style={{ width: '1.125rem', height: '1.125rem' }}
        />
      </button>
    </div>
  );
}

export function SearchInput({
  value,
  onValueChange,
  placeholder = 'Search…',
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onValueChange(event.target.value)}
        className="input pl-9"
        aria-label={placeholder}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onValueChange('')}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
          aria-label="Clear search"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/** Multi-select list rendered as toggle chips — used for danger signs & topics. */
export function ChipMultiSelect({
  options,
  values,
  onToggle,
  tone = 'default',
}: {
  options: Option[];
  values: string[];
  onToggle: (value: string) => void;
  tone?: 'default' | 'danger';
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = values.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onToggle(option.value)}
            aria-pressed={active}
            className={cn(
              'chip',
              active && (tone === 'danger' ? 'border-[var(--color-risk-red)] bg-[var(--color-risk-red)] text-white hover:bg-[var(--color-risk-red)] hover:text-white' : 'chip-active'),
            )}
          >
            {active ? <Check className="size-3.5" aria-hidden /> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function NumberField({
  label,
  value,
  onValueChange,
  unit,
  min,
  max,
  step = 1,
  error,
  hint,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  error?: string | null;
  hint?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <Field label={label} error={error} hint={hint}>
      <TextInput
        inputMode="decimal"
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        placeholder={placeholder}
        suffix={unit}
        invalid={Boolean(error)}
        onValueChange={onValueChange}
      />
    </Field>
  );
}
