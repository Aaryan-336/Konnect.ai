'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { NAV_ITEMS, canAccess, isActive } from '@/lib/nav';
import { LogoMark } from '@/components/ui/Logo';
import { Moon, Sun, Search } from 'lucide-react';

/**
 * The bar that runs above the content on every screen size.
 *
 * On mobile it carries the brand (the rail is gone there); on desktop it
 * carries the page title and the global search shortcut. Sticky, with a blur
 * so content passing underneath stays legible.
 */
export default function TopBar({ onSearch }: { onSearch?: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { resolved, toggle } = useTheme();

  const current = NAV_ITEMS.filter((i) => canAccess(i, user?.roles)).find((i) =>
    isActive(pathname, i.href)
  );

  return (
    <header
      className="sticky top-0 z-30 border-b backdrop-blur-xl"
      style={{
        background: 'color-mix(in srgb, var(--bg-primary) 82%, transparent)',
        borderColor: 'var(--border-subtle)',
        paddingTop: 'var(--safe-t)',
      }}
    >
      <div
        className="flex items-center gap-3 px-4 sm:px-6 lg:px-8"
        style={{ height: 'var(--topbar-h)' }}
      >
        {/* Brand on mobile, page title on desktop */}
        <Link href="/dashboard" className="flex items-center gap-2 lg:hidden">
          <LogoMark size={30} tone="ink" />
          <span
            className="text-[15px] font-semibold tracking-[-0.02em]"
            style={{ color: 'var(--text-primary)' }}
          >
            Konnect
          </span>
        </Link>

        <h2
          className="hidden text-[15px] font-semibold tracking-[-0.01em] lg:block"
          style={{ color: 'var(--text-primary)' }}
        >
          {current?.label ?? 'Konnect'}
        </h2>

        <div className="ml-auto flex items-center gap-2">
          {onSearch && (
            <button
              onClick={onSearch}
              className="hidden h-9 items-center gap-2 rounded-full border px-3.5 text-xs transition-colors hover:bg-[var(--bg-hover)] sm:flex"
              style={{
                borderColor: 'var(--border-primary)',
                background: 'var(--bg-card)',
                color: 'var(--text-muted)',
              }}
            >
              <Search size={14} />
              <span>Search</span>
              <kbd
                className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}
              >
                /
              </kbd>
            </button>
          )}

          <button
            onClick={toggle}
            aria-label={resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            className="flex h-9 w-9 items-center justify-center rounded-full border transition-colors hover:bg-[var(--bg-hover)]"
            style={{
              borderColor: 'var(--border-primary)',
              background: 'var(--bg-card)',
              color: 'var(--text-secondary)',
            }}
          >
            {resolved === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          <Link
            href="/dashboard/settings"
            aria-label="Account settings"
            className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold transition-transform active:scale-95"
            style={{ background: 'var(--accent)', color: 'var(--accent-on)' }}
          >
            {user?.display_name?.charAt(0)?.toUpperCase() ?? '?'}
          </Link>
        </div>
      </div>
    </header>
  );
}
