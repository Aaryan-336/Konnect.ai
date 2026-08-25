'use client';

import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  CheckCircle2, AlertTriangle, Info, X, AlertOctagon,
} from 'lucide-react';
import { Button } from './primitives';

/* ---------------------------------------------------------------------------
   Toasts and confirmations.

   Replaces window.alert / window.confirm. Those block the whole page, cannot
   be styled, and — for an error as ordinary as a dropped request — interrupt
   the user for something they can neither act on nor dismiss in context.
   --------------------------------------------------------------------------- */

type Tone = 'success' | 'danger' | 'info';

interface Toast {
  id: number;
  message: string;
  tone: Tone;
}

interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button for an irreversible action. */
  destructive?: boolean;
}

interface FeedbackContextValue {
  toast: (message: string, tone?: Tone) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function useToast() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useToast must be used within FeedbackProvider');
  return ctx.toast;
}

export function useConfirm() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useConfirm must be used within FeedbackProvider');
  return ctx.confirm;
}

const TONE_STYLE: Record<Tone, { icon: typeof Info; color: string; background: string }> = {
  success: { icon: CheckCircle2, color: 'var(--success)', background: 'var(--success-soft)' },
  danger: { icon: AlertTriangle, color: 'var(--danger)', background: 'var(--danger-soft)' },
  info: { icon: Info, color: 'var(--info)', background: 'var(--info-soft)' },
};

const TOAST_MS = 6000;

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<ConfirmOptions | null>(null);
  const nextId = useRef(0);
  // Held so the promise returned by confirm() can settle on the user's click.
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: Tone = 'danger') => {
      const id = nextId.current++;
      setToasts((prev) => [...prev.slice(-2), { id, message, tone }]);
      setTimeout(() => dismiss(id), TOAST_MS);
    },
    [dismiss]
  );

  const confirm = useCallback((options: ConfirmOptions) => {
    setDialog(options);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((result: boolean) => {
    resolver.current?.(result);
    resolver.current = null;
    setDialog(null);
  }, []);

  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') settle(false);
      if (e.key === 'Enter') settle(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, settle]);

  const value = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}

      {/* Toasts — above the dock, out of the way of the thumb on mobile. */}
      {toasts.length > 0 && (
        <div
          className="pointer-events-none fixed inset-x-3 z-[130] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-4 sm:items-end"
          style={{ bottom: 'calc(var(--dock-h) + var(--safe-b) + 16px)' }}
          role="status"
          aria-live="polite"
        >
          {toasts.map((t) => {
            const { icon: Icon, color, background } = TONE_STYLE[t.tone];
            return (
              <div
                key={t.id}
                className="animate-rise pointer-events-auto flex w-full max-w-sm items-start gap-2.5 p-3.5"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--r-md)',
                  boxShadow: 'var(--shadow-lg)',
                }}
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px]"
                  style={{ background, color }}
                >
                  <Icon size={15} />
                </span>
                <p
                  className="flex-1 pt-1 text-[13px] leading-snug"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {t.message}
                </p>
                <button
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss"
                  className="shrink-0 p-1"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation */}
      {dialog && (
        <div className="fixed inset-0 z-[140] flex items-end justify-center sm:items-center sm:p-4">
          <button
            aria-label="Cancel"
            onClick={() => settle(false)}
            className="animate-scrim absolute inset-0 backdrop-blur-[3px]"
            style={{ background: 'rgba(12, 12, 16, 0.55)' }}
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label={dialog.title}
            className="animate-sheet relative w-full sm:max-w-sm"
            style={{
              background: 'var(--bg-card)',
              borderRadius: 'var(--r-2xl)',
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
              boxShadow: 'var(--shadow-lg)',
              padding: '22px',
              paddingBottom: 'calc(22px + var(--safe-b))',
            }}
          >
            <span
              className="mb-3 flex h-11 w-11 items-center justify-center rounded-[14px]"
              style={{
                background: dialog.destructive ? 'var(--danger-soft)' : 'var(--bg-tertiary)',
                color: dialog.destructive ? 'var(--danger)' : 'var(--text-secondary)',
              }}
            >
              <AlertOctagon size={20} />
            </span>

            <h2
              className="text-[16px] font-semibold tracking-[-0.01em]"
              style={{ color: 'var(--text-primary)' }}
            >
              {dialog.title}
            </h2>
            {dialog.body && (
              <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {dialog.body}
              </p>
            )}

            <div className="mt-5 flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => settle(false)}>
                {dialog.cancelLabel ?? 'Cancel'}
              </Button>
              <Button
                className="flex-1"
                variant={dialog.destructive ? 'danger' : 'primary'}
                onClick={() => settle(true)}
                autoFocus
              >
                {dialog.confirmLabel ?? 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  );
}
