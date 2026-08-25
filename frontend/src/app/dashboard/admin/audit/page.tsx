'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Shield, ArrowLeft, RefreshCw, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import Link from 'next/link';

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');

  const fetchLogs = async (p = page) => {
    try {
      setLoading(true);
      const res = await api.getAuditLogs(p, pageSize);
      setLogs(res.items || []);
      setTotal(res.total || 0);
      setPage(res.page || 1);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page]);

  const totalPages = Math.ceil(total / pageSize) || 1;

  const filteredLogs = actionFilter
    ? logs.filter((l) => l.action.toLowerCase().includes(actionFilter.toLowerCase()))
    : logs;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/dashboard/admin"
            className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-2"
          >
            <ArrowLeft size={14} /> Back to Analytics
          </Link>
          <h1 className="flex items-center gap-2.5 text-[26px] font-semibold tracking-[-0.025em] sm:text-[30px]" style={{ color: 'var(--text-primary)' }}>
            <Shield className="text-[var(--accent)]" size={24} />
            Security & Compliance Audit Trail
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Immutable chronological record of logins, administrative events, knowledge changes, and document access.
          </p>
        </div>

        <button
          onClick={() => fetchLogs()}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--r-md)] border text-xs hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"
          style={{ borderColor: 'var(--border-primary)' }}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Filter Bar */}
      <div
        className="p-4 rounded-[var(--r-lg)] border flex items-center gap-3"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}
      >
        <Filter size={16} className="text-[var(--text-muted)]" />
        <input
          type="text"
          placeholder="Filter by action (e.g. login, source_created, agent_published)..."
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="flex-1 bg-transparent outline-none text-xs"
          style={{ color: 'var(--text-primary)' }}
        />
      </div>

      {/* Audit Log Table */}
      <div
        className="rounded-[var(--r-lg)] border overflow-hidden"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}
      >
        <div className="scroll-x">
          <table className="w-full min-w-[680px] text-xs text-left border-collapse">
            <thead>
              <tr style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
                <th className="py-3 px-4 font-semibold border-b" style={{ borderColor: 'var(--border-primary)' }}>
                  Timestamp
                </th>
                <th className="py-3 px-4 font-semibold border-b" style={{ borderColor: 'var(--border-primary)' }}>
                  Action
                </th>
                <th className="py-3 px-4 font-semibold border-b" style={{ borderColor: 'var(--border-primary)' }}>
                  Resource Type
                </th>
                <th className="py-3 px-4 font-semibold border-b" style={{ borderColor: 'var(--border-primary)' }}>
                  Result
                </th>
                <th className="py-3 px-4 font-semibold border-b" style={{ borderColor: 'var(--border-primary)' }}>
                  Detail
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                    Loading audit events...
                  </td>
                </tr>
              ) : filteredLogs.length > 0 ? (
                filteredLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b transition-colors hover:bg-[var(--bg-hover)]"
                    style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
                  >
                    <td className="py-3 px-4 font-mono text-[11px] whitespace-nowrap">
                      {log.created_at ? new Date(log.created_at).toLocaleString() : '—'}
                    </td>
                    <td className="py-3 px-4 font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {log.action}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px]">
                      {log.resource_type || 'system'}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                        style={{
                          background:
                            log.result === 'success'
                              ? 'var(--success-soft)'
                              : 'var(--danger-soft)',
                          color:
                            log.result === 'success'
                              ? 'var(--success)'
                              : 'var(--danger)',
                        }}
                      >
                        {log.result}
                      </span>
                    </td>
                    <td className="py-3 px-4 truncate max-w-xs text-[var(--text-muted)]">
                      {log.detail || log.resource_id || '—'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                    No audit logs recorded
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        <div
          className="px-5 py-3 border-t flex items-center justify-between text-xs"
          style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-secondary)' }}
        >
          <span style={{ color: 'var(--text-muted)' }}>
            Showing {filteredLogs.length} of {total} events
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={page <= 1 || loading}
              className="p-1 rounded-lg border disabled:opacity-30 hover:bg-[var(--bg-hover)]"
              style={{ borderColor: 'var(--border-primary)' }}
            >
              <ChevronLeft size={14} />
            </button>
            <span style={{ color: 'var(--text-secondary)' }}>
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              disabled={page >= totalPages || loading}
              className="p-1 rounded-lg border disabled:opacity-30 hover:bg-[var(--bg-hover)]"
              style={{ borderColor: 'var(--border-primary)' }}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
