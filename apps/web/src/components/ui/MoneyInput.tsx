'use client';

import { forwardRef, useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoneyBr, maskMoneyBr, parseMoneyBr } from '@/lib/validation/masks';

interface MoneyInputProps {
  label?: string;
  required?: boolean;
  error?: string;
  helpText?: string;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
  /** valor numérico atual (em reais). null/undefined = vazio */
  value: number | null | undefined;
  /** chamado quando o usuário altera — recebe número em reais (ou null) */
  onChange: (n: number | null) => void;
  /** chamado no blur — útil com react-hook-form */
  onBlur?: () => void;
  id?: string;
  name?: string;
}

/**
 * Input de moeda BRL com máscara de entrada "direita→esquerda".
 * Controla seu próprio estado textual internamente e avisa o parent via onChange
 * com o valor NUMÉRICO em reais. Mantém o cursor estável via formatação.
 *
 * Uso típico:
 *   <Controller
 *     control={control}
 *     name="price"
 *     render={({ field, fieldState }) => (
 *       <MoneyInput
 *         label="Preço"
 *         value={field.value}
 *         onChange={field.onChange}
 *         onBlur={field.onBlur}
 *         error={fieldState.error?.message}
 *       />
 *     )}
 *   />
 */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(
  (
    {
      label,
      required,
      error,
      helpText,
      placeholder = '0,00',
      disabled,
      readOnly,
      className,
      value,
      onChange,
      onBlur,
      id,
      name,
    },
    ref,
  ) => {
    // Estado textual local. Sincronizamos com o valor numérico do parent
    // sempre que ele mudar por um caminho externo (ex: resetForm, cálculo auto).
    const [text, setText] = useState<string>(() =>
      value === null || value === undefined ? '' : formatMoneyBr(value),
    );

    useEffect(() => {
      // Se o valor numérico mudou externamente, reformata o texto.
      // Só atualiza se o número representado pelo texto atual for diferente
      // do novo valor — evita sobrescrever enquanto o usuário digita.
      const textAsNumber = parseMoneyBr(text);
      const numericValue = value ?? null;

      if (numericValue === null && text !== '') {
        setText('');
        return;
      }
      if (numericValue !== null && Math.abs(textAsNumber - numericValue) > 0.001) {
        setText(formatMoneyBr(numericValue));
      }
    }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const masked = maskMoneyBr(e.target.value);
      setText(masked);
      const parsed = parseMoneyBr(masked);
      onChange(masked === '' ? null : parsed);
    };

    const hasError = Boolean(error);

    return (
      <div className="w-full">
        {label && (
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor={id}>
            {label}
            {required && <span className="ml-0.5 text-red-500">*</span>}
          </label>
        )}
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
            R$
          </span>
          <input
            ref={ref}
            id={id}
            name={name}
            type="text"
            inputMode="numeric"
            value={text}
            onChange={handleChange}
            onBlur={onBlur}
            disabled={disabled}
            readOnly={readOnly}
            placeholder={placeholder}
            className={cn(
              'w-full rounded-md border pl-9 pr-3 py-2 text-sm transition placeholder:text-gray-400 focus:outline-none focus:ring-1',
              hasError
                ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
                : 'border-gray-300 focus:border-brand-500 focus:ring-brand-500',
              readOnly && 'bg-gray-50 text-gray-600 cursor-not-allowed',
              className,
            )}
          />
        </div>
        {hasError ? (
          <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
            <AlertCircle className="h-3 w-3 shrink-0" />
            {error}
          </p>
        ) : helpText ? (
          <p className="mt-1 text-xs text-gray-500">{helpText}</p>
        ) : null}
      </div>
    );
  },
);

MoneyInput.displayName = 'MoneyInput';
