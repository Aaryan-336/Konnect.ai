'use client';

import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

/**
 * Registers the service worker and surfaces offline state.
 *
 * Registration is deferred to `load` so it never competes with the first
 * paint, and skipped in development where Next's dev server and the SW cache
 * fight over the same URLs.
 */
export default function ServiceWorkerRegistrar() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // A failed registration costs offline support, not the app.
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register);

    return () => window.removeEventListener('load', register);
  }, []);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      className="fixed inset-x-0 z-[100] flex justify-center px-4"
      style={{ top: 'calc(var(--safe-t) + 8px)' }}
      role="status"
    >
      <span
        className="flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[11px] font-semibold shadow-[var(--shadow-md)]"
        style={{ background: 'var(--ink)', color: 'var(--ink-fg)' }}
      >
        <WifiOff size={13} />
        Offline — showing cached pages
      </span>
    </div>
  );
}
