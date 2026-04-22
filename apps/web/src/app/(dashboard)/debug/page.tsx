'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Send, Bot, User, RefreshCw, Bug, AlertTriangle } from 'lucide-react';
import { api, extractApiError } from '@/lib/api/client';
import { cn, formatRelativeTime } from '@/lib/utils';

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

interface SimulateResponse {
  conversationId: string;
  events: Array<{
    type: 'bot_reply' | 'handoff';
    content: string;
    reason?: string;
    timestamp: string;
  }>;
}

export default function DebugPage() {
  const [text, setText] = useState('');
  const [contactName, setContactName] = useState('Cliente Teste');
  const scrollRef = useRef<HTMLDivElement>(null);
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

  const simulate = useMutation({
    mutationFn: async (payload: { text: string; contactName: string }) => {
      const { data } = await api.post<SimulateResponse>('/debug/simulate-inbound', payload);
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['debug-history'] });
      if (data.events.length === 0) {
        toast.warning('Bot não respondeu dentro do timeout');
      }
      const handoff = data.events.find((e) => e.type === 'handoff');
      if (handoff) {
        toast.info(`Handoff: ${handoff.reason}`);
      }
    },
    onError: (e) => toast.error(extractApiError(e)),
  });

  const reset = useMutation({
    mutationFn: async () => {
      await api.delete('/debug/reset');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['debug-history'] });
      toast.success('Conversa resetada');
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [history?.messages.length]);

  const handleSend = () => {
    if (!text.trim()) return;
    simulate.mutate({ text, contactName });
    setText('');
  };

  const messages = history?.messages ?? [];
  const isHumanMode = history?.status === 'HUMAN';

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
              Simule mensagens de clientes sem conectar WhatsApp real.
            </p>
          </div>
        </div>
        <button
          onClick={() => confirm('Apagar conversa de debug?') && reset.mutate()}
          className="btn-secondary text-xs"
        >
          <RefreshCw className="h-3 w-3" /> Resetar conversa
        </button>
      </div>

      {isHumanMode && (
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-100 px-6 py-2 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4" />
          Conversa transferida para humano. O bot não responderá mais até você resetar.
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-gray-50 p-6">
        <div className="mx-auto max-w-2xl space-y-3">
          {messages.length === 0 && (
            <div className="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
              Nenhuma mensagem ainda. Digite abaixo como se fosse um cliente.
              <br />
              <span className="mt-2 block text-xs">
                Exemplos: "qual o horário?", "tem iPhone 13?", "quero falar com atendente"
              </span>
            </div>
          )}

          {messages.map((m) => (
            <div
              key={m.id}
              className={cn('flex', m.direction === 'OUTBOUND' ? 'justify-start' : 'justify-end')}
            >
              <div
                className={cn(
                  'max-w-md rounded-lg px-4 py-2 text-sm shadow-sm',
                  m.direction === 'OUTBOUND'
                    ? m.fromBot
                      ? 'bg-blue-100 text-blue-900'
                      : 'bg-white text-gray-900'
                    : 'bg-brand-600 text-white',
                )}
              >
                <div className="mb-1 flex items-center gap-1 text-xs opacity-70">
                  {m.direction === 'OUTBOUND' ? (
                    m.fromBot ? (
                      <>
                        <Bot className="h-3 w-3" /> Bot
                      </>
                    ) : (
                      <>
                        <User className="h-3 w-3" /> Atendente
                      </>
                    )
                  ) : (
                    <>
                      <User className="h-3 w-3" /> Você (cliente)
                    </>
                  )}
                </div>
                <p className="whitespace-pre-wrap">{m.content}</p>
                <p className="mt-1 text-xs opacity-60">{formatRelativeTime(m.createdAt)}</p>
              </div>
            </div>
          ))}

          {simulate.isPending && (
            <div className="flex justify-start">
              <div className="rounded-lg bg-blue-100 px-4 py-2 text-sm text-blue-900 shadow-sm">
                <div className="flex items-center gap-2">
                  <Bot className="h-3 w-3" />
                  <span className="animate-pulse">Bot está processando...</span>
                </div>
              </div>
            </div>
          )}
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
          </div>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder="Digite como se fosse o cliente..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              disabled={simulate.isPending || isHumanMode}
            />
            <button
              onClick={handleSend}
              className="btn-primary"
              disabled={!text.trim() || simulate.isPending || isHumanMode}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Atalho: Enter para enviar. Essa conversa não envia nada para WhatsApp real.
          </p>
        </div>
      </div>
    </div>
  );
}
