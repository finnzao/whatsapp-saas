export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 to-gray-100 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">WhatsApp SaaS</h1>
          <p className="mt-2 text-sm text-gray-600">Atendimento inteligente para varejo</p>
        </div>
        <div className="card p-8">{children}</div>
      </div>
    </div>
  );
}
