'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Smartphone, Bot, HelpCircle, RefreshCw, QrCode } from 'lucide-react';
import { api, extractApiError } from '@/lib/api/client';
import { cn } from '@/lib/utils';

type Tab = 'whatsapp' | 'ia' | 'faqs';

export default function ConfiguracoesPage() {
  const [tab, setTab] = useState<Tab>('whatsapp');

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">Configurações</h1>

      <div className="mb-6 flex gap-2 border-b border-gray-200">
        <TabButton active={tab === 'whatsapp'} onClick={() => setTab('whatsapp')} icon={Smartphone}>
          WhatsApp
        </TabButton>
        <TabButton active={tab === 'ia'} onClick={() => setTab('ia')} icon={Bot}>
          Inteligência Artificial
        </TabButton>
        <TabButton active={tab === 'faqs'} onClick={() => setTab('faqs')} icon={HelpCircle}>
          Perguntas frequentes
        </TabButton>
      </div>

      {tab === 'whatsapp' && <WhatsAppTab />}
      {tab === 'ia' && <AiTab />}
      {tab === 'faqs' && <FaqsTab />}
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

// ---------------------------------------------------------------
// WhatsApp tab
// ---------------------------------------------------------------

function WhatsAppTab() {
  const qc = useQueryClient();
  const { data: instance, refetch } = useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: async () => {
      try {
        const { data } = await api.get('/whatsapp/instance/status');
        return data;
      } catch {
        return null;
      }
    },
    refetchInterval: 5_000,
  });

  const createInstance = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/whatsapp/instance');
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-status'] });
      qc.invalidateQueries({ queryKey: ['whatsapp-qr'] });
      toast.success('Instância criada. Escaneie o QR Code com seu WhatsApp.');
    },
    onError: (e) => toast.error(extractApiError(e)),
  });

  const { data: qr } = useQuery({
    queryKey: ['whatsapp-qr'],
    queryFn: async () => {
      const { data } = await api.get<{ qrCode: string | null }>('/whatsapp/instance/qr');
      return data.qrCode;
    },
    enabled: !!instance && instance.status !== 'CONNECTED',
    refetchInterval: 3_000,
  });

  const statusConfig: Record<string, { label: string; color: string }> = {
    CONNECTED: { label: 'Conectado', color: 'bg-green-100 text-green-700' },
    CONNECTING: { label: 'Conectando...', color: 'bg-amber-100 text-amber-700' },
    QRCODE: { label: 'Aguardando QR Code', color: 'bg-blue-100 text-blue-700' },
    DISCONNECTED: { label: 'Desconectado', color: 'bg-red-100 text-red-700' },
    ERROR: { label: 'Erro', color: 'bg-red-100 text-red-700' },
  };

  return (
    <div className="card max-w-2xl p-6">
      <h2 className="mb-2 text-lg font-semibold">Conexão do WhatsApp</h2>
      <p className="mb-6 text-sm text-gray-600">
        Conecte o número do WhatsApp da sua loja para começar a receber mensagens automatizadas.
      </p>

      {!instance ? (
        <button
          onClick={() => createInstance.mutate()}
          className="btn-primary"
          disabled={createInstance.isPending}
        >
          {createInstance.isPending ? 'Criando...' : 'Conectar WhatsApp'}
        </button>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
            <div>
              <p className="text-sm text-gray-600">Status</p>
              <span className={cn('badge mt-1', statusConfig[instance.status]?.color)}>
                {statusConfig[instance.status]?.label ?? instance.status}
              </span>
            </div>
            <button onClick={() => refetch()} className="btn-secondary text-xs">
              <RefreshCw className="h-3 w-3" /> Atualizar
            </button>
          </div>

          {instance.status !== 'CONNECTED' && qr && (
            <div className="flex flex-col items-center rounded-lg border border-gray-200 p-6">
              <QrCode className="mb-3 h-5 w-5 text-gray-400" />
              <h3 className="mb-2 font-medium">Escaneie o QR Code</h3>
              <p className="mb-4 text-center text-sm text-gray-600">
                Abra o WhatsApp no celular, vá em Dispositivos conectados e escaneie.
              </p>
              <img src={qr} alt="QR Code" className="h-64 w-64" />
            </div>
          )}

          {instance.status === 'CONNECTED' && (
            <div className="rounded-lg bg-green-50 p-4 text-sm text-green-800">
              WhatsApp conectado com sucesso. As mensagens dos seus clientes já estão sendo recebidas.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------
// IA tab
// ---------------------------------------------------------------

function AiTab() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data } = await api.get('/settings');
      return data;
    },
  });

  const update = useMutation({
    mutationFn: async (payload: any) => {
      const { data } = await api.patch('/settings', payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Configurações salvas');
    },
    onError: (e) => toast.error(extractApiError(e)),
  });

  if (!settings) return <div className="text-sm text-gray-500">Carregando...</div>;

  return (
    <div className="card max-w-2xl p-6">
      <h2 className="mb-4 text-lg font-semibold">Comportamento da IA</h2>

      <div className="mb-4 flex items-center justify-between rounded-lg border border-gray-200 p-4">
        <div>
          <p className="font-medium">IA ativada</p>
          <p className="text-sm text-gray-600">Quando desativada, todas as conversas vão direto para atendimento humano</p>
        </div>
        <button
          onClick={() => update.mutate({ aiEnabled: !settings.aiEnabled })}
          className={cn(
            'relative h-6 w-11 rounded-full transition',
            settings.aiEnabled ? 'bg-brand-600' : 'bg-gray-300',
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 h-5 w-5 rounded-full bg-white transition',
              settings.aiEnabled ? 'left-5' : 'left-0.5',
            )}
          />
        </button>
      </div>

      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium">Mensagem de boas-vindas</label>
        <textarea
          className="input"
          rows={3}
          defaultValue={settings.welcomeMessage ?? ''}
          onBlur={(e) => update.mutate({ welcomeMessage: e.target.value })}
          placeholder="Olá! Bem-vindo à nossa loja."
        />
      </div>

      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium">Instruções específicas para a IA</label>
        <p className="mb-2 text-xs text-gray-500">
          Dica: "sempre ofereça película ao vender celular", "não dê desconto sem consultar", "só trabalhamos com Apple e Xiaomi"
        </p>
        <textarea
          className="input"
          rows={5}
          defaultValue={settings.aiInstructions ?? ''}
          onBlur={(e) => update.mutate({ aiInstructions: e.target.value })}
          placeholder="Instruções que a IA deve seguir..."
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Palavras que transferem para humano</label>
        <p className="mb-2 text-xs text-gray-500">Separe por vírgula</p>
        <input
          className="input"
          defaultValue={settings.handoffKeywords?.join(', ') ?? ''}
          onBlur={(e) => {
            const keywords = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
            update.mutate({ handoffKeywords: keywords });
          }}
          placeholder="falar com atendente, reclamação, problema"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// FAQs tab
// ---------------------------------------------------------------

interface Faq {
  id: string;
  question: string;
  answer: string;
  keywords: string[];
  active: boolean;
}

function FaqsTab() {
  const qc = useQueryClient();
  const { data: faqs = [] } = useQuery({
    queryKey: ['faqs'],
    queryFn: async () => {
      const { data } = await api.get<Faq[]>('/settings/faqs');
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async (payload: any) => {
      const { data } = await api.post('/settings/faqs', payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['faqs'] });
      toast.success('FAQ adicionada');
    },
    onError: (e) => toast.error(extractApiError(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/settings/faqs/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['faqs'] });
      toast.success('FAQ removida');
    },
  });

  const [showForm, setShowForm] = useState(false);

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Perguntas frequentes</h2>
          <p className="text-sm text-gray-600">
            Respostas automáticas para perguntas comuns - elas não consomem IA, resposta instantânea.
          </p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          Nova FAQ
        </button>
      </div>

      {showForm && <NewFaqForm onClose={() => setShowForm(false)} onCreate={(payload) => create.mutate(payload)} />}

      <div className="space-y-3">
        {faqs.map((faq) => (
          <div key={faq.id} className="card p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-medium">{faq.question}</h3>
                <p className="mt-1 text-sm text-gray-600">{faq.answer}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {faq.keywords.map((kw) => (
                    <span key={kw} className="badge bg-gray-100 text-gray-700">
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
              <button
                onClick={() => confirm('Remover esta FAQ?') && remove.mutate(faq.id)}
                className="text-sm text-red-600 hover:underline"
              >
                Remover
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NewFaqForm({ onClose, onCreate }: { onClose: () => void; onCreate: (p: any) => void }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [keywords, setKeywords] = useState('');

  const submit = () => {
    if (!question || !answer) return;
    onCreate({
      question,
      answer,
      keywords: keywords.split(',').map((s) => s.trim()).filter(Boolean),
    });
    onClose();
  };

  return (
    <div className="card mb-4 p-4">
      <div className="mb-3">
        <label className="mb-1 block text-sm font-medium">Pergunta</label>
        <input className="input" value={question} onChange={(e) => setQuestion(e.target.value)} />
      </div>
      <div className="mb-3">
        <label className="mb-1 block text-sm font-medium">Resposta automática</label>
        <textarea className="input" rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} />
      </div>
      <div className="mb-3">
        <label className="mb-1 block text-sm font-medium">Palavras-chave (separe por vírgula)</label>
        <input
          className="input"
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder="horário, que horas, abertura"
        />
      </div>
      <div className="flex gap-2">
        <button onClick={onClose} className="btn-secondary">Cancelar</button>
        <button onClick={submit} className="btn-primary">Salvar FAQ</button>
      </div>
    </div>
  );
}
