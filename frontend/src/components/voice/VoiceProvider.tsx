'use client';

import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { Mic, X, CornerDownLeft, AlertCircle, Loader2, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { useRecorder, formatElapsed } from '@/lib/recorder';
import { Button } from '@/components/ui/primitives';

type VoiceHandler = (text: string) => void;

interface VoiceContextValue {
  open: () => void;
  close: () => void;
  isOpen: boolean;
  /**
   * Lets the page on screen claim the transcript (the chat composer does this).
   * Returns an unsubscribe so the claim dies with the page.
   */
  setHandler: (handler: VoiceHandler | null) => () => void;
}

const VoiceContext = createContext<VoiceContextValue | null>(null);

export function useVoice() {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error('useVoice must be used within VoiceProvider');
  return ctx;
}

/**
 * Routes a spoken question to whatever is on screen: the chat composer when a
 * chat is open, otherwise the first published agent.
 */
export function useVoiceTarget(handler: VoiceHandler | null) {
  const { setHandler } = useVoice();
  const ref = useRef(handler);

  useEffect(() => {
    ref.current = handler;
  }, [handler]);

  // Registration depends only on whether a handler exists; the ref keeps the
  // callback itself current, so an inline closure never re-registers.
  const active = handler !== null;
  useEffect(() => {
    if (!active) return;
    return setHandler((text) => ref.current?.(text));
  }, [active, setHandler]);
}

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const handlerRef = useRef<VoiceHandler | null>(null);

  const setHandler = useCallback((handler: VoiceHandler | null) => {
    handlerRef.current = handler;
    return () => {
      if (handlerRef.current === handler) handlerRef.current = null;
    };
  }, []);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const value = useMemo(
    () => ({ open, close, isOpen, setHandler }),
    [open, close, isOpen, setHandler]
  );

  return (
    <VoiceContext.Provider value={value}>
      {children}
      {isOpen && <VoiceSheet onClose={close} handlerRef={handlerRef} />}
    </VoiceContext.Provider>
  );
}

/* -------------------------------------------------------------------------- */

function VoiceSheet({
  onClose,
  handlerRef,
}: {
  onClose: () => void;
  handlerRef: React.MutableRefObject<VoiceHandler | null>;
}) {
  const router = useRouter();
  const [transcript, setTranscript] = useState('');
  const [routing, setRouting] = useState(false);
  const startedRef = useRef(false);

  const { state, error, levels, elapsed, start, stop, cancel, reset } = useRecorder({
    onComplete: async (blob) => {
      const res = await api.transcribe(blob);
      const text = (res.text ?? '').trim();
      if (!text) throw new Error('Nothing was picked up — try again.');
      setTranscript(text);
    },
  });

  // Open with the mic already live: the user tapped mic, not "open a dialog".
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    start();
  }, [start]);

  // Lock the page behind the sheet so iOS doesn't rubber-band the backdrop.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const dismiss = useCallback(() => {
    cancel();
    onClose();
  }, [cancel, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dismiss]);

  const submit = useCallback(
    async (text: string) => {
      const query = text.trim();
      if (!query) return;

      if (handlerRef.current) {
        handlerRef.current(query);
        onClose();
        return;
      }

      // No chat on screen — send the question to the first published agent.
      setRouting(true);
      try {
        const agents = await api.listAgents('published');
        if (agents?.length) {
          router.push(`/dashboard/agents/${agents[0].id}?q=${encodeURIComponent(query)}`);
          onClose();
          return;
        }
        setRouting(false);
        setTranscript(query);
      } catch {
        setRouting(false);
      }
    },
    [handlerRef, onClose, router]
  );

  const listening = state === 'listening';
  const processing = state === 'processing' || routing;

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center">
      <button
        aria-label="Close voice input"
        onClick={dismiss}
        className="animate-scrim absolute inset-0 backdrop-blur-[3px]"
        style={{ background: 'rgba(12, 12, 16, 0.55)' }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Voice input"
        className="animate-sheet relative w-full max-w-md"
        style={{
          background: 'var(--bg-card)',
          borderTopLeftRadius: 'var(--r-2xl)',
          borderTopRightRadius: 'var(--r-2xl)',
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          boxShadow: 'var(--shadow-lg)',
          paddingBottom: 'calc(24px + var(--safe-b))',
        }}
      >
        {/* Grab handle — the affordance that says "drag or tap away". */}
        <div className="flex justify-center pt-3 sm:hidden">
          <span
            className="h-1 w-10 rounded-full"
            style={{ background: 'var(--border-strong)' }}
          />
        </div>

        <button
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-[var(--bg-hover)]"
          style={{ color: 'var(--text-muted)' }}
        >
          <X size={16} />
        </button>

        <div className="flex flex-col items-center px-6 pt-6 text-center">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.16em]"
            style={{ color: 'var(--text-muted)' }}
          >
            {listening ? 'Listening' : processing ? 'Transcribing' : state === 'error' ? 'Problem' : 'Voice question'}
          </p>

          {/* The orb */}
          <div className="relative my-7 flex h-32 w-32 items-center justify-center">
            {listening && (
              <>
                <span
                  className="animate-pulse-ring absolute inset-0 rounded-full"
                  style={{ background: 'var(--spark-soft)' }}
                />
                <span
                  className="animate-pulse-ring absolute inset-0 rounded-full"
                  style={{ background: 'var(--spark-soft)', animationDelay: '0.6s' }}
                />
              </>
            )}
            <div
              className="relative flex h-24 w-24 items-center justify-center rounded-full transition-colors"
              style={{
                background: listening
                  ? 'linear-gradient(150deg, var(--spark) 0%, var(--spark-strong) 100%)'
                  : 'var(--accent)',
                color: listening ? '#fff' : 'var(--accent-on)',
                boxShadow: listening
                  ? '0 16px 40px rgba(217, 122, 43, 0.4)'
                  : 'var(--shadow-ink)',
              }}
            >
              {processing ? (
                <Loader2 size={30} className="animate-spin" />
              ) : listening ? (
                <div className="flex h-9 items-center gap-[3px]">
                  {levels.map((level, i) => (
                    <span
                      key={i}
                      className="w-[3px] rounded-full bg-white"
                      style={{
                        height: `${Math.round(level * 34)}px`,
                        transition: 'height 90ms linear',
                      }}
                    />
                  ))}
                </div>
              ) : state === 'error' ? (
                <AlertCircle size={30} />
              ) : (
                <Mic size={30} />
              )}
            </div>
          </div>

          <p
            className="min-h-[3.5rem] px-2 text-[15px] leading-relaxed"
            style={{ color: transcript ? 'var(--text-primary)' : 'var(--text-muted)' }}
          >
            {state === 'error'
              ? error
              : transcript
              ? `“${transcript}”`
              : listening
              ? `Ask your question out loud · ${formatElapsed(elapsed)}`
              : processing
              ? 'Turning speech into text…'
              : 'Tap the mic to start'}
          </p>

          <div className="mt-6 flex w-full flex-col gap-2">
            {listening && (
              <Button size="lg" onClick={stop} className="w-full">
                <Check size={16} />
                Done
              </Button>
            )}

            {transcript && !listening && !processing && (
              <>
                <Button size="lg" className="w-full" onClick={() => submit(transcript)}>
                  <CornerDownLeft size={16} />
                  Ask this
                </Button>
                <Button
                  size="lg"
                  variant="secondary"
                  className="w-full"
                  onClick={() => {
                    setTranscript('');
                    reset();
                    start();
                  }}
                >
                  <Mic size={16} />
                  Record again
                </Button>
              </>
            )}

            {state === 'error' && (
              <Button
                size="lg"
                variant="secondary"
                className="w-full"
                onClick={() => {
                  reset();
                  start();
                }}
              >
                Try again
              </Button>
            )}
          </div>

          <p className="mt-4 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Audio is transcribed by your own backend — nothing leaves your tenant.
          </p>
        </div>
      </div>
    </div>
  );
}
