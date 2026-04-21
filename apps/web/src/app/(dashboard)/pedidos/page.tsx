'use client';

import { useQuery } from '@tanstack/react-query';
import { ShoppingCart } from 'lucide-react';
import { api } from '@/lib/api/client';
import { formatCurrency, formatPhone, formatRelativeTime, cn } from '@/lib/utils';

interface OrderItem {
  id: string;
  quantity: number;
  unitPrice: string;
  total: string;
  product: { id: string; name: string };
}

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  paymentMethod?: string;
  total: string;
  createdAt: string;
  contact: { id: string; name?: string; phone: string; pushName?: string };
  items: OrderItem[];
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Pendente', color: 'bg-amber-100 text-amber-700' },
  CONFIRMED: { label: 'Confirmado', color: 'bg-blue-100 text-blue-700' },
  PREPARING: { label: 'Preparando', color: 'bg-purple-100 text-purple-700' },
  SHIPPED: { label: 'Enviado', color: 'bg-indigo-100 text-indigo-700' },
  DELIVERED: { label: 'Entregue', color: 'bg-green-100 text-green-700' },
  CANCELLED: { label: 'Cancelado', color: 'bg-red-100 text-red-700' },
};

const PAYMENT_CONFIG: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Aguardando pagamento', color: 'bg-amber-100 text-amber-700' },
  PAID: { label: 'Pago', color: 'bg-green-100 text-green-700' },
  REFUNDED: { label: 'Reembolsado', color: 'bg-gray-100 text-gray-700' },
  FAILED: { label: 'Falhou', color: 'bg-red-100 text-red-700' },
};

export default function PedidosPage() {
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const { data } = await api.get<Order[]>('/orders');
      return data;
    },
  });

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Pedidos</h1>
        <p className="text-sm text-gray-500">{orders.length} pedidos registrados</p>
      </div>

      {isLoading && <div className="text-sm text-gray-500">Carregando...</div>}

      {!isLoading && orders.length === 0 && (
        <div className="card flex flex-col items-center py-16 text-center">
          <ShoppingCart className="h-12 w-12 text-gray-300" />
          <h3 className="mt-4 font-medium text-gray-900">Nenhum pedido ainda</h3>
          <p className="mt-1 text-sm text-gray-500">
            Os pedidos fechados pelas conversas do WhatsApp aparecem aqui.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {orders.map((order) => {
          const status = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.PENDING;
          const payment = PAYMENT_CONFIG[order.paymentStatus] ?? PAYMENT_CONFIG.PENDING;
          const displayName = order.contact.name ?? order.contact.pushName ?? formatPhone(order.contact.phone);

          return (
            <div key={order.id} className="card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">#{order.orderNumber}</h3>
                    <span className={cn('badge', status.color)}>{status.label}</span>
                    <span className={cn('badge', payment.color)}>{payment.label}</span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">
                    {displayName} • {formatPhone(order.contact.phone)}
                  </p>
                  <p className="text-xs text-gray-500">{formatRelativeTime(order.createdAt)}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-gray-900">
                    {formatCurrency(order.total)}
                  </p>
                  {order.paymentMethod && (
                    <p className="text-xs text-gray-500">{order.paymentMethod}</p>
                  )}
                </div>
              </div>

              <div className="mt-3 space-y-1 border-t border-gray-100 pt-3">
                {order.items.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span className="text-gray-700">
                      {item.quantity}x {item.product.name}
                    </span>
                    <span className="text-gray-900">{formatCurrency(item.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
