'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  Smartphone,
  Bot,
  HelpCircle,
  RefreshCw,
  QrCode,
  Plus,
  Pencil,
  Trash2,
  Sparkles,
  Check,
  X as XIcon,
  Settings2,
} from 'lucide-react';
import { api, extractApiError } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { TagInput } from '@/components/ui/TagInput';
import { ValidatedInput } from '@/components/ui/ValidatedInput';
import { ValidatedTextarea } from '@/components/ui/ValidatedTextarea';
import {
  faqSchema,
  customFieldDefinitionSchema,
  type FaqInput,
  type CustomFieldDefinitionInput,
} from '@/lib/validation/schemas';
import { maskCustomFieldKey } from '@/lib/validation/masks';
import {
  useCustomFieldDefinitions,
  useCreateCustomField,
  useDeleteCustomField,
} from '@/lib/hooks/useCustomFields';
import type { CustomFieldDefinition } from '@/components/ui/CustomFieldRenderer';

type Tab = 'whatsapp' | 'ia' | 'faqs' | 'custom-fields';

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
        <TabButton
          active={tab === 'custom-fields'}
          onClick={() => setTab('custom-fields')}
          icon={Settings2}
        >
          Campos personalizados
        </TabButton>
      </div>

      {tab === 'whatsapp' && <WhatsAppTab />}
      {tab === 'ia' && <AiTab />}
      {tab === 'faqs' && <FaqsTab />}
      {tab === 'custom-fields' && <CustomFieldsTab />}
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
        active ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-600 hover:text-gray-900',
      )}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}

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
      toast.success('Instância criada');
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
        <button onClick={() => createInstance.mutate()} className="btn-primary" disabled={createInstance.isPending}>
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
              WhatsApp conectado com sucesso.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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
          <p className="text-sm text-gray-600">
            Quando desativada, FAQs ainda funcionam mas perguntas fora delas vão direto para atendimento humano
          </p>
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
          Dica: "sempre ofereça película ao vender celular", "não dê desconto sem consultar"
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
        <p className="mb-2 text-xs text-gray-500">Pressione Enter ou vírgula para adicionar</p>
        <TagInput
          value={settings.handoffKeywords ?? []}
          onChange={(keywords) => update.mutate({ handoffKeywords: keywords })}
          placeholder="Ex: falar com atendente, reclamação..."
        />
      </div>
    </div>
  );
}

interface Faq {
  id: string;
  question: string;
  answer: string;
  keywords: string[];
  active: boolean;
}

interface TemplateGroup {
  id: string;
  name: string;
  description: string;
  segment: string;
  count: number;
  templates: Array<{ question: string; answer: string; keywords: string[] }>;
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
  const [editing, setEditing] = useState<Faq | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Perguntas frequentes</h2>
          <p className="text-sm text-gray-600">
            Respostas automáticas para perguntas comuns. Resposta instantânea, sem consumir IA.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowTemplates(true)} className="btn-secondary">
            <Sparkles className="h-4 w-4" /> Usar modelo pronto
          </button>
          <button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="btn-primary"
          >
            <Plus className="h-4 w-4" /> Nova FAQ
          </button>
        </div>
      </div>

      {showForm && (
        <FaqForm
          faq={editing}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
        />
      )}

      {showTemplates && <TemplatesModal onClose={() => setShowTemplates(false)} />}

      {faqs.length === 0 && !showForm && (
        <div className="card flex flex-col items-center p-8 text-center">
          <HelpCircle className="h-10 w-10 text-gray-300" />
          <h3 className="mt-3 font-medium text-gray-900">Nenhuma FAQ cadastrada</h3>
          <p className="mt-1 text-sm text-gray-500">
            Comece rapidamente com um modelo pronto ou crie a primeira manualmente.
          </p>
          <div className="mt-4 flex gap-2">
            <button onClick={() => setShowTemplates(true)} className="btn-secondary">
              <Sparkles className="h-4 w-4" /> Ver modelos
            </button>
            <button onClick={() => setShowForm(true)} className="btn-primary">
              <Plus className="h-4 w-4" /> Criar FAQ
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {faqs.map((faq) => (
          <div key={faq.id} className="card p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h3 className="font-medium">{faq.question}</h3>
                <p className="mt-1 text-sm text-gray-600">{faq.answer}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {faq.keywords.map((kw) => (
                    <span
                      key={kw}
                      className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => {
                    setEditing(faq);
                    setShowForm(true);
                  }}
                  className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                  aria-label="Editar"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => confirm('Remover esta FAQ?') && remove.mutate(faq.id)}
                  className="rounded p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
                  aria-label="Remover"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FaqForm({ faq, onClose }: { faq: Faq | null; onClose: () => void }) {
  const qc = useQueryClient();
  const isEditing = !!faq;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FaqInput>({
    resolver: zodResolver(faqSchema),
    defaultValues: {
      question: faq?.question ?? '',
      answer: faq?.answer ?? '',
      keywords: faq?.keywords ?? [],
    },
    mode: 'onBlur',
  });

  const keywords = watch('keywords');

  const save = useMutation({
    mutationFn: async (data: FaqInput) => {
      if (isEditing) {
        const { data: res } = await api.patch(`/settings/faqs/${faq!.id}`, data);
        return res;
      }
      const { data: res } = await api.post('/settings/faqs', data);
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['faqs'] });
      toast.success(isEditing ? 'FAQ atualizada' : 'FAQ criada');
      onClose();
    },
    onError: (e) => toast.error(extractApiError(e)),
  });

  return (
    <div className="card mb-4 p-4">
      <h3 className="mb-3 font-medium">{isEditing ? 'Editar FAQ' : 'Nova FAQ'}</h3>
      <form onSubmit={handleSubmit((data) => save.mutate(data))} className="space-y-3" noValidate>
        <ValidatedInput
          label="Pergunta"
          required
          placeholder="Ex: Qual o horário de funcionamento?"
          error={errors.question?.message}
          {...register('question')}
        />
        <ValidatedTextarea
          label="Resposta automática"
          required
          rows={3}
          placeholder="Essa resposta será enviada quando o cliente perguntar isso."
          error={errors.answer?.message}
          {...register('answer')}
        />
        <TagInput
          label="Palavras-chave"
          required
          value={keywords}
          onChange={(tags) => setValue('keywords', tags, { shouldValidate: true })}
          placeholder="Ex: horário, que horas, abertura..."
          helpText="Pressione Enter ou vírgula para adicionar"
          error={errors.keywords?.message as string | undefined}
        />
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={isSubmitting || save.isPending}>
            <Check className="h-4 w-4" />
            {save.isPending ? 'Salvando...' : 'Salvar FAQ'}
          </button>
        </div>
      </form>
    </div>
  );
}

function TemplatesModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['faq-templates'],
    queryFn: async () => {
      const { data } = await api.get<TemplateGroup[]>('/settings/faqs/templates');
      return data;
    },
  });

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedQuestions, setSelectedQuestions] = useState<Set<string>>(new Set());

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);

  const importMut = useMutation({
    mutationFn: async () => {
      if (!selectedGroupId) return;
      const { data } = await api.post('/settings/faqs/import-template', {
        groupId: selectedGroupId,
        templateQuestions: selectedQuestions.size === 0 ? undefined : Array.from(selectedQuestions),
      });
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['faqs'] });
      toast.success(
        `${data.imported} FAQ${data.imported !== 1 ? 's' : ''} importada${data.imported !== 1 ? 's' : ''}${data.skipped ? ` (${data.skipped} já existiam)` : ''}`,
      );
      onClose();
    },
    onError: (e) => toast.error(extractApiError(e)),
  });

  const toggleQuestion = (question: string) => {
    setSelectedQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(question)) next.delete(question);
      else next.add(question);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-brand-600" />
            <h2 className="text-lg font-semibold">Modelos de FAQ prontos</h2>
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
                onClick={() => {
                  setSelectedGroupId(group.id);
                  setSelectedQuestions(new Set());
                }}
                className={cn(
                  'w-full border-b border-gray-200 px-4 py-3 text-left text-sm transition',
                  selectedGroupId === group.id
                    ? 'bg-white font-medium text-brand-700'
                    : 'text-gray-700 hover:bg-white',
                )}
              >
                <div className="font-medium">{group.name}</div>
                <div className="mt-0.5 text-xs text-gray-500">{group.count} FAQs</div>
              </button>
            ))}
          </div>

          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {!selectedGroup ? (
              <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-gray-500">
                Selecione um grupo ao lado para ver as FAQs disponíveis
              </div>
            ) : (
              <>
                <div className="border-b border-gray-200 bg-white px-6 py-3">
                  <h3 className="font-medium">{selectedGroup.name}</h3>
                  <p className="text-xs text-gray-500">{selectedGroup.description}</p>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto p-4">
                  {selectedGroup.templates.map((template) => {
                    const selected = selectedQuestions.has(template.question);
                    return (
                      <button
                        key={template.question}
                        onClick={() => toggleQuestion(template.question)}
                        className={cn(
                          'w-full rounded-lg border p-3 text-left transition',
                          selected
                            ? 'border-brand-500 bg-brand-50'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50',
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <div
                            className={cn(
                              'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                              selected ? 'border-brand-600 bg-brand-600' : 'border-gray-300',
                            )}
                          >
                            {selected && <Check className="h-3 w-3 text-white" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium">{template.question}</div>
                            <div className="mt-1 text-xs text-gray-600">{template.answer}</div>
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

        <div className="flex items-center justify-between border-t border-gray-200 px-6 py-3">
          <p className="text-xs text-gray-500">
            {selectedGroup && selectedQuestions.size > 0
              ? `${selectedQuestions.size} selecionadas`
              : selectedGroup
                ? 'Nenhuma selecionada — importa todas'
                : ''}
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary">
              Cancelar
            </button>
            <button
              onClick={() => importMut.mutate()}
              className="btn-primary"
              disabled={!selectedGroupId || importMut.isPending}
            >
              {importMut.isPending ? 'Importando...' : 'Importar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CustomFieldsTab() {
  const { data: fields = [], isLoading } = useCustomFieldDefinitions('product');
  const deleteField = useDeleteCustomField();
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Campos personalizados de produtos</h2>
          <p className="text-sm text-gray-600">
            Crie campos como "Cor", "Tamanho", "Material" — eles aparecem no formulário de produto e
            a IA usa no atendimento.
          </p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> Novo campo
        </button>
      </div>

      {showForm && <CustomFieldForm onClose={() => setShowForm(false)} />}

      {isLoading && <div className="text-sm text-gray-500">Carregando...</div>}

      {!isLoading && fields.length === 0 && !showForm && (
        <div className="card flex flex-col items-center p-8 text-center">
          <Settings2 className="h-10 w-10 text-gray-300" />
          <h3 className="mt-3 font-medium text-gray-900">Nenhum campo personalizado</h3>
          <p className="mt-1 text-sm text-gray-500">
            Exemplo: loja de moda cria campo "Tamanho" com opções P, M, G. Loja de eletrônicos cria
            "Voltagem" com opções 110V, 220V, Bivolt.
          </p>
          <button onClick={() => setShowForm(true)} className="btn-primary mt-4">
            <Plus className="h-4 w-4" /> Criar primeiro campo
          </button>
        </div>
      )}

      <div className="space-y-3">
        {fields.map((field) => (
          <CustomFieldCard
            key={field.id}
            field={field}
            onDelete={() => {
              if (
                confirm(
                  `Remover o campo "${field.label}"?\n\nValores deste campo nos produtos não serão apagados, mas o campo não aparecerá mais no formulário.`,
                )
              ) {
                deleteField.mutate(field.id);
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}

function CustomFieldCard({
  field,
  onDelete,
}: {
  field: CustomFieldDefinition;
  onDelete: () => void;
}) {
  const typeLabels: Record<string, string> = {
    TEXT: 'Texto curto',
    TEXTAREA: 'Texto longo',
    NUMBER: 'Número',
    BOOLEAN: 'Sim/Não',
    SELECT: 'Seleção única',
    MULTISELECT: 'Múltipla escolha',
    DATE: 'Data',
    COLOR: 'Cor',
  };

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium">{field.label}</h3>
            <span className="badge bg-gray-100 text-gray-700">{typeLabels[field.type]}</span>
            {field.required && (
              <span className="badge bg-red-50 text-red-700">Obrigatório</span>
            )}
          </div>
          <p className="mt-1 font-mono text-xs text-gray-500">key: {field.key}</p>
          {field.options && field.options.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {field.options.map((opt) => (
                <span
                  key={opt}
                  className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700"
                >
                  {opt}
                </span>
              ))}
            </div>
          )}
          {field.helpText && <p className="mt-2 text-xs text-gray-500">{field.helpText}</p>}
        </div>
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

function CustomFieldForm({ onClose }: { onClose: () => void }) {
  const create = useCreateCustomField();
  const [optionsInput, setOptionsInput] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CustomFieldDefinitionInput>({
    resolver: zodResolver(customFieldDefinitionSchema),
    defaultValues: {
      key: '',
      label: '',
      type: 'TEXT',
      options: [],
      required: false,
      placeholder: '',
      helpText: '',
    },
    mode: 'onBlur',
  });

  const type = watch('type');
  const label = watch('label');
  const needsOptions = type === 'SELECT' || type === 'MULTISELECT';

  const onLabelBlur = (value: string) => {
    const currentKey = watch('key');
    if (!currentKey && value) {
      setValue('key', maskCustomFieldKey(value), { shouldValidate: true });
    }
  };

  const onSubmit = (data: CustomFieldDefinitionInput) => {
    create.mutate(
      {
        entity: 'product',
        ...data,
        options: needsOptions ? optionsInput : undefined,
        placeholder: data.placeholder || undefined,
        helpText: data.helpText || undefined,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <div className="card mb-4 p-4">
      <h3 className="mb-3 font-medium">Novo campo personalizado</h3>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
        <ValidatedInput
          label="Nome do campo"
          required
          placeholder="Ex: Cor, Tamanho, Voltagem"
          helpText="Como aparece no formulário"
          error={errors.label?.message}
          {...register('label', { onBlur: (e) => onLabelBlur(e.target.value) })}
        />

        <ValidatedInput
          label="Chave técnica"
          required
          placeholder="ex: cor, tamanho"
          helpText="Identificador interno. Só letras minúsculas, números e underscore."
          error={errors.key?.message}
          mask={maskCustomFieldKey}
          {...register('key')}
        />

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Tipo <span className="text-red-500">*</span>
          </label>
          <select className="input" {...register('type')}>
            <option value="TEXT">Texto curto</option>
            <option value="TEXTAREA">Texto longo</option>
            <option value="NUMBER">Número</option>
            <option value="BOOLEAN">Sim/Não</option>
            <option value="SELECT">Seleção única</option>
            <option value="MULTISELECT">Múltipla escolha</option>
            <option value="DATE">Data</option>
            <option value="COLOR">Cor</option>
          </select>
        </div>

        {needsOptions && (
          <TagInput
            label="Opções"
            required
            value={optionsInput}
            onChange={setOptionsInput}
            placeholder="Ex: Azul, Vermelho, Verde..."
            helpText="Pressione Enter para adicionar cada opção"
          />
        )}

        <ValidatedInput
          label="Texto de ajuda (opcional)"
          placeholder="Dica que aparece abaixo do campo"
          error={errors.helpText?.message}
          {...register('helpText')}
        />

        <label className="flex cursor-pointer items-center gap-2 pt-1">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-brand-600"
            {...register('required')}
          />
          <span className="text-sm font-medium text-gray-700">Campo obrigatório</span>
        </label>

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancelar
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={isSubmitting || create.isPending || (needsOptions && optionsInput.length === 0)}
          >
            <Check className="h-4 w-4" />
            {create.isPending ? 'Criando...' : 'Criar campo'}
          </button>
        </div>
      </form>
    </div>
  );
}
