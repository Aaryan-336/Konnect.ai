'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Chrome fires `beforeinstallprompt` once, early — often before any component
 * that cares has mounted. A module-level store catches it and replays it to
 * whoever subscribes later.
 */
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    emit();
  });
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function useInstallPrompt() {
  const canInstall = useSyncExternalStore(
    subscribe,
    () => deferred !== null,
    () => false
  );

  const promptInstall = useCallback(async () => {
    if (!deferred) return 'unavailable' as const;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    emit();
    return outcome;
  }, []);

  return { canInstall, promptInstall };
}

const DISMISS_KEY = 'konnect-install-dismissed';
const DISMISS_EVENT = 'konnect-install-dismissed-change';

function subscribeDismissed(onChange: () => void) {
  window.addEventListener(DISMISS_EVENT, onChange);
  return () => window.removeEventListener(DISMISS_EVENT, onChange);
}

/** A quiet banner above the dock, shown once until dismissed. */
export default function InstallBanner() {
  const { canInstall, promptInstall } = useInstallPrompt();
  // Starts as dismissed on the server so the banner never flashes in before
  // localStorage has been consulted.
  const dismissed = useSyncExternalStore(
    subscribeDismissed,
    () => localStorage.getItem(DISMISS_KEY) === '1',
    () => true
  );

  if (!canInstall || dismissed) return null;

  return (
    <div
      className="fixed inset-x-3 z-[60] flex items-center gap-3 p-3 lg:inset-x-auto lg:bottom-4 lg:right-4 lg:w-[340px]"
      style={{
        bottom: 'calc(var(--dock-h) + var(--safe-b) + 12px)',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--r-lg)',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]"
        style={{ background: 'var(--tint-peach)', color: 'var(--tint-peach-ink)' }}
      >
        <Download size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
          Install Konnect
        </p>
        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          Full-screen, offline-ready, one tap from your home screen.
        </p>
      </div>
      <button
        onClick={() => promptInstall()}
        className="shrink-0 rounded-[10px] px-3 py-2 text-xs font-semibold"
        style={{ background: 'var(--accent)', color: 'var(--accent-on)' }}
      >
        Install
      </button>
      <button
        aria-label="Dismiss"
        onClick={() => {
          localStorage.setItem(DISMISS_KEY, '1');
          window.dispatchEvent(new Event(DISMISS_EVENT));
        }}
        className="shrink-0 p-1"
        style={{ color: 'var(--text-muted)' }}
      >
        <X size={15} />
      </button>
    </div>
  );
}
