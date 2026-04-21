import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/**
 * Seed de desenvolvimento.
 * Cria um tenant de exemplo (loja de eletrônicos) com usuário owner,
 * algumas categorias, produtos e FAQs.
 */
async function main() {
  console.log('Iniciando seed...');

  // Tenant + owner
  const password = await bcrypt.hash('senha123', 10);
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'loja-demo' },
    update: {},
    create: {
      name: 'Loja Demo Eletrônicos',
      slug: 'loja-demo',
      segment: 'eletronicos',
      status: 'TRIAL',
      settings: {
        create: {
          welcomeMessage: 'Olá! Bem-vindo à Loja Demo. Como posso ajudar?',
          awayMessage: 'Estamos fora do horário de atendimento. Retornamos às 8h.',
          aiEnabled: true,
          aiInstructions: 'Somos especializados em celulares Apple e Xiaomi. Aceitamos PIX, cartão e parcelamento em até 12x.',
          handoffKeywords: ['falar com atendente', 'quero um humano', 'reclamação'],
        },
      },
    },
  });

  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'admin@loja.com' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'admin@loja.com',
      password,
      name: 'Admin da Loja',
      role: 'OWNER',
    },
  });

  // Categorias
  const categories = await Promise.all(
    [
      { name: 'Celulares', slug: 'celulares', order: 1 },
      { name: 'Acessórios', slug: 'acessorios', order: 2 },
      { name: 'Áudio', slug: 'audio', order: 3 },
    ].map((cat) =>
      prisma.category.upsert({
        where: { tenantId_slug: { tenantId: tenant.id, slug: cat.slug } },
        update: {},
        create: { tenantId: tenant.id, ...cat },
      }),
    ),
  );

  const [celulares, acessorios, audio] = categories;

  // Produtos de exemplo
  const produtos = [
    {
      name: 'iPhone 13 128GB Preto',
      description: 'iPhone 13 lacrado, 128GB, cor preta, garantia Apple 1 ano.',
      categoryId: celulares.id,
      price: 3499.0,
      priceCash: 3299.0,
      priceInstallment: 3499.0,
      installments: 12,
      stock: 3,
      condition: 'NEW' as const,
      warranty: '1 ano Apple',
      images: [],
    },
    {
      name: 'iPhone 13 128GB Azul Seminovo',
      description: 'iPhone 13 seminovo, sem marcas, com garantia da loja.',
      categoryId: celulares.id,
      price: 2899.0,
      priceCash: 2799.0,
      priceInstallment: 2899.0,
      installments: 10,
      stock: 1,
      condition: 'SEMINEW' as const,
      warranty: '90 dias loja',
      images: [],
    },
    {
      name: 'Xiaomi Redmi Note 13 256GB',
      description: 'Xiaomi Redmi Note 13, 256GB, tela AMOLED, câmera 108MP.',
      categoryId: celulares.id,
      price: 1899.0,
      stock: 5,
      installments: 10,
      images: [],
    },
    {
      name: 'Capa Silicone iPhone 13',
      description: 'Capa de silicone original, várias cores disponíveis.',
      categoryId: acessorios.id,
      price: 89.9,
      stock: 20,
      images: [],
    },
    {
      name: 'Película 3D iPhone 13',
      description: 'Película de vidro 3D com colocação grátis.',
      categoryId: acessorios.id,
      price: 49.9,
      stock: 15,
      images: [],
    },
    {
      name: 'AirPods Pro 2',
      description: 'AirPods Pro 2ª geração, cancelamento de ruído ativo.',
      categoryId: audio.id,
      price: 1899.0,
      stock: 2,
      installments: 10,
      images: [],
    },
  ];

  for (const p of produtos) {
    await prisma.product.create({ data: { tenantId: tenant.id, ...p } });
  }

  // FAQs
  const faqs = [
    {
      question: 'Qual o horário de funcionamento?',
      answer: 'Atendemos de segunda a sábado, das 9h às 19h. Domingos fechado.',
      keywords: ['horário', 'horario', 'funcionamento', 'aberto', 'que horas'],
    },
    {
      question: 'Qual o endereço da loja?',
      answer: 'Rua Exemplo, 123 - Centro. Referência: ao lado do banco.',
      keywords: ['endereço', 'endereco', 'onde fica', 'localização', 'localizacao'],
    },
    {
      question: 'Fazem entrega?',
      answer: 'Sim! Entregamos em toda a cidade. Grátis acima de R$ 200, abaixo disso taxa de R$ 15.',
      keywords: ['entrega', 'entregam', 'delivery', 'frete'],
    },
    {
      question: 'Formas de pagamento?',
      answer: 'Aceitamos PIX (5% de desconto), cartão de crédito em até 12x e débito.',
      keywords: ['pagamento', 'pagam', 'cartão', 'cartao', 'pix', 'parcelar', 'parcelamento'],
    },
  ];

  for (const faq of faqs) {
    await prisma.faq.create({ data: { tenantId: tenant.id, ...faq } });
  }

  console.log('Seed concluído!');
  console.log('Login: admin@loja.com / senha123');
  console.log(`Tenant ID: ${tenant.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
