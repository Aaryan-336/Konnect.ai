'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';
import { useAuth } from '@/lib/auth';
import { NAV_ITEMS, canAccess, isActive } from '@/lib/nav';
import { LogoMark } from '@/components/ui/Logo';
import { LogOut, PanelLeftClose, PanelLeftOpen, Mic } from 'lucide-react';
import { useVoice } from '@/components/voice/VoiceProvider';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'konnect-rail-collapsed';
const RAIL_EVENT = 'konnect-rail-change';

/** Collapsed state lives in localStorage, so it is read as an external store. */
function subscribeRail(onChange: () => void) {
  window.addEventListener(RAIL_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(RAIL_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/**
 * The desktop rail. An ink slab floating on the cream canvas, mirroring the
 * dark sidebar in the reference design. Hidden below `lg`, where the dock
 * takes over.
 */
export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { open: openVoice } = useVoice();
  const collapsed = useSyncExternalStore(
    subscribeRail,
    () => localStorage.getItem(STORAGE_KEY) === '1',
    () => false
  );

  // The content column reads this instead of subscribing to rail state, so
  // collapsing never re-renders the page below.
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--rail-current',
      collapsed ? 'var(--rail-w-collapsed)' : 'var(--rail-w)'
    );
  }, [collapsed]);

  const toggle = () => {
    localStorage.setItem(STORAGE_KEY, collapsed ? '0' : '1');
    window.dispatchEvent(new Event(RAIL_EVENT));
  };

  const visible = NAV_ITEMS.filter((item) => canAccess(item, user?.roles));
  const workspace = visible.filter((i) => i.group === 'workspace');
  const manage = visible.filter((i) => i.group === 'manage');

  const renderGroup = (label: string, items: typeof visible) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-5">
        {!collapsed && (
          <p
            className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em]"
            style={{ color: 'var(--ink-fg-muted)' }}
          >
            {label}
          </p>
        )}
        <div className="flex flex-col gap-1">
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group relative flex items-center gap-3 rounded-[14px] py-2.5 text-[13px] font-medium transition-all duration-200',
                  collapsed ? 'justify-center px-0' : 'px-3'
                )}
                style={{
                  background: active ? 'var(--ink-fg)' : 'transparent',
                  color: active ? 'var(--ink)' : 'var(--ink-fg-muted)',
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.07)';
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = 'transparent';
                }}
              >
                <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <aside
      className="fixed left-0 top-0 z-40 hidden h-screen p-3 lg:block"
      style={{ width: collapsed ? 'var(--rail-w-collapsed)' : 'var(--rail-w)', transition: 'width 0.28s cubic-bezier(0.22,1,0.36,1)' }}
    >
      <div
        className="flex h-full flex-col overflow-hidden px-3 py-4"
        style={{
          background: 'var(--ink)',
          borderRadius: 'var(--r-xl)',
          boxShadow: 'var(--shadow-ink)',
        }}
      >
        {/* Brand */}
        <div className={cn('mb-6 flex items-center', collapsed ? 'justify-center' : 'gap-2.5 px-1')}>
          <LogoMark size={collapsed ? 34 : 32} tone="cream" />
          {!collapsed && (
            <span
              className="text-[15px] font-semibold tracking-[-0.02em]"
              style={{ color: 'var(--ink-fg)' }}
            >
              Konnect
            </span>
          )}
        </div>

        {/* Ask — voice entry point, mirrored by the dock's mic on mobile */}
        <button
          onClick={openVoice}
          className={cn(
            'mb-6 flex items-center gap-2.5 rounded-[14px] py-2.5 text-[13px] font-semibold transition-transform duration-200 active:scale-[0.97]',
            collapsed ? 'justify-center px-0' : 'px-3'
          )}
          style={{
            background: 'linear-gradient(140deg, var(--spark) 0%, var(--spark-strong) 100%)',
            color: '#fff',
            boxShadow: '0 8px 22px rgba(217, 122, 43, 0.32)',
          }}
          title="Ask with your voice"
        >
          <Mic size={17} />
          {!collapsed && <span>Ask by voice</span>}
        </button>

        <nav className="no-scrollbar flex-1 overflow-y-auto">
          {renderGroup('Workspace', workspace)}
          {renderGroup('Manage', manage)}
        </nav>

        {/* User */}
        <div
          className="mt-3 border-t pt-3"
          style={{ borderColor: 'rgba(255,255,255,0.09)' }}
        >
          {!collapsed && user && (
            <div className="mb-2 flex items-center gap-2.5 px-1">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                style={{ background: 'rgba(255,255,255,0.12)', color: 'var(--ink-fg)' }}
              >
                {user.display_name?.charAt(0)?.toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className="block truncate text-[13px] font-semibold"
                  style={{ color: 'var(--ink-fg)' }}
                >
                  {user.display_name}
                </span>
                <span
                  className="block truncate text-[11px]"
                  style={{ color: 'var(--ink-fg-muted)' }}
                >
                  {user.roles?.[0]?.replace(/_/g, ' ').toLowerCase()}
                </span>
              </span>
            </div>
          )}

          <div className={cn('flex gap-1.5', collapsed && 'flex-col')}>
            <button
              onClick={toggle}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand' : 'Collapse'}
              className="flex h-9 flex-1 items-center justify-center rounded-[11px] transition-colors"
              style={{ background: 'rgba(255,255,255,0.07)', color: 'var(--ink-fg-muted)' }}
            >
              {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
            <button
              onClick={logout}
              aria-label="Log out"
              title="Log out"
              className="flex h-9 flex-1 items-center justify-center rounded-[11px] transition-colors"
              style={{ background: 'rgba(255,255,255,0.07)', color: 'var(--ink-fg-muted)' }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
