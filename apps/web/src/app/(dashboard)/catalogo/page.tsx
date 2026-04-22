'use client';

import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Plus,
  Search,
  PauseCircle,
  PlayCircle,
  Trash2,
  Package,
  Pencil,
  X as XIcon,
  Box,
  DollarSign,
  Sparkles,
} from 'lucide-react';
import {
  useProducts,
  useTogglePause,
  useDeleteProduct,
  useCreateProduct,
  useUpdateProduct,
  useCategories,
  Product,
} from '@/lib/hooks/useProducts';
import { useCustomFieldDefinitions } from '@/lib/hooks/useCustomFields';
import { cn, formatCurrency } from '@/lib/utils';
import { productSchema, type ProductInput } from '@/lib/validation/schemas';
import { maskSku } from '@/lib/validation/masks';
import { ValidatedInput } from '@/components/ui/ValidatedInput';
import { ValidatedTextarea } from '@/components/ui/ValidatedTextarea';
import { CustomFieldRenderer } from '@/components/ui/CustomFieldRenderer';

export default function CatalogoPage() {
  const [search, setSearch] = useState('');
  const [modalState, setModalState] = useState<{ open: boolean; product: Product | null }>({
    open: false,
    product: null,
  });
  const { data, isLoading } = useProducts(search);
  const togglePause = useTogglePause();
  const deleteProduct = useDeleteProduct();

  const products = data?.items ?? [];

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Catálogo</h1>
          <p className="text-sm text-gray-500">
            {data?.pagination.total ?? 0} produtos cadastrados
          </p>
        </div>
        <button
          onClick={() => setModalState({ open: true, product: null })}
          className="btn-primary"
        >
          <Plus className="h-4 w-4" /> Novo produto
        </button>
      </div>

      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          className="input pl-10"
          placeholder="Buscar por nome ou SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading && <div className="text-sm text-gray-500">Carregando...</div>}

      {!isLoading && products.length === 0 && (
        <div className="card flex flex-col items-center py-16 text-center">
          <Package className="h-12 w-12 text-gray-300" />
          <h3 className="mt-4 font-medium text-gray-900">Nenhum produto cadastrado</h3>
          <p className="mt-1 text-sm text-gray-500">
            Comece cadastrando seu primeiro produto para a IA poder oferecê-lo aos clientes.
          </p>
          <button
            onClick={() => setModalState({ open: true, product: null })}
            className="btn-primary mt-4"
          >
            <Plus className="h-4 w-4" /> Cadastrar produto
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            onEdit={() => setModalState({ open: true, product })}
            onTogglePause={() => togglePause.mutate(product.id)}
            onDelete={() => {
              if (confirm(`Remover ${product.name}?`)) deleteProduct.mutate(product.id);
            }}
          />
        ))}
      </div>

      {modalState.open && (
        <ProductModal
          product={modalState.product}
          onClose={() => setModalState({ open: false, product: null })}
        />
      )}
    </div>
  );
}

function ProductCard({
  product,
  onEdit,
  onTogglePause,
  onDelete,
}: {
  product: Product;
  onEdit: () => void;
  onTogglePause: () => void;
  onDelete: () => void;
}) {
  const price = typeof product.price === 'string' ? parseFloat(product.price) : product.price;
  const customFieldEntries = product.customFields
    ? Object.entries(product.customFields as Record<string, unknown>)
    : [];

  return (
    <div className={cn('card p-4', product.paused && 'opacity-60')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium text-gray-900">{product.name}</h3>
          {product.category && (
            <span className="badge mt-1 bg-gray-100 text-gray-700">{product.category.name}</span>
          )}
        </div>
        <button
          onClick={onEdit}
          className="shrink-0 rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          aria-label="Editar"
        >
          <Pencil className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3">
        <p className="text-lg font-semibold text-gray-900">{formatCurrency(price)}</p>
        {product.priceInstallment && product.installments && (
          <p className="text-xs text-gray-500">
            ou {product.installments}x de{' '}
            {formatCurrency(Number(product.priceInstallment) / product.installments)}
          </p>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs">
        <span
          className={cn(
            'badge',
            product.stock > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700',
          )}
        >
          {product.stock > 0 ? `${product.stock} em estoque` : 'Sem estoque'}
        </span>
        {product.paused && <span className="badge bg-amber-100 text-amber-700">Pausado</span>}
      </div>

      {customFieldEntries.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1 border-t border-gray-100 pt-3">
          {customFieldEntries.slice(0, 4).map(([key, val]) => (
            <span
              key={key}
              className="inline-flex items-center rounded bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700"
              title={`${key}: ${String(val)}`}
            >
              {key}: {Array.isArray(val) ? val.join(', ') : String(val)}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex gap-2 border-t border-gray-100 pt-3">
        <button onClick={onTogglePause} className="btn-secondary flex-1 text-xs">
          {product.paused ? (
            <>
              <PlayCircle className="h-3 w-3" /> Ativar
            </>
          ) : (
            <>
              <PauseCircle className="h-3 w-3" /> Pausar
            </>
          )}
        </button>
        <button onClick={onDelete} className="btn-secondary text-xs text-red-600 hover:bg-red-50">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

type Tab = 'basic' | 'pricing' | 'custom';

function ProductModal({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('basic');
  const isEditing = !!product;

  const { data: categories = [] } = useCategories();
  const { data: customFields = [] } = useCustomFieldDefinitions('product');
  const create = useCreateProduct();
  const update = useUpdateProduct();

  const defaultValues: Partial<ProductInput> = {
    name: product?.name ?? '',
    description: product?.description ?? '',
    categoryId: product?.categoryId ?? '',
    sku: product?.sku ?? '',
    price: product ? Number(product.price) : undefined,
    priceCash: product?.priceCash ? Number(product.priceCash) : undefined,
    priceInstallment: product?.priceInstallment ? Number(product.priceInstallment) : undefined,
    installments: product?.installments ?? undefined,
    stock: product?.stock ?? 0,
    trackStock: product?.trackStock ?? true,
    condition: (product?.condition as ProductInput['condition']) ?? 'NEW',
    warranty: product?.warranty ?? '',
    customFields: (product?.customFields as Record<string, unknown>) ?? {},
  };

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ProductInput>({
    resolver: zodResolver(productSchema),
    defaultValues,
    mode: 'onBlur',
  });

  const customFieldValues = watch('customFields') ?? {};

  const onSubmit = (data: ProductInput) => {
    const payload = {
      ...data,
      categoryId: data.categoryId || undefined,
      sku: data.sku || undefined,
      warranty: data.warranty || undefined,
      description: data.description || undefined,
    };

    if (isEditing) {
      update.mutate({ id: product.id, ...payload }, { onSuccess: onClose });
    } else {
      create.mutate(payload, { onSuccess: onClose });
    }
  };

  const customFieldErrors = (errors.customFields as Record<string, { message?: string }>) ?? {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold">{isEditing ? 'Editar produto' : 'Novo produto'}</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-500 hover:bg-gray-100"
            aria-label="Fechar"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex gap-1 border-b border-gray-200 px-6">
          <ModalTab active={tab === 'basic'} onClick={() => setTab('basic')} icon={Box}>
            Básico
          </ModalTab>
          <ModalTab active={tab === 'pricing'} onClick={() => setTab('pricing')} icon={DollarSign}>
            Preços e estoque
          </ModalTab>
          <ModalTab active={tab === 'custom'} onClick={() => setTab('custom')} icon={Sparkles}>
            Campos personalizados
            {customFields.length > 0 && (
              <span className="ml-1 rounded-full bg-brand-100 px-1.5 text-[10px] font-semibold text-brand-700">
                {customFields.length}
              </span>
            )}
          </ModalTab>
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
                  placeholder="iPhone 13 128GB Preto"
                  error={errors.name?.message}
                  {...register('name')}
                />

                <ValidatedTextarea
                  label="Descrição"
                  rows={3}
                  placeholder="Detalhes do produto, estado, o que está incluso..."
                  error={errors.description?.message}
                  {...register('description')}
                />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Categoria
                    </label>
                    <select className="input" {...register('categoryId')}>
                      <option value="">Sem categoria</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Condição
                    </label>
                    <select className="input" {...register('condition')}>
                      <option value="NEW">Novo (lacrado)</option>
                      <option value="SEMINEW">Seminovo</option>
                      <option value="USED">Usado</option>
                      <option value="SHOWCASE">Mostruário</option>
                      <option value="REFURBISHED">Recondicionado</option>
                    </select>
                  </div>
                </div>

                <ValidatedInput
                  label="SKU (opcional)"
                  placeholder="IPH13-128-BLK"
                  helpText="Código interno do produto. 3 a 20 caracteres, letras, números e hífen."
                  error={errors.sku?.message}
                  mask={maskSku}
                  {...register('sku')}
                />

                <ValidatedInput
                  label="Garantia (opcional)"
                  placeholder="1 ano Apple, 90 dias loja..."
                  error={errors.warranty?.message}
                  {...register('warranty')}
                />
              </div>
            )}

            {tab === 'pricing' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <ValidatedInput
                    label="Preço (R$)"
                    required
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0,00"
                    error={errors.price?.message}
                    {...register('price', { valueAsNumber: true })}
                  />
                  <ValidatedInput
                    label="Preço à vista (R$)"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Opcional"
                    helpText="Com desconto PIX/dinheiro"
                    error={errors.priceCash?.message}
                    {...register('priceCash', { valueAsNumber: true })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <ValidatedInput
                    label="Preço parcelado (R$)"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Opcional"
                    error={errors.priceInstallment?.message}
                    {...register('priceInstallment', { valueAsNumber: true })}
                  />
                  <ValidatedInput
                    label="Parcelas"
                    type="number"
                    min="1"
                    max="24"
                    placeholder="Ex: 12"
                    error={errors.installments?.message}
                    {...register('installments', { valueAsNumber: true })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <ValidatedInput
                    label="Estoque"
                    required
                    type="number"
                    min="0"
                    error={errors.stock?.message}
                    {...register('stock', { valueAsNumber: true })}
                  />
                  <div className="flex items-center pt-6">
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                        {...register('trackStock')}
                      />
                      <span className="font-medium text-gray-700">Controlar estoque</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {tab === 'custom' && (
              <div className="space-y-4">
                {customFields.length === 0 ? (
                  <div className="rounded-lg border-2 border-dashed border-gray-300 p-6 text-center">
                    <Sparkles className="mx-auto h-8 w-8 text-gray-300" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">
                      Nenhum campo personalizado
                    </h3>
                    <p className="mt-1 text-xs text-gray-500">
                      Vá em Configurações → Campos personalizados para criar campos como "Cor",
                      "Tamanho", "Material", etc. Esses campos aparecem aqui para cada produto.
                    </p>
                  </div>
                ) : (
                  <Controller
                    control={control}
                    name="customFields"
                    render={({ field }) => (
                      <div className="space-y-4">
                        {customFields.map((def) => (
                          <CustomFieldRenderer
                            key={def.id}
                            definition={def}
                            value={(field.value ?? {})[def.key]}
                            onChange={(val) => {
                              const next = { ...(field.value ?? {}) };
                              if (val === undefined || val === '' || val === null) {
                                delete next[def.key];
                              } else {
                                next[def.key] = val;
                              }
                              field.onChange(next);
                            }}
                            error={customFieldErrors[def.key]?.message}
                          />
                        ))}
                      </div>
                    )}
                  />
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-gray-200 px-6 py-3">
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
                {create.isPending || update.isPending
                  ? 'Salvando...'
                  : isEditing
                    ? 'Salvar alterações'
                    : 'Criar produto'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function ModalTab({
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
