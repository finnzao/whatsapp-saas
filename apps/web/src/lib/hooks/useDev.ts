'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, extractApiError } from '@/lib/api/client';

export type DevEntity =
  | 'products'
  | 'contacts'
  | 'conversations'
  | 'messages'
  | 'faqs'
  | 'customFields'
  | 'settings'
  | 'orders'
  | 'categories';

export interface DevOverview {
  tenantId: string;
  counts: Record<string, number>;
}

export function useDevOverview() {
  return useQuery({
    queryKey: ['dev', 'overview'],
    queryFn: async () => {
      const { data } = await api.get<DevOverview>('/dev/overview');
      return data;
    },
    staleTime: 10_000,
  });
}

export function useDevEntity(entity: DevEntity | null, limit = 50) {
  return useQuery({
    queryKey: ['dev', 'entity', entity, limit],
    queryFn: async () => {
      if (!entity) return null;
      const { data } = await api.get<unknown[] | Record<string, unknown>>(
        `/dev/entities/${entity}`,
        { params: { limit } },
      );
      return data;
    },
    enabled: Boolean(entity),
  });
}

export function useDeleteRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ entity, id }: { entity: DevEntity; id: string }) => {
      const { data } = await api.delete(`/dev/entities/${entity}/${id}`);
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['dev'] });
      toast.success(`${vars.entity}/${vars.id.slice(0, 8)} removido`);
    },
    onError: (e) => toast.error(extractApiError(e)),
  });
}

export function useDeleteAll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entity: DevEntity) => {
      const { data } = await api.delete<{ deleted: number }>(`/dev/entities/${entity}`);
      return data;
    },
    onSuccess: (data, entity) => {
      qc.invalidateQueries({ queryKey: ['dev'] });
      toast.success(`${data.deleted} registros de ${entity} removidos`);
    },
    onError: (e) => toast.error(extractApiError(e)),
  });
}

export interface TestSearchResult {
  query: string;
  tokens: string[];
  resultsCount: number;
  results: Array<{
    id: string;
    name: string;
    price: number;
    stock: number;
    customFields: Record<string, unknown> | null;
  }>;
}

export function useTestSearch() {
  return useMutation({
    mutationFn: async (payload: { query: string; limit?: number }) => {
      const { data } = await api.post<TestSearchResult>('/dev/test-search', payload);
      return data;
    },
    onError: (e) => toast.error(extractApiError(e)),
  });
}

export function useSeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ summary: string }>('/dev/seed');
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['dev'] });
      toast.success(`Seed ok: ${data.summary}`);
    },
    onError: (e) => toast.error(extractApiError(e)),
  });
}
