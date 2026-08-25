'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { LogoMark } from '@/components/ui/Logo';
import { LoadingDots } from '@/components/ui/primitives';

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) router.push(user ? '/dashboard' : '/login');
  }, [user, loading, router]);

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
