'use client';

import { ShieldCheck, Mic, FileText } from 'lucide-react';
import { LogoMark } from '@/components/ui/Logo';

const HIGHLIGHTS = [
  { icon: ShieldCheck, text: 'Answers grounded only in documents you are cleared to see' },
  { icon: FileText, text: 'Every claim carries a citation back to the source page' },
  { icon: Mic, text: 'Ask out loud — voice questions work anywhere in the app' },
];

/**
 * Two-panel auth layout: an ink brand panel that only appears from `lg` up,
 * and the form column, which is the whole screen on a phone.
 */
export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      {/* Brand panel */}
      <aside className="relative hidden w-[46%] max-w-[560px] p-3 lg:block">
        <div
          className="flex h-full flex-col justify-between overflow-hidden p-10"
          style={{
            background: 'var(--ink)',
            borderRadius: 'var(--r-2xl)',
            color: 'var(--ink-fg)',
          }}
        >
          <LogoMark size={40} tone="cream" />

          <div>
            <h2 className="text-[34px] font-semibold leading-[1.12] tracking-[-0.03em]">
              Your organisation&apos;s knowledge,
              <br />
              <span style={{ color: 'var(--ink-fg-muted)' }}>answerable in a sentence.</span>
            </h2>

            <ul className="mt-9 space-y-4">
              {HIGHLIGHTS.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start gap-3">
                  <span
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
                    style={{ background: 'rgba(255,255,255,0.09)' }}
                  >
                    <Icon size={15} />
                  </span>
                  <span
                    className="text-[13px] leading-relaxed"
                    style={{ color: 'var(--ink-fg-muted)' }}
                  >
                    {text}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-[11px]" style={{ color: 'var(--ink-fg-muted)' }}>
            Tenant-isolated · No web search · Full audit trail
          </p>
        </div>
      </aside>

      {/* Form panel */}
      <main className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="w-full max-w-[380px]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <LogoMark size={34} tone="ink" />
            <span
              className="text-[17px] font-semibold tracking-[-0.02em]"
              style={{ color: 'var(--text-primary)' }}
            >
              Konnect
            </span>
          </div>

          <h1
            className="text-[26px] font-semibold tracking-[-0.025em]"
            style={{ color: 'var(--text-primary)' }}
          >
            {title}
          </h1>
          <p className="mb-7 mt-1.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {subtitle}
          </p>

          {children}

          <div className="mt-7 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            {footer}
          </div>
        </div>
      </main>
    </div>
  );
}
