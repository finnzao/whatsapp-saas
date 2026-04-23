'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, extractApiError } from '@/lib/api/client';

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  order: number;
  active: boolean;
  _count?: { products: number };
}

export interface CategoryInput {
  name: string;
  description?: string;
  order?: number;
  active?: boolean;
}

export function useCategories(onlyActive = false) {
  return useQuery({
    queryKey: ['categories', { onlyActive }],
    queryFn: async () => {
      const { data } = await api.get<Category[]>('/categories', {
        params: onlyActive ? { onlyActive: 'true' } : undefined,
      });
      return data;
    },
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CategoryInput) => {
      const { data } = await api.post<Category>('/categories', payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Categoria criada');
    },
    onError: (e) => toast.error(extractApiError(e)),
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: Partial<CategoryInput> & { id: string }) => {
      const { data } = await api.patch<Category>(`/categories/${id}`, payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Categoria atualizada');
    },
    onError: (e) => toast.error(extractApiError(e)),
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/categories/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Categoria removida');
    },
    onError: (e) => toast.error(extractApiError(e)),
  });
}
