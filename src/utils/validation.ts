export function validateEmail(email: string): { isValid: boolean; error?: string } {
  if (!email || typeof email !== 'string') {
    return { isValid: false, error: 'Email é obrigatório' };
  }

  const trimmedEmail = email.trim();

  // Detecta string composta apenas por espaços
  if (trimmedEmail.length === 0) {
    return { isValid: false, error: 'Email é obrigatório' };
  }

  if (trimmedEmail.length < 5 || trimmedEmail.length > 254) {
    return { isValid: false, error: 'Email deve ter entre 5 e 254 caracteres' };
  }

  const atIndex = trimmedEmail.indexOf('@');
  const localPart = atIndex !== -1 ? trimmedEmail.slice(0, atIndex) : trimmedEmail;

  if (
    trimmedEmail.startsWith('.') ||
    trimmedEmail.startsWith('-') ||
    trimmedEmail.endsWith('.') ||
    trimmedEmail.endsWith('-') ||
    trimmedEmail.includes('..') ||
    localPart.endsWith('.') ||
    localPart.endsWith('-')
  ) {
    return { isValid: false, error: 'Email inválido' };
  }

  // Regex reforçado: impede ponto duplo no domínio, domínio iniciando/terminando com ponto ou hífen,
  // e exige que o TLD contenha pelo menos uma letra (TLDs puramente numéricos não existem)
  const emailRegex = /^[^\s@]+@[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]*[a-zA-Z][a-zA-Z0-9]*)+$/;
  if (!emailRegex.test(trimmedEmail)) {
    return { isValid: false, error: 'Formato de email inválido' };
  }

  return { isValid: true };
}
