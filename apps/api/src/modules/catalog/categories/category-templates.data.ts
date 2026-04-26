/**
 * Categorias-padrão por segmento de varejo brasileiro.
 *
 * Cada categoria tem `description` curta e ESPECÍFICA — esse texto vai
 * direto para a IA quando o cliente pergunta "o que vocês vendem?".
 * Categorias sem descrição fazem a IA responder genericamente; com
 * descrição ela cita exemplos concretos.
 *
 * Os pacotes são editáveis: o lojista importa, ajusta nomes/descrições e
 * os dados ficam no banco como qualquer outra categoria.
 */
export interface CategoryTemplate {
  name: string;
  slug: string;
  description: string;
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
        order: 1,
      },
      {
        name: 'Acessórios para celular',
        slug: 'acessorios-celular',
        description: 'Capinhas, películas 3D, suportes, popsockets',
        order: 2,
      },
      {
        name: 'Carregadores e cabos',
        slug: 'carregadores-cabos',
        description: 'Carregadores rápidos, cabos USB-C/Lightning, adaptadores',
        order: 3,
      },
      {
        name: 'Fones e áudio',
        slug: 'fones-audio',
        description: 'Fones bluetooth, AirPods, headsets gamer, caixas de som',
        order: 4,
      },
      {
        name: 'Smartwatches',
        slug: 'smartwatches',
        description: 'Apple Watch, Galaxy Watch, smartbands fitness',
        order: 5,
      },
      {
        name: 'Powerbanks',
        slug: 'powerbanks',
        description: 'Carregadores portáteis de 5.000 a 30.000 mAh',
        order: 6,
      },
      {
        name: 'Notebooks',
        slug: 'notebooks',
        description: 'Notebooks novos e seminovos para trabalho e estudo',
        order: 7,
      },
      {
        name: 'Tablets',
        slug: 'tablets',
        description: 'iPad, Galaxy Tab, tablets para estudo',
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
      { name: 'Camisetas', slug: 'camisetas', description: 'Camisetas masculinas e femininas, lisas e estampadas', order: 1 },
      { name: 'Calças', slug: 'calcas', description: 'Calças jeans, sociais, alfaiataria, esportivas', order: 2 },
      { name: 'Vestidos', slug: 'vestidos', description: 'Vestidos casuais, festa, midi, longos', order: 3 },
      { name: 'Tênis e calçados', slug: 'tenis-calcados', description: 'Tênis esportivos, casuais, sapatos sociais, sandálias', order: 4 },
      { name: 'Bolsas e mochilas', slug: 'bolsas-mochilas', description: 'Bolsas femininas, mochilas, carteiras', order: 5 },
      { name: 'Acessórios', slug: 'acessorios-moda', description: 'Cintos, óculos de sol, bonés, bijuterias', order: 6 },
    ],
  },
  {
    id: 'beleza',
    name: 'Beleza e Cosméticos',
    description: 'Loja de cosméticos, perfumes e cuidados pessoais',
    segment: 'beleza',
    categories: [
      { name: 'Perfumes', slug: 'perfumes', description: 'Perfumes nacionais e importados, masculino e feminino', order: 1 },
      { name: 'Cabelos', slug: 'cabelos', description: 'Shampoos, condicionadores, máscaras, tintas', order: 2 },
      { name: 'Maquiagem', slug: 'maquiagem', description: 'Bases, batons, máscaras, paletas de sombra', order: 3 },
      { name: 'Skincare', slug: 'skincare', description: 'Hidratantes, séruns, protetor solar, ácidos', order: 4 },
      { name: 'Cuidados corporais', slug: 'corpo', description: 'Hidratantes corporais, esfoliantes, depilação', order: 5 },
      { name: 'Esmaltes e unhas', slug: 'unhas', description: 'Esmaltes, removedores, kits de manicure', order: 6 },
    ],
  },
  {
    id: 'alimentacao',
    name: 'Alimentação e Bebidas',
    description: 'Mercados, padarias, lanchonetes e delivery de comida',
    segment: 'alimentacao',
    categories: [
      { name: 'Lanches', slug: 'lanches', description: 'Hambúrgueres, sanduíches, hot dogs', order: 1 },
      { name: 'Pizzas', slug: 'pizzas', description: 'Pizzas tradicionais, especiais e doces', order: 2 },
      { name: 'Bebidas', slug: 'bebidas', description: 'Refrigerantes, sucos, água, cervejas', order: 3 },
      { name: 'Sobremesas', slug: 'sobremesas', description: 'Bolos, tortas, sorvetes, doces', order: 4 },
      { name: 'Pratos prontos', slug: 'pratos-prontos', description: 'Marmitas, executivos, refeições do dia', order: 5 },
      { name: 'Combos e promoções', slug: 'combos', description: 'Combos de lanche+bebida e promoções do dia', order: 6 },
    ],
  },
  {
    id: 'farmacia',
    name: 'Farmácia e Saúde',
    description: 'Farmácias, drogarias, produtos de saúde',
    segment: 'farmacia',
    categories: [
      { name: 'Medicamentos sem receita', slug: 'medicamentos-mip', description: 'Analgésicos, antitérmicos, antialérgicos sem prescrição', order: 1 },
      { name: 'Higiene pessoal', slug: 'higiene', description: 'Sabonetes, desodorantes, pasta de dente, escovas', order: 2 },
      { name: 'Suplementos e vitaminas', slug: 'suplementos', description: 'Vitaminas, minerais, whey protein, colágeno', order: 3 },
      { name: 'Cuidados infantis', slug: 'infantil', description: 'Fraldas, lenços, papinhas, produtos para bebê', order: 4 },
      { name: 'Primeiros socorros', slug: 'primeiros-socorros', description: 'Curativos, soro, álcool, termômetros', order: 5 },
      { name: 'Dermocosméticos', slug: 'dermocosmeticos', description: 'Protetor solar, hidratantes, anti-acne', order: 6 },
    ],
  },
  {
    id: 'pet',
    name: 'Pet Shop',
    description: 'Loja de produtos para animais',
    segment: 'pet',
    categories: [
      { name: 'Rações', slug: 'racoes', description: 'Rações para cães e gatos, todas as idades', order: 1 },
      { name: 'Petiscos', slug: 'petiscos', description: 'Biscoitos, ossinhos, snacks para cães e gatos', order: 2 },
      { name: 'Brinquedos', slug: 'brinquedos-pet', description: 'Bolinhas, cordas, mordedores', order: 3 },
      { name: 'Acessórios', slug: 'acessorios-pet', description: 'Coleiras, peitorais, guias, comedouros', order: 4 },
      { name: 'Higiene', slug: 'higiene-pet', description: 'Shampoos, banho a seco, lenços, areia para gatos', order: 5 },
      { name: 'Saúde animal', slug: 'saude-pet', description: 'Antipulgas, vermífugos, suplementos', order: 6 },
    ],
  },
  {
    id: 'casa-decoracao',
    name: 'Casa e Decoração',
    description: 'Loja de utilidades domésticas, móveis e decoração',
    segment: 'casa',
    categories: [
      { name: 'Cama, mesa e banho', slug: 'cama-mesa-banho', description: 'Lençóis, toalhas, jogos americanos', order: 1 },
      { name: 'Cozinha', slug: 'cozinha', description: 'Panelas, talheres, utensílios, organizadores', order: 2 },
      { name: 'Eletroportáteis', slug: 'eletroportateis', description: 'Liquidificadores, airfryers, sanduicheiras, cafeteiras', order: 3 },
      { name: 'Decoração', slug: 'decoracao', description: 'Quadros, vasos, almofadas, objetos decorativos', order: 4 },
      { name: 'Iluminação', slug: 'iluminacao', description: 'Luminárias, abajures, lâmpadas LED', order: 5 },
      { name: 'Limpeza', slug: 'limpeza', description: 'Produtos de limpeza, vassouras, panos', order: 6 },
    ],
  },
];

export function findTemplateGroup(id: string): CategoryTemplateGroup | undefined {
  return CATEGORY_TEMPLATES.find((g) => g.id === id);
}
