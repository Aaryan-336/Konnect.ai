'use client';

import React, { useCallback, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bot, Sparkles, ArrowRight, Layers, CheckCircle2, Archive, SlidersHorizontal,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast, useConfirm } from '@/components/ui/feedback';
import {
  Button, Chip, EmptyState, PageHeader, Skeleton, type ChipTone,
} from '@/components/ui/primitives';

interface Agent {
  id: string;
  name: string;
  description?: string;
  status: string;
  knowledge_sources?: unknown[];
}

const FILTERS = ['all', 'published', 'draft', 'archived'] as const;
type Filter = (typeof FILTERS)[number];

const STATUS_TONE: Record<string, ChipTone> = {
  published: 'success',
  draft: 'warning',
  archived: 'neutral',
};

const TINTS: ChipTone[] = ['peach', 'lavender', 'mint', 'sky', 'butter'];
function tintFor(id: string): ChipTone {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return TINTS[hash % TINTS.length];
}

export default function AgentsPage() {
  const { isAgentManager, isAdmin } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const fetchAgents = useCallback(async () => {
    try {
      setAgents(await api.listAgents());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load agents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const act = async (id: string, run: () => Promise<unknown>) => {
    setError('');
    setBusyId(id);
    try {
      await run();
      setLoading(true);
      await fetchAgents();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  const filtered = agents.filter((a) => filter === 'all' || a.status === filter);

  const counts = FILTERS.reduce<Record<string, number>>((acc, f) => {
    acc[f] = f === 'all' ? agents.length : agents.filter((a) => a.status === f).length;
    return acc;
  }, {});

  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow="Workspace"
        title="Agents"
        subtitle="AI specialists bounded to the knowledge sources you give them."
        actions={
          isAgentManager && (
            <Link href="/dashboard/agents/builder">
              <Button>
                <Sparkles size={15} />
                Build an agent
              </Button>
            </Link>
          )
        }
      />

      {/* Filter pills */}
      <div className="scroll-x -mx-1 mb-5 flex gap-2 px-1 pb-1">
        {FILTERS.map((tab) => {
          const active = filter === tab;
          return (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className="shrink-0 rounded-full border px-3.5 py-2 text-xs font-semibold capitalize transition-colors"
              style={{
                background: active ? 'var(--accent)' : 'var(--bg-card)',
                borderColor: active ? 'var(--accent)' : 'var(--border-primary)',
                color: active ? 'var(--accent-on)' : 'var(--text-secondary)',
              }}
            >
              {tab}
              <span className="ml-1.5 opacity-60">{counts[tab] ?? 0}</span>
            </button>
          );
        })}
      </div>

      {error && (
        <p
          className="mb-4 rounded-[12px] px-3.5 py-2.5 text-xs"
          style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
          role="alert"
        >
          {error}
        </p>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[190px] rounded-[20px]" />
          ))}
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((agent) => {
            const tone = tintFor(agent.id);
            const isDraft = agent.status === 'draft';
            const isPublished = agent.status === 'published';
            const busy = busyId === agent.id;

            return (
              <Link
                key={agent.id}
                href={`/dashboard/agents/${agent.id}`}
                className="surface hover-lift group flex flex-col p-5"
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <span
                    className="flex h-12 w-12 items-center justify-center rounded-[15px]"
                    style={{
                      background: `var(--tint-${tone})`,
                      color: `var(--tint-${tone}-ink)`,
                    }}
                  >
                    <Bot size={22} />
                  </span>
                  <Chip tone={STATUS_TONE[agent.status] ?? 'neutral'}>{agent.status}</Chip>
                </div>

                <h3
                  className="text-[15px] font-semibold tracking-[-0.01em]"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {agent.name}
                </h3>
                <p
                  className="mt-1.5 line-clamp-2 flex-1 text-[13px] leading-relaxed"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {agent.description || 'Specialised knowledge assistant.'}
                </p>

                <div
                  className="mt-4 flex items-center justify-between border-t pt-3.5 text-[11px]"
                  style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
                >
                  <span className="flex items-center gap-1.5">
                    <Layers size={13} />
                    {agent.knowledge_sources?.length ?? 0} knowledge sources
                  </span>
                  <ArrowRight
                    size={15}
                    className="transition-transform group-hover:translate-x-1"
                  />
                </div>

                {isAgentManager && (
                  <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="flex-1"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        router.push(`/dashboard/agents/${agent.id}/edit`);
                      }}
                    >
                      <SlidersHorizontal size={13} />
                      Edit
                    </Button>
                  </div>
                )}

                {isAdmin && (isDraft || isPublished) && (
                  <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                    {isDraft ? (
                      <Button
                        size="sm"
                        className="w-full"
                        disabled={busy}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          act(agent.id, () => api.publishAgent(agent.id));
                        }}
                      >
                        <CheckCircle2 size={13} />
                        {busy ? 'Publishing…' : 'Publish'}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="w-full"
                        disabled={busy}
                        onClick={async (e) => {
                          // Synchronous, before any await: once the handler
                          // yields, the click has already navigated the Link.
                          e.preventDefault();
                          e.stopPropagation();
                          const ok = await confirm({
                            title: `Archive “${agent.name}”?`,
                            body: 'It stops being available to users. You can publish it again later.',
                            confirmLabel: 'Archive',
                          });
                          if (ok) act(agent.id, () => api.archiveAgent(agent.id));
                        }}
                      >
                        <Archive size={13} />
                        {busy ? 'Archiving…' : 'Archive'}
                      </Button>
                    )}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={Bot}
          title="No agents here"
          description={
            filter === 'all'
              ? 'Describe what you need in plain language and the builder will draft an agent for you.'
              : `Nothing with the status “${filter}”.`
          }
          action={
            isAgentManager && filter === 'all' ? (
              <Link href="/dashboard/agents/builder">
                <Button>
                  <Sparkles size={15} />
                  Build an agent
                </Button>
              </Link>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
