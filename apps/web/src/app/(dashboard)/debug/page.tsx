'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Send,
  Bot,
  User,
  RefreshCw,
  Bug,
  AlertTriangle,
  Wifi,
  WifiOff,
  Loader2,
} from 'lucide-react';
import { api, extractApiError } from '@/lib/api/client';
import { cn, formatRelativeTime } from '@/lib/utils';
import { useDebugStream, DebugStreamEvent } from '@/lib/hooks/useDebugStream';

interface DebugMessage {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  content: string | null;
  fromBot: boolean;
  createdAt: string;
}

interface HistoryResponse {
  conversationId: string | null;
  status?: string;
  messages: DebugMessage[];
}

interface LocalEvent {
  id: string;
  kind: 'user' | 'bot' | 'handoff' | 'error';
  content: string;
  reason?: string;
  timestamp: string;
}

let eventSeq = 0;
const nextId = () => `local-${Date.now()}-${++eventSeq}`;

export default function DebugPage() {
  const [text, setText] = useState('');
  const [contactName, setContactName] = useState('Cliente Teste');
  const [localEvents, setLocalEvents] = useState<LocalEvent[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isHumanMode, setIsHumanMode] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const { data: history } = useQuery({
    queryKey: ['debug-history'],
    queryFn: async () => {
      const { data } = await api.get<HistoryResponse>('/debug/history');
      return data;
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  });

  useEffect(() => {
    if (!history) return;
    setIsHumanMode(history.status === 'HUMAN');
    setLocalEvents(
      history.messages.map((m) => ({
        id: m.id,
        kind: m.direction === 'INBOUND' ? 'user' : 'bot',
        content: m.content ?? '',
        timestamp: m.createdAt,
      })),
    );
  }, [history?.conversationId]);

  const handleEvent = useCallback((event: DebugStreamEvent) => {
    switch (event.type) {
      case 'user_message':
        setLocalEvents((prev) => [
          ...prev,
          { id: nextId(), kind: 'user', content: event.content, timestamp: event.timestamp },
        ]);
        break;
      case 'typing_start':
        setIsTyping(true);
        break;
      case 'typing_end':
        setIsTyping(false);
        setPendingCount((n) => Math.max(0, n - 1));
        break;
      case 'bot_reply':
        setLocalEvents((prev) => [
          ...prev,
          { id: nextId(), kind: 'bot', content: event.content, timestamp: event.timestamp },
        ]);
        break;
      case 'handoff':
        setIsHumanMode(true);
        setLocalEvents((prev) => [
          ...prev,
          {
            id: nextId(),
            kind: 'handoff',
            content: event.content,
            reason: event.reason,
            timestamp: event.timestamp,
          },
        ]);
        toast.info(`Handoff: ${event.reason}`);
        break;
      case 'error':
        setLocalEvents((prev) => [
          ...prev,
          { id: nextId(), kind: 'error', content: event.content, timestamp: event.timestamp },
        ]);
        toast.error(event.content);
        break;
    }
  }, []);

  const { status: streamStatus } = useDebugStream({ onEvent: handleEvent });

  const simulate = useMutation({
    mutationFn: async (payload: { text: string; contactName: string }) => {
      await api.post('/debug/simulate-inbound', payload);
    },
    onError: (e) => toast.error(extractApiError(e)),
  });

  const reset = useMutation({
    mutationFn: async () => {
      await api.delete('/debug/reset');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['debug-history'] });
      setLocalEvents([]);
      setIsHumanMode(false);
      setIsTyping(false);
      setPendingCount(0);
      toast.success('Conversa resetada');
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [localEvents.length, isTyping]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || isHumanMode) return;
    simulate.mutate({ text: trimmed, contactName });
    setText('');
    setPendingCount((n) => n + 1);
    inputRef.current?.focus();
  };

  return (
    <div className="flex h-screen flex-col">
      <div className="flex items-center justify-between border-b border-gray-200 bg-amber-50 px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-amber-100 p-2">
            <Bug className="h-5 w-5 text-amber-700" />
          </div>
          <div>
            <h1 className="font-semibold text-gray-900">Modo Debug</h1>
            <p className="text-xs text-gray-600">
              Simule mensagens em tempo real, sem bloquear o input. Conexão por SSE.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StreamStatusBadge status={streamStatus} />
          <button
            onClick={() => confirm('Apagar conversa de debug?') && reset.mutate()}
            className="btn-secondary text-xs"
          >
            <RefreshCw className="h-3 w-3" /> Resetar conversa
          </button>
        </div>
      </div>

      {isHumanMode && (
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-100 px-6 py-2 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4" />
          Conversa transferida para humano. O bot não responderá mais até você resetar.
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-gray-50 p-6">
        <div className="mx-auto max-w-2xl space-y-3">
          {localEvents.length === 0 && !isTyping && (
            <div className="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
              Nenhuma mensagem ainda. Digite abaixo como se fosse um cliente.
              <br />
              <span className="mt-2 block text-xs">
                Você pode mandar várias mensagens em sequência sem esperar a resposta.
              </span>
            </div>
          )}

          {localEvents.map((ev) => (
            <EventBubble key={ev.id} event={ev} />
          ))}

          {isTyping && <TypingBubble />}
        </div>
      </div>

      <div className="border-t border-gray-200 bg-white p-4">
        <div className="mx-auto max-w-2xl space-y-2">
          <div className="flex gap-2">
            <input
              className="input w-48"
              placeholder="Nome do cliente"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
            />
            {pendingCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 text-xs font-medium text-blue-700">
                <Loader2 className="h-3 w-3 animate-spin" />
                {pendingCount} processando
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              className="input flex-1"
              placeholder="Digite e mande quantas quiser..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              disabled={isHumanMode}
              autoFocus
            />
            <button
              onClick={handleSend}
              className="btn-primary"
              disabled={!text.trim() || isHumanMode}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Enter para enviar. O input nunca trava — respostas chegam via SSE em tempo real.
          </p>
        </div>
      </div>
    </div>
  );
}

function EventBubble({ event }: { event: LocalEvent }) {
  if (event.kind === 'handoff') {
    return (
      <div className="flex justify-center">
        <div className="max-w-md rounded-lg bg-amber-100 px-4 py-2 text-center text-xs text-amber-900 shadow-sm">
          <AlertTriangle className="mr-1 inline h-3 w-3" />
          {event.content}
          {event.reason && <div className="mt-0.5 text-[11px] opacity-80">Motivo: {event.reason}</div>}
        </div>
      </div>
    );
  }

  if (event.kind === 'error') {
    return (
      <div className="flex justify-center">
        <div className="max-w-md rounded-lg bg-red-100 px-4 py-2 text-center text-xs text-red-900 shadow-sm">
          {event.content}
        </div>
      </div>
    );
  }

  const isUser = event.kind === 'user';
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-md rounded-lg px-4 py-2 text-sm shadow-sm',
          isUser ? 'bg-brand-600 text-white' : 'bg-blue-100 text-blue-900',
        )}
      >
        <div className="mb-1 flex items-center gap-1 text-xs opacity-70">
          {isUser ? (
            <>
              <User className="h-3 w-3" /> Você (cliente)
            </>
          ) : (
            <>
              <Bot className="h-3 w-3" /> Bot
            </>
          )}
        </div>
        <p className="whitespace-pre-wrap">{event.content}</p>
        <p className="mt-1 text-xs opacity-60">{formatRelativeTime(event.timestamp)}</p>
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex justify-start">
      <div className="rounded-lg bg-blue-100 px-4 py-2.5 text-sm text-blue-900 shadow-sm">
        <div className="flex items-center gap-2">
          <Bot className="h-3 w-3" />
          <span className="flex gap-1">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-700 [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-700 [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-700" />
          </span>
        </div>
      </div>
    </div>
  );
}

function StreamStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; icon: any; className: string }> = {
    idle: { label: 'Inativo', icon: WifiOff, className: 'bg-gray-100 text-gray-600' },
    connecting: { label: 'Conectando', icon: Loader2, className: 'bg-amber-100 text-amber-700' },
    open: { label: 'Conectado', icon: Wifi, className: 'bg-green-100 text-green-700' },
    closed: { label: 'Fechado', icon: WifiOff, className: 'bg-gray-100 text-gray-600' },
    error: { label: 'Reconectando', icon: Loader2, className: 'bg-red-100 text-red-700' },
  };
  const c = config[status] ?? config.idle;
  const Icon = c.icon;
  const animate = status === 'connecting' || status === 'error';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        c.className,
      )}
    >
      <Icon className={cn('h-3 w-3', animate && 'animate-spin')} />
      {c.label}
    </span>
  );
}
