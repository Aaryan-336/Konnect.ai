'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { MessageSquare, Bot, ArrowRight, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/primitives';

interface Conversation {
  id: string;
  agent_id: string;
  agent_name?: string;
  title?: string;
  updated_at: string;
}

/** Groups history the way people remember it: today, yesterday, then by date. */
function bucketFor(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.floor((startOfToday.getTime() - date.getTime()) / 86_400_000);

  if (date >= startOfToday) return 'Today';
  if (diffDays < 1) return 'Yesterday';
  if (diffDays < 7) return 'Earlier this week';
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listConversations()
      .then(setConversations)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, Conversation[]>();
    for (const conv of conversations) {
      const key = bucketFor(conv.updated_at);
      const list = map.get(key);
      if (list) list.push(conv);
      else map.set(key, [conv]);
    }
    return [...map.entries()];
  }, [conversations]);

  return (
    <div className="page-narrow animate-fade-in">
      <PageHeader
        eyebrow="Workspace"
        title="Conversations"
        subtitle="Pick up any past session exactly where you left it."
      />

      {loading ? (
        <div className="space-y-2.5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[74px] rounded-[18px]" />
          ))}
        </div>
      ) : groups.length > 0 ? (
        <div className="space-y-7">
          {groups.map(([label, items]) => (
            <section key={label}>
              <h2
                className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: 'var(--text-muted)' }}
              >
                {label}
              </h2>
              <div className="space-y-2.5">
                {items.map((conv) => (
                  <Link
                    key={conv.id}
                    href={`/dashboard/agents/${conv.agent_id}?conversation=${conv.id}`}
                    className="surface hover-lift group flex items-center gap-3.5 p-4"
                  >
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]"
                      style={{
                        background: 'var(--tint-lavender)',
                        color: 'var(--tint-lavender-ink)',
                      }}
                    >
                      <Bot size={19} />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate text-[14px] font-semibold"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {conv.title || 'Conversation'}
                      </span>
                      <span
                        className="mt-0.5 flex items-center gap-2 text-[11px]"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        <span className="truncate">
                          {conv.agent_name || 'Knowledge assistant'}
                        </span>
                        <span>·</span>
                        <span className="flex shrink-0 items-center gap-1">
                          <Clock size={11} />
                          {new Date(conv.updated_at).toLocaleTimeString([], {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </span>
                      </span>
                    </span>

                    <ArrowRight
                      size={16}
                      className="shrink-0 transition-transform group-hover:translate-x-1"
                      style={{ color: 'var(--text-muted)' }}
                    />
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={MessageSquare}
          title="No conversations yet"
          description="Ask an agent something — by voice or text — and the session shows up here."
        />
      )}
    </div>
  );
}
