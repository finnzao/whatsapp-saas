'use client';

import { forwardRef, TextareaHTMLAttributes } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ValidatedTextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'ref'> {
  label?: string;
  error?: string;
  helpText?: string;
  isValid?: boolean;
}

export const ValidatedTextarea = forwardRef<HTMLTextAreaElement, ValidatedTextareaProps>(
  ({ label, error, helpText, isValid, className, required, ...props }, ref) => {
    const hasError = Boolean(error);

    return (
      <div className="w-full">
        {label && (
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {label}
            {required && <span className="ml-0.5 text-red-500">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          className={cn(
            'w-full rounded-md border px-3 py-2 text-sm transition placeholder:text-gray-400 focus:outline-none focus:ring-1',
            hasError
              ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
              : isValid
                ? 'border-green-400 focus:border-green-500 focus:ring-green-500'
                : 'border-gray-300 focus:border-brand-500 focus:ring-brand-500',
            className,
          )}
          {...props}
        />
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

ValidatedTextarea.displayName = 'ValidatedTextarea';
