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

export interface CategoryTemplateGroup {
  id: string;
  name: string;
  description: string;
  segment: string;
  count: number;
  categories: Array<{
    name: string;
    slug: string;
    description: string;
    order: number;
  }>;
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

export function useCategoryTemplates() {
  return useQuery({
    queryKey: ['category-templates'],
    queryFn: async () => {
      const { data } = await api.get<CategoryTemplateGroup[]>('/categories/templates');
      return data;
    },
    staleTime: Infinity, // estes nunca mudam em runtime
  });
}

export function useImportCategoryTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { groupId: string; slugs?: string[] }) => {
      const { data } = await api.post<{
        imported: number;
        skipped: number;
        message?: string;
      }>('/categories/import-template', payload);
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      const noun = data.imported === 1 ? 'categoria importada' : 'categorias importadas';
      const skipMsg = data.skipped > 0 ? ` (${data.skipped} já existiam)` : '';
      if (data.imported === 0) {
        toast.info(data.message ?? 'Nenhuma categoria nova para importar');
      } else {
        toast.success(`${data.imported} ${noun}${skipMsg}`);
      }
    },
    onError: (e) => toast.error(extractApiError(e)),
  });
}
