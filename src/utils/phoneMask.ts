export function applyPhoneMask(value: string): string {
  const numbers = value.replace(/\D/g, '');

  if (numbers.length <= 2) {
    return numbers.length > 0 ? `(${numbers}` : '';
  }
  if (numbers.length <= 6) {
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
  }
  if (numbers.length <= 10) {
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 6)}-${numbers.slice(6)}`;
  }
  return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`;
}

export function removePhoneMask(value: string): string {
  return value.replace(/\D/g, '');
}

export function validatePhoneFormat(phone: string): { isValid: boolean; error?: string } {
  if (!phone || phone.trim() === '') {
    return { isValid: true };
  }
  const digits = removePhoneMask(phone);
  if (digits.length !== 10 && digits.length !== 11) {
    return { isValid: false, error: 'Telefone deve ter 10 ou 11 dígitos' };
  }
  if (!/^\d+$/.test(digits)) {
    return { isValid: false, error: 'Telefone deve conter apenas números' };
  }
  return { isValid: true };
}
