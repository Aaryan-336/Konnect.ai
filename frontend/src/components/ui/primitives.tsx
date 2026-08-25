'use client';

import React from 'react';
import { cn } from '@/lib/utils';

/* ---------------------------------------------------------------------------
   Shared surface + control primitives.
   Everything here reads from the tokens in globals.css, so a theme change
   never needs a component edit.
   --------------------------------------------------------------------------- */

export function Card({
  className,
  interactive,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn('surface', interactive && 'hover-lift', className)}
      {...props}
    />
  );
}

export function InkPanel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('surface-ink', className)} {...props} />;
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'spark';
type ButtonSize = 'sm' | 'md' | 'lg';

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-[10px]',
  md: 'h-10 px-4 text-[13px] gap-2 rounded-[12px]',
  lg: 'h-12 px-5 text-sm gap-2 rounded-[14px]',
};

export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
  }
>(function Button({ className, variant = 'primary', size = 'md', style, ...props }, ref) {
  const variantStyle: React.CSSProperties =
    variant === 'primary'
      ? { background: 'var(--accent)', color: 'var(--accent-on)' }
      : variant === 'secondary'
      ? {
          background: 'var(--bg-card)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-primary)',
        }
      : variant === 'ghost'
      ? { background: 'transparent', color: 'var(--text-secondary)' }
      : variant === 'spark'
      ? { background: 'var(--spark)', color: '#fff' }
      : {
          background: 'var(--danger-soft)',
          color: 'var(--danger)',
          border: '1px solid var(--danger-soft)',
        };

  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center font-semibold whitespace-nowrap',
        'transition-all duration-200 active:scale-[0.97]',
        'disabled:opacity-40 disabled:pointer-events-none',
        variant === 'primary' && 'shadow-[var(--shadow-sm)] hover:opacity-90',
        variant === 'secondary' && 'hover:bg-[var(--bg-hover)]',
        variant === 'ghost' && 'hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
        SIZES[size],
        className
      )}
      style={{ ...variantStyle, ...style }}
      {...props}
    />
  );
});

export function IconButton({
  className,
  label,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]',
        'border border-[var(--border-primary)] bg-[var(--bg-card)] text-[var(--text-secondary)]',
        'transition-all duration-200 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
        'active:scale-95 disabled:opacity-40',
        className
      )}
      {...props}
    />
  );
}

export type ChipTone =
  | 'neutral' | 'ink' | 'success' | 'warning' | 'danger' | 'info' | 'spark'
  | 'peach' | 'lavender' | 'mint' | 'sky' | 'butter';

const CHIP_TONES: Record<ChipTone, React.CSSProperties> = {
  neutral: { background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' },
  ink: { background: 'var(--accent)', color: 'var(--accent-on)' },
  success: { background: 'var(--success-soft)', color: 'var(--success)' },
  warning: { background: 'var(--warning-soft)', color: 'var(--warning)' },
  danger: { background: 'var(--danger-soft)', color: 'var(--danger)' },
  info: { background: 'var(--info-soft)', color: 'var(--info)' },
  spark: { background: 'var(--spark-soft)', color: 'var(--spark-strong)' },
  peach: { background: 'var(--tint-peach)', color: 'var(--tint-peach-ink)' },
  lavender: { background: 'var(--tint-lavender)', color: 'var(--tint-lavender-ink)' },
  mint: { background: 'var(--tint-mint)', color: 'var(--tint-mint-ink)' },
  sky: { background: 'var(--tint-sky)', color: 'var(--tint-sky-ink)' },
  butter: { background: 'var(--tint-butter)', color: 'var(--tint-butter-ink)' },
};

export function Chip({
  tone = 'neutral',
  className,
  style,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: ChipTone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1',
        'text-[10px] font-bold uppercase tracking-[0.06em] whitespace-nowrap',
        className
      )}
      style={{ ...CHIP_TONES[tone], ...style }}
      {...props}
    />
  );
}

/** The soft square that holds an icon at the top of a card. */
export function TintIcon({
  tone = 'neutral',
  size = 'md',
  className,
  children,
}: {
  tone?: ChipTone;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center',
        size === 'sm' && 'h-8 w-8 rounded-[10px]',
        size === 'md' && 'h-11 w-11 rounded-[14px]',
        size === 'lg' && 'h-14 w-14 rounded-[18px]',
        className
      )}
      style={CHIP_TONES[tone]}
    >
      {children}
    </span>
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full rounded-[12px] border px-4 py-2.5 text-sm outline-none transition-colors',
        'border-[var(--border-primary)] bg-[var(--bg-card)] text-[var(--text-primary)]',
        'placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]',
        className
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span
        className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.07em]"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </span>
      {children}
      {hint && (
        <span className="mt-1 block text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {hint}
        </span>
      )}
    </label>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <p
            className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: 'var(--text-muted)' }}
          >
            {eyebrow}
          </p>
        )}
        <h1
          className="text-[26px] font-semibold leading-tight tracking-[-0.025em] sm:text-[32px]"
          style={{ color: 'var(--text-primary)' }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1.5 max-w-2xl text-sm" style={{ color: 'var(--text-secondary)' }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export function SectionLabel({
  icon: Icon,
  children,
  className,
}: {
  icon?: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em]',
        className
      )}
      style={{ color: 'var(--text-muted)' }}
    >
      {Icon && <Icon size={12} style={{ color: 'var(--spark)' }} />}
      {children}
    </span>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="surface flex flex-col items-center px-6 py-16 text-center">
      <span
        className="mb-4 flex h-14 w-14 items-center justify-center rounded-[18px]"
        style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}
      >
        <Icon size={26} strokeWidth={1.6} />
      </span>
      <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
        {title}
      </h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm" style={{ color: 'var(--text-secondary)' }}>
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />;
}

export function LoadingDots({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-1.5', className)} role="status" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="loading-dot h-2 w-2 rounded-full"
          style={{ background: 'var(--text-muted)' }}
        />
      ))}
    </div>
  );
}
