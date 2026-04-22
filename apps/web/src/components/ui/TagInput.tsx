'use client';

import { useState, useRef, KeyboardEvent } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TagInputProps {
  label?: string;
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  maxTags?: number;
  error?: string;
  helpText?: string;
  required?: boolean;
}

export function TagInput({
  label,
  value,
  onChange,
  placeholder = 'Digite e pressione Enter...',
  className,
  disabled,
  maxTags,
  error,
  helpText,
  required,
}: TagInputProps) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const hasError = Boolean(error);

  const addTag = (raw: string) => {
    const tag = raw.trim();
    if (!tag) return;
    if (maxTags && value.length >= maxTags) return;
    const normalized = tag.toLowerCase();
    if (value.some((v) => v.toLowerCase() === normalized)) return;
    onChange([...value, tag]);
  };

  const removeTag = (index: number) => onChange(value.filter((_, i) => i !== index));

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (input.trim()) {
        addTag(input);
        setInput('');
      }
      return;
    }

    if (e.key === 'Backspace' && !input && value.length > 0) {
      e.preventDefault();
      removeTag(value.length - 1);
    }

    if (e.key === 'Tab' && input.trim()) {
      addTag(input);
      setInput('');
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (pasted.includes(',') || pasted.includes('\n')) {
      e.preventDefault();
      const tags = pasted.split(/[,\n]+/).map((t) => t.trim()).filter(Boolean);
      tags.forEach(addTag);
      setInput('');
    }
  };

  const handleBlur = () => {
    if (input.trim()) {
      addTag(input);
      setInput('');
    }
  };

  return (
    <div className="w-full">
      {label && (
        <label className="mb-1 block text-sm font-medium text-gray-700">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      <div
        onClick={() => inputRef.current?.focus()}
        className={cn(
          'flex min-h-[42px] w-full flex-wrap items-center gap-1.5 rounded-md border bg-white px-2 py-1.5 text-sm transition focus-within:ring-1',
          hasError
            ? 'border-red-400 focus-within:border-red-500 focus-within:ring-red-500'
            : 'border-gray-300 focus-within:border-brand-500 focus-within:ring-brand-500',
          disabled && 'cursor-not-allowed bg-gray-50 opacity-60',
          className,
        )}
      >
        {value.map((tag, i) => (
          <span
            key={`${tag}-${i}`}
            className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-medium text-brand-800"
          >
            {tag}
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTag(i);
                }}
                className="rounded-full transition hover:bg-brand-200"
                aria-label={`Remover ${tag}`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          className="flex-1 border-0 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-gray-400 disabled:cursor-not-allowed"
          placeholder={value.length === 0 ? placeholder : ''}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={handleBlur}
          disabled={disabled || (maxTags !== undefined && value.length >= maxTags)}
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
}
