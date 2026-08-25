'use client';

import React from 'react';
import {
  Bot, User as UserIcon, ShieldAlert, ShieldCheck, ShieldQuestion,
  Sparkles, Clock, Cpu, Layers, Lightbulb, ArrowRight,
} from 'lucide-react';
import ChartRenderer from '@/components/data-viz/ChartRenderer';
import DataTable from '@/components/data-viz/DataTable';
import KPICard from '@/components/data-viz/KPICard';
import FlowDiagram from '@/components/data-viz/FlowDiagram';
import Timeline from '@/components/data-viz/Timeline';
import CitationCard from './CitationCard';
import Markdown from './Markdown';
import {
  CONFIDENCE_META,
  emptyResponse,
  type Confidence,
  type StructuredResponse,
} from '@/lib/response';

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  response?: StructuredResponse;
  isStreaming?: boolean;
  /** Pipeline stage shown while waiting for the first token. */
  stage?: string;
}

interface MessageBubbleProps {
  message: ChatMessage;
  agentName?: string;
  onSelectPrompt?: (prompt: string) => void;
}

const STAGE_LABELS: Record<string, string> = {
  retrieving: 'Searching your knowledge sources',
  grounding: 'Validating the evidence',
  generating: 'Composing a grounded answer',
  rate_limited: 'Model is busy — retrying shortly',
};

const CONFIDENCE_ICON: Record<Confidence, typeof ShieldCheck> = {
  supported: ShieldCheck,
  partial: ShieldQuestion,
  insufficient: ShieldAlert,
};

function SectionLabel({ icon: Icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <span
      className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5"
      style={{ color: 'var(--text-muted)' }}
    >
      <Icon size={12} style={{ color: 'var(--spark)' }} />
      {children}
    </span>
  );
}

export default function MessageBubble({
  message,
  agentName = 'Assistant',
  onSelectPrompt,
}: MessageBubbleProps) {
  if (message.role === 'user') {
    return (
      <div className="mb-6 flex animate-fade-in justify-end">
        <div className="flex max-w-[86%] items-start gap-2.5 sm:max-w-[75%]">
          <div
            className="whitespace-pre-wrap px-4 py-2.5 text-[14px] leading-relaxed"
            style={{
              background: 'var(--accent)',
              color: 'var(--accent-on)',
              borderRadius: 'var(--r-lg)',
              borderBottomRightRadius: 6,
            }}
          >
            {message.content}
          </div>
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
          >
            <UserIcon size={15} />
          </div>
        </div>
      </div>
    );
  }

  const data = message.response ?? emptyResponse();
  const confidence = data.confidence;
  const meta = CONFIDENCE_META[confidence] ?? CONFIDENCE_META.supported;
  const ConfidenceIcon = CONFIDENCE_ICON[confidence] ?? ShieldCheck;
  const isInsufficient = confidence === 'insufficient';

  const prose = message.content || data.answer;
  const awaitingFirstToken = message.isStreaming && !prose;

  return (
    <div className="flex items-start gap-3 mb-8 animate-fade-in">
      {/* Avatar */}
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px]"
        style={{
          background: isInsufficient ? meta.background : 'var(--tint-lavender)',
          color: isInsufficient ? meta.color : 'var(--tint-lavender-ink)',
        }}
      >
        {isInsufficient ? <ShieldAlert size={16} /> : <Bot size={17} />}
      </div>

      <div className="flex-1 min-w-0">
        {/* Byline: who answered, how well grounded, how fast */}
        <div className="flex flex-wrap items-center gap-2 mb-1.5">
          <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
            {agentName}
          </span>

          {!message.isStreaming && (
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"
              style={{ background: meta.background, color: meta.color }}
              title={meta.description}
            >
              <ConfidenceIcon size={10} />
              {meta.label}
            </span>
          )}

          {!message.isStreaming && data.latency_ms != null && (
            <span
              className="text-[10px] flex items-center gap-1"
              style={{ color: 'var(--text-muted)' }}
              title={data.model_used ? `Model: ${data.model_used}` : undefined}
            >
              <Clock size={10} />
              {(data.latency_ms / 1000).toFixed(1)}s
            </span>
          )}

          {!message.isStreaming && data.retrieval && (
            <span
              className="text-[10px] flex items-center gap-1"
              style={{ color: 'var(--text-muted)' }}
              title={`${data.retrieval.candidates} candidate chunks retrieved, ${data.retrieval.reranked} reranked`}
            >
              <Layers size={10} />
              {data.retrieval.context_chunks} chunks
            </span>
          )}
        </div>

        {/* Answer card */}
        <div
          className="border p-4 sm:p-5"
          style={{
            background: 'var(--bg-card)',
            borderColor: isInsufficient ? meta.color : 'var(--border-primary)',
            borderRadius: 'var(--r-lg)',
            borderTopLeftRadius: 6,
            boxShadow: 'var(--shadow-xs)',
          }}
        >
          {/* Headline — the one-line direct answer */}
          {!message.isStreaming && data.headline && !isInsufficient && (
            <p
              className="text-[15px] font-semibold leading-snug mb-3 pb-3 border-b"
              style={{ color: 'var(--text-primary)', borderColor: 'var(--border-subtle)' }}
            >
              {data.headline}
            </p>
          )}

          {/* KPI row — the figures the answer turns on */}
          {data.kpi_cards.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
              {data.kpi_cards.map((kpi, i) => (
                <KPICard key={i} {...kpi} />
              ))}
            </div>
          )}

          {/* Prose */}
          {awaitingFirstToken ? (
            <div className="space-y-2 py-1">
              <div className="skeleton h-3 w-4/5" />
              <div className="skeleton h-3 w-full" />
              <div className="skeleton h-3 w-2/3" />
              <p className="text-xs pt-1.5" style={{ color: 'var(--text-muted)' }}>
                {STAGE_LABELS[message.stage ?? 'retrieving'] ?? 'Working'}…
              </p>
            </div>
          ) : (
            <div className="relative">
              <Markdown>{prose}</Markdown>
              {message.isStreaming && <span className="stream-caret" aria-hidden />}
            </div>
          )}

          {/* Key points — the scannable takeaways */}
          {data.key_points.length > 0 && (
            <div
              className="mt-4 p-4 rounded-xl border"
              style={{ background: 'var(--bg-inset)', borderColor: 'var(--border-subtle)' }}
            >
              <SectionLabel icon={Sparkles}>Key Points</SectionLabel>
              <ul className="mt-2.5 space-y-2">
                {data.key_points.map((point, i) => (
                  <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
                    <span
                      className="mt-[7px] w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: 'var(--spark)' }}
                      aria-hidden
                    />
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {point.text}
                      {point.source && (
                        <span className="ml-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          — {point.source}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Structured blocks */}
          {data.table && <DataTable data={data.table} />}

          {data.visualizations.map((spec, i) => (
            <ChartRenderer key={i} spec={spec} />
          ))}

          {data.flow_diagram && <FlowDiagram spec={data.flow_diagram} />}

          {data.timeline.length > 0 && <Timeline events={data.timeline} />}

          {/* Provenance */}
          {data.citations.length > 0 && (
            <div
              className="mt-4 pt-3 border-t flex flex-col gap-2"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <SectionLabel icon={ShieldCheck}>
                Verified Sources ({data.citations.length})
              </SectionLabel>
              <div className="flex flex-wrap gap-2">
                {data.citations.map((citation, i) => (
                  <CitationCard key={i} citation={citation} index={i} />
                ))}
              </div>
            </div>
          )}

          {/* Documents consulted but not cited — shown only when nothing was cited,
              so the user can still see what the retriever looked at. */}
          {data.citations.length === 0 && data.sources.length > 0 && !message.isStreaming && (
            <div
              className="mt-4 pt-3 border-t"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <SectionLabel icon={Layers}>Documents Consulted</SectionLabel>
              <div className="flex flex-wrap gap-2 mt-2">
                {data.sources.map((source, i) => (
                  <span
                    key={i}
                    className="text-[11px] px-2.5 py-1 rounded-lg border"
                    style={{
                      background: 'var(--bg-tertiary)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {source.document_name}
                    {source.pages.length > 0 && ` · p.${source.pages.slice(0, 3).join(', ')}`}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Follow-ups */}
        {data.follow_up_questions.length > 0 && !message.isStreaming && (
          <div className="mt-3">
            <SectionLabel icon={Lightbulb}>Ask Next</SectionLabel>
            <div className="flex flex-wrap gap-2 mt-2">
              {data.follow_up_questions.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => onSelectPrompt?.(prompt)}
                  className="group flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-left text-xs transition-all hover:bg-[var(--bg-hover)]"
                  style={{
                    background: 'var(--bg-card)',
                    borderColor: 'var(--border-primary)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {prompt}
                  <ArrowRight
                    size={12}
                    className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    style={{ color: 'var(--spark)' }}
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Trace id — makes an answer auditable against the query log */}
        {!message.isStreaming && data.trace_id && (
          <p
            className="mt-2 text-[10px] flex items-center gap-1"
            style={{ color: 'var(--text-muted)' }}
          >
            <Cpu size={10} />
            trace {data.trace_id}
            {data.model_used && ` · ${data.model_used}`}
          </p>
        )}
      </div>
    </div>
  );
}
