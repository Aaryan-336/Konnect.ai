'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Bot, ArrowRight, ArrowUpRight, Mic, Search, Sparkles, MessageSquare,
  Clock, Layers, ShieldCheck, Plus,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useVoice } from '@/components/voice/VoiceProvider';
import {
  Card, TintIcon, Button, EmptyState, Skeleton, SectionLabel,
  type ChipTone,
} from '@/components/ui/primitives';

/** Agents get a stable tint from their id, so a card looks the same every visit. */
const TINTS: ChipTone[] = ['peach', 'lavender', 'mint', 'sky', 'butter'];
function tintFor(id: string): ChipTone {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return TINTS[hash % TINTS.length];
}

interface Agent {
  id: string;
  name: string;
  description?: string;
  knowledge_sources?: unknown[];
  suggested_prompts?: string[];
}

interface Conversation {
  id: string;
  agent_id: string;
  agent_name?: string;
  title?: string;
  updated_at: string;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function DashboardHome() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { open: openVoice } = useVoice();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const voiceLaunchedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([api.listAgents('published'), api.listConversations()])
      .then(([agentResult, convResult]) => {
        if (cancelled) return;
        if (agentResult.status === 'fulfilled') setAgents(agentResult.value ?? []);
        if (convResult.status === 'fulfilled') setConversations(convResult.value ?? []);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // The manifest's "Ask by voice" shortcut lands here with ?voice=1.
  useEffect(() => {
    if (searchParams.get('voice') && !voiceLaunchedRef.current) {
      voiceLaunchedRef.current = true;
      openVoice();
    }
  }, [searchParams, openVoice]);

  // "/" focuses the ask box, the way every search-first tool behaves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';
      if (e.key === '/' && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const ask = (text: string) => {
    const q = text.trim();
    if (!q || agents.length === 0) return;
    router.push(`/dashboard/agents/${agents[0].id}?q=${encodeURIComponent(q)}`);
  };

  const starters = useMemo(
    () =>
      agents
        .flatMap((a) => a.suggested_prompts ?? [])
        .filter(Boolean)
        .slice(0, 4),
    [agents]
  );

  const sourceCount = agents.reduce((n, a) => n + (a.knowledge_sources?.length ?? 0), 0);

  return (
    <div className="animate-fade-in space-y-6 sm:space-y-8">
      {/* ---------------------------------------------------------------- Hero */}
      <section>
        <p
          className="text-[11px] font-semibold uppercase tracking-[0.16em]"
          style={{ color: 'var(--text-muted)' }}
        >
          {new Date().toLocaleDateString(undefined, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </p>
        <h1
          className="mt-2 text-[28px] font-semibold leading-[1.15] tracking-[-0.03em] sm:text-[38px]"
          style={{ color: 'var(--text-primary)' }}
        >
          {greeting()}, {user?.display_name?.split(' ')[0]}.
          <br />
          <span style={{ color: 'var(--text-muted)' }}>What would you like to know?</span>
        </h1>
      </section>

      {/* Ask bar — text on the left, voice on the right, same as the dock's mic */}
      <section>
        <div
          className="flex items-center gap-2 p-2 transition-all focus-within:border-[var(--accent)]"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--r-xl)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <Search size={18} className="ml-3 shrink-0" style={{ color: 'var(--text-muted)' }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && ask(query)}
            placeholder="Ask anything about your organisation…"
            className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] outline-none placeholder:text-[var(--text-muted)]"
            style={{ color: 'var(--text-primary)' }}
            aria-label="Ask a question"
          />
          <button
            onClick={openVoice}
            aria-label="Ask by voice"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-transform active:scale-90"
            style={{
              background: 'linear-gradient(150deg, var(--spark) 0%, var(--spark-strong) 100%)',
              color: '#fff',
              boxShadow: '0 8px 20px rgba(217, 122, 43, 0.32)',
            }}
          >
            <Mic size={19} />
          </button>
          <button
            onClick={() => ask(query)}
            disabled={!query.trim() || agents.length === 0}
            aria-label="Send question"
            className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all disabled:opacity-30 sm:flex"
            style={{ background: 'var(--accent)', color: 'var(--accent-on)' }}
          >
            <ArrowRight size={19} />
          </button>
        </div>

        {starters.length > 0 && (
          <div className="scroll-x mt-3 flex gap-2 pb-1">
            {starters.map((prompt, i) => (
              <button
                key={i}
                onClick={() => ask(prompt)}
                className="shrink-0 rounded-full border px-3.5 py-2 text-xs transition-colors hover:bg-[var(--bg-hover)]"
                style={{
                  borderColor: 'var(--border-primary)',
                  background: 'var(--bg-card)',
                  color: 'var(--text-secondary)',
                }}
              >
                {prompt}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* --------------------------------------------------------- Main columns */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Agents */}
        <section className="lg:col-span-2">
          <div className="mb-3 flex items-end justify-between">
            <SectionLabel icon={Bot}>Your agents</SectionLabel>
            <Link
              href="/dashboard/agents"
              className="flex items-center gap-1 text-xs font-semibold transition-colors hover:opacity-70"
              style={{ color: 'var(--text-primary)' }}
            >
              See all <ArrowUpRight size={13} />
            </Link>
          </div>

          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-[132px] rounded-[20px]" />
              ))}
            </div>
          ) : agents.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {agents.slice(0, 4).map((agent) => {
                const tone = tintFor(agent.id);
                return (
                  <Link
                    key={agent.id}
                    href={`/dashboard/agents/${agent.id}`}
                    className="group flex flex-col justify-between p-5 transition-all duration-300 active:scale-[0.99]"
                    style={{
                      background: `var(--tint-${tone})`,
                      borderRadius: 'var(--r-lg)',
                      minHeight: 132,
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3
                          className="truncate text-[15px] font-semibold tracking-[-0.01em]"
                          style={{ color: `var(--tint-${tone}-ink)` }}
                        >
                          {agent.name}
                        </h3>
                        <p
                          className="mt-1 line-clamp-2 text-xs leading-relaxed"
                          style={{ color: `var(--tint-${tone}-ink)`, opacity: 0.8 }}
                        >
                          {agent.description || 'Grounded knowledge assistant'}
                        </p>
                      </div>
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px]"
                        style={{
                          background: 'rgba(255,255,255,0.55)',
                          color: `var(--tint-${tone}-ink)`,
                        }}
                      >
                        <Bot size={17} />
                      </span>
                    </div>

                    <div
                      className="mt-4 flex items-center justify-between text-[11px] font-medium"
                      style={{ color: `var(--tint-${tone}-ink)`, opacity: 0.85 }}
                    >
                      <span className="flex items-center gap-1.5">
                        <Layers size={12} />
                        {agent.knowledge_sources?.length ?? 0} sources
                      </span>
                      <ArrowRight
                        size={15}
                        className="transition-transform group-hover:translate-x-1"
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={Sparkles}
              title="No agents yet"
              description="Add a knowledge source, then build an agent to start asking questions."
              action={
                <Link href="/dashboard/agents/builder">
                  <Button>
                    <Plus size={15} />
                    Build an agent
                  </Button>
                </Link>
              }
            />
          )}
        </section>

        {/* Right column: ink stat panel + recent */}
        <section className="space-y-5">
          <div
            className="p-5"
            style={{
              background: 'var(--ink)',
              color: 'var(--ink-fg)',
              borderRadius: 'var(--r-xl)',
              boxShadow: 'var(--shadow-ink)',
            }}
          >
            <div className="flex items-center justify-between">
              <p
                className="text-[11px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: 'var(--ink-fg-muted)' }}
              >
                Your workspace
              </p>
              <ShieldCheck size={15} style={{ color: 'var(--ink-fg-muted)' }} />
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3">
              {[
                { label: 'Agents', value: agents.length },
                { label: 'Sources', value: sourceCount },
                { label: 'Chats', value: conversations.length },
              ].map((stat) => (
                <div key={stat.label}>
                  <p className="text-[26px] font-semibold leading-none tracking-[-0.03em]">
                    {loading ? '—' : stat.value}
                  </p>
                  <p
                    className="mt-1.5 text-[11px]"
                    style={{ color: 'var(--ink-fg-muted)' }}
                  >
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>

            <div
              className="mt-5 flex items-start gap-2.5 rounded-[14px] p-3"
              style={{ background: 'rgba(255,255,255,0.07)' }}
            >
              <ShieldCheck size={14} className="mt-0.5 shrink-0" />
              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--ink-fg-muted)' }}>
                Every answer is grounded in your authorised documents and cited. No web search.
              </p>
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-end justify-between">
              <SectionLabel icon={Clock}>Recent</SectionLabel>
              <Link
                href="/dashboard/conversations"
                className="flex items-center gap-1 text-xs font-semibold transition-colors hover:opacity-70"
                style={{ color: 'var(--text-primary)' }}
              >
                All <ArrowUpRight size={13} />
              </Link>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-[62px] rounded-[16px]" />
                ))}
              </div>
            ) : conversations.length > 0 ? (
              <div className="space-y-2">
                {conversations.slice(0, 4).map((conv) => (
                  <Link
                    key={conv.id}
                    href={`/dashboard/agents/${conv.agent_id}?conversation=${conv.id}`}
                    className="flex items-center gap-3 p-3 transition-colors hover:bg-[var(--bg-hover)]"
                    style={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-primary)',
                      borderRadius: 'var(--r-md)',
                    }}
                  >
                    <TintIcon tone="neutral" size="sm">
                      <MessageSquare size={15} />
                    </TintIcon>
                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate text-[13px] font-medium"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {conv.title || 'Conversation'}
                      </span>
                      <span className="block text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        {new Date(conv.updated_at).toLocaleDateString()}
                      </span>
                    </span>
                    <ArrowRight size={14} style={{ color: 'var(--text-muted)' }} />
                  </Link>
                ))}
              </div>
            ) : (
              <Card className="px-4 py-8 text-center">
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Nothing yet — your questions will show up here.
                </p>
              </Card>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * useSearchParams (used for the manifest's ?voice=1 shortcut) opts this subtree
 * out of prerendering, so it needs its own boundary.
 */
export default function DashboardHomePage() {
  return (
    <Suspense fallback={<div className="h-[60vh]" />}>
      <DashboardHome />
    </Suspense>
  );
}
