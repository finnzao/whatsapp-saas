'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  MessageSquare,
  Package,
  Settings,
  Bug,
  LogOut,
  Users,
  ShoppingBag,
  Database,
} from 'lucide-react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useCurrentUser, useLogout } from '@/lib/hooks/useAuth';
import { cn } from '@/lib/utils';

const isDev = process.env.NODE_ENV !== 'production';

const navItems = [
  { href: '/conversas', label: 'Conversas', icon: MessageSquare },
  { href: '/contatos', label: 'Contatos', icon: Users },
  { href: '/catalogo', label: 'Catálogo', icon: Package },
  { href: '/pedidos', label: 'Pedidos', icon: ShoppingBag },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
  ...(isDev
    ? [
        { href: '/debug', label: 'Debug chat', icon: Bug },
        { href: '/dev', label: 'Developer', icon: Database },
      ]
    : []),
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <DashboardShell>{children}</DashboardShell>
    </AuthGuard>
  );
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const user = useCurrentUser();
  const logout = useLogout();

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="flex w-60 flex-col border-r border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-4">
          <h1 className="text-lg font-semibold text-gray-900">WhatsApp SaaS</h1>
          {user && <p className="mt-0.5 truncate text-xs text-gray-500">{user.name}</p>}
        </div>

        <nav className="flex-1 space-y-0.5 p-2">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;
            const isDevLink = item.href === '/dev' || item.href === '/debug';
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition',
                  active
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900',
                  isDevLink && !active && 'text-amber-700 hover:text-amber-800',
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
                {isDevLink && (
                  <span className="ml-auto rounded-full bg-amber-100 px-1.5 text-[9px] font-bold text-amber-800">
                    DEV
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-gray-200 p-2">
          <button
            onClick={logout}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-red-50 hover:text-red-700"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
