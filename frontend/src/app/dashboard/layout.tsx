'use client';

import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import TopBar from '@/components/layout/TopBar';
import MobileDock from '@/components/layout/MobileDock';
import { VoiceProvider } from '@/components/voice/VoiceProvider';
import { FeedbackProvider } from '@/components/ui/feedback';
import { LoadingDots } from '@/components/ui/primitives';
import { LogoMark } from '@/components/ui/Logo';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  if (loading) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-5"
        style={{ background: 'var(--bg-primary)' }}
      >
        <LogoMark size={44} />
        <LoadingDots />
      </div>
    );
  }

  if (!user) return null;

  return (
    <FeedbackProvider>
      <VoiceProvider>
      <div style={{ background: 'var(--bg-primary)' }} className="min-h-screen">
        <Sidebar />

        {/* The rail is fixed, so the content column is offset rather than
            flexed. Sidebar keeps --rail-current in sync when it collapses. */}
        <div
          className="lg:pl-[var(--rail-current)]"
          style={{ transition: 'padding-left 0.28s cubic-bezier(0.22,1,0.36,1)' }}
        >
          <TopBar />
          <main
            className="px-4 pb-[calc(var(--dock-h)+var(--safe-b)+28px)] pt-5 sm:px-6 lg:px-8 lg:pb-12"
          >
            <div className="page">{children}</div>
          </main>
        </div>

        <MobileDock />
      </div>
      </VoiceProvider>
    </FeedbackProvider>
  );
}
