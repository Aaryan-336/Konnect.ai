'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowUp, Sparkles, Loader2, MessageSquarePlus, Bot, ShieldCheck, Mic } from 'lucide-react';
import MessageBubble, { ChatMessage } from './MessageBubble';
import { useVoice, useVoiceTarget } from '@/components/voice/VoiceProvider';
import { api } from '@/lib/api';
import { readSSE } from '@/lib/sse';
import { emptyResponse, toStructuredResponse, type StructuredResponse } from '@/lib/response';

interface AgentData {
  id: string;
  name: string;
  description?: string;
  suggested_prompts?: string[];
  ui_config?: any;
}

interface ChatWindowProps {
  agent: AgentData;
  initialQuery?: string;
  conversationId?: string;
  onConversationCreated?: (id: string) => void;
}

export default function ChatWindow({
  agent,
  initialQuery,
  conversationId: propConversationId,
  onConversationCreated,
}: ChatWindowProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>(propConversationId);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { open: openVoice } = useVoice();
  // Guards the initial-query effect so a re-render never re-sends it.
  const autoSentRef = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /** Replace the in-flight assistant message (always the last one). */
  const updateAssistant = useCallback(
    (patch: (msg: ChatMessage) => ChatMessage) => {
      setMessages((prev) => {
        const next = [...prev];
        for (let i = next.length - 1; i >= 0; i--) {
          if (next[i].role === 'assistant') {
            next[i] = patch(next[i]);
            break;
          }
        }
        return next;
      });
    },
    []
  );

  const handleSend = useCallback(
    async (queryText?: string) => {
      const text = (queryText ?? input).trim();
      if (!text || loading) return;

      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';

      setMessages((prev) => [
        ...prev,
        { role: 'user', content: text },
        { role: 'assistant', content: '', isStreaming: true, stage: 'retrieving', response: emptyResponse() },
      ]);
      setLoading(true);

      // Accumulated outside React state so streaming tokens never race a
      // stale closure over `messages`.
      let prose = '';
      let structured: StructuredResponse | null = null;
      let sawStructured = false;

      try {
        const response = await api.chatStream(agent.id, text, conversationId);
        if (!response.ok) {
          const detail = await response.json().catch(() => null);
          throw new Error(detail?.detail || `Stream failed (${response.status})`);
        }

        for await (const evt of readSSE(response)) {
          let payload: any;
          try {
            payload = JSON.parse(evt.data);
          } catch {
            continue; // Ignore a malformed frame rather than aborting the answer.
          }

          switch (evt.event) {
            case 'meta': {
              if (payload.conversation_id && !conversationId) {
                setConversationId(payload.conversation_id);
                onConversationCreated?.(payload.conversation_id);
              }
              break;
            }

            case 'stage': {
              updateAssistant((m) => ({ ...m, stage: payload.stage }));
              break;
            }

            case 'source': {
              // Show provenance while the answer is still being written.
              updateAssistant((m) => ({
                ...m,
                response: {
                  ...(m.response ?? emptyResponse()),
                  sources: [...(m.response?.sources ?? []), payload],
                },
              }));
              break;
            }

            case 'token': {
              prose += payload.text ?? '';
              updateAssistant((m) => ({ ...m, content: prose }));
              break;
            }

            case 'structured': {
              sawStructured = true;
              structured = toStructuredResponse(payload, prose);
              // The server flags the case where the streamed prose is not the
              // real answer (malformed generation) and must be discarded.
              if (payload.replace_answer) prose = structured.answer;
              updateAssistant((m) => ({
                ...m,
                content: prose || structured!.answer,
                response: structured!,
              }));
              break;
            }

            case 'done': {
              updateAssistant((m) => ({ ...m, id: payload.message_id, isStreaming: false }));
              break;
            }

            case 'error': {
              updateAssistant((m) => ({
                ...m,
                content: payload.text || 'The request failed.',
                response: { ...(m.response ?? emptyResponse()), confidence: 'insufficient' },
                isStreaming: false,
              }));
              break;
            }
          }
        }

        // A stream that ends without a structured frame still has to settle.
        if (!sawStructured) {
          updateAssistant((m) => ({
            ...m,
            content: prose || 'No answer was generated.',
            isStreaming: false,
          }));
        } else {
          updateAssistant((m) => ({ ...m, isStreaming: false }));
        }
      } catch (streamError: any) {
        // Fall back to the non-streaming endpoint, which returns the same
        // structured contract in one response.
        try {
          const fallback = await api.chat(agent.id, text, conversationId);
          const data = toStructuredResponse(fallback.response);
          updateAssistant((m) => ({
            ...m,
            content: data.answer,
            response: data,
            isStreaming: false,
          }));
          if (fallback.conversation_id && !conversationId) {
            setConversationId(fallback.conversation_id);
            onConversationCreated?.(fallback.conversation_id);
          }
        } catch (fallbackError: any) {
          updateAssistant((m) => ({
            ...m,
            content:
              fallbackError?.message ||
              streamError?.message ||
              'The request failed. Please try again.',
            response: { ...emptyResponse(), confidence: 'insufficient' },
            isStreaming: false,
          }));
        }
      } finally {
        setLoading(false);
      }
    },
    [agent.id, conversationId, input, loading, onConversationCreated, updateAssistant]
  );

  // Load an existing conversation, including its stored structured blocks.
  useEffect(() => {
    if (!propConversationId) return;
    setConversationId(propConversationId);
    api
      .getMessages(propConversationId)
      .then((dbMessages) => {
        setMessages(
          dbMessages.map((m: any) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
            response:
              m.role === 'assistant' ? toStructuredResponse(m.response, m.content) : undefined,
          }))
        );
      })
      .catch(() => {});
  }, [propConversationId]);

  // Fire a query passed in via the URL, exactly once.
  useEffect(() => {
    if (initialQuery && !autoSentRef.current) {
      autoSentRef.current = true;
      handleSend(initialQuery);
    }
  }, [initialQuery, handleSend]);

  // While a chat is on screen the dock's mic drops its transcript straight
  // into this composer instead of routing to a new conversation.
  useVoiceTarget((text) => {
    setInput((prev) => (prev ? `${prev} ${text}` : text));
    textareaRef.current?.focus();
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
  };

  const startNewChat = () => {
    setMessages([]);
    setConversationId(undefined);
    setInput('');
  };

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--r-xl)',
        boxShadow: 'var(--shadow-sm)',
        // Fills the viewport that is left once the top bar and (on phones) the
        // dock have taken their share. dvh keeps it stable while mobile
        // browser chrome collapses.
        height: 'calc(100dvh - var(--topbar-h) - var(--dock-h) - var(--safe-b) - 96px)',
        minHeight: 420,
      }}
    >
      {/* Header */}
      <div
        className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3 sm:px-5"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px]"
            style={{ background: 'var(--tint-lavender)', color: 'var(--tint-lavender-ink)' }}
          >
            <Bot size={19} />
          </span>
          <div className="min-w-0">
            <h2
              className="truncate text-[14px] font-semibold tracking-[-0.01em]"
              style={{ color: 'var(--text-primary)' }}
            >
              {agent.name}
            </h2>
            <p className="truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {agent.description || 'Grounded knowledge assistant'}
            </p>
          </div>
        </div>

        {messages.length > 0 && (
          <button
            onClick={startNewChat}
            className="flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors hover:bg-[var(--bg-hover)]"
            style={{
              borderColor: 'var(--border-primary)',
              background: 'var(--bg-card)',
              color: 'var(--text-secondary)',
            }}
          >
            <MessageSquarePlus size={13} />
            <span className="hidden sm:inline">New chat</span>
          </button>
        )}
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto px-4 py-5 sm:px-6"
        style={{ background: 'var(--bg-inset)' }}
      >
        {messages.length === 0 && (
          <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center py-10 text-center">
            <span
              className="mb-4 flex h-14 w-14 items-center justify-center rounded-[18px]"
              style={{ background: 'var(--tint-peach)', color: 'var(--tint-peach-ink)' }}
            >
              <Sparkles size={24} />
            </span>
            <h3
              className="text-[17px] font-semibold tracking-[-0.02em]"
              style={{ color: 'var(--text-primary)' }}
            >
              Ask {agent.name}
            </h3>
            <p
              className="mb-7 mt-1.5 text-[13px] leading-relaxed"
              style={{ color: 'var(--text-secondary)' }}
            >
              Answers come only from your authorised documents, with citations, tables and
              charts built from the source data.
            </p>

            {agent.suggested_prompts && agent.suggested_prompts.length > 0 && (
              <div className="w-full space-y-2 text-left">
                <span
                  className="block text-[10px] font-semibold uppercase tracking-[0.14em]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Try asking
                </span>
                {agent.suggested_prompts.map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(prompt)}
                    className="w-full rounded-[14px] border p-3.5 text-left text-[13px] transition-all hover:-translate-y-0.5 hover:border-[var(--border-strong)]"
                    style={{
                      background: 'var(--bg-card)',
                      borderColor: 'var(--border-primary)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((msg, idx) => (
          <MessageBubble
            key={msg.id ?? idx}
            message={msg}
            agentName={agent.name}
            onSelectPrompt={(p) => handleSend(p)}
          />
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <div
        className="shrink-0 border-t p-3 sm:p-4"
        style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-card)' }}
      >
        <div
          className="flex items-end gap-2 p-1.5 transition-colors focus-within:border-[var(--accent)]"
          style={{
            background: 'var(--bg-inset)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--r-lg)',
          }}
        >
          <button
            type="button"
            onClick={openVoice}
            disabled={loading}
            aria-label="Ask by voice"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] transition-transform active:scale-90 disabled:opacity-40"
            style={{
              background: 'var(--spark-soft)',
              color: 'var(--spark-strong)',
            }}
          >
            <Mic size={18} />
          </button>

          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={handleTextareaInput}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question…"
            disabled={loading}
            className="max-h-[180px] min-w-0 flex-1 resize-none bg-transparent px-1 py-2.5 text-[14px] leading-relaxed outline-none placeholder:text-[var(--text-muted)] disabled:opacity-50"
            style={{ color: 'var(--text-primary)' }}
          />

          <button
            type="button"
            onClick={() => handleSend()}
            disabled={!input.trim() || loading}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] transition-all active:scale-90 disabled:opacity-25"
            style={{ background: 'var(--accent)', color: 'var(--accent-on)' }}
            aria-label="Send message"
          >
            {loading ? <Loader2 size={17} className="animate-spin" /> : <ArrowUp size={18} />}
          </button>
        </div>

        <div
          className="mt-2 flex items-center justify-between gap-3 px-1 text-[10px]"
          style={{ color: 'var(--text-muted)' }}
        >
          <span className="hidden sm:inline">Enter to send · Shift + Enter for a new line</span>
          <span className="flex items-center gap-1">
            <ShieldCheck size={11} />
            Grounded in your documents · no web search
          </span>
        </div>
      </div>
    </div>
  );
}
