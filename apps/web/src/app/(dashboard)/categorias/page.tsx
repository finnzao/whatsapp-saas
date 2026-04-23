'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Plus,
  Pencil,
  Trash2,
  FolderOpen,
  X as XIcon,
  Check,
  GripVertical,
  AlertCircle,
} from 'lucide-react';
import {
  useCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  Category,
} from '@/lib/hooks/useCategories';
import { cn } from '@/lib/utils';
import { categorySchema, type CategoryInput } from '@/lib/validation/schemas';
import { ValidatedInput } from '@/components/ui/ValidatedInput';
import { ValidatedTextarea } from '@/components/ui/ValidatedTextarea';

export default function CategoriasPage() {
  const { data: categories = [], isLoading } = useCategories();
  const deleteCategory = useDeleteCategory();
  const [modalState, setModalState] = useState<{ open: boolean; category: Category | null }>({
    open: false,
    category: null,
  });

  const activeCount = categories.filter((c) => c.active).length;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Categorias</h1>
          <p className="text-sm text-gray-500">
            {categories.length} categoria(s) · {activeCount} ativa(s). A IA usa essas categorias
            para responder quando o cliente pergunta o que a loja vende.
          </p>
        </div>
        <button
          onClick={() => setModalState({ open: true, category: null })}
          className="btn-primary shrink-0"
        >
          <Plus className="h-4 w-4" /> Nova categoria
        </button>
      </div>

      {categories.length === 0 && !isLoading && (
        <div className="card mb-6 border-amber-200 bg-amber-50">
          <div className="flex gap-3 p-4">
            <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
            <div className="text-sm text-amber-900">
              <strong>Crie categorias para a IA responder corretamente.</strong> Sem categorias
              cadastradas, a IA pode inventar ("temos celulares, notebooks...") quando perguntada
              "o que vocês vendem?". Cadastre as categorias reais da sua loja e adicione uma
              descrição curta para cada uma.
            </div>
          </div>
        </div>
      )}

      {isLoading && <div className="text-sm text-gray-500">Carregando...</div>}

      <div className="space-y-2">
        {categories.map((cat) => (
          <CategoryCard
            key={cat.id}
            category={cat}
            onEdit={() => setModalState({ open: true, category: cat })}
            onDelete={() => {
              if (confirm(`Remover a categoria "${cat.name}"?`)) {
                deleteCategory.mutate(cat.id);
              }
            }}
          />
        ))}
      </div>

      {modalState.open && (
        <CategoryModal
          category={modalState.category}
          onClose={() => setModalState({ open: false, category: null })}
        />
      )}
    </div>
  );
}

function CategoryCard({
  category,
  onEdit,
  onDelete,
}: {
  category: Category;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const productCount = category._count?.products ?? 0;

  return (
    <div
      className={cn(
        'card flex items-start gap-3 p-4 transition',
        !category.active && 'opacity-60',
      )}
    >
      <div className="shrink-0 pt-1">
        <GripVertical className="h-4 w-4 text-gray-300" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-medium text-gray-900">{category.name}</h3>
          <span className="badge bg-gray-100 text-gray-700">#{category.order}</span>
          {!category.active && <span className="badge bg-red-100 text-red-700">Inativa</span>}
          <span className="badge bg-blue-50 text-blue-700">
            {productCount} produto{productCount !== 1 ? 's' : ''}
          </span>
        </div>
        {category.description ? (
          <p className="mt-1 text-sm text-gray-600">{category.description}</p>
        ) : (
          <p className="mt-1 text-xs italic text-amber-700">
            Sem descrição — adicione uma para a IA responder melhor
          </p>
        )}
        <p className="mt-0.5 text-xs text-gray-400">slug: {category.slug}</p>
      </div>

      <div className="flex shrink-0 gap-1">
        <button
          onClick={onEdit}
          className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          aria-label="Editar"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={onDelete}
          className="rounded p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
          aria-label="Remover"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function CategoryModal({
  category,
  onClose,
}: {
  category: Category | null;
  onClose: () => void;
}) {
  const isEditing = !!category;
  const create = useCreateCategory();
  const update = useUpdateCategory();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CategoryInput>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: category?.name ?? '',
      description: category?.description ?? '',
      order: category?.order ?? 0,
      active: category?.active ?? true,
    },
    mode: 'onBlur',
  });

  const onSubmit = (data: CategoryInput) => {
    const payload = {
      ...data,
      description: data.description || undefined,
    };
    if (isEditing) {
      update.mutate({ id: category.id, ...payload }, { onSuccess: onClose });
    } else {
      create.mutate(payload, { onSuccess: onClose });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold">
            {isEditing ? 'Editar categoria' : 'Nova categoria'}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-500 hover:bg-gray-100"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 p-6" noValidate>
          <ValidatedInput
            label="Nome"
            required
            placeholder="Ex: Celulares"
            error={errors.name?.message}
            helpText="O nome que aparece pro cliente quando a IA lista categorias"
            {...register('name')}
          />

          <ValidatedTextarea
            label="Descrição para a IA"
            rows={2}
            placeholder="Ex: iPhones e Androids, novos e seminovos, com garantia"
            error={errors.description?.message}
            helpText="Frase curta que a IA usa ao responder. Sem isso ela fala só o nome."
            {...register('description')}
          />

          <div className="grid grid-cols-2 gap-3">
            <ValidatedInput
              label="Ordem"
              type="number"
              min="0"
              error={errors.order?.message}
              helpText="Menor = aparece primeiro"
              {...register('order', { valueAsNumber: true })}
            />
            <div className="flex items-end">
              <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  {...register('active')}
                />
                <span className="font-medium text-gray-700">Categoria ativa</span>
              </label>
            </div>
          </div>

          <div className="flex gap-2 border-t border-gray-200 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary ml-auto"
              disabled={isSubmitting || create.isPending || update.isPending}
            >
              <Check className="h-4 w-4" />
              {create.isPending || update.isPending
                ? 'Salvando...'
                : isEditing
                  ? 'Salvar alterações'
                  : 'Criar categoria'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
