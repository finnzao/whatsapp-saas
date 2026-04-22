export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  color: string;
  checks: {
    length: boolean;
    lowercase: boolean;
    uppercase: boolean;
    number: boolean;
    special: boolean;
  };
}

export function evaluatePassword(password: string): PasswordStrength {
  const checks = {
    length: password.length >= 8,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    number: /\d/.test(password),
    special: /[^a-zA-Z0-9]/.test(password),
  };

  const passed = Object.values(checks).filter(Boolean).length;

  const matrix: PasswordStrength[] = [
    { score: 0, label: 'Muito fraca', color: 'bg-red-500', checks },
    { score: 1, label: 'Fraca', color: 'bg-red-500', checks },
    { score: 2, label: 'Regular', color: 'bg-amber-500', checks },
    { score: 3, label: 'Boa', color: 'bg-yellow-500', checks },
    { score: 4, label: 'Forte', color: 'bg-green-500', checks },
  ];

  return matrix[Math.min(passed, 4) as 0 | 1 | 2 | 3 | 4];
}
