'use client';

import { Monitor, Moon, Sun, Palette, Download, Check } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { useInstallPrompt } from '@/components/pwa/InstallPrompt';

const OPTIONS = [
  { value: 'light' as const, label: 'Light', icon: Sun },
  { value: 'dark' as const, label: 'Dark', icon: Moon },
  { value: 'system' as const, label: 'Match system', icon: Monitor },
];

/** Theme choice plus the install entry point, for the desktop settings page. */
export default function AppearanceCard() {
  const { theme, setTheme } = useTheme();
  const { canInstall, promptInstall } = useInstallPrompt();

  return (
    <div
      className="space-y-4 rounded-[var(--r-lg)] border p-5 sm:p-6"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}
    >
      <div
        className="flex items-center gap-2 border-b pb-3"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <Palette size={16} style={{ color: 'var(--spark)' }} />
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Appearance &amp; App
        </h2>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {OPTIONS.map(({ value, label, icon: Icon }) => {
          const active = theme === value;
          return (
            <button
              key={value}
              onClick={() => setTheme(value)}
              aria-pressed={active}
              className="flex items-center gap-2.5 rounded-[var(--r-md)] border px-3.5 py-3 text-[13px] font-medium transition-colors"
              style={{
                borderColor: active ? 'var(--accent)' : 'var(--border-primary)',
                background: active ? 'var(--accent-muted)' : 'var(--bg-inset)',
                color: 'var(--text-primary)',
              }}
            >
              <Icon size={16} style={{ color: 'var(--text-secondary)' }} />
              <span className="flex-1 text-left">{label}</span>
              {active && <Check size={14} style={{ color: 'var(--text-primary)' }} />}
            </button>
          );
        })}
      </div>

      <div
        className="flex flex-col gap-3 rounded-[var(--r-md)] p-4 sm:flex-row sm:items-center"
        style={{ background: 'var(--bg-inset)' }}
      >
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
            Install as an app
          </p>
          <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {canInstall
              ? 'Runs full-screen from your home screen or dock, and keeps working offline for pages you have opened.'
              : 'Already installed, or your browser offers this from its own menu — look for “Add to Home Screen”.'}
          </p>
        </div>
        <button
          onClick={() => promptInstall()}
          disabled={!canInstall}
          className="flex shrink-0 items-center justify-center gap-2 rounded-[var(--r-md)] px-4 py-2.5 text-xs font-semibold transition-opacity disabled:opacity-40"
          style={{ background: 'var(--accent)', color: 'var(--accent-on)' }}
        >
          <Download size={14} />
          Install
        </button>
      </div>
    </div>
  );
}
