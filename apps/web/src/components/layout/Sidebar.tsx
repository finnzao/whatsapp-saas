'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  MessageSquare,
  Package,
  ShoppingCart,
  Settings,
  LogOut,
  Smartphone,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLogout } from '@/lib/hooks/useAuth';

const menuItems = [
  { href: '/conversas', label: 'Conversas', icon: MessageSquare },
  { href: '/catalogo', label: 'Catálogo', icon: Package },
  { href: '/pedidos', label: 'Pedidos', icon: ShoppingCart },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const logout = useLogout();

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-200 px-6 py-4">
        <Smartphone className="h-6 w-6 text-brand-600" />
        <span className="text-lg font-semibold text-gray-900">WhatsApp SaaS</span>
      </div>

      <nav className="flex-1 space-y-1 p-4">
        {menuItems.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition',
                active
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900',
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <button
        onClick={logout}
        className="flex items-center gap-3 border-t border-gray-200 px-6 py-4 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900"
      >
        <LogOut className="h-4 w-4" />
        Sair
      </button>
    </aside>
  );
}
