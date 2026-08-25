'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Plus, Trash2, Save, Loader2, Database, Sparkles,
  CheckCircle2, Archive, Lightbulb, AlertTriangle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast, useConfirm } from '@/components/ui/feedback';
import {
  Button, Chip, Field, Input, LoadingDots, PageHeader, SectionLabel,
} from '@/components/ui/primitives';

interface KnowledgeSource {
  id: string;
  name: string;
  description?: string;
}

interface AgentDetail {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  status: string;
  suggested_prompts?: string[];
  knowledge_sources?: { id: string; name?: string }[];
}

/**
 * Agent editor.
 *
 * The backend has always accepted PATCH /api/agents/{id}; this is the surface
 * for it. Instructions and suggested prompts matter most: instructions shape
 * how the model uses retrieved evidence, and the prompts teach users the
 * phrasing that actually retrieves well.
 */
export default function EditAgentPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as string;
  const { isAgentManager, isAdmin } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState('draft');
  const [sources, setSources] = useState<KnowledgeSource[]>([]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [prompts, setPrompts] = useState<string[]>([]);
  const [sourceIds, setSourceIds] = useState<string[]>([]);

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;

    Promise.allSettled([api.getAgent(agentId), api.listSources()])
      .then(([agentResult, sourceResult]) => {
        if (cancelled) return;

        if (agentResult.status === 'fulfilled') {
          const agent = agentResult.value as AgentDetail;
          setName(agent.name ?? '');
          setDescription(agent.description ?? '');
          setInstructions(agent.instructions ?? '');
          setPrompts(agent.suggested_prompts ?? []);
          setSourceIds((agent.knowledge_sources ?? []).map((s) => s.id));
          setStatus(agent.status ?? 'draft');
        } else {
          setError('Could not load this agent.');
        }

        if (sourceResult.status === 'fulfilled') setSources(sourceResult.value ?? []);
      })
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [agentId]);

  const save = useCallback(async () => {
    setError('');
    setSaved(false);

    if (!name.trim()) {
      setError('The agent needs a name.');
      return;
    }
    if (sourceIds.length === 0) {
      setError('Pick at least one knowledge source — an agent with none can never answer.');
      return;
    }

    setSaving(true);
    try {
      await api.updateAgent(agentId, {
        name: name.trim(),
        description: description.trim() || null,
        instructions,
        suggested_prompts: prompts.map((p) => p.trim()).filter(Boolean),
        knowledge_source_ids: sourceIds,
      });
      setSaved(true);
      // The confirmation is transient; the saved state is the page itself.
      setTimeout(() => setSaved(false), 2600);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  }, [agentId, name, description, instructions, prompts, sourceIds]);

  const changeStatus = async (action: 'publish' | 'archive') => {
    setError('');
    setSaving(true);
    try {
      if (action === 'publish') {
        await api.publishAgent(agentId);
        setStatus('published');
      } else {
        await api.archiveAgent(agentId);
        setStatus('archived');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change status.');
    } finally {
      setSaving(false);
    }
  };

  const toggleSource = (id: string) => {
    setSourceIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <LoadingDots />
      </div>
    );
  }

  if (!isAgentManager) {
    return (
      <div className="page-narrow py-10">
        <div
          className="flex items-start gap-3 rounded-[var(--r-lg)] border p-5"
          style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-card)' }}
        >
          <AlertTriangle size={18} style={{ color: 'var(--warning)' }} className="mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              You don&apos;t have permission to edit agents
            </p>
            <p className="mt-1 text-[13px]" style={{ color: 'var(--text-secondary)' }}>
              This needs the AGENT_MANAGER or ADMIN role. Ask an administrator to grant it.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-narrow animate-fade-in pb-4">
      <Link
        href={`/dashboard/agents/${agentId}`}
        className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium transition-colors hover:text-[var(--text-primary)]"
        style={{ color: 'var(--text-muted)' }}
      >
        <ArrowLeft size={14} /> Back to agent
      </Link>

      <PageHeader
        eyebrow="Configure"
        title="Edit agent"
        subtitle="Instructions shape how the model uses retrieved evidence. Suggested prompts teach users the phrasing that retrieves well."
        actions={
          <>
            <Chip tone={status === 'published' ? 'success' : status === 'draft' ? 'warning' : 'neutral'}>
              {status}
            </Chip>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      />

      {error && (
        <p
          className="mb-4 rounded-[var(--r-md)] px-3.5 py-2.5 text-xs"
          style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
          role="alert"
        >
          {error}
        </p>
      )}
      {saved && (
        <p
          className="mb-4 flex items-center gap-2 rounded-[var(--r-md)] px-3.5 py-2.5 text-xs"
          style={{ background: 'var(--success-soft)', color: 'var(--success)' }}
          role="status"
        >
          <CheckCircle2 size={14} />
          Saved. Changes apply to the next question asked.
        </p>
      )}

      <div className="space-y-5">
        {/* Identity */}
        <section
          className="space-y-4 rounded-[var(--r-lg)] border p-5"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}
        >
          <SectionLabel icon={Sparkles}>Identity</SectionLabel>
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mutual Fund Comparator" />
          </Field>
          <Field label="Description" hint="Shown on the agent card and in the chat header.">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this agent is for"
            />
          </Field>
        </section>

        {/* Instructions */}
        <section
          className="space-y-3 rounded-[var(--r-lg)] border p-5"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}
        >
          <SectionLabel icon={Lightbulb}>Instructions</SectionLabel>
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Added to the grounding rules the model always receives. Use it for domain vocabulary
            and answer discipline — for example, that a &ldquo;Fund Management Entity&rdquo; is a
            firm and is not the same thing as an individual fund manager.
          </p>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={12}
            spellCheck={false}
            placeholder="You answer questions about private credit funds…"
            className="w-full resize-y rounded-[var(--r-md)] border p-3.5 font-mono text-[12.5px] leading-relaxed outline-none transition-colors focus:border-[var(--accent)]"
            style={{
              background: 'var(--bg-inset)',
              borderColor: 'var(--border-primary)',
              color: 'var(--text-primary)',
            }}
          />
          <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            {instructions.length} characters · instructions cannot change which documents are
            retrieved, only how the model uses them.
            {status === 'published' && (
              <>
                {' '}Editing them cuts a new draft version — publish again to make it live.
              </>
            )}
          </p>
        </section>

        {/* Suggested prompts */}
        <section
          className="space-y-3 rounded-[var(--r-lg)] border p-5"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}
        >
          <SectionLabel icon={Lightbulb}>Suggested questions</SectionLabel>
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Shown on the empty chat screen. Phrase these the way the documents do — it is the
            cheapest accuracy win you have.
          </p>

          <div className="space-y-2">
            {prompts.map((prompt, i) => (
              <div key={i} className="flex items-start gap-2">
                <textarea
                  value={prompt}
                  rows={2}
                  onChange={(e) =>
                    setPrompts((prev) => prev.map((p, idx) => (idx === i ? e.target.value : p)))
                  }
                  className="flex-1 resize-y rounded-[var(--r-md)] border p-2.5 text-[13px] outline-none transition-colors focus:border-[var(--accent)]"
                  style={{
                    background: 'var(--bg-inset)',
                    borderColor: 'var(--border-primary)',
                    color: 'var(--text-primary)',
                  }}
                />
                <button
                  onClick={() => setPrompts((prev) => prev.filter((_, idx) => idx !== i))}
                  aria-label={`Remove question ${i + 1}`}
                  className="mt-1 rounded-[10px] p-2 transition-colors hover:bg-[var(--danger-soft)]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>

          <Button variant="secondary" size="sm" onClick={() => setPrompts((prev) => [...prev, ''])}>
            <Plus size={14} />
            Add question
          </Button>
        </section>

        {/* Knowledge sources */}
        <section
          className="space-y-3 rounded-[var(--r-lg)] border p-5"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}
        >
          <SectionLabel icon={Database}>Knowledge sources</SectionLabel>
          <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
            The agent can only ever see documents in the sources you select here.
          </p>

          {sources.length === 0 ? (
            <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
              No knowledge sources exist yet.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {sources.map((source) => {
                const selected = sourceIds.includes(source.id);
                return (
                  <button
                    key={source.id}
                    onClick={() => toggleSource(source.id)}
                    aria-pressed={selected}
                    className="flex items-start gap-2.5 rounded-[var(--r-md)] border p-3.5 text-left transition-colors"
                    style={{
                      borderColor: selected ? 'var(--accent)' : 'var(--border-primary)',
                      background: selected ? 'var(--accent-muted)' : 'var(--bg-inset)',
                    }}
                  >
                    <span
                      className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border"
                      style={{
                        borderColor: selected ? 'var(--accent)' : 'var(--border-strong)',
                        background: selected ? 'var(--accent)' : 'transparent',
                        color: 'var(--accent-on)',
                      }}
                    >
                      {selected && <CheckCircle2 size={12} />}
                    </span>
                    <span className="min-w-0">
                      <span
                        className="block truncate text-[13px] font-semibold"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {source.name}
                      </span>
                      {source.description && (
                        <span
                          className="mt-0.5 block truncate text-[11px]"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {source.description}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Lifecycle */}
        {isAdmin && (
          <section
            className="flex flex-col gap-3 rounded-[var(--r-lg)] border p-5 sm:flex-row sm:items-center sm:justify-between"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}
          >
            <div>
              <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                Status
              </p>
              <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Only published agents are visible to users.
              </p>
            </div>
            <div className="flex gap-2">
              {status !== 'published' && (
                <Button size="sm" disabled={saving} onClick={() => changeStatus('publish')}>
                  <CheckCircle2 size={13} />
                  Publish
                </Button>
              )}
              {status === 'published' && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={saving}
                  onClick={async () => {
                    const ok = await confirm({
                      title: `Archive “${name}”?`,
                      body: 'It stops being available to users. You can publish it again later.',
                      confirmLabel: 'Archive',
                    });
                    if (ok) changeStatus('archive');
                  }}
                >
                  <Archive size={13} />
                  Archive
                </Button>
              )}
            </div>
          </section>
        )}

        <div className="flex justify-end gap-2 pb-2">
          <Button variant="secondary" onClick={() => router.push(`/dashboard/agents/${agentId}`)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}
