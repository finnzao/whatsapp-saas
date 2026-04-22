export interface FaqTemplate {
  question: string;
  answer: string;
  keywords: string[];
}

export interface FaqTemplateGroup {
  id: string;
  name: string;
  description: string;
  segment: string;
  templates: FaqTemplate[];
}

export const FAQ_TEMPLATES: FaqTemplateGroup[] = [
  {
    id: 'varejo-geral',
    name: 'Varejo Geral',
    description: 'Perguntas básicas comuns a qualquer tipo de loja',
    segment: 'geral',
    templates: [
      {
        question: 'Qual o horário de funcionamento?',
        answer:
          'Atendemos de segunda a sábado, das 9h às 19h. Domingos fechado. Personalize esta resposta nas configurações.',
        keywords: ['horário', 'horario', 'funcionamento', 'aberto', 'abertura', 'fechamento', 'que horas abre', 'que horas fecha'],
      },
      {
        question: 'Qual o endereço da loja?',
        answer:
          'Nosso endereço é [INSIRA AQUI]. Personalize esta resposta nas configurações com seu endereço real.',
        keywords: ['endereço', 'endereco', 'onde fica', 'localização', 'localizacao', 'como chegar', 'rua', 'avenida'],
      },
      {
        question: 'Vocês fazem entrega?',
        answer:
          'Sim, entregamos em toda a cidade. Frete grátis acima de R$ 200. Abaixo disso taxa de R$ 15. Personalize conforme sua política.',
        keywords: ['entrega', 'entregam', 'delivery', 'frete', 'motoboy', 'levam em casa'],
      },
      {
        question: 'Quais formas de pagamento vocês aceitam?',
        answer:
          'Aceitamos PIX, cartão de crédito em até 12x, débito e dinheiro. Personalize esta resposta conforme suas opções.',
        keywords: ['pagamento', 'pagar', 'cartão', 'cartao', 'pix', 'parcelar', 'parcelamento', 'dinheiro', 'crediário'],
      },
      {
        question: 'Qual o contato/telefone de vocês?',
        answer: 'Você já está falando com a gente! Para outros contatos: [INSIRA AQUI].',
        keywords: ['telefone', 'contato', 'whatsapp', 'ligar', 'falar'],
      },
    ],
  },
  {
    id: 'eletronicos',
    name: 'Eletrônicos e Celulares',
    description: 'Perguntas específicas de lojas de celulares, eletrônicos e acessórios',
    segment: 'eletronicos',
    templates: [
      {
        question: 'Aceitam aparelho usado na troca?',
        answer:
          'Sim, fazemos avaliação do seu aparelho usado para desconto na compra de um novo. Traga na loja ou envie fotos/vídeo do aparelho funcionando para avaliação.',
        keywords: ['troca', 'trocar aparelho', 'usado', 'seminovo na troca', 'avaliação', 'avaliacao do meu'],
      },
      {
        question: 'Qual a garantia dos produtos?',
        answer:
          'Produtos novos: garantia de fábrica (geralmente 1 ano). Seminovos: 90 dias de garantia da loja cobrindo defeitos de funcionamento.',
        keywords: ['garantia', 'garante', 'defeito', 'estraga', 'problema depois'],
      },
      {
        question: 'Fazem desbloqueio/liberação de operadora?',
        answer:
          'Depende do modelo. Entre em contato com um atendente para verificar a viabilidade e o preço.',
        keywords: ['desbloqueio', 'desbloquear', 'liberar operadora', 'chip de outra operadora'],
      },
      {
        question: 'Assistência técnica / conserto',
        answer:
          'Para assistência técnica e reparos, preciso te transferir para um atendente especializado. Um momento.',
        keywords: ['assistência', 'assistencia', 'conserto', 'consertar', 'arrumar', 'tela quebrada', 'bateria viciada', 'não liga', 'nao liga'],
      },
      {
        question: 'Tem película e capinha disponível?',
        answer:
          'Sim, temos películas 3D e capinhas de silicone/transparentes para a maioria dos modelos. Nos diga qual seu celular que verificamos.',
        keywords: ['película', 'pelicula', 'capinha', 'capa', 'proteção', 'protetor de tela'],
      },
    ],
  },
  {
    id: 'moda',
    name: 'Moda e Vestuário',
    description: 'Perguntas para lojas de roupas, calçados e acessórios',
    segment: 'moda',
    templates: [
      {
        question: 'Como funciona a troca de peças?',
        answer:
          'Trocas em até 7 dias com a peça sem uso, com etiqueta e nota fiscal. Para defeitos o prazo é de 30 dias.',
        keywords: ['troca', 'trocar peça', 'devolução', 'devolucao', 'não gostei', 'nao serviu', 'ficou pequeno', 'ficou grande'],
      },
      {
        question: 'Qual a tabela de tamanhos?',
        answer:
          'Posso te enviar a tabela. Qual peça você quer conferir: camiseta, calça, vestido, calçado?',
        keywords: ['tamanho', 'tamanhos', 'tabela', 'medida', 'medidas', 'p m g', 'numero calça'],
      },
      {
        question: 'Tem outras cores/tamanhos disponíveis?',
        answer: 'Vou verificar no estoque. Me diga o código da peça ou me envia uma foto.',
        keywords: ['outras cores', 'tem em azul', 'tem em preto', 'tem número', 'outro tamanho'],
      },
    ],
  },
  {
    id: 'alimentacao',
    name: 'Alimentação e Delivery',
    description: 'Perguntas para restaurantes, lanchonetes e food delivery',
    segment: 'alimentacao',
    templates: [
      {
        question: 'Qual o tempo de entrega?',
        answer:
          'Nosso tempo médio de entrega é de 30 a 50 minutos, dependendo da região e movimento.',
        keywords: ['tempo de entrega', 'quanto demora', 'quanto tempo', 'vai chegar', 'demora'],
      },
      {
        question: 'Têm cardápio atualizado?',
        answer:
          'Sim, posso te enviar o cardápio. Me diga se prefere salgados, doces, bebidas ou o cardápio completo.',
        keywords: ['cardápio', 'cardapio', 'menu', 'o que tem', 'tem de comer'],
      },
      {
        question: 'Fazem encomenda para eventos?',
        answer:
          'Sim, fazemos encomendas. Para orçamento me diga a data, quantidade de pessoas e tipo de evento.',
        keywords: ['encomenda', 'encomendar', 'festa', 'evento', 'aniversário', 'aniversario', 'casamento'],
      },
    ],
  },
];
