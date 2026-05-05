export function applyPhoneMask(value: string): string {
  if (!value) return '';
  let raw = value.replace(/\D/g, '');
  // Remove prefixo internacional do Brasil (+55 ou 55) quando resultar em mais de 11 dígitos
  if (raw.length > 11 && raw.startsWith('55')) {
    raw = raw.slice(2);
  }
  const numbers = raw.slice(0, 11);

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
  if (!value) return '';
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
  return { isValid: true };
}
