'use client';

import React, { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { useToast, useConfirm } from '@/components/ui/feedback';
import { useAuth } from '@/lib/auth';
import {
  Database, Plus, Upload, Trash2, FileText, CheckCircle2, AlertCircle,
  Clock, RefreshCw, ChevronRight, Layers, FileSpreadsheet, Presentation,
  FileType, X
} from 'lucide-react';

export default function KnowledgePage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { isKnowledgeAdmin } = useAuth();
  const [sources, setSources] = useState<any[]>([]);
  const [selectedSource, setSelectedSource] = useState<any | null>(null);
  const [sourceDetails, setSourceDetails] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Create Source modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceDesc, setNewSourceDesc] = useState('');
  const [creating, setCreating] = useState(false);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchSources = async (selectId?: string) => {
    try {
      setLoading(true);
      const list = await api.listSources();
      setSources(list);
      if (selectId) {
        const found = list.find((s) => s.id === selectId);
        if (found) setSelectedSource(found);
      } else if (list.length > 0 && !selectedSource) {
        setSelectedSource(list[0]);
      } else if (list.length === 0) {
        setSelectedSource(null);
        setSourceDetails(null);
      }
    } catch (err: any) {
      // Swallowing this rendered a failed load as an empty workspace — the
      // "no knowledge sources" empty state, with nothing saying the request
      // never succeeded.
      toast(err.message || 'Could not load knowledge sources');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSources();
  }, []);

  const fetchDetails = async (sourceId: string) => {
    try {
      setLoadingDetails(true);
      const data = await api.getSource(sourceId);
      setSourceDetails(data);
    } catch {
      setSourceDetails(null);
    } finally {
      setLoadingDetails(false);
    }
  };

  useEffect(() => {
    if (selectedSource?.id) {
      fetchDetails(selectedSource.id);
    }
  }, [selectedSource]);

  const handleCreateSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSourceName.trim() || creating) return;

    setCreating(true);
    try {
      const created = await api.createSource(newSourceName.trim(), newSourceDesc.trim());
      setNewSourceName('');
      setNewSourceDesc('');
      setShowCreateModal(false);
      await fetchSources(created.id);
    } catch (err: any) {
      toast(err.message || 'Failed to create knowledge source');
    } finally {
      setCreating(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !selectedSource) return;

    setUploading(true);
    setUploadResults([]);
    try {
      const res = await api.uploadFiles(selectedSource.id, Array.from(files));
      setUploadResults(res.results || []);
      await fetchDetails(selectedSource.id);
      await fetchSources(selectedSource.id);
    } catch (err: any) {
      toast(err.message || 'Upload failed');
      // The request failing does not mean the server stopped: ingestion runs
      // inside it, so a client-side timeout leaves work still finishing and
      // then committing. Without this refresh the page kept showing an empty
      // source while every document was in fact indexed.
      await fetchDetails(selectedSource.id).catch(() => {});
      await fetchSources(selectedSource.id).catch(() => {});
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteSource = async (sourceId: string) => {
    const ok = await confirm({
      title: 'Delete this knowledge source?',
      body: 'Its files and every vector embedding built from them are removed permanently. Agents using this source will stop finding those documents.',
      confirmLabel: 'Delete source',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.deleteSource(sourceId);
      const remaining = sources.filter((s) => s.id !== sourceId);
      setSources(remaining);
      if (remaining.length > 0) {
        setSelectedSource(remaining[0]);
      } else {
        setSelectedSource(null);
        setSourceDetails(null);
      }
    } catch (err: any) {
      toast(err.message || 'Failed to delete knowledge source');
    }
  };

  const handleDeleteDocument = async (documentId: string, docName: string) => {
    if (!selectedSource) return;
    const ok = await confirm({
      title: 'Delete this document?',
      body: `“${docName}” and its vector chunks are removed permanently.`,
      confirmLabel: 'Delete document',
      destructive: true,
    });
    if (!ok) return;

    try {
      await api.deleteDocument(selectedSource.id, documentId);
      await fetchDetails(selectedSource.id);
      await fetchSources(selectedSource.id);
    } catch (err: any) {
      toast(err.message || 'Failed to delete document');
    }
  };

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return <FileText size={16} className="text-[var(--danger)]" />;
    if (ext === 'docx') return <FileText size={16} className="text-[var(--info)]" />;
    if (ext === 'xlsx' || ext === 'xlsm' || ext === 'csv') return <FileSpreadsheet size={16} className="text-[var(--success)]" />;
    if (ext === 'pptx') return <Presentation size={16} className="text-[var(--warning)]" />;
    return <FileType size={16} className="text-[var(--text-muted)]" />;
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-[26px] font-semibold tracking-[-0.025em] sm:text-[30px]" style={{ color: 'var(--text-primary)' }}>
            <Database className="text-[var(--accent)]" size={24} />
            Knowledge Management
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Authoritative, bounded private document repositories for grounded RAG retrieval.
          </p>
        </div>

        {isKnowledgeAdmin && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-[var(--r-md)] text-xs font-semibold transition-all shadow-sm hover:opacity-90 self-start"
            style={{ background: 'var(--accent)', color: 'var(--accent-on)' }}
          >
            <Plus size={15} />
            New Knowledge Source
          </button>
        )}
      </div>

      {/* Main Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Sources List (4 cols) */}
        <div
          className="lg:col-span-4 p-5 rounded-[var(--r-lg)] border flex flex-col space-y-3"
          style={{
            background: 'var(--bg-card)',
            borderColor: 'var(--border-primary)',
          }}
        >
          <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Sources ({sources.length})
            </span>
          </div>

          <div className="space-y-2 overflow-y-auto max-h-[600px]">
            {loading ? (
              [1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-16 rounded-[var(--r-md)] border animate-pulse"
                  style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)' }}
                />
              ))
            ) : sources.length > 0 ? (
              sources.map((src) => {
                const isSelected = selectedSource?.id === src.id;
                return (
                  <button
                    key={src.id}
                    onClick={() => setSelectedSource(src)}
                    className="w-full text-left p-3.5 rounded-[var(--r-md)] border transition-all flex items-center justify-between group"
                    style={{
                      background: isSelected ? 'var(--accent-muted)' : 'var(--bg-tertiary)',
                      borderColor: isSelected ? 'var(--accent)' : 'var(--border-subtle)',
                      color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                    }}
                  >
                    <div className="min-w-0 pr-2">
                      <h4 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                        {src.name}
                      </h4>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {src.document_count || 0} files • {src.indexed_count || 0} indexed
                      </p>
                    </div>
                    <ChevronRight
                      size={16}
                      className={isSelected ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}
                    />
                  </button>
                );
              })
            ) : (
              <div className="text-center py-10 text-xs" style={{ color: 'var(--text-muted)' }}>
                No knowledge sources created yet.
              </div>
            )}
          </div>
        </div>

        {/* Right: Selected Source Inspector & File Ingestion (8 cols) */}
        <div
          className="lg:col-span-8 p-6 rounded-[var(--r-lg)] border space-y-6"
          style={{
            background: 'var(--bg-card)',
            borderColor: 'var(--border-primary)',
          }}
        >
          {selectedSource ? (
            <>
              {/* Source Details Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                      {selectedSource.name}
                    </h2>
                    <span
                      className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                      style={{
                        background: 'var(--success-soft)',
                        color: 'var(--success)',
                      }}
                    >
                      {selectedSource.status}
                    </span>
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                    {selectedSource.description || 'Private document repository'}
                  </p>
                </div>

                {isKnowledgeAdmin && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-[var(--r-md)] text-xs font-semibold transition-all hover:opacity-90"
                      style={{ background: 'var(--accent)', color: 'var(--accent-on)' }}
                    >
                      {uploading ? <RefreshCw size={13} className="animate-spin" /> : <Upload size={13} />}
                      Upload Files
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept=".pdf,.docx,.xlsx,.xlsm,.xltx,.xltm,.pptx,.csv,.txt,.md,.markdown"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <button
                      onClick={() => handleDeleteSource(selectedSource.id)}
                      className="p-2 rounded-[var(--r-md)] border bg-[var(--danger-soft)] border-[var(--danger)] hover:bg-[var(--danger-soft)] text-[var(--danger)] transition-colors"
                      title="Delete this entire Knowledge Source"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>

              {/* Upload Notifications */}
              {uploadResults.length > 0 && (
                <div className="p-4 rounded-[var(--r-md)] bg-[var(--bg-tertiary)] border border-[var(--border-primary)] text-xs space-y-2">
                  <div className="flex items-center justify-between font-semibold" style={{ color: 'var(--text-primary)' }}>
                    <span>Uploaded Batch Status</span>
                    <button onClick={() => setUploadResults([])} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="space-y-1">
                    {uploadResults.map((r, i) => (
                      <div key={i} className="flex items-center justify-between text-[11px]">
                        <span className="truncate max-w-[280px]" style={{ color: 'var(--text-secondary)' }}>
                          {r.filename}
                        </span>
                        <span
                          className={`font-medium ${
                            r.status === 'indexed'
                              ? 'text-[var(--success)]'
                              : r.status === 'unsupported'
                              ? 'text-[var(--warning)]'
                              : 'text-[var(--danger)]'
                          }`}
                        >
                          {r.status} {r.error ? `(${r.error})` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Document List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    Indexed Files ({sourceDetails?.documents?.length || 0})
                  </span>
                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Supported: PDF, DOCX, XLSX, XLSM, PPTX, CSV, TXT, MD
                  </span>
                </div>

                {loadingDetails ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="h-12 rounded-[var(--r-md)] border animate-pulse"
                        style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border-subtle)' }}
                      />
                    ))}
                  </div>
                ) : sourceDetails?.documents && sourceDetails.documents.length > 0 ? (
                  <div className="scroll-x rounded-[var(--r-md)] border" style={{ borderColor: 'var(--border-primary)' }}>
                    <table className="w-full min-w-[520px] text-xs text-left border-collapse">
                      <thead>
                        <tr style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
                          <th className="py-2.5 px-4 font-semibold border-b" style={{ borderColor: 'var(--border-primary)' }}>
                            File Name
                          </th>
                          <th className="py-2.5 px-4 font-semibold border-b" style={{ borderColor: 'var(--border-primary)' }}>
                            Status
                          </th>
                          <th className="py-2.5 px-4 font-semibold border-b" style={{ borderColor: 'var(--border-primary)' }}>
                            Chunks
                          </th>
                          <th className="py-2.5 px-4 font-semibold border-b" style={{ borderColor: 'var(--border-primary)' }}>
                            Size
                          </th>
                          {isKnowledgeAdmin && (
                            <th className="py-2.5 px-4 font-semibold border-b text-right" style={{ borderColor: 'var(--border-primary)' }}>
                              Actions
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {sourceDetails.documents.map((doc: any) => (
                          <tr
                            key={doc.id}
                            className="border-b transition-colors hover:bg-[var(--bg-hover)]"
                            style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
                          >
                            <td className="py-3 px-4 flex items-center gap-2">
                              {getFileIcon(doc.name)}
                              <span className="font-medium truncate max-w-xs" style={{ color: 'var(--text-primary)' }}>
                                {doc.name}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                                style={{
                                  background:
                                    doc.status === 'indexed'
                                      ? 'var(--success-soft)'
                                      : doc.status === 'processing'
                                      ? 'var(--info-soft)'
                                      : 'var(--danger-soft)',
                                  color:
                                    doc.status === 'indexed'
                                      ? 'var(--success)'
                                      : doc.status === 'processing'
                                      ? 'var(--info)'
                                      : 'var(--danger)',
                                }}
                              >
                                {doc.status}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-mono">{doc.chunk_count || 0}</td>
                            <td className="py-3 px-4 text-[var(--text-muted)]">
                              {doc.size_bytes ? `${Math.round(doc.size_bytes / 1024)} KB` : '—'}
                            </td>
                            {isKnowledgeAdmin && (
                              <td className="py-3 px-4 text-right">
                                <button
                                  onClick={() => handleDeleteDocument(doc.id, doc.name)}
                                  className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)] transition-colors"
                                  title="Delete document"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div
                    className="p-10 border border-dashed rounded-[var(--r-md)] text-center space-y-2"
                    style={{ borderColor: 'var(--border-primary)' }}
                  >
                    <Upload size={32} className="mx-auto opacity-30 text-[var(--text-muted)]" />
                    <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                      No documents in this knowledge source
                    </p>
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      Upload files to parse, chunk, embed into pgvector, and make available to AI agents.
                    </p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="py-24 text-center space-y-2">
              <Database size={40} className="mx-auto opacity-20" />
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Select or create a knowledge source to get started
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Create Source Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/55 backdrop-blur-[3px] animate-scrim sm:items-center sm:p-4">
          <div
            className="animate-sheet w-full space-y-4 rounded-t-[var(--r-2xl)] border p-5 shadow-[var(--shadow-lg)] sm:max-w-md sm:rounded-[var(--r-lg)] sm:p-6"
            style={{
              background: 'var(--bg-card)',
              borderColor: 'var(--border-primary)',
              paddingBottom: 'calc(20px + var(--safe-b))',
            }}
          >
            <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
              <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                Create Knowledge Source
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSource} className="space-y-4">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                  Source Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. HR Policies, Financial Reports Q4, Engineering Wiki"
                  value={newSourceName}
                  onChange={(e) => setNewSourceName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-[var(--r-md)] border text-sm outline-none focus:border-[var(--accent)]"
                  style={{
                    background: 'var(--bg-tertiary)',
                    borderColor: 'var(--border-primary)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                  Description (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Brief description of documents stored in this source"
                  value={newSourceDesc}
                  onChange={(e) => setNewSourceDesc(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-[var(--r-md)] border text-sm outline-none focus:border-[var(--accent)]"
                  style={{
                    background: 'var(--bg-tertiary)',
                    borderColor: 'var(--border-primary)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-[var(--r-md)] text-xs border hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"
                  style={{ borderColor: 'var(--border-primary)' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newSourceName.trim() || creating}
                  className="px-4 py-2 rounded-[var(--r-md)] text-xs font-semibold transition-opacity disabled:opacity-50"
                  style={{ background: 'var(--accent)', color: 'var(--accent-on)' }}
                >
                  {creating ? 'Creating...' : 'Create Source'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
