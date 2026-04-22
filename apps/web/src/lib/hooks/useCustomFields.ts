'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, extractApiError } from '@/lib/api/client';
import type { CustomFieldDefinition } from '@/components/ui/CustomFieldRenderer';

export interface CreateFieldPayload {
  entity: string;
  key: string;
  label: string;
  type: CustomFieldDefinition['type'];
  options?: string[];
  required?: boolean;
  placeholder?: string;
  helpText?: string;
}

export function useCustomFieldDefinitions(entity?: string) {
  return useQuery({
    queryKey: ['custom-fields', entity],
    queryFn: async () => {
      const { data } = await api.get<CustomFieldDefinition[]>('/custom-fields', {
        params: entity ? { entity } : undefined,
      });
      return data;
    },
  });
}

export function useCreateCustomField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateFieldPayload) => {
      const { data } = await api.post<CustomFieldDefinition>('/custom-fields', payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['custom-fields'] });
      toast.success('Campo criado');
    },
    onError: (e) => toast.error(extractApiError(e)),
  });
}

export function useUpdateCustomField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...payload
    }: {
      id: string;
      label?: string;
      options?: string[];
      required?: boolean;
      placeholder?: string;
      helpText?: string;
    }) => {
      const { data } = await api.patch<CustomFieldDefinition>(`/custom-fields/${id}`, payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['custom-fields'] });
      toast.success('Campo atualizado');
    },
    onError: (e) => toast.error(extractApiError(e)),
  });
}

export function useDeleteCustomField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/custom-fields/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['custom-fields'] });
      toast.success('Campo removido');
    },
    onError: (e) => toast.error(extractApiError(e)),
  });
}
