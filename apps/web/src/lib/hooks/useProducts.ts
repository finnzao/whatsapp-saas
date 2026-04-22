'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, extractApiError } from '@/lib/api/client';

export interface Product {
  id: string;
  name: string;
  description?: string;
  sku?: string;
  price: string | number;
  priceCash?: string | number;
  priceInstallment?: string | number;
  installments?: number;
  stock: number;
  trackStock: boolean;
  condition: string;
  warranty?: string;
  images: string[];
  active: boolean;
  paused: boolean;
  category?: { id: string; name: string };
  categoryId?: string;
  customFields?: Record<string, unknown> | null;
}

interface ProductsResponse {
  items: Product[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export function useProducts(search?: string) {
  return useQuery({
    queryKey: ['products', search],
    queryFn: async () => {
      const { data } = await api.get<ProductsResponse>('/products', {
        params: { search, pageSize: 50 },
      });
      return data;
    },
  });
}

export function useProduct(id: string | null) {
  return useQuery({
    queryKey: ['product', id],
    queryFn: async () => {
      const { data } = await api.get<Product>(`/products/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useTogglePause() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.patch<Product>(`/products/${id}/toggle-pause`);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      toast.success('Produto atualizado');
    },
    onError: (e) => toast.error(extractApiError(e)),
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<Product>) => {
      const { data } = await api.post<Product>('/products', payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      toast.success('Produto criado');
    },
    onError: (e) => toast.error(extractApiError(e)),
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: Partial<Product> & { id: string }) => {
      const { data } = await api.patch<Product>(`/products/${id}`, payload);
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['product', vars.id] });
      toast.success('Produto atualizado');
    },
    onError: (e) => toast.error(extractApiError(e)),
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/products/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      toast.success('Produto removido');
    },
    onError: (e) => toast.error(extractApiError(e)),
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data } = await api.get<Array<{ id: string; name: string }>>('/categories');
      return data;
    },
  });
}
