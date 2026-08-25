import React from 'react';

/**
 * The Konnect mark: two interlocking blocks, echoing the "linked knowledge"
 * idea. Drawn as SVG so it stays crisp in the rail, the dock and the PWA
 * splash. `tone` picks the fill for the surface it sits on.
 */
export function LogoMark({
  size = 32,
  tone = 'ink',
  className,
}: {
  size?: number;
  tone?: 'ink' | 'cream' | 'current';
  className?: string;
}) {
  const bg =
    tone === 'ink' ? 'var(--ink)' : tone === 'cream' ? 'var(--ink-fg)' : 'currentColor';
  const fg = tone === 'ink' ? 'var(--ink-fg)' : tone === 'cream' ? 'var(--ink)' : 'var(--bg-card)';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden
    >
      <rect width="32" height="32" rx="9" fill={bg} />
      <path
        d="M10 8.5c0-.6.5-1.1 1.1-1.1h2.6c.6 0 1.1.5 1.1 1.1v15c0 .6-.5 1.1-1.1 1.1h-2.6c-.6 0-1.1-.5-1.1-1.1v-15Z"
        fill={fg}
      />
      <path
        d="M17.6 15.1 21.4 8a1.1 1.1 0 0 1 1-.6h2.7c.9 0 1.4.9 1 1.6l-4 6.9 4 6.9c.4.7-.1 1.6-1 1.6h-2.7c-.4 0-.8-.2-1-.6l-3.8-7.1a1.1 1.1 0 0 1 0-1.6Z"
        fill={fg}
        opacity="0.62"
      />
    </svg>
  );
}

export function LogoWordmark({
  size = 32,
  tone = 'ink',
  labelClassName,
}: {
  size?: number;
  tone?: 'ink' | 'cream';
  labelClassName?: string;
}) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={size} tone={tone} />
      <span
        className={labelClassName ?? 'text-[15px] font-semibold tracking-[-0.02em]'}
        style={{ color: tone === 'cream' ? 'var(--ink-fg)' : 'var(--text-primary)' }}
      >
        Konnect
      </span>
    </span>
  );
}
