'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/feedback';
import { useAuth } from '@/lib/auth';
import { Users, Plus, ArrowLeft, Shield, UserCheck, X } from 'lucide-react';
import Link from 'next/link';

export default function UsersManagementPage() {
  const toast = useToast();
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Add User modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('USER');
  const [submitting, setSubmitting] = useState(false);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const list = await api.listUsers();
      setUsers(list);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim() || submitting) return;

    setSubmitting(true);
    try {
      await api.register(email.trim(), password.trim(), displayName.trim() || email.split('@')[0]);
      setShowAddModal(false);
      setEmail('');
      setPassword('');
      setDisplayName('');
      await fetchUsers();
    } catch (err: any) {
      toast(err.message || 'Failed to add user');
    } finally {
      setSubmitting(false);
    }
  };

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
            <Users className="text-[var(--accent)]" size={24} />
            User & Role Management
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Configure enterprise role-based authorization (RBAC) across USER, AGENT_MANAGER, KNOWLEDGE_ADMIN, and ADMIN roles.
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-[var(--r-md)] text-xs font-semibold transition-all shadow-sm hover:opacity-90"
            style={{ background: 'var(--accent)', color: 'var(--accent-on)' }}
          >
            <Plus size={15} />
            Add User
          </button>
        )}
      </div>

      {/* Users Table */}
      <div
        className="rounded-[var(--r-lg)] border overflow-hidden"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}
      >
        <div className="scroll-x">
          <table className="w-full min-w-[640px] text-xs text-left border-collapse">
            <thead>
              <tr style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
                <th className="py-3 px-4 font-semibold border-b" style={{ borderColor: 'var(--border-primary)' }}>
                  User
                </th>
                <th className="py-3 px-4 font-semibold border-b" style={{ borderColor: 'var(--border-primary)' }}>
                  Email
                </th>
                <th className="py-3 px-4 font-semibold border-b" style={{ borderColor: 'var(--border-primary)' }}>
                  Roles
                </th>
                <th className="py-3 px-4 font-semibold border-b" style={{ borderColor: 'var(--border-primary)' }}>
                  Status
                </th>
                <th className="py-3 px-4 font-semibold border-b" style={{ borderColor: 'var(--border-primary)' }}>
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                    Loading users...
                  </td>
                </tr>
              ) : users.length > 0 ? (
                users.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b transition-colors hover:bg-[var(--bg-hover)]"
                    style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
                  >
                    <td className="py-3 px-4 font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {u.display_name}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px]">
                      {u.email}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        {u.roles?.map((r: string, idx: number) => (
                          <span
                            key={idx}
                            className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                            style={{
                              background:
                                r === 'SUPER_ADMIN' || r === 'ADMIN'
                                  ? 'var(--accent-muted)'
                                  : r === 'KNOWLEDGE_ADMIN'
                                  ? 'var(--info-soft)'
                                  : r === 'AGENT_MANAGER'
                                  ? 'var(--tint-lavender)'
                                  : 'var(--bg-tertiary)',
                              color:
                                r === 'SUPER_ADMIN' || r === 'ADMIN'
                                  ? 'var(--accent)'
                                  : r === 'KNOWLEDGE_ADMIN'
                                  ? 'var(--info)'
                                  : r === 'AGENT_MANAGER'
                                  ? 'var(--tint-lavender-ink)'
                                  : 'var(--text-secondary)',
                            }}
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-[10px] font-bold uppercase text-[var(--success)]">
                        {u.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[var(--text-muted)]">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                    No users found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User Modal */}
      {showAddModal && (
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
                Add Organization User
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddUser} className="space-y-4">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Jane Doe"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
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
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="jane@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
                  Temporary Password
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder="Min 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
                  Assigned Role
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-[var(--r-md)] border text-sm outline-none focus:border-[var(--accent)]"
                  style={{
                    background: 'var(--bg-tertiary)',
                    borderColor: 'var(--border-primary)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <option value="USER">USER (Query & Chat only)</option>
                  <option value="AGENT_MANAGER">AGENT_MANAGER (Build & Manage Agents)</option>
                  <option value="KNOWLEDGE_ADMIN">KNOWLEDGE_ADMIN (Upload & Ingest Documents)</option>
                  <option value="ADMIN">ADMIN (Full Admin Access)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-[var(--r-md)] text-xs border hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"
                  style={{ borderColor: 'var(--border-primary)' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-[var(--r-md)] text-xs font-semibold transition-opacity disabled:opacity-50"
                  style={{ background: 'var(--accent)', color: 'var(--accent-on)' }}
                >
                  {submitting ? 'Creating...' : 'Add User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
