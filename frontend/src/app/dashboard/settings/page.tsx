'use client';

import React from 'react';
import { useAuth } from '@/lib/auth';
import { Settings, Shield, User, Building2 } from 'lucide-react';
import AppearanceCard from '@/components/settings/AppearanceCard';

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="flex items-center gap-2.5 text-[26px] font-semibold tracking-[-0.025em] sm:text-[30px]" style={{ color: 'var(--text-primary)' }}>
          <Settings className="text-[var(--accent)]" size={24} />
          Settings & Organization Profile
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Account preferences, security parameters, and tenant isolation configuration.
        </p>
      </div>

      <div className="space-y-6">
        {/* User Profile Card */}
        <div
          className="p-6 rounded-[var(--r-lg)] border space-y-4"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}
        >
          <div className="flex items-center gap-2 pb-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
            <User size={16} className="text-[var(--accent)]" />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              User Profile
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-[var(--text-muted)] block mb-1">Display Name</span>
              <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                {user?.display_name}
              </span>
            </div>
            <div>
              <span className="text-[var(--text-muted)] block mb-1">Email Address</span>
              <span className="font-mono text-sm" style={{ color: 'var(--text-primary)' }}>
                {user?.email}
              </span>
            </div>
            <div>
              <span className="text-[var(--text-muted)] block mb-1">Assigned Roles</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {user?.roles?.map((r, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-[var(--accent-muted)] text-[var(--accent)]"
                  >
                    {r}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <span className="text-[var(--text-muted)] block mb-1">Account Status</span>
              <span className="font-bold text-[var(--success)] uppercase text-[10px] px-2 py-0.5 rounded-full bg-[var(--success-soft)] inline-block mt-1">
                {user?.status}
              </span>
            </div>
          </div>
        </div>

        <AppearanceCard />

        {/* Tenant Isolation Info */}
        <div
          className="p-6 rounded-[var(--r-lg)] border space-y-4"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}
        >
          <div className="flex items-center gap-2 pb-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
            <Building2 size={16} className="text-[var(--accent)]" />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Tenant Isolation Boundary
            </h2>
          </div>

          <div className="text-xs space-y-2" style={{ color: 'var(--text-secondary)' }}>
            <div className="flex justify-between py-1 border-b border-[var(--border-subtle)]">
              <span className="text-[var(--text-muted)]">Tenant ID</span>
              <span className="font-mono text-[var(--text-primary)]">{user?.tenant_id}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[var(--border-subtle)]">
              <span className="text-[var(--text-muted)]">Data Isolation Mode</span>
              <span className="text-[var(--success)] font-semibold">Row-Level Security (Strict)</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-[var(--text-muted)]">Vector Space</span>
              <span className="text-[var(--success)] font-semibold">Tenant-Scoped Partition</span>
            </div>
          </div>
        </div>

        {/* Security & RAG Policies */}
        <div
          className="p-6 rounded-[var(--r-lg)] border space-y-4"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}
        >
          <div className="flex items-center gap-2 pb-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
            <Shield size={16} className="text-[var(--success)]" />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              RAG Guardrails & Policy Enforcement
            </h2>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="p-3 rounded-[var(--r-md)] bg-[var(--bg-tertiary)] flex items-start gap-2.5">
              <div className="w-2 h-2 rounded-full bg-[var(--success)] mt-1 shrink-0" />
              <div>
                <strong className="text-[var(--text-primary)] block">Zero Web Search Rule</strong>
                <p className="text-[var(--text-muted)] text-[11px] mt-0.5">
                  The system never contacts Google, Bing, SerpAPI or external websites. Only authorized documents are queried.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-[var(--r-md)] bg-[var(--bg-tertiary)] flex items-start gap-2.5">
              <div className="w-2 h-2 rounded-full bg-[var(--success)] mt-1 shrink-0" />
              <div>
                <strong className="text-[var(--text-primary)] block">Pre-Retrieval Authorization</strong>
                <p className="text-[var(--text-muted)] text-[11px] mt-0.5">
                  Permissions are verified before vectors or chunks reach the LLM context layer.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-[var(--r-md)] bg-[var(--bg-tertiary)] flex items-start gap-2.5">
              <div className="w-2 h-2 rounded-full bg-[var(--success)] mt-1 shrink-0" />
              <div>
                <strong className="text-[var(--text-primary)] block">Prompt Injection Isolation</strong>
                <p className="text-[var(--text-muted)] text-[11px] mt-0.5">
                  Document content is treated exclusively as evidence data inside XML source blocks, never as system instructions.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
