'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api';

interface User {
  id: string;
  tenant_id: string;
  email: string;
  display_name: string;
  status: string;
  roles: string[];
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  isAdmin: boolean;
  isKnowledgeAdmin: boolean;
  isAgentManager: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  /** Returns the user so callers can tell "not signed in" from "load failed". */
  const fetchUser = useCallback(async (): Promise<User | null> => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) return null;
      const userData = await api.getMe();
      setUser(userData);
      return userData;
    } catch {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = async (email: string, password: string) => {
    const tokens = await api.login(email, password);
    localStorage.setItem('access_token', tokens.access_token);
    localStorage.setItem('refresh_token', tokens.refresh_token);

    // Without this the caller would navigate to the dashboard on a token that
    // cannot actually load a profile, and be bounced straight back with no
    // explanation.
    const profile = await fetchUser();
    if (!profile) {
      throw new Error('Signed in, but your profile could not be loaded. Please try again.');
    }
  };

  const register = async (email: string, password: string, name: string) => {
    await api.register(email, password, name);
    await login(email, password);
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setUser(null);
  };

  const hasRole = (role: string) => user?.roles?.includes(role) ?? false;
  const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'];
  const KNOWLEDGE_ROLES = [...ADMIN_ROLES, 'KNOWLEDGE_ADMIN'];
  const AGENT_ROLES = [...ADMIN_ROLES, 'AGENT_MANAGER'];

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        isAdmin: ADMIN_ROLES.some(hasRole),
        isKnowledgeAdmin: KNOWLEDGE_ROLES.some(hasRole),
        isAgentManager: AGENT_ROLES.some(hasRole),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
