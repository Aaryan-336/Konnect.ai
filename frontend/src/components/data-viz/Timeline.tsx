'use client';

import React from 'react';
import { CalendarClock } from 'lucide-react';

export interface TimelineEvent {
  date?: string | null;
  label: string;
  detail?: string | null;
}

interface TimelineProps {
  events: TimelineEvent[];
  title?: string;
}

export default function Timeline({ events, title = 'Timeline' }: TimelineProps) {
  if (!events.length) return null;

  return (
    <figure
      className="my-4 overflow-hidden rounded-[var(--r-lg)] border"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}
    >
      <figcaption className="flex items-center gap-2 px-4 pt-4 pb-1">
        <CalendarClock size={14} style={{ color: 'var(--spark)' }} />
        <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h4>
      </figcaption>

      <ol className="px-4 py-3">
        {events.map((event, i) => {
          const isLast = i === events.length - 1;
          return (
            <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
              {/* Rail + node */}
              <div className="flex flex-col items-center shrink-0 pt-1">
                <span
                  className="w-2.5 h-2.5 rounded-full ring-2"
                  style={{
                    background: 'var(--spark)',
                    // 2px surface ring keeps the node readable over the rail.
                    boxShadow: '0 0 0 2px var(--bg-card)',
                    // @ts-expect-error CSS custom property passthrough
                    '--tw-ring-color': 'transparent',
                  }}
                />
                {!isLast && (
                  <span
                    className="w-px flex-1 mt-1"
                    style={{ background: 'var(--border-primary)', minHeight: 20 }}
                  />
                )}
              </div>

              <div className="min-w-0 pb-1">
                {event.date && (
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wider block"
                    style={{ color: 'var(--spark)' }}
                  >
                    {event.date}
                  </span>
                )}
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {event.label}
                </p>
                {event.detail && (
                  <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {event.detail}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </figure>
  );
}
