/**
 * The structured answer contract returned by /api/chat and /api/chat/stream.
 *
 * Mirrors app/schemas/chat.py on the backend. The backend guarantees every key
 * is present and shape-valid, so components can render blocks by presence
 * without defensive checks on their internals.
 */

import type { VisualizationSpec } from '@/components/data-viz/ChartRenderer';
import type { FlowDiagramSpec } from '@/components/data-viz/FlowDiagram';
import type { TimelineEvent } from '@/components/data-viz/Timeline';

export type Confidence = 'supported' | 'partial' | 'insufficient';

export interface Citation {
  document_id?: string | null;
  document_name: string;
  page?: number | null;
  section?: string | null;
  snippet?: string;
}

export interface SourceRef {
  document_id: string;
  document_name: string;
  pages: number[];
  top_score: number;
}

export interface KeyPoint {
  text: string;
  source?: string | null;
}

export interface KPICardData {
  label: string;
  value: string;
  change?: string | null;
  trend?: 'up' | 'down' | 'stable' | null;
  source?: string | null;
}

export interface TableData {
  title?: string | null;
  headers: string[];
  rows: (string | number | null)[][];
  source?: string | null;
}

export interface RetrievalStats {
  candidates: number;
  reranked: number;
  context_chunks: number;
  top_score: number;
}

export interface StructuredResponse {
  answer: string;
  headline?: string | null;
  confidence: Confidence;
  key_points: KeyPoint[];
  kpi_cards: KPICardData[];
  table: TableData | null;
  visualizations: VisualizationSpec[];
  flow_diagram: FlowDiagramSpec | null;
  timeline: TimelineEvent[];
  citations: Citation[];
  sources: SourceRef[];
  follow_up_questions: string[];

  trace_id?: string | null;
  latency_ms?: number | null;
  model_used?: string | null;
  retrieval?: RetrievalStats | null;
  /** Set when the streamed prose must be discarded in favour of `answer`. */
  replace_answer?: boolean;
}

/** An empty contract, used as the starting state for a streaming message. */
export function emptyResponse(): StructuredResponse {
  return {
    answer: '',
    headline: null,
    confidence: 'supported',
    key_points: [],
    kpi_cards: [],
    table: null,
    visualizations: [],
    flow_diagram: null,
    timeline: [],
    citations: [],
    sources: [],
    follow_up_questions: [],
  };
}

/**
 * Coerce a payload from the API (or from a stored conversation) into the
 * contract, tolerating older records written before a field existed.
 */
export function toStructuredResponse(raw: any, fallbackAnswer = ''): StructuredResponse {
  const base = emptyResponse();
  if (!raw || typeof raw !== 'object') {
    return { ...base, answer: fallbackAnswer };
  }

  return {
    ...base,
    ...raw,
    answer: typeof raw.answer === 'string' && raw.answer ? raw.answer : fallbackAnswer,
    key_points: Array.isArray(raw.key_points) ? raw.key_points : [],
    kpi_cards: Array.isArray(raw.kpi_cards) ? raw.kpi_cards : [],
    // Older records stored a single `visualization`; newer ones a list.
    visualizations: Array.isArray(raw.visualizations)
      ? raw.visualizations
      : raw.visualization
      ? [raw.visualization]
      : [],
    timeline: Array.isArray(raw.timeline) ? raw.timeline : [],
    citations: Array.isArray(raw.citations) ? raw.citations : [],
    sources: Array.isArray(raw.sources) ? raw.sources : [],
    follow_up_questions: Array.isArray(raw.follow_up_questions) ? raw.follow_up_questions : [],
    table: raw.table ?? null,
    flow_diagram: raw.flow_diagram ?? null,
  };
}

export const CONFIDENCE_META: Record<
  Confidence,
  { label: string; description: string; color: string; background: string }
> = {
  supported: {
    label: 'Grounded',
    description: 'Every claim is backed by a validated citation from your knowledge sources.',
    color: 'var(--success)',
    background: 'var(--success-soft)',
  },
  partial: {
    label: 'Partial',
    description: 'Some of the answer is supported; treat the rest as incomplete.',
    color: 'var(--warning)',
    background: 'var(--warning-soft)',
  },
  insufficient: {
    label: 'No evidence',
    description: 'The knowledge sources did not contain enough information to answer.',
    color: 'var(--danger)',
    background: 'var(--danger-soft)',
  },
};
