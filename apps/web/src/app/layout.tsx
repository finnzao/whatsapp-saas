import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'WhatsApp SaaS',
  description: 'Atendimento inteligente para varejo',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <Providers>{children}</Providers>
        <Toaster
          position="bottom-left"
          richColors
          closeButton
          duration={2500}
          toastOptions={{
            style: { fontSize: '13px' },
          }}
        />
      </body>
    </html>
  );
}
