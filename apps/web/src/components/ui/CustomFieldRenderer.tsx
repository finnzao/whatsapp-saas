'use client';

import { ValidatedInput } from './ValidatedInput';
import { ValidatedTextarea } from './ValidatedTextarea';
import { cn } from '@/lib/utils';

export type CustomFieldType =
  | 'TEXT'
  | 'TEXTAREA'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'SELECT'
  | 'MULTISELECT'
  | 'DATE'
  | 'COLOR';

export interface CustomFieldDefinition {
  id: string;
  key: string;
  label: string;
  type: CustomFieldType;
  options: string[];
  required: boolean;
  placeholder?: string | null;
  helpText?: string | null;
}

interface CustomFieldRendererProps {
  definition: CustomFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
}

export function CustomFieldRenderer({
  definition,
  value,
  onChange,
  error,
}: CustomFieldRendererProps) {
  const common = {
    label: definition.label,
    required: definition.required,
    error,
    helpText: definition.helpText ?? undefined,
    placeholder: definition.placeholder ?? undefined,
  };

  switch (definition.type) {
    case 'TEXT':
      return (
        <ValidatedInput
          {...common}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case 'TEXTAREA':
      return (
        <ValidatedTextarea
          {...common}
          rows={3}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case 'NUMBER':
      return (
        <ValidatedInput
          {...common}
          type="number"
          step="any"
          value={(value as number | string) ?? ''}
          onChange={(e) =>
            onChange(e.target.value === '' ? undefined : Number(e.target.value))
          }
        />
      );

    case 'BOOLEAN':
      return (
        <div>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={(e) => onChange(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-sm font-medium text-gray-700">
              {definition.label}
              {definition.required && <span className="ml-0.5 text-red-500">*</span>}
            </span>
          </label>
          {definition.helpText && <p className="mt-1 text-xs text-gray-500">{definition.helpText}</p>}
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
      );

    case 'SELECT':
      return (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {definition.label}
            {definition.required && <span className="ml-0.5 text-red-500">*</span>}
          </label>
          <select
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value || undefined)}
            className={cn(
              'w-full rounded-md border px-3 py-2 text-sm transition focus:outline-none focus:ring-1',
              error
                ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
                : 'border-gray-300 focus:border-brand-500 focus:ring-brand-500',
            )}
          >
            <option value="">Selecione...</option>
            {definition.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          {error ? (
            <p className="mt-1 text-xs text-red-600">{error}</p>
          ) : definition.helpText ? (
            <p className="mt-1 text-xs text-gray-500">{definition.helpText}</p>
          ) : null}
        </div>
      );

    case 'MULTISELECT': {
      const current = (Array.isArray(value) ? value : []) as string[];
      const toggle = (opt: string) => {
        const next = current.includes(opt)
          ? current.filter((v) => v !== opt)
          : [...current, opt];
        onChange(next);
      };
      return (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {definition.label}
            {definition.required && <span className="ml-0.5 text-red-500">*</span>}
          </label>
          <div className="flex flex-wrap gap-2 rounded-md border border-gray-300 bg-white p-2">
            {definition.options.map((opt) => {
              const active = current.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggle(opt)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium transition',
                    active
                      ? 'bg-brand-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
                  )}
                >
                  {opt}
                </button>
              );
            })}
          </div>
          {error ? (
            <p className="mt-1 text-xs text-red-600">{error}</p>
          ) : definition.helpText ? (
            <p className="mt-1 text-xs text-gray-500">{definition.helpText}</p>
          ) : null}
        </div>
      );
    }

    case 'DATE':
      return (
        <ValidatedInput
          {...common}
          type="date"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || undefined)}
        />
      );

    case 'COLOR':
      return (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {definition.label}
            {definition.required && <span className="ml-0.5 text-red-500">*</span>}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={(value as string) ?? '#000000'}
              onChange={(e) => onChange(e.target.value)}
              className="h-10 w-14 cursor-pointer rounded border border-gray-300"
            />
            <input
              type="text"
              value={(value as string) ?? ''}
              onChange={(e) => onChange(e.target.value)}
              placeholder="#000000"
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          {error ? (
            <p className="mt-1 text-xs text-red-600">{error}</p>
          ) : definition.helpText ? (
            <p className="mt-1 text-xs text-gray-500">{definition.helpText}</p>
          ) : null}
        </div>
      );

    default:
      return null;
  }
}
