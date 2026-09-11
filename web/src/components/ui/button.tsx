import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'quiet' | 'ghost' | 'danger' | 'outline-danger' | 'white';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  quiet: 'btn-quiet',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
  'outline-danger': 'btn-outline-danger',
  white: 'btn-white',
};

const SIZES: Record<Size, string> = { sm: 'btn-sm', md: '', lg: 'btn-lg' };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, icon, iconRight, block, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn('btn', VARIANTS[variant], SIZES[size], block && 'w-full', className)}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      <span className={cn(loading && 'opacity-90')}>{children}</span>
      {!loading && iconRight}
    </button>
  );
});

export interface ButtonLinkProps extends LinkProps {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  block?: boolean;
}

export function ButtonLink({ variant = 'primary', size = 'md', icon, block, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={cn('btn', VARIANTS[variant], SIZES[size], block && 'w-full', className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}

export function LinkButton({ className, variant = 'secondary', size = 'md', children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant; size?: Size }) {
  return (
    <a className={cn('btn', VARIANTS[variant], SIZES[size], className)} {...rest}>
      {children}
    </a>
  );
}

export function IconButton({
  label,
  icon,
  variant = 'ghost',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: ReactNode; variant?: Variant }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'btn size-9 min-h-0 p-0',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {icon}
      <span className="sr-only">{label}</span>
    </button>
  );
}
