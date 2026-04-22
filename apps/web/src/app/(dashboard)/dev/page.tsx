'use client';

import { useState } from 'react';
import {
  Database,
  Search,
  Sprout,
  Trash2,
  AlertTriangle,
  RefreshCw,
  ChevronRight,
  Copy,
  Check,
} from 'lucide-react';
import {
  DevEntity,
  useDevOverview,
  useDevEntity,
  useDeleteRecord,
  useDeleteAll,
  useTestSearch,
  useSeed,
} from '@/lib/hooks/useDev';
import { cn } from '@/lib/utils';

const ENTITIES: Array<{ key: DevEntity; label: string; countKey?: string }> = [
  { key: 'products', label: 'Produtos', countKey: 'products' },
  { key: 'customFields', label: 'Custom Fields', countKey: 'customFields' },
  { key: 'categories', label: 'Categorias', countKey: 'categories' },
  { key: 'contacts', label: 'Contatos', countKey: 'contacts' },
  { key: 'conversations', label: 'Conversas', countKey: 'conversations' },
  { key: 'messages', label: 'Mensagens', countKey: 'messages' },
  { key: 'faqs', label: 'FAQs', countKey: 'faqs' },
  { key: 'orders', label: 'Pedidos', countKey: 'orders' },
  { key: 'settings', label: 'Settings' },
];

export default function DevPage() {
  const [selected, setSelected] = useState<DevEntity>('products');
  const [tab, setTab] = useState<'data' | 'search' | 'seed'>('data');

  const overview = useDevOverview();

  if (process.env.NODE_ENV === 'production') {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
          <h1 className="mt-3 text-xl font-semibold">Indisponível em produção</h1>
          <p className="mt-1 text-sm text-gray-600">
            A página /dev só funciona em desenvolvimento.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-amber-100 p-2">
            <Database className="h-5 w-5 text-amber-700" />
          </div>
          <div>
            <h1 className="font-semibold text-gray-900">Developer</h1>
            <p className="text-xs text-gray-600">
              Inspecione o banco, teste a busca, popule dados de exemplo. Só disponível em dev.
            </p>
          </div>
        </div>
        <button
          onClick={() => overview.refetch()}
          className="btn-secondary text-xs"
          disabled={overview.isFetching}
        >
          <RefreshCw className={cn('h-3 w-3', overview.isFetching && 'animate-spin')} />
          Atualizar
        </button>
      </header>

      <div className="flex gap-1 border-b border-gray-200 bg-white px-4">
        <TabButton active={tab === 'data'} onClick={() => setTab('data')} icon={Database}>
          Dados
        </TabButton>
        <TabButton active={tab === 'search'} onClick={() => setTab('search')} icon={Search}>
          Testar busca IA
        </TabButton>
        <TabButton active={tab === 'seed'} onClick={() => setTab('seed')} icon={Sprout}>
          Seed
        </TabButton>
      </div>

      {tab === 'data' && (
        <DataTab selected={selected} setSelected={setSelected} overview={overview.data} />
      )}
      {tab === 'search' && <SearchTab />}
      {tab === 'seed' && <SeedTab />}
    </div>
  );
}

function TabButton({
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

function DataTab({
  selected,
  setSelected,
  overview,
}: {
  selected: DevEntity;
  setSelected: (e: DevEntity) => void;
  overview: { counts: Record<string, number> } | undefined;
}) {
  const { data, isLoading } = useDevEntity(selected);
  const deleteRecord = useDeleteRecord();
  const deleteAll = useDeleteAll();

  const records = Array.isArray(data) ? data : data ? [data] : [];

  const handleDeleteAll = () => {
    const count = overview?.counts[selected] ?? 0;
    if (count === 0) return;
    if (
      confirm(
        `ATENÇÃO! Deletar TODOS os ${count} registros de "${selected}" do seu tenant?\n\nEssa ação é irreversível.`,
      )
    ) {
      deleteAll.mutate(selected);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <aside className="w-56 shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50 p-2">
        {ENTITIES.map((e) => {
          const count = e.countKey ? overview?.counts[e.countKey] : undefined;
          return (
            <button
              key={e.key}
              onClick={() => setSelected(e.key)}
              className={cn(
                'flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-medium transition',
                selected === e.key
                  ? 'bg-white text-brand-700 shadow-sm'
                  : 'text-gray-700 hover:bg-white hover:text-gray-900',
              )}
            >
              <span>{e.label}</span>
              {count !== undefined && (
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs',
                    count > 0 ? 'bg-brand-100 text-brand-700' : 'bg-gray-200 text-gray-500',
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-mono text-gray-500">
              GET /dev/entities/{selected}
            </span>
            <span className="text-gray-400">→</span>
            <span className="font-medium">{records.length} registro(s)</span>
          </div>
          {selected !== 'settings' && records.length > 0 && (
            <button
              onClick={handleDeleteAll}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
              disabled={deleteAll.isPending}
            >
              <Trash2 className="h-3 w-3" />
              Deletar todos
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading && <div className="text-sm text-gray-500">Carregando...</div>}

          {!isLoading && records.length === 0 && (
            <div className="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
              Nenhum registro em <strong>{selected}</strong>.
            </div>
          )}

          <div className="space-y-2">
            {records.map((record: any, i) => (
              <RecordCard
                key={record?.id ?? i}
                record={record}
                entity={selected}
                onDelete={
                  record?.id && selected !== 'settings'
                    ? () => {
                        if (confirm(`Deletar ${selected}/${record.id}?`)) {
                          deleteRecord.mutate({ entity: selected, id: record.id });
                        }
                      }
                    : undefined
                }
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

function RecordCard({
  record,
  entity,
  onDelete,
}: {
  record: Record<string, any>;
  entity: DevEntity;
  onDelete?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const summary = buildSummary(record, entity);

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(record, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="rounded p-1 text-gray-500 hover:bg-gray-100"
          aria-label="Expandir"
        >
          <ChevronRight
            className={cn('h-4 w-4 transition', expanded && 'rotate-90')}
          />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{summary.title}</p>
          {summary.subtitle && (
            <p className="truncate text-xs text-gray-500">{summary.subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="rounded p-1.5 text-gray-500 hover:bg-gray-100"
            aria-label="Copiar JSON"
            title="Copiar JSON"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-600" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
          {onDelete && (
            <button
              onClick={onDelete}
              className="rounded p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
              aria-label="Deletar"
              title="Deletar"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <pre className="max-h-96 overflow-auto border-t border-gray-100 bg-gray-50 p-3 font-mono text-xs text-gray-800">
          {JSON.stringify(record, null, 2)}
        </pre>
      )}
    </div>
  );
}

function buildSummary(
  record: Record<string, any>,
  entity: DevEntity,
): { title: string; subtitle?: string } {
  switch (entity) {
    case 'products':
      return {
        title: `${record.name} ${record.sku ? `(${record.sku})` : ''}`,
        subtitle: `R$ ${Number(record.price).toFixed(2)} · estoque ${record.stock}${
          record.customFields ? ` · ${JSON.stringify(record.customFields)}` : ''
        }${record.active ? '' : ' · INATIVO'}${record.paused ? ' · PAUSADO' : ''}`,
      };
    case 'customFields':
      return {
        title: `${record.label} (${record.key})`,
        subtitle: `tipo ${record.type}${
          record.options?.length ? ` · opções: ${record.options.join(', ')}` : ''
        }${record.required ? ' · obrigatório' : ''}`,
      };
    case 'contacts':
      return {
        title: record.name ?? record.pushName ?? record.phone,
        subtitle: record.phone,
      };
    case 'conversations':
      return {
        title: `${record.contact?.name ?? record.contact?.phone ?? 'Sem contato'} — ${record.status}`,
        subtitle: `${record._count?.messages ?? 0} mensagens · ${new Date(record.createdAt).toLocaleString('pt-BR')}`,
      };
    case 'messages':
      return {
        title: `${record.direction} · ${record.fromBot ? 'BOT' : 'USER'}`,
        subtitle: (record.content ?? '').slice(0, 100),
      };
    case 'faqs':
      return {
        title: record.question,
        subtitle: `keywords: ${(record.keywords ?? []).join(', ')}`,
      };
    case 'categories':
      return { title: record.name, subtitle: record.slug };
    case 'orders':
      return {
        title: `#${record.orderNumber} · ${record.status}`,
        subtitle: `R$ ${Number(record.total).toFixed(2)} · ${record.contact?.name ?? record.contact?.phone ?? ''}`,
      };
    case 'settings':
      return {
        title: `Settings do tenant ${record.tenantId?.slice(0, 8) ?? ''}`,
        subtitle: `IA ${record.aiEnabled ? 'ligada' : 'desligada'}`,
      };
    default:
      return { title: record.id ?? '—' };
  }
}

function SearchTab() {
  const [query, setQuery] = useState('iphone laranja');
  const mutation = useTestSearch();

  const handleSearch = () => {
    if (!query.trim()) return;
    mutation.mutate({ query: query.trim() });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
      <div className="max-w-3xl">
        <h2 className="mb-2 text-lg font-semibold">Testar busca de produtos da IA</h2>
        <p className="mb-4 text-sm text-gray-600">
          Simula a tool <code className="rounded bg-gray-100 px-1">search_products</code> que a IA
          chama no atendimento. Útil pra confirmar se um produto é encontrável ANTES de culpar o
          modelo.
        </p>

        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder='Ex: "iphone laranja", "celular 128gb preto"'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button
            onClick={handleSearch}
            className="btn-primary"
            disabled={mutation.isPending || !query.trim()}
          >
            <Search className="h-4 w-4" />
            Buscar
          </button>
        </div>

        {mutation.data && (
          <div className="mt-6 space-y-4">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
              <p>
                <strong>Query:</strong>{' '}
                <code className="rounded bg-white px-1">{mutation.data.query}</code>
              </p>
              <p className="mt-1">
                <strong>Tokens após normalização:</strong>{' '}
                {mutation.data.tokens.length > 0 ? (
                  mutation.data.tokens.map((t) => (
                    <code key={t} className="mx-0.5 rounded bg-white px-1 text-xs">
                      {t}
                    </code>
                  ))
                ) : (
                  <em className="text-gray-500">nenhum token útil</em>
                )}
              </p>
              <p className="mt-1">
                <strong>Resultados:</strong>{' '}
                <span
                  className={cn(
                    'font-mono',
                    mutation.data.resultsCount === 0 ? 'text-red-600' : 'text-green-600',
                  )}
                >
                  {mutation.data.resultsCount}
                </span>
              </p>
            </div>

            {mutation.data.resultsCount === 0 && (
              <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="mr-1 inline h-4 w-4" />
                Nenhum produto encontrado. Possíveis causas: produto não cadastrado, produto
                inativo/pausado, ou os tokens da query não aparecem no nome/descrição/customFields.
              </div>
            )}

            <div className="space-y-2">
              {mutation.data.results.map((r) => (
                <div key={r.id} className="rounded-lg border border-gray-200 bg-white p-3">
                  <p className="font-medium">{r.name}</p>
                  <p className="mt-1 text-sm text-gray-600">
                    R$ {Number(r.price).toFixed(2)} · estoque {r.stock}
                  </p>
                  {r.customFields && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {Object.entries(r.customFields).map(([k, v]) => (
                        <span
                          key={k}
                          className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
                        >
                          {k}: {Array.isArray(v) ? v.join(', ') : String(v)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SeedTab() {
  const mutation = useSeed();

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
      <div className="max-w-2xl">
        <h2 className="mb-2 text-lg font-semibold">Popular dados de exemplo</h2>
        <p className="mb-4 text-sm text-gray-600">
          Cria rapidamente: 2 custom fields (cor, armazenamento), 1 categoria (Smartphones), 4
          produtos (iPhone 13 Laranja, iPhone 13 Azul, iPhone 15 Preto, Galaxy S24 Verde), 3 FAQs
          comuns. Registros já existentes são mantidos.
        </p>

        <button
          onClick={() => mutation.mutate()}
          className="btn-primary"
          disabled={mutation.isPending}
        >
          <Sprout className="h-4 w-4" />
          {mutation.isPending ? 'Populando...' : 'Popular dados de exemplo'}
        </button>

        {mutation.data && (
          <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">
            <p className="font-medium">✓ {mutation.data.summary}</p>
            <p className="mt-1 text-xs">
              Agora você pode testar o bot perguntando "tem iphone laranja?", "qual horário?",
              "vocês entregam?" e verificar se a IA encontra.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
