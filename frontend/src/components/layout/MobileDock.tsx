'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Mic, MoreHorizontal } from 'lucide-react';
import { DOCK_ITEMS, isActive } from '@/lib/nav';
import { useVoice } from '@/components/voice/VoiceProvider';
import MoreSheet from './MoreSheet';
import { cn } from '@/lib/utils';

/**
 * The mobile dock.
 *
 * Four flat tabs with a raised mic in the middle: voice is the primary way
 * into the product on a phone, so it gets the elevated, warm-gradient button
 * that breaks the dock's top edge. Everything sits above the home indicator
 * via the safe-area token.
 */
export default function MobileDock() {
  const pathname = usePathname();
  const { open: openVoice } = useVoice();
  const [moreOpen, setMoreOpen] = useState(false);

  const tabs = DOCK_ITEMS;
  const left = tabs.slice(0, 2);
  const right = tabs.slice(2);

  const Tab = ({ href, label, short, icon: Icon }: (typeof tabs)[number]) => {
    const active = isActive(pathname, href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? 'page' : undefined}
        className="flex flex-1 flex-col items-center justify-center gap-1 py-1 transition-transform active:scale-95"
        style={{ color: active ? 'var(--text-primary)' : 'var(--text-muted)' }}
      >
        <Icon size={20} strokeWidth={active ? 2.3 : 1.8} />
        <span
          className={cn('text-[10px]', active ? 'font-semibold' : 'font-medium')}
        >
          {short ?? label}
        </span>
        <span
          className="h-[3px] w-[3px] rounded-full transition-opacity"
          style={{
            background: 'var(--spark)',
            opacity: active ? 1 : 0,
          }}
        />
      </Link>
    );
  };

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 lg:hidden"
        style={{ paddingBottom: 'var(--safe-b)' }}
      >
        {/* A fade so page content dissolves into the dock instead of colliding. */}
        <div
          className="pointer-events-none h-6 w-full"
          style={{
            background: 'linear-gradient(to top, var(--bg-primary), transparent)',
          }}
        />
        <div
          className="relative flex items-stretch border-t px-2 backdrop-blur-xl"
          style={{
            height: 'var(--dock-h)',
            background: 'color-mix(in srgb, var(--bg-card) 88%, transparent)',
            borderColor: 'var(--border-subtle)',
            boxShadow: '0 -8px 28px rgba(24, 22, 18, 0.07)',
          }}
        >
          {left.map(Tab)}

          {/* Mic — the raised centrepiece */}
          <div className="relative flex w-[86px] shrink-0 justify-center">
            <button
              onClick={openVoice}
              aria-label="Ask by voice"
              className="absolute -top-6 flex h-[62px] w-[62px] items-center justify-center rounded-full transition-transform duration-200 active:scale-90"
              style={{
                background: 'linear-gradient(150deg, var(--spark) 0%, var(--spark-strong) 100%)',
                color: '#fff',
                // The ring in canvas colour is what makes the button read as
                // punching through the dock rather than sitting on it.
                border: '4px solid var(--bg-primary)',
                boxShadow: '0 10px 26px rgba(217, 122, 43, 0.42)',
              }}
            >
              <Mic size={25} strokeWidth={2.1} />
            </button>
            <span
              className="absolute bottom-2.5 text-[10px] font-semibold"
              style={{ color: 'var(--spark-strong)' }}
            >
              Ask
            </span>
          </div>

          {right.map(Tab)}

          <button
            onClick={() => setMoreOpen(true)}
            aria-label="More"
            className="flex flex-1 flex-col items-center justify-center gap-1 py-1 transition-transform active:scale-95"
            style={{ color: 'var(--text-muted)' }}
          >
            <MoreHorizontal size={20} strokeWidth={1.8} />
            <span className="text-[10px] font-medium">More</span>
            <span className="h-[3px] w-[3px]" />
          </button>
        </div>
      </nav>

      {moreOpen && <MoreSheet onClose={() => setMoreOpen(false)} />}
    </>
  );
}
