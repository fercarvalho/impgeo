export function applyCpfMask(value: string): string {
  const numbers = value.replace(/\D/g, '').slice(0, 11);
  if (numbers.length <= 3) return numbers;
  if (numbers.length <= 6) return `${numbers.slice(0, 3)}.${numbers.slice(3)}`;
  if (numbers.length <= 9) return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6)}`;
  return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6, 9)}-${numbers.slice(9)}`;
}

export function removeCpfMask(value: string): string {
  return value.replace(/\D/g, '');
}

export function validateCpfFormat(cpf: string): { isValid: boolean; error?: string } {
  if (!cpf || cpf.trim() === '') return { isValid: true };
  const digits = removeCpfMask(cpf);
  if (digits.length !== 11) return { isValid: false, error: 'CPF deve ter 11 dígitos' };
  if (/^(\d)\1{10}$/.test(digits)) return { isValid: false, error: 'CPF inválido' };

  let sum = 0;
  for (let index = 1; index <= 9; index += 1) {
    sum += Number(digits.substring(index - 1, index)) * (11 - index);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== Number(digits.substring(9, 10))) return { isValid: false, error: 'CPF inválido' };

  sum = 0;
  for (let index = 1; index <= 10; index += 1) {
    sum += Number(digits.substring(index - 1, index)) * (12 - index);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== Number(digits.substring(10, 11))) return { isValid: false, error: 'CPF inválido' };

  return { isValid: true };
}
