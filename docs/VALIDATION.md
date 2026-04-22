# Validação de Formulários — DRY

Todas as validações do frontend passam por uma única biblioteca: `apps/web/src/lib/validation/`.

## Por que centralizar?

Sem DRY, cada formulário tinha seu próprio regex de e-mail, suas próprias mensagens de erro. Manutenção vira pesadelo: se decidimos que senha precisa ter 10 caracteres em vez de 8, precisamos lembrar de atualizar em 5 lugares.

## Estrutura

```
apps/web/src/lib/validation/
├── schemas.ts          // schemas Zod reutilizáveis + patterns + mensagens
├── masks.ts            // máscaras de input (telefone, SKU, etc)
└── password-strength.ts // avaliador de força de senha
```

## Padrões (Single Source of Truth)

Todos os regex ficam em `PATTERNS`:

```typescript
export const PATTERNS = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  phoneBr: /^(\+?55\s?)?\(?[1-9]{2}\)?\s?9?\d{4}-?\d{4}$/,
  strongPassword: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/,
  customFieldKey: /^[a-z][a-z0-9_]*$/,
  hexColor: /^#[0-9a-fA-F]{6}$/,
  sku: /^[A-Z0-9-]{3,20}$/i,
  // ...
};
```

## Mensagens

Também em um único lugar:

```typescript
export const MESSAGES = {
  required: 'Campo obrigatório',
  email: 'E-mail inválido',
  password: 'Mínimo 8 caracteres, com maiúscula, minúscula e número',
  min: (n: number) => `Mínimo ${n} caracteres`,
  // ...
};
```

## Fields (blocos reutilizáveis)

```typescript
export const fields = {
  email: () => z.string().min(1, MESSAGES.required).email(MESSAGES.email),
  password: () => z.string().min(8).regex(PATTERNS.strongPassword, MESSAGES.password),
  money: (min = 0) => z.number().min(min),
  // ...
};
```

Cada schema é composto a partir desses blocos:

```typescript
export const productSchema = z.object({
  name: fields.name(2, 200),
  price: fields.money(0.01),
  sku: fields.sku(),
  stock: fields.stock(),
  // ...
});
```

## Componente único: ValidatedInput

Em vez de cada tela ter seu próprio `<input>` + renderização de erro, tem um componente:

```tsx
<ValidatedInput
  label="E-mail"
  type="email"
  error={errors.email?.message}
  isValid={!errors.email && touchedFields.email}
  showValidIcon
  {...register('email')}
/>
```

Ele já trata:
- Label + asterisco de obrigatório
- Ícone de validação (check verde / alerta vermelho)
- Mensagem de erro
- Helper text
- Toggle de visibilidade (para `type="password"`)
- Máscaras (prop `mask`)

## Máscaras

Entradas que precisam formatação ficam em `masks.ts` e são passadas via prop:

```tsx
<ValidatedInput mask={maskSku} {...register('sku')} />
<ValidatedInput mask={maskCustomFieldKey} {...register('key')} />
```

## Integração com react-hook-form + Zod

Todos os formulários seguem o mesmo pattern:

```tsx
const { register, handleSubmit, formState: { errors } } = useForm<LoginInput>({
  resolver: zodResolver(loginSchema),
  mode: 'onBlur',
});
```

## Onde está aplicado

- `/login` — `loginSchema` (email + senha mínima)
- `/register` — `registerSchema` (email + senha forte + nome + loja) + `PasswordStrengthMeter`
- `/catalogo` modal — `productSchema` (nome + preço + estoque + SKU + ...)
- `/configuracoes` → FAQ — `faqSchema` (pergunta + resposta + keywords)
- `/configuracoes` → Campos personalizados — `customFieldDefinitionSchema` (key + label + tipo + opções)

## Como adicionar uma nova validação

Se for um padrão reutilizável (CPF, CNPJ, CEP...):

1. Adiciona o regex em `PATTERNS`
2. Adiciona a mensagem em `MESSAGES`
3. Exporta um `field` em `fields`
4. Usa em qualquer schema

Se for um schema de formulário específico:

1. Cria o schema em `schemas.ts`
2. Exporta o tipo inferido (`type Input = z.infer<typeof schema>`)
3. Na tela, usa `useForm({ resolver: zodResolver(schema) })`
