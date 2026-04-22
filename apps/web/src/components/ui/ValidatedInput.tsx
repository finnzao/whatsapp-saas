'use client';

import { forwardRef, InputHTMLAttributes, useState } from 'react';
import { Eye, EyeOff, Check, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ValidatedInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'ref'> {
  label?: string;
  error?: string;
  helpText?: string;
  showValidIcon?: boolean;
  isValid?: boolean;
  rightElement?: React.ReactNode;
  onValueChange?: (value: string) => void;
  mask?: (raw: string) => string;
}

export const ValidatedInput = forwardRef<HTMLInputElement, ValidatedInputProps>(
  (
    {
      label,
      error,
      helpText,
      showValidIcon,
      isValid,
      rightElement,
      type = 'text',
      onValueChange,
      onChange,
      mask,
      className,
      required,
      ...props
    },
    ref,
  ) => {
    const [showPassword, setShowPassword] = useState(false);
    const inputType = type === 'password' && showPassword ? 'text' : type;
    const hasError = Boolean(error);
    const showValid = showValidIcon && isValid && !hasError;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = mask ? mask(e.target.value) : e.target.value;
      if (mask) e.target.value = value;
      onChange?.(e);
      onValueChange?.(value);
    };

    return (
      <div className="w-full">
        {label && (
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {label}
            {required && <span className="ml-0.5 text-red-500">*</span>}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            type={inputType}
            onChange={handleChange}
            className={cn(
              'w-full rounded-md border px-3 py-2 text-sm transition placeholder:text-gray-400 focus:outline-none focus:ring-1',
              hasError
                ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
                : showValid
                  ? 'border-green-400 focus:border-green-500 focus:ring-green-500'
                  : 'border-gray-300 focus:border-brand-500 focus:ring-brand-500',
              (type === 'password' || rightElement || showValid || hasError) && 'pr-10',
              className,
            )}
            {...props}
          />
          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
            {type === 'password' && (
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="rounded p-1 text-gray-400 transition hover:text-gray-600"
                tabIndex={-1}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            )}
            {showValid && !rightElement && type !== 'password' && (
              <Check className="h-4 w-4 text-green-500" />
            )}
            {hasError && !rightElement && type !== 'password' && (
              <AlertCircle className="h-4 w-4 text-red-500" />
            )}
            {rightElement}
          </div>
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

ValidatedInput.displayName = 'ValidatedInput';
