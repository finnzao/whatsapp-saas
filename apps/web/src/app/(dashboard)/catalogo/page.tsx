'use client';

import { useState } from 'react';
import { Plus, Search, PauseCircle, PlayCircle, Trash2, Package } from 'lucide-react';
import { useProducts, useTogglePause, useDeleteProduct, useCreateProduct, Product } from '@/lib/hooks/useProducts';
import { cn, formatCurrency } from '@/lib/utils';
import { useForm } from 'react-hook-form';

export default function CatalogoPage() {
  const [search, setSearch] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
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
        <button onClick={() => setShowNewModal(true)} className="btn-primary">
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
          <button onClick={() => setShowNewModal(true)} className="btn-primary mt-4">
            <Plus className="h-4 w-4" /> Cadastrar produto
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            onTogglePause={() => togglePause.mutate(product.id)}
            onDelete={() => {
              if (confirm(`Remover ${product.name}?`)) deleteProduct.mutate(product.id);
            }}
          />
        ))}
      </div>

      {showNewModal && <NewProductModal onClose={() => setShowNewModal(false)} />}
    </div>
  );
}

function ProductCard({
  product,
  onTogglePause,
  onDelete,
}: {
  product: Product;
  onTogglePause: () => void;
  onDelete: () => void;
}) {
  const price = typeof product.price === 'string' ? parseFloat(product.price) : product.price;

  return (
    <div className={cn('card p-4', product.paused && 'opacity-60')}>
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium text-gray-900">{product.name}</h3>
          {product.category && (
            <span className="badge mt-1 bg-gray-100 text-gray-700">{product.category.name}</span>
          )}
        </div>
      </div>

      <div className="mt-3">
        <p className="text-lg font-semibold text-gray-900">{formatCurrency(price)}</p>
        {product.priceInstallment && product.installments && (
          <p className="text-xs text-gray-500">
            ou {product.installments}x de {formatCurrency(Number(product.priceInstallment) / product.installments)}
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

interface NewProductForm {
  name: string;
  description?: string;
  price: number;
  stock: number;
}

function NewProductModal({ onClose }: { onClose: () => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<NewProductForm>();
  const create = useCreateProduct();

  const onSubmit = (data: NewProductForm) => {
    create.mutate(
      {
        ...data,
        price: Number(data.price),
        stock: Number(data.stock),
      } as any,
      { onSuccess: onClose },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="card w-full max-w-md p-6">
        <h2 className="mb-4 text-lg font-semibold">Novo produto</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Nome</label>
            <input
              className="input"
              placeholder="iPhone 13 128GB"
              {...register('name', { required: 'Nome obrigatório' })}
            />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Descrição</label>
            <textarea className="input" rows={3} {...register('description')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Preço (R$)</label>
              <input
                type="number"
                step="0.01"
                className="input"
                {...register('price', { required: true, min: 0 })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Estoque</label>
              <input
                type="number"
                className="input"
                {...register('stock', { required: true, min: 0 })}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancelar
            </button>
            <button type="submit" className="btn-primary flex-1" disabled={create.isPending}>
              {create.isPending ? 'Criando...' : 'Criar produto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
