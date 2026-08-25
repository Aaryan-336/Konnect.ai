'use client';

import React, { Suspense, useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Bot, ArrowLeft, SlidersHorizontal } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import ChatWindow from '@/components/chat/ChatWindow';
import { EmptyState, LoadingDots, Button } from '@/components/ui/primitives';

function ChatLoading() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <LoadingDots />
    </div>
  );
}

function AgentChat() {
  const params = useParams();
  // useSearchParams opts this subtree out of prerendering, so it lives under
  // its own Suspense boundary (see the Next.js useSearchParams reference).
  const searchParams = useSearchParams();
  const agentId = params.id as string;
  const initialQuery = searchParams.get('q') || undefined;
  // Set when arriving from the conversation history, so the chat resumes
  // rather than starting a new thread.
  const conversationId = searchParams.get('conversation') || undefined;

  const { isAgentManager } = useAuth();
  const [agent, setAgent] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!agentId) return;
    api
      .getAgent(agentId)
      .then(setAgent)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load agent'))
      .finally(() => setLoading(false));
  }, [agentId]);

  if (loading) return <ChatLoading />;

  if (error || !agent) {
    return (
      <div className="page-narrow py-10">
        <EmptyState
          icon={Bot}
          title={error || 'Agent not found'}
          description="It may have been archived, or you may not have access to it."
          action={
            <Link href="/dashboard/agents">
              <Button variant="secondary">
                <ArrowLeft size={15} />
                Back to agents
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-3 flex items-center justify-between gap-3">
        <Link
          href="/dashboard/agents"
          className="inline-flex items-center gap-1.5 text-xs font-medium transition-colors hover:text-[var(--text-primary)]"
          style={{ color: 'var(--text-muted)' }}
        >
          <ArrowLeft size={14} /> All agents
        </Link>

        {isAgentManager && (
          <Link
            href={`/dashboard/agents/${agentId}/edit`}
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors hover:bg-[var(--bg-hover)]"
            style={{
              borderColor: 'var(--border-primary)',
              background: 'var(--bg-card)',
              color: 'var(--text-secondary)',
            }}
          >
            <SlidersHorizontal size={13} />
            Edit agent
          </Link>
        )}
      </div>

      <ChatWindow
        agent={agent}
        initialQuery={initialQuery}
        conversationId={conversationId}
      />
    </div>
  );
}

export default function AgentChatPage() {
  return (
    <Suspense fallback={<ChatLoading />}>
      <AgentChat />
    </Suspense>
  );
}
