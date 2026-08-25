'use client';

import React, { useState } from 'react';
import { FileText, ExternalLink, X } from 'lucide-react';

export interface CitationItem {
  document_id?: string | null;
  document_name: string;
  page?: number | null;
  section?: string | null;
  snippet?: string;
  index?: number;
}

interface CitationCardProps {
  citation: CitationItem;
  index: number;
}

export default function CitationCard({ citation, index }: CitationCardProps) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all text-left group hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
        style={{
          background: 'var(--bg-tertiary)',
          borderColor: 'var(--border-primary)',
          color: 'var(--text-secondary)',
        }}
      >
        <span
          className="w-4 h-4 rounded flex items-center justify-center font-bold text-[10px]"
          style={{ background: 'var(--accent-muted)', color: 'var(--spark)' }}
        >
          {index + 1}
        </span>
        <FileText size={13} className="text-[var(--spark)] shrink-0" />
        <span className="truncate max-w-[180px] font-medium" style={{ color: 'var(--text-primary)' }}>
          {citation.document_name}
        </span>
        {citation.page && (
          <span className="text-[10px] shrink-0" style={{ color: 'var(--text-muted)' }}>
            p.{citation.page}
          </span>
        )}
      </button>

      {/* Excerpt Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div
            className="w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            style={{
              background: 'var(--bg-card)',
              borderColor: 'var(--border-primary)',
            }}
          >
            {/* Header */}
            <div
              className="px-5 py-4 border-b flex items-center justify-between"
              style={{ borderColor: 'var(--border-primary)' }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={18} className="text-[var(--spark)] shrink-0" />
                <div>
                  <h3
                    className="font-semibold text-sm truncate"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {citation.document_name}
                  </h3>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {citation.page ? `Page ${citation.page}` : ''}
                    {citation.page && citation.section ? ' • ' : ''}
                    {citation.section ? `Section: ${citation.section}` : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-5 overflow-y-auto text-sm space-y-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>
                  Grounded Excerpt
                </span>
                <div
                  className="p-3.5 rounded-xl border text-xs leading-relaxed font-mono whitespace-pre-wrap select-text"
                  style={{
                    background: 'var(--bg-tertiary)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {citation.snippet || 'No excerpt available for this reference.'}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div
              className="px-5 py-3 border-t flex justify-end"
              style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
            >
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-1.5 rounded-xl text-xs font-medium transition-colors"
                style={{ background: 'var(--accent)', color: 'var(--accent-on)' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
