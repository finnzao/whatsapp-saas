/**
 * Categorias-padrão por segmento de varejo brasileiro.
 *
 * Cada categoria tem `description` curta e ESPECÍFICA — esse texto vai
 * direto para a IA quando o cliente pergunta "o que vocês vendem?".
 * Categorias sem descrição fazem a IA responder genericamente; com
 * descrição ela cita exemplos concretos.
 *
 * `keywords` é a lista de termos do cliente que ativam esta categoria
 * na busca. Inclui sinônimos, plurais, gírias e marcas comuns. A IA usa
 * isso pra decidir se a pergunta do cliente é coberta por esta categoria.
 *
 * Os pacotes são editáveis: o lojista importa, ajusta nomes/descrições e
 * os dados ficam no banco como qualquer outra categoria.
 */
export interface CategoryTemplate {
  name: string;
  slug: string;
  description: string;
  keywords: string[];
  order: number;
}

export interface CategoryTemplateGroup {
  id: string;
  name: string;
  description: string;
  segment: string;
  categories: CategoryTemplate[];
}

export const CATEGORY_TEMPLATES: CategoryTemplateGroup[] = [
  {
    id: 'eletronicos',
    name: 'Eletrônicos e Celulares',
    description: 'Loja de smartphones, acessórios, áudio e informática',
    segment: 'eletronicos',
    categories: [
      {
        name: 'Smartphones',
        slug: 'smartphones',
        description: 'iPhones, Samsung Galaxy, Xiaomi, Motorola — novos e seminovos',
        keywords: [
          'celular', 'celulares', 'smartphone', 'aparelho', 'aparelhos',
          'iphone', 'galaxy', 'xiaomi', 'redmi', 'motorola', 'moto', 'apple', 'samsung',
        ],
        order: 1,
      },
      {
        name: 'Acessórios para celular',
        slug: 'acessorios-celular',
        description: 'Capinhas, películas 3D, suportes, popsockets',
        keywords: [
          'capinha', 'capinhas', 'capa', 'capas', 'case',
          'pelicula', 'peliculas', 'protetor', 'vidro 3d',
          'suporte', 'popsocket', 'pop socket',
        ],
        order: 2,
      },
      {
        name: 'Carregadores e cabos',
        slug: 'carregadores-cabos',
        description: 'Carregadores rápidos, cabos USB-C/Lightning, adaptadores',
        keywords: [
          'carregador', 'carregadores', 'fonte', 'fontes',
          'cabo', 'cabos', 'tomada', 'adaptador', 'adaptadores',
          '20w', '65w', '30w', 'usb', 'tipo c', 'usb c', 'lightning',
        ],
        order: 3,
      },
      {
        name: 'Fones e áudio',
        slug: 'fones-audio',
        description: 'Fones bluetooth, AirPods, headsets gamer, caixas de som',
        keywords: [
          'fone', 'fones', 'headphone', 'headphones', 'earphone', 'headset',
          'airpod', 'airpods', 'bluetooth',
          'caixa de som', 'caixinha', 'caixinhas', 'speaker', 'soundbar', 'jbl',
        ],
        order: 4,
      },
      {
        name: 'Smartwatches',
        slug: 'smartwatches',
        description: 'Apple Watch, Galaxy Watch, smartbands fitness',
        keywords: [
          'smartwatch', 'smartwatches', 'relogio', 'relogios', 'relógio',
          'apple watch', 'galaxy watch', 'smartband', 'mi band', 'pulseira',
        ],
        order: 5,
      },
      {
        name: 'Powerbanks',
        slug: 'powerbanks',
        description: 'Carregadores portáteis de 5.000 a 30.000 mAh',
        keywords: [
          'powerbank', 'powerbanks', 'power bank',
          'bateria portatil', 'bateria externa', 'carregador portatil', 'mah',
        ],
        order: 6,
      },
      {
        name: 'Notebooks',
        slug: 'notebooks',
        description: 'Notebooks novos e seminovos para trabalho e estudo',
        keywords: [
          'notebook', 'notebooks', 'laptop', 'laptops', 'ultrabook',
          'macbook', 'dell', 'lenovo', 'acer', 'asus', 'positivo',
        ],
        order: 7,
      },
      {
        name: 'Tablets',
        slug: 'tablets',
        description: 'iPad, Galaxy Tab, tablets para estudo',
        keywords: [
          'tablet', 'tablets', 'ipad', 'galaxy tab', 'tab',
        ],
        order: 8,
      },
    ],
  },
  {
    id: 'moda',
    name: 'Moda e Vestuário',
    description: 'Loja de roupas, calçados e acessórios',
    segment: 'moda',
    categories: [
      {
        name: 'Camisetas',
        slug: 'camisetas',
        description: 'Camisetas masculinas e femininas, lisas e estampadas',
        keywords: [
          'camiseta', 'camisetas', 'camisa', 'camisas', 'blusa', 'blusas',
          't-shirt', 'tshirt', 'regata',
        ],
        order: 1,
      },
      {
        name: 'Calças',
        slug: 'calcas',
        description: 'Calças jeans, sociais, alfaiataria, esportivas',
        keywords: [
          'calca', 'calcas', 'calça', 'calças',
          'jeans', 'social', 'alfaiataria', 'jogger', 'legging',
          'short', 'shorts', 'bermuda', 'bermudas',
        ],
        order: 2,
      },
      {
        name: 'Vestidos',
        slug: 'vestidos',
        description: 'Vestidos casuais, festa, midi, longos',
        keywords: [
          'vestido', 'vestidos', 'midi', 'longo', 'curto', 'festa',
          'saia', 'saias',
        ],
        order: 3,
      },
      {
        name: 'Tênis e calçados',
        slug: 'tenis-calcados',
        description: 'Tênis esportivos, casuais, sapatos sociais, sandálias',
        keywords: [
          'tenis', 'tênis', 'sapato', 'sapatos', 'sandalia', 'sandalias',
          'bota', 'botas', 'chinelo', 'chinelos', 'rasteirinha',
          'nike', 'adidas', 'mizuno', 'puma', 'olympikus',
        ],
        order: 4,
      },
      {
        name: 'Bolsas e mochilas',
        slug: 'bolsas-mochilas',
        description: 'Bolsas femininas, mochilas, carteiras',
        keywords: [
          'bolsa', 'bolsas', 'mochila', 'mochilas', 'carteira', 'carteiras',
          'pochete', 'necessaire',
        ],
        order: 5,
      },
      {
        name: 'Acessórios',
        slug: 'acessorios-moda',
        description: 'Cintos, óculos de sol, bonés, bijuterias',
        keywords: [
          'cinto', 'cintos', 'oculos', 'óculos', 'oculos de sol',
          'bone', 'bonés', 'boné', 'chapeu',
          'bijuteria', 'bijuterias', 'colar', 'pulseira', 'brinco',
        ],
        order: 6,
      },
    ],
  },
  {
    id: 'beleza',
    name: 'Beleza e Cosméticos',
    description: 'Loja de cosméticos, perfumes e cuidados pessoais',
    segment: 'beleza',
    categories: [
      {
        name: 'Perfumes',
        slug: 'perfumes',
        description: 'Perfumes nacionais e importados, masculino e feminino',
        keywords: [
          'perfume', 'perfumes', 'fragrancia', 'fragrância',
          'colonia', 'colônia', 'eau de parfum', 'edp', 'edt',
        ],
        order: 1,
      },
      {
        name: 'Cabelos',
        slug: 'cabelos',
        description: 'Shampoos, condicionadores, máscaras, tintas',
        keywords: [
          'shampoo', 'shampoos', 'condicionador', 'condicionadores',
          'mascara capilar', 'máscara', 'tinta', 'tintura', 'coloracao',
          'progressiva', 'cabelo', 'cabelos',
        ],
        order: 2,
      },
      {
        name: 'Maquiagem',
        slug: 'maquiagem',
        description: 'Bases, batons, máscaras, paletas de sombra',
        keywords: [
          'maquiagem', 'make', 'base', 'batom', 'batons',
          'rimel', 'rímel', 'mascara de cilios', 'sombra', 'paleta',
          'po', 'pó', 'blush', 'corretivo', 'iluminador',
        ],
        order: 3,
      },
      {
        name: 'Skincare',
        slug: 'skincare',
        description: 'Hidratantes, séruns, protetor solar, ácidos',
        keywords: [
          'skincare', 'hidratante', 'serum', 'sérum',
          'protetor solar', 'filtro solar', 'fps',
          'acido hialuronico', 'vitamina c', 'retinol', 'niacinamida',
          'sabonete facial', 'tonico',
        ],
        order: 4,
      },
      {
        name: 'Cuidados corporais',
        slug: 'corpo',
        description: 'Hidratantes corporais, esfoliantes, depilação',
        keywords: [
          'hidratante corporal', 'creme corporal', 'esfoliante',
          'depilacao', 'cera', 'lamina',
        ],
        order: 5,
      },
      {
        name: 'Esmaltes e unhas',
        slug: 'unhas',
        description: 'Esmaltes, removedores, kits de manicure',
        keywords: [
          'esmalte', 'esmaltes', 'unha', 'unhas',
          'removedor', 'acetona', 'manicure', 'pedicure', 'lixa',
        ],
        order: 6,
      },
    ],
  },
  {
    id: 'alimentacao',
    name: 'Alimentação e Bebidas',
    description: 'Mercados, padarias, lanchonetes e delivery de comida',
    segment: 'alimentacao',
    categories: [
      {
        name: 'Lanches',
        slug: 'lanches',
        description: 'Hambúrgueres, sanduíches, hot dogs',
        keywords: [
          'lanche', 'lanches', 'hamburguer', 'hambúrguer', 'burger',
          'sanduiche', 'sanduíche', 'hot dog', 'cachorro quente', 'xis',
        ],
        order: 1,
      },
      {
        name: 'Pizzas',
        slug: 'pizzas',
        description: 'Pizzas tradicionais, especiais e doces',
        keywords: [
          'pizza', 'pizzas', 'esfiha', 'esfirra', 'calzone',
        ],
        order: 2,
      },
      {
        name: 'Bebidas',
        slug: 'bebidas',
        description: 'Refrigerantes, sucos, água, cervejas',
        keywords: [
          'bebida', 'bebidas', 'refrigerante', 'refri',
          'suco', 'sucos', 'agua', 'água',
          'cerveja', 'cervejas', 'long neck', 'lata',
          'coca', 'guarana', 'guaraná',
        ],
        order: 3,
      },
      {
        name: 'Sobremesas',
        slug: 'sobremesas',
        description: 'Bolos, tortas, sorvetes, doces',
        keywords: [
          'sobremesa', 'sobremesas', 'bolo', 'bolos', 'torta', 'tortas',
          'sorvete', 'sorvetes', 'doce', 'doces', 'pudim', 'mousse',
        ],
        order: 4,
      },
      {
        name: 'Pratos prontos',
        slug: 'pratos-prontos',
        description: 'Marmitas, executivos, refeições do dia',
        keywords: [
          'marmita', 'marmitas', 'marmitex', 'executivo',
          'prato feito', 'pf', 'refeicao', 'almoco', 'janta',
        ],
        order: 5,
      },
      {
        name: 'Combos e promoções',
        slug: 'combos',
        description: 'Combos de lanche+bebida e promoções do dia',
        keywords: [
          'combo', 'combos', 'promocao', 'promoção', 'promo',
          'desconto', 'oferta',
        ],
        order: 6,
      },
    ],
  },
  {
    id: 'farmacia',
    name: 'Farmácia e Saúde',
    description: 'Farmácias, drogarias, produtos de saúde',
    segment: 'farmacia',
    categories: [
      {
        name: 'Medicamentos sem receita',
        slug: 'medicamentos-mip',
        description: 'Analgésicos, antitérmicos, antialérgicos sem prescrição',
        keywords: [
          'remedio', 'remédio', 'medicamento', 'medicamentos',
          'analgesico', 'antitermico', 'antialergico',
          'dipirona', 'paracetamol', 'ibuprofeno', 'dor de cabeca', 'febre',
        ],
        order: 1,
      },
      {
        name: 'Higiene pessoal',
        slug: 'higiene',
        description: 'Sabonetes, desodorantes, pasta de dente, escovas',
        keywords: [
          'sabonete', 'sabonetes', 'desodorante', 'desodorantes',
          'pasta de dente', 'creme dental', 'escova de dente', 'fio dental',
          'higiene', 'shampoo',
        ],
        order: 2,
      },
      {
        name: 'Suplementos e vitaminas',
        slug: 'suplementos',
        description: 'Vitaminas, minerais, whey protein, colágeno',
        keywords: [
          'suplemento', 'suplementos', 'vitamina', 'vitaminas',
          'whey', 'protein', 'colageno', 'colágeno',
          'creatina', 'omega', 'multivitaminico',
        ],
        order: 3,
      },
      {
        name: 'Cuidados infantis',
        slug: 'infantil',
        description: 'Fraldas, lenços, papinhas, produtos para bebê',
        keywords: [
          'fralda', 'fraldas', 'lenço umedecido', 'lencos',
          'papinha', 'papinhas', 'bebe', 'bebê', 'infantil',
          'mamadeira', 'chupeta',
        ],
        order: 4,
      },
      {
        name: 'Primeiros socorros',
        slug: 'primeiros-socorros',
        description: 'Curativos, soro, álcool, termômetros',
        keywords: [
          'curativo', 'band aid', 'gaze', 'esparadrapo',
          'soro', 'alcool', 'álcool', 'termometro', 'termômetro',
          'mascara', 'luva',
        ],
        order: 5,
      },
      {
        name: 'Dermocosméticos',
        slug: 'dermocosmeticos',
        description: 'Protetor solar, hidratantes, anti-acne',
        keywords: [
          'protetor solar', 'filtro solar', 'fps',
          'hidratante facial', 'anti acne', 'antiacne',
          'la roche', 'vichy', 'eucerin', 'cerave',
        ],
        order: 6,
      },
    ],
  },
  {
    id: 'pet',
    name: 'Pet Shop',
    description: 'Loja de produtos para animais',
    segment: 'pet',
    categories: [
      {
        name: 'Rações',
        slug: 'racoes',
        description: 'Rações para cães e gatos, todas as idades',
        keywords: [
          'racao', 'ração', 'racoes', 'rações',
          'comida de cachorro', 'comida de gato', 'alimento',
          'premier', 'pedigree', 'whiskas', 'royal canin',
        ],
        order: 1,
      },
      {
        name: 'Petiscos',
        slug: 'petiscos',
        description: 'Biscoitos, ossinhos, snacks para cães e gatos',
        keywords: [
          'petisco', 'petiscos', 'biscoito', 'ossinho', 'osso',
          'snack', 'snacks', 'bifinho',
        ],
        order: 2,
      },
      {
        name: 'Brinquedos',
        slug: 'brinquedos-pet',
        description: 'Bolinhas, cordas, mordedores',
        keywords: [
          'brinquedo', 'brinquedos', 'bolinha', 'corda',
          'mordedor', 'kong', 'arranhador',
        ],
        order: 3,
      },
      {
        name: 'Acessórios',
        slug: 'acessorios-pet',
        description: 'Coleiras, peitorais, guias, comedouros',
        keywords: [
          'coleira', 'coleiras', 'peitoral', 'guia',
          'comedouro', 'bebedouro', 'cama de cachorro', 'caminha',
          'transporte', 'caixa de transporte',
        ],
        order: 4,
      },
      {
        name: 'Higiene',
        slug: 'higiene-pet',
        description: 'Shampoos, banho a seco, lenços, areia para gatos',
        keywords: [
          'shampoo pet', 'banho a seco', 'lenco pet',
          'areia de gato', 'areia higienica', 'tapete higienico',
        ],
        order: 5,
      },
      {
        name: 'Saúde animal',
        slug: 'saude-pet',
        description: 'Antipulgas, vermífugos, suplementos',
        keywords: [
          'antipulgas', 'anti pulga', 'vermifugo', 'vermífugo',
          'frontline', 'bravecto', 'remedio pet', 'suplemento pet',
        ],
        order: 6,
      },
    ],
  },
  {
    id: 'casa-decoracao',
    name: 'Casa e Decoração',
    description: 'Loja de utilidades domésticas, móveis e decoração',
    segment: 'casa',
    categories: [
      {
        name: 'Cama, mesa e banho',
        slug: 'cama-mesa-banho',
        description: 'Lençóis, toalhas, jogos americanos',
        keywords: [
          'lencol', 'lençol', 'lencois', 'toalha', 'toalhas',
          'jogo americano', 'edredom', 'cobertor', 'manta',
          'fronha', 'travesseiro',
        ],
        order: 1,
      },
      {
        name: 'Cozinha',
        slug: 'cozinha',
        description: 'Panelas, talheres, utensílios, organizadores',
        keywords: [
          'panela', 'panelas', 'frigideira', 'wok',
          'talher', 'talheres', 'faca', 'garfo', 'colher',
          'utensilio', 'pote', 'tupperware',
        ],
        order: 2,
      },
      {
        name: 'Eletroportáteis',
        slug: 'eletroportateis',
        description: 'Liquidificadores, airfryers, sanduicheiras, cafeteiras',
        keywords: [
          'liquidificador', 'airfryer', 'air fryer', 'fritadeira',
          'sanduicheira', 'cafeteira', 'cafeteira italiana',
          'mixer', 'batedeira', 'micro-ondas', 'microondas',
        ],
        order: 3,
      },
      {
        name: 'Decoração',
        slug: 'decoracao',
        description: 'Quadros, vasos, almofadas, objetos decorativos',
        keywords: [
          'decoracao', 'decoração', 'quadro', 'quadros',
          'vaso', 'vasos', 'almofada', 'almofadas',
          'enfeite', 'objeto decorativo',
        ],
        order: 4,
      },
      {
        name: 'Iluminação',
        slug: 'iluminacao',
        description: 'Luminárias, abajures, lâmpadas LED',
        keywords: [
          'luminaria', 'luminária', 'abajur', 'abajour',
          'lampada', 'lâmpada', 'led', 'spot', 'pendente',
        ],
        order: 5,
      },
      {
        name: 'Limpeza',
        slug: 'limpeza',
        description: 'Produtos de limpeza, vassouras, panos',
        keywords: [
          'limpeza', 'detergente', 'sabao', 'sabão',
          'vassoura', 'rodo', 'pano', 'esponja',
          'desinfetante', 'agua sanitaria', 'amaciante',
        ],
        order: 6,
      },
    ],
  },
];

export function findTemplateGroup(id: string): CategoryTemplateGroup | undefined {
  return CATEGORY_TEMPLATES.find((g) => g.id === id);
}
