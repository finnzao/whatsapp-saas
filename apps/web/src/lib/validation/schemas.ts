import { z } from 'zod';

export const PATTERNS = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  phoneBr: /^(\+?55\s?)?\(?[1-9]{2}\)?\s?9?\d{4}-?\d{4}$/,
  onlyDigits: /^\d+$/,
  slug: /^[a-z0-9-]+$/,
  hexColor: /^#[0-9a-fA-F]{6}$/,
  strongPassword: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/,
  customFieldKey: /^[a-z][a-z0-9_]*$/,
  url: /^https?:\/\/.+/,
  sku: /^[A-Z0-9-]{3,20}$/i,
} as const;

export const MESSAGES = {
  required: 'Campo obrigatório',
  email: 'E-mail inválido',
  phoneBr: 'Telefone inválido. Ex: (11) 98765-4321',
  password: 'Mínimo 8 caracteres, com maiúscula, minúscula e número',
  min: (n: number) => `Mínimo ${n} caracteres`,
  max: (n: number) => `Máximo ${n} caracteres`,
  minValue: (n: number) => `Mínimo ${n}`,
  maxValue: (n: number) => `Máximo ${n}`,
  integer: 'Deve ser um número inteiro',
  positive: 'Deve ser maior que zero',
  nonNegative: 'Não pode ser negativo',
  customFieldKey: 'Use só letras minúsculas, números e underscore, começando com letra',
  hexColor: 'Formato de cor inválido (#rrggbb)',
  url: 'URL inválida (precisa começar com http:// ou https://)',
  sku: '3-20 caracteres alfanuméricos ou hífen',
  money: 'Valor inválido',
} as const;

export const fields = {
  email: () =>
    z
      .string({ required_error: MESSAGES.required })
      .min(1, MESSAGES.required)
      .email(MESSAGES.email),

  password: () =>
    z
      .string({ required_error: MESSAGES.required })
      .min(8, MESSAGES.password)
      .regex(PATTERNS.strongPassword, MESSAGES.password),

  passwordLogin: () =>
    z.string({ required_error: MESSAGES.required }).min(1, MESSAGES.required),

  name: (min = 2, max = 100) =>
    z
      .string({ required_error: MESSAGES.required })
      .trim()
      .min(min, MESSAGES.min(min))
      .max(max, MESSAGES.max(max)),

  phoneBr: () =>
    z
      .string({ required_error: MESSAGES.required })
      .regex(PATTERNS.phoneBr, MESSAGES.phoneBr),

  money: (min = 0) =>
    z
      .number({ invalid_type_error: MESSAGES.money })
      .min(min, MESSAGES.minValue(min)),

  stock: () =>
    z
      .number({ invalid_type_error: MESSAGES.integer })
      .int(MESSAGES.integer)
      .min(0, MESSAGES.nonNegative),

  sku: () =>
    z
      .string()
      .regex(PATTERNS.sku, MESSAGES.sku)
      .optional()
      .or(z.literal('')),

  url: () =>
    z
      .string()
      .regex(PATTERNS.url, MESSAGES.url)
      .optional()
      .or(z.literal('')),

  hexColor: () => z.string().regex(PATTERNS.hexColor, MESSAGES.hexColor),

  customFieldKey: () =>
    z
      .string({ required_error: MESSAGES.required })
      .regex(PATTERNS.customFieldKey, MESSAGES.customFieldKey),

  text: (min = 1, max = 500) =>
    z
      .string({ required_error: MESSAGES.required })
      .trim()
      .min(min, MESSAGES.min(min))
      .max(max, MESSAGES.max(max)),
};

export const loginSchema = z.object({
  email: fields.email(),
  password: fields.passwordLogin(),
});

export const registerSchema = z.object({
  email: fields.email(),
  password: fields.password(),
  name: fields.name(),
  tenantName: fields.name(2, 80),
});

export const productSchema = z
  .object({
    name: fields.name(2, 200),
    description: z.string().max(2000).optional().or(z.literal('')),
    categoryId: z.string().uuid().optional().or(z.literal('')),
    sku: fields.sku(),
    price: fields.money(0.01),
    priceCash: z
      .number({ invalid_type_error: MESSAGES.money })
      .min(0, MESSAGES.nonNegative)
      .optional()
      .nullable(),
    priceInstallment: z
      .number({ invalid_type_error: MESSAGES.money })
      .min(0, MESSAGES.nonNegative)
      .optional()
      .nullable(),
    installments: z
      .number()
      .int()
      .min(1, 'Mínimo 1 parcela')
      .max(24, 'Máximo 24 parcelas')
      .optional()
      .nullable(),
    stock: fields.stock(),
    trackStock: z.boolean().optional(),
    condition: z.enum(['NEW', 'SEMINEW', 'USED', 'SHOWCASE', 'REFURBISHED']).optional(),
    warranty: z.string().max(200).optional().or(z.literal('')),
    images: z.array(fields.url()).optional(),
    customFields: z.record(z.unknown()).optional(),
  })
  .superRefine((data, ctx) => {
    // Parcelamento só faz sentido com os dois campos juntos.
    const hasInstallments =
      data.installments !== null && data.installments !== undefined && data.installments > 0;
    const hasInstallmentPrice =
      data.priceInstallment !== null &&
      data.priceInstallment !== undefined &&
      data.priceInstallment > 0;

    if (hasInstallments && !hasInstallmentPrice) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['priceInstallment'],
        message: 'Informe o valor total parcelado para calcular as parcelas',
      });
    }
    if (hasInstallmentPrice && !hasInstallments) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['installments'],
        message: 'Informe em quantas parcelas o valor será dividido',
      });
    }

    // Se tem parcelamento mas o valor parcelado é menor que o preço base,
    // provavelmente é engano do usuário (parcelamento normalmente é > à vista).
    // Warning leve: só avisa, não bloqueia.
    if (
      hasInstallmentPrice &&
      data.priceInstallment! < data.price &&
      data.priceInstallment! > 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['priceInstallment'],
        message:
          'O valor parcelado é menor que o preço base. Confira se não é o valor de cada parcela (precisamos do total).',
      });
    }
  });

export const faqSchema = z.object({
  question: fields.text(3, 200),
  answer: fields.text(3, 2000),
  keywords: z
    .array(z.string().min(1))
    .min(1, 'Adicione ao menos uma palavra-chave'),
});

export const customFieldDefinitionSchema = z.object({
  key: fields.customFieldKey(),
  label: fields.name(2, 80),
  type: z.enum(['TEXT', 'TEXTAREA', 'NUMBER', 'BOOLEAN', 'SELECT', 'MULTISELECT', 'DATE', 'COLOR']),
  options: z.array(z.string().min(1)).optional(),
  required: z.boolean().optional(),
  placeholder: z.string().max(120).optional().or(z.literal('')),
  helpText: z.string().max(200).optional().or(z.literal('')),
});

export const categorySchema = z.object({
  name: fields.name(2, 80),
  description: z.string().max(200).optional().or(z.literal('')),
  order: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type FaqInput = z.infer<typeof faqSchema>;
export type CustomFieldDefinitionInput = z.infer<typeof customFieldDefinitionSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
