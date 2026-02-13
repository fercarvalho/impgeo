export function validateEmail(email: string): { isValid: boolean; error?: string } {
  if (!email || typeof email !== 'string') {
    return { isValid: false, error: 'Email é obrigatório' };
  }

  const trimmedEmail = email.trim();
  if (trimmedEmail.length < 5 || trimmedEmail.length > 254) {
    return { isValid: false, error: 'Email deve ter entre 5 e 254 caracteres' };
  }

  if (
    trimmedEmail.startsWith('.') ||
    trimmedEmail.startsWith('-') ||
    trimmedEmail.endsWith('.') ||
    trimmedEmail.endsWith('-')
  ) {
    return { isValid: false, error: 'Email inválido' };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmedEmail)) {
    return { isValid: false, error: 'Formato de email inválido' };
  }

  const parts = trimmedEmail.split('@');
  if (parts.length !== 2 || !parts[1].includes('.')) {
    return { isValid: false, error: 'Formato de email inválido' };
  }

  return { isValid: true };
}
