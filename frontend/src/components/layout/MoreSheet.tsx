'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { LogOut, X, Moon, Sun, Monitor, Download } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { NAV_ITEMS, canAccess, isActive, DOCK_ITEMS } from '@/lib/nav';
import { useInstallPrompt } from '@/components/pwa/InstallPrompt';
import { cn } from '@/lib/utils';

/** Everything that doesn't fit in the four dock slots. */
export default function MoreSheet({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { canInstall, promptInstall } = useInstallPrompt();

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const dockHrefs = new Set(DOCK_ITEMS.map((i) => i.href));
  const rest = NAV_ITEMS.filter((i) => canAccess(i, user?.roles) && !dockHrefs.has(i.href));

  const themeOptions = [
    { value: 'light' as const, label: 'Light', icon: Sun },
    { value: 'dark' as const, label: 'Dark', icon: Moon },
    { value: 'system' as const, label: 'Auto', icon: Monitor },
  ];

  return (
    <div className="fixed inset-0 z-[110] flex items-end lg:hidden">
      <button
        aria-label="Close menu"
        onClick={onClose}
        className="animate-scrim absolute inset-0 backdrop-blur-[3px]"
        style={{ background: 'rgba(12, 12, 16, 0.5)' }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="More"
        className="animate-sheet relative w-full px-4 pt-3"
        style={{
          background: 'var(--bg-card)',
          borderTopLeftRadius: 'var(--r-2xl)',
          borderTopRightRadius: 'var(--r-2xl)',
          boxShadow: 'var(--shadow-lg)',
          paddingBottom: 'calc(20px + var(--safe-b))',
        }}
      >
        <div className="flex justify-center">
          <span className="h-1 w-10 rounded-full" style={{ background: 'var(--border-strong)' }} />
        </div>

        <div className="mb-4 mt-4 flex items-center gap-3">
          <span
            className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold"
            style={{ background: 'var(--accent)', color: 'var(--accent-on)' }}
          >
            {user?.display_name?.charAt(0)?.toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-sm font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              {user?.display_name}
            </p>
            <p className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>
              {user?.email}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {rest.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className="flex items-center gap-2.5 rounded-[14px] border px-3.5 py-3 text-[13px] font-medium transition-colors"
                style={{
                  borderColor: active ? 'var(--accent)' : 'var(--border-primary)',
                  background: active ? 'var(--accent-muted)' : 'var(--bg-inset)',
                  color: 'var(--text-primary)',
                }}
              >
                <Icon size={17} style={{ color: 'var(--text-secondary)' }} />
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Theme */}
        <div className="mt-4">
          <p
            className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em]"
            style={{ color: 'var(--text-muted)' }}
          >
            Appearance
          </p>
          <div
            className="flex gap-1 rounded-[14px] p-1"
            style={{ background: 'var(--bg-tertiary)' }}
          >
            {themeOptions.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-[10px] py-2 text-xs font-semibold transition-all'
                )}
                style={{
                  background: theme === value ? 'var(--bg-card)' : 'transparent',
                  color: theme === value ? 'var(--text-primary)' : 'var(--text-muted)',
                  boxShadow: theme === value ? 'var(--shadow-xs)' : 'none',
                }}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {canInstall && (
          <button
            onClick={() => {
              promptInstall();
              onClose();
            }}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-[14px] py-3 text-[13px] font-semibold"
            style={{ background: 'var(--accent)', color: 'var(--accent-on)' }}
          >
            <Download size={16} />
            Install Konnect
          </button>
        )}

        <button
          onClick={() => {
            logout();
            onClose();
          }}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-[14px] py-3 text-[13px] font-semibold"
          style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
        >
          <LogOut size={16} />
          Log out
        </button>
      </div>
    </div>
  );
}
