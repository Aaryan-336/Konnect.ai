'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Users, Database, ShieldCheck, Activity, CheckCircle2,
  AlertTriangle, FileWarning, Quote, Gauge,
} from 'lucide-react';
import { api } from '@/lib/api';
import KPICard from '@/components/data-viz/KPICard';
import ChartRenderer, { type VisualizationSpec } from '@/components/data-viz/ChartRenderer';
import { STATUS_COLORS, formatValue } from '@/lib/chart-theme';

/** Short weekday+day label so a 14-day axis stays readable. */
function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function Panel({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: any;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-[var(--r-lg)] border overflow-hidden"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}
    >
      <header
        className="flex items-center justify-between px-5 py-3.5 border-b"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <h3
          className="text-sm font-semibold flex items-center gap-2"
          style={{ color: 'var(--text-primary)' }}
        >
          <Icon size={15} style={{ color: 'var(--accent)' }} />
          {title}
        </h3>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="text-xs py-6 text-center" style={{ color: 'var(--text-muted)' }}>
      {message}
    </p>
  );
}

export default function AdminOverviewPage() {
  const [overview, setOverview] = useState<any>(null);
  const [queries, setQueries] = useState<any>(null);
  const [knowledge, setKnowledge] = useState<any>(null);
  const [security, setSecurity] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getOverview().catch(() => null),
      api.getQueryAnalytics().catch(() => null),
      api.getKnowledgeAnalytics().catch(() => null),
      api.getSecurityAnalytics().catch(() => null),
    ]).then(([ov, qa, ka, sa]) => {
      setOverview(ov);
      setQueries(qa);
      setKnowledge(ka);
      setSecurity(sa);
      setLoading(false);
    });
  }, []);

  const hasQueries = (overview?.total_queries ?? 0) > 0;

  /** Query volume over time — one series, so no legend; the title names it. */
  const volumeSpec = useMemo<VisualizationSpec | null>(() => {
    const series = queries?.queries_per_day;
    if (!series?.length) return null;
    return {
      chart_type: 'area',
      title: 'Query volume, last 14 days',
      labels: series.map((p: any) => shortDate(p.date)),
      datasets: [{ label: 'Queries', data: series.map((p: any) => p.value) }],
      units: null,
      source: null,
      insight: null,
    };
  }, [queries]);

  /** Latency trend against the response-time target. */
  const latencySpec = useMemo<VisualizationSpec | null>(() => {
    const series = queries?.latency_per_day;
    if (!series?.length) return null;
    return {
      chart_type: 'line',
      title: 'Average response time, last 14 days',
      labels: series.map((p: any) => shortDate(p.date)),
      datasets: [{ label: 'Latency', data: series.map((p: any) => p.value) }],
      units: 'ms',
      source: null,
      insight: overview
        ? `Target is under ${overview.latency_target_ms} ms; p95 is currently ${formatValue(
            overview.p95_response_time_ms,
            'ms'
          )}.`
        : null,
    };
  }, [queries, overview]);

  /** Grounding quality — part-to-whole across three confidence states. */
  const confidenceSpec = useMemo<VisualizationSpec | null>(() => {
    const breakdown = queries?.confidence_breakdown?.filter((c: any) => c.count > 0);
    if (!breakdown?.length) return null;
    return {
      chart_type: 'donut',
      title: 'Answer grounding quality',
      labels: breakdown.map((c: any) => c.confidence),
      datasets: [{ label: 'Queries', data: breakdown.map((c: any) => c.count) }],
      units: null,
      source: null,
      insight: `${queries.grounded_rate}% of answers were fully grounded; ${queries.no_answer_rate}% correctly refused for lack of evidence.`,
    };
  }, [queries]);

  /** Per-agent volume. */
  const agentSpec = useMemo<VisualizationSpec | null>(() => {
    const byAgent = queries?.queries_by_agent;
    if (!byAgent?.length) return null;
    return {
      chart_type: 'horizontal_bar',
      title: 'Queries by agent',
      labels: byAgent.map((a: any) => a.agent),
      datasets: [{ label: 'Queries', data: byAgent.map((a: any) => a.count) }],
      units: null,
      source: null,
      insight: null,
    };
  }, [queries]);

  /** Indexed chunks per knowledge source. */
  const chunkSpec = useMemo<VisualizationSpec | null>(() => {
    const dist = knowledge?.chunk_distribution;
    if (!dist?.length) return null;
    return {
      chart_type: 'bar',
      title: 'Indexed chunks by knowledge source',
      labels: dist.map((d: any) => d.source),
      datasets: [{ label: 'Chunks', data: dist.map((d: any) => d.chunks) }],
      units: null,
      source: null,
      insight: null,
    };
  }, [knowledge]);

  /** Most-cited documents — which sources are actually earning their place. */
  const citedSpec = useMemo<VisualizationSpec | null>(() => {
    const docs = knowledge?.top_documents;
    if (!docs?.length) return null;
    return {
      chart_type: 'horizontal_bar',
      title: 'Most-cited documents',
      labels: docs.map((d: any) =>
        d.document.length > 34 ? `${d.document.slice(0, 33)}…` : d.document
      ),
      datasets: [{ label: 'Citations', data: docs.map((d: any) => d.citations) }],
      units: null,
      source: null,
      insight: null,
    };
  }, [knowledge]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-8 w-96" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-24" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="skeleton h-72" />
          <div className="skeleton h-72" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1
            className="flex items-center gap-2.5 text-[26px] font-semibold tracking-[-0.025em] sm:text-[30px]"
            style={{ color: 'var(--text-primary)' }}
          >
            <Activity size={24} style={{ color: 'var(--accent)' }} />
            System Intelligence
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Grounded retrieval quality, response latency, indexing health, and the security trail.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/admin/audit"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-[var(--r-md)] text-xs font-semibold border transition-colors hover:bg-[var(--bg-hover)]"
            style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}
          >
            <ShieldCheck size={14} />
            Audit Logs
          </Link>
          <Link
            href="/dashboard/admin/users"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-[var(--r-md)] text-xs font-semibold transition-opacity hover:opacity-90"
            style={{ background: 'var(--accent)', color: 'var(--accent-on)' }}
          >
            <Users size={14} />
            Manage Users
          </Link>
        </div>
      </div>

      {/* Headline metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          emphasis
          label="Queries answered"
          value={overview?.total_queries ?? 0}
          change={`${overview?.queries_last_24h ?? 0} in the last 24h`}
          trend="stable"
        />
        <KPICard
          emphasis
          label="Citation coverage"
          value={`${overview?.citation_coverage ?? 0}%`}
          change={
            hasQueries ? `${queries?.grounded_rate ?? 0}% fully grounded` : 'No queries yet'
          }
          trend={(overview?.citation_coverage ?? 0) >= 80 ? 'up' : 'stable'}
        />
        <KPICard
          emphasis
          label="Avg response time"
          value={overview?.avg_response_time_ms ? formatValue(overview.avg_response_time_ms, 'ms') : '—'}
          change={`p95 ${formatValue(overview?.p95_response_time_ms ?? 0, 'ms')}`}
          trend={
            overview?.avg_response_time_ms &&
            overview.avg_response_time_ms < overview.latency_target_ms
              ? 'up'
              : 'down'
          }
        />
        <KPICard
          emphasis
          label="Indexed documents"
          value={overview?.indexed_documents ?? 0}
          change={`${overview?.total_chunks ?? 0} searchable chunks`}
          trend="stable"
        />
      </div>

      {/* Usage & latency */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {volumeSpec ? (
          <ChartRenderer spec={volumeSpec} height={260} />
        ) : (
          <Panel title="Query volume" icon={Activity}>
            <EmptyState message="No queries recorded yet. Ask an agent a question to populate this chart." />
          </Panel>
        )}
        {latencySpec ? (
          <ChartRenderer spec={latencySpec} height={260} />
        ) : (
          <Panel title="Response time" icon={Gauge}>
            <EmptyState message="Latency is tracked once the first query is answered." />
          </Panel>
        )}
      </div>

      {/* Grounding quality & agent load */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {confidenceSpec ? (
          <ChartRenderer spec={confidenceSpec} height={280} />
        ) : (
          <Panel title="Grounding quality" icon={Quote}>
            <EmptyState message="Confidence distribution appears after the first answers." />
          </Panel>
        )}
        {agentSpec ? (
          <ChartRenderer spec={agentSpec} height={280} />
        ) : (
          <Panel title="Queries by agent" icon={Activity}>
            <EmptyState message="No agent activity yet." />
          </Panel>
        )}
      </div>

      {/* Knowledge health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel
          title="Document ingestion health"
          icon={Database}
          action={
            <Link href="/dashboard/knowledge" className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>
              Inspect sources
            </Link>
          }
        >
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Indexed', value: knowledge?.indexed ?? 0, color: STATUS_COLORS.good },
              { label: 'Processing', value: knowledge?.processing ?? 0, color: 'var(--info)' },
              { label: 'Failed', value: knowledge?.failed ?? 0, color: STATUS_COLORS.critical },
            ].map((cell) => (
              <div
                key={cell.label}
                className="p-3 rounded-[var(--r-md)] border text-center"
                style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border-subtle)' }}
              >
                <span className="text-[11px] block" style={{ color: 'var(--text-muted)' }}>
                  {cell.label}
                </span>
                <span
                  className="text-xl font-semibold mt-1 block tabular-nums"
                  style={{ color: cell.color }}
                >
                  {cell.value}
                </span>
              </div>
            ))}
          </div>

          {/* Index rate as a proportion bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-[11px] mb-1.5">
              <span style={{ color: 'var(--text-muted)' }}>Index completion</span>
              <span className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                {knowledge?.index_rate ?? 0}%
              </span>
            </div>
            <div
              className="h-1.5 rounded-full overflow-hidden"
              style={{ background: 'var(--bg-tertiary)' }}
              role="meter"
              aria-valuenow={knowledge?.index_rate ?? 0}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Index completion"
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${knowledge?.index_rate ?? 0}%`,
                  background: STATUS_COLORS.good,
                }}
              />
            </div>
          </div>

          {knowledge?.failed_documents?.length > 0 && (
            <div className="mt-4 space-y-1.5">
              <span
                className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5"
                style={{ color: 'var(--text-muted)' }}
              >
                <FileWarning size={12} style={{ color: STATUS_COLORS.critical }} />
                Failed documents
              </span>
              {knowledge.failed_documents.slice(0, 4).map((doc: any, i: number) => (
                <div
                  key={i}
                  className="p-2.5 rounded-lg border text-[11px]"
                  style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border-subtle)' }}
                >
                  <div className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {doc.document}
                  </div>
                  <div className="truncate" style={{ color: 'var(--text-muted)' }}>
                    {doc.error}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {chunkSpec ? (
          <ChartRenderer spec={chunkSpec} height={300} />
        ) : (
          <Panel title="Knowledge index" icon={Database}>
            <EmptyState message="Upload documents to a knowledge source to build the index." />
          </Panel>
        )}
      </div>

      {/* Most-cited documents & security */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {citedSpec ? (
          <ChartRenderer spec={citedSpec} height={280} />
        ) : (
          <Panel title="Most-cited documents" icon={Quote}>
            <EmptyState message="Citation counts appear once agents start answering from your documents." />
          </Panel>
        )}

        <Panel
          title="Security & access"
          icon={ShieldCheck}
          action={
            <Link href="/dashboard/admin/audit" className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>
              Full trail
            </Link>
          }
        >
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: 'Failed logins', value: security?.failed_logins ?? 0 },
              { label: 'Auth failures', value: security?.auth_failures ?? 0 },
              { label: 'Admin actions', value: security?.admin_actions ?? 0 },
            ].map((cell) => (
              <div
                key={cell.label}
                className="p-3 rounded-[var(--r-md)] border text-center"
                style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border-subtle)' }}
              >
                <span className="text-[11px] block" style={{ color: 'var(--text-muted)' }}>
                  {cell.label}
                </span>
                <span
                  className="text-xl font-semibold mt-1 block tabular-nums"
                  style={{
                    color:
                      cell.value > 0 && cell.label !== 'Admin actions'
                        ? STATUS_COLORS.warning
                        : 'var(--text-primary)',
                  }}
                >
                  {cell.value}
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-2 text-xs">
            {[
              { name: 'PostgreSQL + pgvector', state: 'Connected' },
              { name: 'Hybrid retrieval (vector + full-text)', state: 'Active' },
              { name: 'Grounding & citation validation', state: 'Enforced' },
              { name: 'Web search', state: 'Disabled' },
            ].map((row) => (
              <div
                key={row.name}
                className="flex items-center justify-between p-2.5 rounded-[var(--r-md)] border"
                style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border-subtle)' }}
              >
                <span style={{ color: 'var(--text-primary)' }}>{row.name}</span>
                <span className="flex items-center gap-1" style={{ color: STATUS_COLORS.good }}>
                  <CheckCircle2 size={13} />
                  {row.state}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Recent queries — the audit view of what was actually asked */}
      <Panel title="Recent queries" icon={Activity}>
        {queries?.recent_queries?.length ? (
          <div className="scroll-x -mx-1">
            <table className="w-full min-w-[560px] text-xs border-collapse">
              <thead>
                <tr style={{ color: 'var(--text-muted)' }}>
                  <th className="text-left py-2 px-2 font-medium">Question</th>
                  <th className="text-left py-2 px-2 font-medium">Grounding</th>
                  <th className="text-right py-2 px-2 font-medium">Latency</th>
                  <th className="text-left py-2 px-2 font-medium">Trace</th>
                </tr>
              </thead>
              <tbody>
                {queries.recent_queries.map((q: any) => {
                  const color =
                    q.confidence === 'supported'
                      ? STATUS_COLORS.good
                      : q.confidence === 'partial'
                      ? STATUS_COLORS.warning
                      : STATUS_COLORS.critical;
                  return (
                    <tr
                      key={q.id}
                      className="border-t"
                      style={{ borderColor: 'var(--border-subtle)' }}
                    >
                      <td className="py-2 px-2 max-w-md truncate" style={{ color: 'var(--text-primary)' }}>
                        {q.query}
                      </td>
                      <td className="py-2 px-2">
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                          style={{ color, background: 'var(--bg-tertiary)' }}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: color }}
                            aria-hidden
                          />
                          {q.confidence ?? 'unknown'}
                        </span>
                      </td>
                      <td
                        className="py-2 px-2 text-right tabular-nums"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {q.latency_ms ? `${q.latency_ms} ms` : '—'}
                      </td>
                      <td className="py-2 px-2 font-mono" style={{ color: 'var(--text-muted)' }}>
                        {q.trace_id || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState message="No queries yet. Every answered question is logged here with its trace id." />
        )}
      </Panel>

      {!hasQueries && (
        <div
          className="flex items-start gap-3 p-4 rounded-[var(--r-lg)] border"
          style={{
            background: 'var(--bg-card)',
            borderColor: 'var(--border-primary)',
          }}
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: STATUS_COLORS.warning }} />
          <div className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--text-primary)' }}>No query data yet.</strong>{' '}
            Charts on this page populate from the query log. Ask an agent a question and this
            dashboard will fill in.
          </div>
        </div>
      )}
    </div>
  );
}
