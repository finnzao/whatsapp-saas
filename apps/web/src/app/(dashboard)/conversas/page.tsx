'use client';

import { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, CheckCircle2 } from 'lucide-react';
import {
  useConversations,
  useConversationMessages,
  useSendMessage,
  useTakeOver,
  useReleaseToBot,
  Conversation,
} from '@/lib/hooks/useConversations';
import { cn, formatPhone, formatRelativeTime } from '@/lib/utils';

export default function ConversasPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  const { data: conversations = [], isLoading } = useConversations(statusFilter);
  const selected = conversations.find((c) => c.id === selectedId);

  return (
    <div className="flex h-screen">
      {/* Lista de conversas */}
      <div className="flex w-96 flex-col border-r border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3">
          <h1 className="text-lg font-semibold text-gray-900">Conversas</h1>
          <div className="mt-3 flex gap-2">
            <FilterButton active={!statusFilter} onClick={() => setStatusFilter(undefined)}>
              Todas
            </FilterButton>
            <FilterButton active={statusFilter === 'BOT'} onClick={() => setStatusFilter('BOT')}>
              Bot
            </FilterButton>
            <FilterButton active={statusFilter === 'HUMAN'} onClick={() => setStatusFilter('HUMAN')}>
              Humano
            </FilterButton>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading && <div className="p-4 text-sm text-gray-500">Carregando...</div>}
          {!isLoading && conversations.length === 0 && (
            <div className="p-8 text-center text-sm text-gray-500">
              Nenhuma conversa ainda. Quando um cliente mandar mensagem no WhatsApp, ela aparecerá aqui.
            </div>
          )}
          {conversations.map((c) => (
            <ConversationItem
              key={c.id}
              conversation={c}
              selected={c.id === selectedId}
              onClick={() => setSelectedId(c.id)}
            />
          ))}
        </div>
      </div>

      {/* Chat */}
      <div className="flex flex-1 flex-col bg-gray-50">
        {selected ? (
          <ChatWindow conversation={selected} />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-500">
            Selecione uma conversa para começar
          </div>
        )}
      </div>
    </div>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-full px-3 py-1 text-xs font-medium transition',
        active ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
      )}
    >
      {children}
    </button>
  );
}

function ConversationItem({
  conversation,
  selected,
  onClick,
}: {
  conversation: Conversation;
  selected: boolean;
  onClick: () => void;
}) {
  const displayName = conversation.contact.name ?? conversation.contact.pushName ?? formatPhone(conversation.contact.phone);

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-3 border-b border-gray-100 px-4 py-3 text-left transition hover:bg-gray-50',
        selected && 'bg-brand-50',
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
        {displayName.slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <p className="truncate text-sm font-medium text-gray-900">{displayName}</p>
          {conversation.lastMessageAt && (
            <span className="text-xs text-gray-500">{formatRelativeTime(conversation.lastMessageAt)}</span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <StatusBadge status={conversation.status} />
          {conversation.unreadCount > 0 && (
            <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">
              {conversation.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { icon: any; label: string; className: string }> = {
    BOT: { icon: Bot, label: 'Bot', className: 'bg-blue-100 text-blue-700' },
    HUMAN: { icon: User, label: 'Humano', className: 'bg-amber-100 text-amber-700' },
    RESOLVED: { icon: CheckCircle2, label: 'Resolvida', className: 'bg-green-100 text-green-700' },
    ARCHIVED: { icon: CheckCircle2, label: 'Arquivada', className: 'bg-gray-100 text-gray-600' },
  };
  const c = config[status] ?? config.BOT;
  const Icon = c.icon;
  return (
    <span className={cn('badge', c.className)}>
      <Icon className="mr-1 h-3 w-3" />
      {c.label}
    </span>
  );
}

function ChatWindow({ conversation }: { conversation: Conversation }) {
  const [text, setText] = useState('');
  const { data: messages = [] } = useConversationMessages(conversation.id);
  const send = useSendMessage();
  const takeOver = useTakeOver();
  const release = useReleaseToBot();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = () => {
    if (!text.trim()) return;
    send.mutate({ conversationId: conversation.id, text });
    setText('');
  };

  const displayName = conversation.contact.name ?? conversation.contact.pushName ?? formatPhone(conversation.contact.phone);

  return (
    <>
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
        <div>
          <h2 className="font-semibold text-gray-900">{displayName}</h2>
          <p className="text-xs text-gray-500">{formatPhone(conversation.contact.phone)}</p>
        </div>
        <div className="flex gap-2">
          {conversation.status === 'BOT' ? (
            <button onClick={() => takeOver.mutate(conversation.id)} className="btn-primary text-xs">
              Assumir conversa
            </button>
          ) : (
            <button onClick={() => release.mutate(conversation.id)} className="btn-secondary text-xs">
              Devolver ao bot
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-3">
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn('flex', m.direction === 'OUTBOUND' ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cn(
                  'max-w-md rounded-lg px-4 py-2 text-sm shadow-sm',
                  m.direction === 'OUTBOUND'
                    ? m.fromBot
                      ? 'bg-blue-100 text-blue-900'
                      : 'bg-brand-600 text-white'
                    : 'bg-white text-gray-900',
                )}
              >
                {m.fromBot && (
                  <div className="mb-1 flex items-center gap-1 text-xs opacity-70">
                    <Bot className="h-3 w-3" /> Bot
                  </div>
                )}
                <p className="whitespace-pre-wrap">{m.content}</p>
                <p className="mt-1 text-xs opacity-60">{formatRelativeTime(m.createdAt)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-gray-200 bg-white p-4">
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="Digite sua mensagem..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            disabled={conversation.status === 'BOT'}
          />
          <button
            onClick={handleSend}
            className="btn-primary"
            disabled={!text.trim() || send.isPending || conversation.status === 'BOT'}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        {conversation.status === 'BOT' && (
          <p className="mt-2 text-xs text-gray-500">
            O bot está atendendo esta conversa. Clique em "Assumir conversa" para responder manualmente.
          </p>
        )}
      </div>
    </>
  );
}
