'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/feedback';
import { useAuth } from '@/lib/auth';
import {
  Sparkles, Bot, ArrowLeft, Check, AlertCircle, RefreshCw, Save,
  Layers, Plus, Trash2, Eye, Sliders, CheckCircle2
} from 'lucide-react';
import Link from 'next/link';

export default function AgentBuilderPage() {
  const toast = useToast();
  const router = useRouter();
  const { isAgentManager, isAdmin } = useAuth();

  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [availableSources, setAvailableSources] = useState<any[]>([]);

  // Generated / Editable draft state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([]);
  const [newPromptInput, setNewPromptInput] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [hasGenerated, setHasGenerated] = useState(false);

  useEffect(() => {
    api.listSources().then(setAvailableSources).catch(() => {});
  }, []);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || generating) return;

    setGenerating(true);
    setWarnings([]);
    try {
      const res = await api.generateAgent(prompt.trim());
      const draft = res.draft_agent;

      setName(draft.name || '');
      setDescription(draft.description || '');
      setInstructions(draft.instructions || '');
      setSelectedSourceIds(draft.knowledge_source_ids || []);
      setSuggestedPrompts(draft.suggested_prompts || []);
      setWarnings(res.warnings || []);
      setHasGenerated(true);
    } catch (err: any) {
      toast(err.message || 'Failed to generate agent');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async (publishImmediately = false) => {
    if (!name.trim() || !instructions.trim()) {
      toast('Name and instructions are required.');
      return;
    }

    setSaving(true);
    try {
      const agent = await api.createAgent({
        name,
        description,
        instructions,
        knowledge_source_ids: selectedSourceIds,
        suggested_prompts: suggestedPrompts,
        ui_config: { layout: 'chat', show_citations: true },
      });

      if (publishImmediately && isAdmin) {
        await api.publishAgent(agent.id);
      }

      router.push(`/dashboard/agents`);
    } catch (err: any) {
      toast(err.message || 'Failed to save agent');
    } finally {
      setSaving(false);
    }
  };

  const toggleSource = (sourceId: string) => {
    setSelectedSourceIds((prev) =>
      prev.includes(sourceId) ? prev.filter((id) => id !== sourceId) : [...prev, sourceId]
    );
  };

  const addPrompt = () => {
    if (!newPromptInput.trim()) return;
    setSuggestedPrompts((prev) => [...prev, newPromptInput.trim()]);
    setNewPromptInput('');
  };

  const removePrompt = (index: number) => {
    setSuggestedPrompts((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/dashboard/agents"
            className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-2"
          >
            <ArrowLeft size={14} /> Back to Agents
          </Link>
          <h1 className="flex items-center gap-2.5 text-[26px] font-semibold tracking-[-0.025em] sm:text-[30px]" style={{ color: 'var(--text-primary)' }}>
            <Sparkles className="text-[var(--accent)]" size={24} />
            Natural-Language Agent Builder
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Describe the agent you need in plain English. The AI will formulate strict bounded instructions and link matching knowledge sources.
          </p>
        </div>
      </div>

      {/* Natural Language Prompt Input */}
      <div
        className="p-6 rounded-[var(--r-lg)] border"
        style={{
          background: 'var(--bg-card)',
          borderColor: 'var(--border-primary)',
        }}
      >
        <form onSubmit={handleGenerate} className="space-y-4">
          <label className="block text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            What should this agent do?
          </label>
          <div className="relative">
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Create an HR Policy Assistant that answers employee questions about leave, benefits, and workplace standards using only HR folders. Always quote the exact policy and cite effective dates."
              className="w-full p-4 rounded-[var(--r-md)] border text-sm outline-none transition-all focus:border-[var(--accent)] leading-relaxed"
              style={{
                background: 'var(--bg-tertiary)',
                borderColor: 'var(--border-primary)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Tip: Mention specific knowledge areas, tone, formatting requirements, and citation style.
            </span>
            <button
              type="submit"
              disabled={!prompt.trim() || generating}
              className="flex items-center gap-2 px-5 py-2.5 rounded-[var(--r-md)] text-xs font-semibold transition-all disabled:opacity-40 shadow-sm"
              style={{ background: 'var(--accent)', color: 'var(--accent-on)' }}
            >
              {generating ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  Generating Configuration...
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  Generate Agent Configuration
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="p-4 rounded-[var(--r-md)] bg-[var(--warning-soft)] border border-[var(--warning)] text-[var(--warning)] text-xs space-y-1">
          <div className="flex items-center gap-1.5 font-semibold">
            <AlertCircle size={15} /> Warnings & Considerations
          </div>
          {warnings.map((w, i) => (
            <p key={i} className="pl-5">
              • {w}
            </p>
          ))}
        </div>
      )}

      {/* Editor & Preview Split View */}
      {(hasGenerated || name) && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in">
          {/* Configuration Form (7 cols) */}
          <div
            className="lg:col-span-7 p-6 rounded-[var(--r-lg)] border space-y-5"
            style={{
              background: 'var(--bg-card)',
              borderColor: 'var(--border-primary)',
            }}
          >
            <div className="flex items-center gap-2 pb-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
              <Sliders size={16} className="text-[var(--accent)]" />
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Agent Specification
              </h2>
            </div>

            {/* Name */}
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                Agent Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2 rounded-[var(--r-md)] border text-sm outline-none focus:border-[var(--accent)]"
                style={{
                  background: 'var(--bg-tertiary)',
                  borderColor: 'var(--border-primary)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                Short Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3.5 py-2 rounded-[var(--r-md)] border text-sm outline-none focus:border-[var(--accent)]"
                style={{
                  background: 'var(--bg-tertiary)',
                  borderColor: 'var(--border-primary)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            {/* Knowledge Sources Selection */}
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
                Assigned Knowledge Sources ({selectedSourceIds.length} selected)
              </label>
              <div
                className="p-3 rounded-[var(--r-md)] border max-h-40 overflow-y-auto space-y-2"
                style={{
                  background: 'var(--bg-tertiary)',
                  borderColor: 'var(--border-primary)',
                }}
              >
                {availableSources.length > 0 ? (
                  availableSources.map((source) => {
                    const isChecked = selectedSourceIds.includes(source.id);
                    return (
                      <label
                        key={source.id}
                        className="flex items-center gap-2 text-xs cursor-pointer select-none py-1 px-2 rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSource(source.id)}
                          className="rounded border-[var(--border-primary)] text-[var(--accent)] focus:ring-0"
                        />
                        <Layers size={13} className="text-[var(--accent)]" />
                        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                          {source.name}
                        </span>
                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          ({source.document_count || 0} docs)
                        </span>
                      </label>
                    );
                  })
                ) : (
                  <p className="text-xs py-2 text-center" style={{ color: 'var(--text-muted)' }}>
                    No knowledge sources available. Create one in the Knowledge tab.
                  </p>
                )}
              </div>
            </div>

            {/* Instructions */}
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                System Instructions (Prompt Boundary)
              </label>
              <textarea
                rows={6}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                className="w-full p-3 rounded-[var(--r-md)] border text-xs outline-none focus:border-[var(--accent)] leading-relaxed font-mono"
                style={{
                  background: 'var(--bg-tertiary)',
                  borderColor: 'var(--border-primary)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            {/* Suggested Prompts */}
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
                Suggested User Prompts
              </label>
              <div className="space-y-2 mb-2">
                {suggestedPrompts.map((p, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-[var(--r-md)] border text-xs"
                    style={{
                      background: 'var(--bg-tertiary)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <span className="truncate">{p}</span>
                    <button
                      type="button"
                      onClick={() => removePrompt(idx)}
                      className="text-[var(--text-muted)] hover:text-[var(--danger)] p-1"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newPromptInput}
                  onChange={(e) => setNewPromptInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addPrompt())}
                  placeholder="Add sample question..."
                  className="flex-1 px-3 py-1.5 rounded-[var(--r-md)] border text-xs outline-none focus:border-[var(--accent)]"
                  style={{
                    background: 'var(--bg-tertiary)',
                    borderColor: 'var(--border-primary)',
                    color: 'var(--text-primary)',
                  }}
                />
                <button
                  type="button"
                  onClick={addPrompt}
                  className="px-3 py-1.5 rounded-[var(--r-md)] text-xs border hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"
                  style={{ borderColor: 'var(--border-primary)' }}
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* Live Preview (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div
              className="p-6 rounded-[var(--r-lg)] border sticky top-6"
              style={{
                background: 'var(--bg-card)',
                borderColor: 'var(--border-primary)',
              }}
            >
              <div className="flex items-center gap-2 pb-3 border-b mb-4" style={{ borderColor: 'var(--border-subtle)' }}>
                <Eye size={16} className="text-[var(--accent)]" />
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Card Preview
                </h2>
              </div>

              {/* Preview Card */}
              <div
                className="p-5 rounded-[var(--r-lg)] border"
                style={{
                  background: 'var(--bg-secondary)',
                  borderColor: 'var(--border-primary)',
                }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-10 h-10 rounded-[var(--r-md)] flex items-center justify-center"
                    style={{ background: 'var(--accent-muted)' }}
                  >
                    <Bot size={20} style={{ color: 'var(--accent)' }} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                      {name || 'Agent Name'}
                    </h3>
                    <p className="text-xs line-clamp-1" style={{ color: 'var(--text-secondary)' }}>
                      {description || 'Agent description preview...'}
                    </p>
                  </div>
                </div>

                <div className="space-y-2 mt-4 pt-3 border-t text-xs" style={{ borderColor: 'var(--border-subtle)' }}>
                  <div className="flex justify-between" style={{ color: 'var(--text-muted)' }}>
                    <span>Knowledge Sources</span>
                    <span className="font-semibold text-[var(--text-primary)]">{selectedSourceIds.length}</span>
                  </div>
                  <div className="flex justify-between" style={{ color: 'var(--text-muted)' }}>
                    <span>Suggested Questions</span>
                    <span className="font-semibold text-[var(--text-primary)]">{suggestedPrompts.length}</span>
                  </div>
                </div>

                {suggestedPrompts.length > 0 && (
                  <div className="mt-4 space-y-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider block" style={{ color: 'var(--text-muted)' }}>
                      Sample Questions
                    </span>
                    {suggestedPrompts.slice(0, 3).map((p, idx) => (
                      <div
                        key={idx}
                        className="p-2 rounded-lg text-xs truncate"
                        style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                      >
                        {p}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-6">
                <button
                  type="button"
                  onClick={() => handleSave(false)}
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-[var(--r-md)] text-xs font-semibold border transition-all hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
                  style={{
                    background: 'var(--bg-tertiary)',
                    borderColor: 'var(--border-primary)',
                  }}
                >
                  <Save size={14} />
                  Save as Draft
                </button>

                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => handleSave(true)}
                    disabled={saving}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-[var(--r-md)] text-xs font-semibold transition-all shadow-sm hover:opacity-90"
                    style={{ background: 'var(--accent)', color: 'var(--accent-on)' }}
                  >
                    <CheckCircle2 size={14} />
                    Approve & Publish Immediately
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
