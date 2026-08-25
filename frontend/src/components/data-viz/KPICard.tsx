'use client';

import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { STATUS_COLORS } from '@/lib/chart-theme';

interface KPICardProps {
  label: string;
  value: string | number;
  change?: string | null;
  trend?: 'up' | 'down' | 'stable' | string | null;
  source?: string | null;
  /** Renders the figure larger, for dashboard hero metrics. */
  emphasis?: boolean;
}

/**
 * A stat tile. Used when the story is a single number — which is more often
 * than a chart is warranted.
 *
 * Direction is carried by an icon and the change text, never by colour alone.
 */
export default function KPICard({
  label,
  value,
  change,
  trend,
  source,
  emphasis = false,
}: KPICardProps) {
  const direction =
    trend === 'up' || trend === 'down' || trend === 'stable'
      ? trend
      : change?.startsWith('+')
      ? 'up'
      : change?.startsWith('-')
      ? 'down'
      : 'stable';

  const DirectionIcon =
    direction === 'up' ? TrendingUp : direction === 'down' ? TrendingDown : Minus;

  const directionColor =
    direction === 'up'
      ? STATUS_COLORS.good
      : direction === 'down'
      ? STATUS_COLORS.critical
      : 'var(--text-secondary)';

  return (
    <div
      className="flex flex-col gap-1.5 p-4 transition-transform hover:-translate-y-0.5"
      style={{
        background: 'var(--bg-inset)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--r-md)',
      }}
      title={source ? `Source: ${source}` : undefined}
    >
      <span
        className="text-[11px] font-medium leading-snug"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </span>

      <span
        className={`font-semibold tracking-tight tabular-nums ${
          emphasis ? 'text-2xl' : 'text-lg'
        }`}
        style={{ color: 'var(--text-primary)' }}
      >
        {value}
      </span>

      {change && (
        <span
          className="text-[11px] font-medium flex items-center gap-1"
          style={{ color: directionColor }}
        >
          <DirectionIcon size={11} aria-hidden />
          {change}
        </span>
      )}

      {source && (
        <span className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
          {source}
        </span>
      )}
    </div>
  );
}
