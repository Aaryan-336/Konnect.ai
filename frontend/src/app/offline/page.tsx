import { WifiOff } from 'lucide-react';
import Link from 'next/link';
import { LogoWordmark } from '@/components/ui/Logo';

export const metadata = { title: 'Offline' };

/**
 * Served by the service worker when a navigation fails and nothing is cached
 * for that route. Static on purpose — it must render with zero network.
 */
export default function OfflinePage() {
  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center px-6 text-center"
      style={{ background: 'var(--bg-primary)' }}
    >
      <LogoWordmark size={34} />

      <span
        className="mt-10 flex h-16 w-16 items-center justify-center rounded-[20px]"
        style={{ background: 'var(--tint-peach)', color: 'var(--tint-peach-ink)' }}
      >
        <WifiOff size={28} strokeWidth={1.7} />
      </span>

      <h1
        className="mt-6 text-2xl font-semibold tracking-[-0.02em]"
        style={{ color: 'var(--text-primary)' }}
      >
        You&apos;re offline
      </h1>
      <p className="mt-2 max-w-sm text-sm" style={{ color: 'var(--text-secondary)' }}>
        Konnect answers come from your knowledge base, so a connection is needed to ask
        anything new. Pages you have already opened stay available.
      </p>

      <Link
        href="/dashboard"
        className="mt-7 rounded-[14px] px-5 py-3 text-sm font-semibold"
        style={{ background: 'var(--accent)', color: 'var(--accent-on)' }}
      >
        Try again
      </Link>
    </main>
  );
}
