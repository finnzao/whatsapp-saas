'use client';

import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
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
  Sparkles,
  Package,
  Info,
  Tag,
  FileText,
} from 'lucide-react';
import {
  useCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  useCategoryTemplates,
  useImportCategoryTemplate,
  Category,
} from '@/lib/hooks/useCategories';
import { cn } from '@/lib/utils';
import { categorySchema, type CategoryInput } from '@/lib/validation/schemas';
import { ValidatedInput } from '@/components/ui/ValidatedInput';
import { ValidatedTextarea } from '@/components/ui/ValidatedTextarea';
import { TagInput } from '@/components/ui/TagInput';

// Sugestões mostradas como helper text quando o usuário ainda não cadastrou
// nenhuma keyword. Genéricas o suficiente pra qualquer segmento.
const KEYWORD_SUGGESTIONS_HELP =
  'Adicione termos que o cliente usaria pra perguntar dessa categoria. Inclua sinônimos, plurais, ' +
  'erros comuns e marcas. Ex: para "Smartphones" use "celular, celulares, iphone, samsung, xiaomi".';

export default function CategoriasPage() {
  const { data: categories = [], isLoading } = useCategories();
  const deleteCategory = useDeleteCategory();
  const [modalState, setModalState] = useState<{ open: boolean; category: Category | null }>({
    open: false,
    category: null,
  });
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const activeCount = categories.filter((c) => c.active).length;
  const noCategoriesYet = !isLoading && categories.length === 0;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Categorias</h1>
          <p className="text-sm text-gray-500">
            {categories.length} categoria(s) · {activeCount} ativa(s). A IA usa essas categorias
            (e suas descrições + palavras-chave) ao identificar o que o cliente está pedindo.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setTemplatesOpen(true)} className="btn-secondary">
            <Sparkles className="h-4 w-4" /> Usar pacote pronto
          </button>
          <button
            onClick={() => setModalState({ open: true, category: null })}
            className="btn-primary"
          >
            <Plus className="h-4 w-4" /> Nova categoria
          </button>
        </div>
      </div>

      {noCategoriesYet && (
        <EmptyState onPickTemplate={() => setTemplatesOpen(true)} />
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

      {templatesOpen && (
        <TemplatesModal onClose={() => setTemplatesOpen(false)} />
      )}
    </div>
  );
}

function EmptyState({ onPickTemplate }: { onPickTemplate: () => void }) {
  return (
    <div className="card mb-6 border-amber-200 bg-amber-50">
      <div className="flex flex-col items-start gap-3 p-5 sm:flex-row">
        <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
        <div className="flex-1">
          <h3 className="font-medium text-amber-900">
            Nenhuma categoria cadastrada ainda
          </h3>
          <p className="mt-1 text-sm text-amber-900/90">
            Sem categorias, a IA pode inventar resposta quando o cliente perguntar
            "o que vocês vendem?". Comece em 30 segundos com um pacote pronto para o
            seu segmento — depois é só ajustar o que precisar.
          </p>
          <button onClick={onPickTemplate} className="btn-primary mt-3">
            <Sparkles className="h-4 w-4" /> Escolher pacote para minha loja
          </button>
        </div>
      </div>
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
  const keywordCount = category.keywords?.length ?? 0;
  const previewKeywords = (category.keywords ?? []).slice(0, 3);
  const remainingKeywords = Math.max(0, keywordCount - previewKeywords.length);

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
            <Package className="mr-1 h-3 w-3" />
            {productCount} produto{productCount !== 1 ? 's' : ''}
          </span>
          {keywordCount > 0 ? (
            <span className="badge bg-emerald-50 text-emerald-700">
              <Tag className="mr-1 h-3 w-3" />
              {keywordCount} palavra{keywordCount !== 1 ? 's' : ''}-chave
            </span>
          ) : (
            <span className="badge bg-amber-50 text-amber-700">
              <AlertCircle className="mr-1 h-3 w-3" />
              Sem palavras-chave
            </span>
          )}
        </div>
        {category.description ? (
          <p className="mt-1 text-sm text-gray-600">{category.description}</p>
        ) : (
          <p className="mt-1 text-xs italic text-amber-700">
            Sem descrição — adicione uma para a IA responder melhor
          </p>
        )}
        {previewKeywords.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {previewKeywords.map((kw) => (
              <span
                key={kw}
                className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800"
              >
                {kw}
              </span>
            ))}
            {remainingKeywords > 0 && (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                +{remainingKeywords}
              </span>
            )}
          </div>
        )}
        <p className="mt-1 text-xs text-gray-400">slug: {category.slug}</p>
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

type ModalTab = 'basic' | 'keywords';

function CategoryModal({
  category,
  onClose,
}: {
  category: Category | null;
  onClose: () => void;
}) {
  const isEditing = !!category;
  const [tab, setTab] = useState<ModalTab>('basic');
  const create = useCreateCategory();
  const update = useUpdateCategory();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CategoryInput>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: category?.name ?? '',
      description: category?.description ?? '',
      keywords: category?.keywords ?? [],
      order: category?.order ?? 0,
      active: category?.active ?? true,
    },
    mode: 'onBlur',
  });

  const onSubmit = (data: CategoryInput) => {
    const payload = {
      ...data,
      description: data.description || undefined,
      keywords: data.keywords ?? [],
    };
    if (isEditing) {
      update.mutate({ id: category.id, ...payload }, { onSuccess: onClose });
    } else {
      create.mutate(payload, { onSuccess: onClose });
    }
  };

  const keywordsErrorMsg =
    typeof errors.keywords?.message === 'string' ? errors.keywords.message : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold">
            {isEditing ? 'Editar categoria' : 'Nova categoria'}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-500 hover:bg-gray-100"
            aria-label="Fechar"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex gap-1 border-b border-gray-200 px-6">
          <ModalTabButton active={tab === 'basic'} onClick={() => setTab('basic')} icon={FileText}>
            Básico
          </ModalTabButton>
          <ModalTabButton
            active={tab === 'keywords'}
            onClick={() => setTab('keywords')}
            icon={Tag}
          >
            Palavras-chave
          </ModalTabButton>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex min-h-0 flex-1 flex-col"
          noValidate
        >
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {tab === 'basic' && (
              <div className="space-y-4">
                <ValidatedInput
                  label="Nome"
                  required
                  placeholder="Ex: Carregadores e cabos"
                  error={errors.name?.message}
                  helpText="Como aparece pro cliente quando a IA lista categorias"
                  {...register('name')}
                />

                <ValidatedTextarea
                  label="Descrição para a IA"
                  rows={2}
                  placeholder="Ex: Carregadores rápidos, cabos USB-C/Lightning, adaptadores"
                  error={errors.description?.message}
                  helpText="Frase curta com EXEMPLOS concretos. Quanto mais específico, menos a IA inventa."
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
              </div>
            )}

            {tab === 'keywords' && (
              <div className="space-y-4">
                <div className="flex items-start gap-2 rounded-md border border-blue-100 bg-blue-50/60 p-3">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                  <div className="min-w-0 flex-1 text-xs text-blue-900/90">
                    <p className="font-medium text-blue-900">
                      Como a IA usa as palavras-chave
                    </p>
                    <p className="mt-1">
                      Quando o cliente escreve uma mensagem, a IA procura essas palavras pra
                      decidir QUAL categoria ele está perguntando. Se nenhuma palavra-chave
                      bater, a IA responde honestamente que a loja não tem o item — em vez de
                      inventar produtos parecidos.
                    </p>
                  </div>
                </div>

                <Controller
                  control={control}
                  name="keywords"
                  render={({ field, fieldState }) => (
                    <TagInput
                      label="Palavras-chave"
                      value={field.value ?? []}
                      onChange={(tags) => field.onChange(tags)}
                      placeholder="Ex: carregador, cabo, fonte, tipo c..."
                      helpText={
                        (field.value?.length ?? 0) === 0
                          ? KEYWORD_SUGGESTIONS_HELP
                          : 'Pressione Enter ou vírgula entre cada palavra. Cole listas separadas por vírgula.'
                      }
                      error={
                        keywordsErrorMsg ??
                        (typeof fieldState.error?.message === 'string'
                          ? fieldState.error.message
                          : undefined)
                      }
                      maxTags={50}
                    />
                  )}
                />

                <div className="rounded-md bg-gray-50 p-3">
                  <p className="text-xs font-medium text-gray-700">💡 Dicas</p>
                  <ul className="mt-1.5 space-y-1 text-xs text-gray-600">
                    <li>• Inclua singular E plural (celular, celulares)</li>
                    <li>• Inclua erros de digitação comuns (oculos, óculos)</li>
                    <li>• Inclua marcas que o cliente cita (iphone, samsung)</li>
                    <li>• Frases curtas funcionam (eau de parfum, tipo c)</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-gray-200 px-6 py-3">
            <p className="text-xs text-gray-500">
              {Object.keys(errors).length > 0 && (
                <span className="text-red-600">
                  {Object.keys(errors).length} erro(s) no formulário
                </span>
              )}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="btn-secondary">
                Cancelar
              </button>
              <button
                type="submit"
                className="btn-primary"
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
          </div>
        </form>
      </div>
    </div>
  );
}

function ModalTabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: any;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition',
        active
          ? 'border-brand-600 text-brand-700'
          : 'border-transparent text-gray-600 hover:text-gray-900',
      )}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}

function TemplatesModal({ onClose }: { onClose: () => void }) {
  const { data: groups = [], isLoading } = useCategoryTemplates();
  const importMut = useImportCategoryTemplate();

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set());

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);

  const pickGroup = (groupId: string) => {
    setSelectedGroupId(groupId);
    setSelectedSlugs(new Set());
  };

  const toggleSlug = (slug: string) => {
    setSelectedSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const toggleAll = () => {
    if (!selectedGroup) return;
    const allSlugs = selectedGroup.categories.map((c) => c.slug);
    if (selectedSlugs.size === allSlugs.length) {
      setSelectedSlugs(new Set());
    } else {
      setSelectedSlugs(new Set(allSlugs));
    }
  };

  const handleImport = () => {
    if (!selectedGroupId) return;
    importMut.mutate(
      {
        groupId: selectedGroupId,
        slugs: selectedSlugs.size === 0 ? undefined : Array.from(selectedSlugs),
      },
      { onSuccess: onClose },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-brand-600" />
            <div>
              <h2 className="text-lg font-semibold">Pacotes de categorias prontos</h2>
              <p className="text-xs text-gray-500">
                Cada pacote já vem com palavras-chave configuradas. Você pode editar tudo depois.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 text-gray-500 hover:bg-gray-100">
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="w-64 shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50">
            {isLoading && <div className="p-4 text-sm text-gray-500">Carregando...</div>}
            {groups.map((group) => (
              <button
                key={group.id}
                onClick={() => pickGroup(group.id)}
                className={cn(
                  'w-full border-b border-gray-200 px-4 py-3 text-left text-sm transition',
                  selectedGroupId === group.id
                    ? 'bg-white font-medium text-brand-700'
                    : 'text-gray-700 hover:bg-white',
                )}
              >
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{group.name}</div>
                    <div className="mt-0.5 text-xs text-gray-500">
                      {group.count} categorias
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {!selectedGroup ? (
              <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-gray-500">
                Selecione um segmento ao lado para ver as categorias disponíveis
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3 border-b border-gray-200 bg-white px-6 py-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium">{selectedGroup.name}</h3>
                    <p className="text-xs text-gray-500">{selectedGroup.description}</p>
                  </div>
                  <button
                    onClick={toggleAll}
                    className="shrink-0 text-xs font-medium text-brand-600 hover:text-brand-700"
                  >
                    {selectedSlugs.size === selectedGroup.categories.length
                      ? 'Limpar seleção'
                      : 'Selecionar todas'}
                  </button>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto p-4">
                  {selectedGroup.categories.map((tpl) => {
                    const selected = selectedSlugs.has(tpl.slug);
                    const kwCount = tpl.keywords?.length ?? 0;
                    return (
                      <button
                        key={tpl.slug}
                        onClick={() => toggleSlug(tpl.slug)}
                        className={cn(
                          'w-full rounded-lg border p-3 text-left transition',
                          selected
                            ? 'border-brand-500 bg-brand-50'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50',
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={cn(
                              'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                              selected ? 'border-brand-600 bg-brand-600' : 'border-gray-300',
                            )}
                          >
                            {selected && <Check className="h-3 w-3 text-white" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium">{tpl.name}</span>
                              {kwCount > 0 && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                                  <Tag className="h-2.5 w-2.5" />
                                  {kwCount} palavra{kwCount !== 1 ? 's' : ''}-chave
                                </span>
                              )}
                            </div>
                            <div className="mt-1 text-xs text-gray-600">{tpl.description}</div>
                            {kwCount > 0 && (
                              <div className="mt-1.5 text-[11px] text-gray-500">
                                <span className="font-medium">Inclui:</span>{' '}
                                {tpl.keywords.slice(0, 6).join(', ')}
                                {kwCount > 6 ? ` e mais ${kwCount - 6}…` : ''}
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 px-6 py-3">
          <p className="text-xs text-gray-500">
            {selectedGroup
              ? selectedSlugs.size > 0
                ? `${selectedSlugs.size} de ${selectedGroup.count} selecionadas`
                : `Nenhuma marcada — vai importar todas as ${selectedGroup.count} do pacote`
              : ''}
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary">
              Cancelar
            </button>
            <button
              onClick={handleImport}
              className="btn-primary"
              disabled={!selectedGroupId || importMut.isPending}
            >
              {importMut.isPending ? 'Importando...' : 'Importar para minha loja'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
