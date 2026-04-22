'use client';

import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { evaluatePassword } from '@/lib/validation/password-strength';

interface PasswordStrengthMeterProps {
  password: string;
}

export function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  if (!password) return null;

  const { score, label, color, checks } = evaluatePassword(password);

  const items: { label: string; passed: boolean }[] = [
    { label: '8+ caracteres', passed: checks.length },
    { label: 'Letra minúscula', passed: checks.lowercase },
    { label: 'Letra maiúscula', passed: checks.uppercase },
    { label: 'Número', passed: checks.number },
  ];

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={cn(
                'h-1 flex-1 rounded-full transition',
                i < score ? color : 'bg-gray-200',
              )}
            />
          ))}
        </div>
        <span className="text-xs font-medium text-gray-600">{label}</span>
      </div>
      <ul className="grid grid-cols-2 gap-1 text-xs">
        {items.map((item) => (
          <li
            key={item.label}
            className={cn(
              'flex items-center gap-1',
              item.passed ? 'text-green-600' : 'text-gray-400',
            )}
          >
            {item.passed ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
