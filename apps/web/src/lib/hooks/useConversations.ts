'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, extractApiError } from '@/lib/api/client';

export interface Conversation {
  id: string;
  status: 'BOT' | 'HUMAN' | 'RESOLVED' | 'ARCHIVED';
  unreadCount: number;
  lastMessageAt: string | null;
  contact: {
    id: string;
    name?: string;
    pushName?: string;
    phone: string;
    avatarUrl?: string;
  };
  assignedUser?: { id: string; name: string };
}

export interface Message {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  type: string;
  content?: string;
  mediaUrl?: string;
  status: string;
  fromBot: boolean;
  createdAt: string;
}

export function useConversations(status?: string) {
  return useQuery({
    queryKey: ['conversations', status],
    queryFn: async () => {
      const { data } = await api.get<{ items: Conversation[] }>('/conversations', {
        params: status ? { status } : undefined,
      });
      return data.items;
    },
    refetchInterval: 10_000,
  });
}

export function useConversationMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ['conversation-messages', conversationId],
    queryFn: async () => {
      const { data } = await api.get<{ items: Message[] }>(
        `/conversations/${conversationId}/messages`,
      );
      return data.items;
    },
    enabled: !!conversationId,
    refetchInterval: 5_000,
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, text }: { conversationId: string; text: string }) => {
      const { data } = await api.post(`/conversations/${conversationId}/messages`, { text });
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['conversation-messages', vars.conversationId] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (e) => toast.error(extractApiError(e)),
  });
}

export function useTakeOver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) => {
      await api.post(`/conversations/${conversationId}/take-over`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversations'] });
      toast.success('Você assumiu esta conversa');
    },
    onError: (e) => toast.error(extractApiError(e)),
  });
}

export function useReleaseToBot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) => {
      await api.post(`/conversations/${conversationId}/release`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversations'] });
      toast.success('Conversa devolvida ao bot');
    },
    onError: (e) => toast.error(extractApiError(e)),
  });
}
