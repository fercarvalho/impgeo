/**
 * Utilidades de Segurança - Fase 3
 * Funções auxiliares para melhorar a segurança do sistema
 */

const crypto = require('crypto');

/**
 * Gera senha aleatória segura
 * Garante pelo menos: 1 maiúscula, 1 minúscula, 1 número, 1 caractere especial
 *
 * @param {number} length - Comprimento da senha (padrão: 16)
 * @returns {string} Senha aleatória segura
 */
function generateSecurePassword(length = 16) {
  // Conjuntos de caracteres
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const special = '!@#$%&*-_+=';

  // Garantir pelo menos um de cada tipo
  let password = '';
  password += uppercase[crypto.randomInt(0, uppercase.length)];
  password += lowercase[crypto.randomInt(0, lowercase.length)];
  password += numbers[crypto.randomInt(0, numbers.length)];
  password += special[crypto.randomInt(0, special.length)];

  // Preencher o restante com caracteres aleatórios de todos os conjuntos
  const allChars = uppercase + lowercase + numbers + special;
  for (let i = password.length; i < length; i++) {
    password += allChars[crypto.randomInt(0, allChars.length)];
  }

  // Embaralhar a senha para não ter padrão previsível
  password = password.split('').sort(() => crypto.randomInt(-1, 2)).join('');

  return password;
}

/**
 * Valida CPF brasileiro
 *
 * @param {string} cpf - CPF com ou sem formatação
 * @returns {boolean} true se válido, false caso contrário
 */
function validateCPF(cpf) {
  if (!cpf) return false;

  // Remove formatação
  cpf = cpf.replace(/[^\d]/g, '');

  // Verifica se tem 11 dígitos
  if (cpf.length !== 11) return false;

  // Verifica se todos os dígitos são iguais (CPF inválido)
  if (/^(\d)\1+$/.test(cpf)) return false;

  // Validação do primeiro dígito verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cpf.charAt(i)) * (10 - i);
  }
  let digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== parseInt(cpf.charAt(9))) return false;

  // Validação do segundo dígito verificador
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cpf.charAt(i)) * (11 - i);
  }
  digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== parseInt(cpf.charAt(10))) return false;

  return true;
}

/**
 * Valida CNPJ brasileiro
 *
 * @param {string} cnpj - CNPJ com ou sem formatação
 * @returns {boolean} true se válido, false caso contrário
 */
function validateCNPJ(cnpj) {
  if (!cnpj) return false;

  // Remove formatação
  cnpj = cnpj.replace(/[^\d]/g, '');

  // Verifica se tem 14 dígitos
  if (cnpj.length !== 14) return false;

  // Verifica se todos os dígitos são iguais (CNPJ inválido)
  if (/^(\d)\1+$/.test(cnpj)) return false;

  // Validação do primeiro dígito verificador
  let length = cnpj.length - 2;
  let numbers = cnpj.substring(0, length);
  const digits = cnpj.substring(length);
  let sum = 0;
  let pos = length - 7;

  for (let i = length; i >= 1; i--) {
    sum += numbers.charAt(length - i) * pos--;
    if (pos < 2) pos = 9;
  }

  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(0))) return false;

  // Validação do segundo dígito verificador
  length = length + 1;
  numbers = cnpj.substring(0, length);
  sum = 0;
  pos = length - 7;

  for (let i = length; i >= 1; i--) {
    sum += numbers.charAt(length - i) * pos--;
    if (pos < 2) pos = 9;
  }

  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(1))) return false;

  return true;
}

/**
 * Valida CPF ou CNPJ
 *
 * @param {string} document - CPF ou CNPJ
 * @returns {object} { valid: boolean, type: 'cpf'|'cnpj'|'unknown' }
 */
function validateDocument(document) {
  if (!document) {
    return { valid: false, type: 'unknown' };
  }

  const cleaned = document.replace(/[^\d]/g, '');

  if (cleaned.length === 11) {
    return { valid: validateCPF(cleaned), type: 'cpf' };
  } else if (cleaned.length === 14) {
    return { valid: validateCNPJ(cleaned), type: 'cnpj' };
  }

  return { valid: false, type: 'unknown' };
}

/**
 * Sanitiza dados sensíveis para logging
 * Remove ou mascara informações confidenciais
 *
 * @param {object} data - Objeto com dados
 * @returns {object} Objeto sanitizado
 */
function sanitizeForLogging(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const sanitized = { ...data };

  // Campos que devem ser completamente removidos
  const removeFields = ['password', 'token', 'secret', 'apiKey', 'tempPassword'];

  // Campos que devem ser mascarados
  const maskFields = ['cpf', 'cnpj', 'email', 'phone'];

  for (const field of removeFields) {
    if (field in sanitized) {
      delete sanitized[field];
    }
  }

  for (const field of maskFields) {
    if (sanitized[field]) {
      if (field === 'cpf') {
        // Mascara CPF: 123.456.789-10 -> ***.***.***-10
        sanitized[field] = sanitized[field].replace(/^(\d{3})\.?(\d{3})\.?(\d{3})-?(\d{2})$/, '***.***.***-$4');
      } else if (field === 'cnpj') {
        // Mascara CNPJ: 12.345.678/0001-90 -> **.***.***/****-90
        sanitized[field] = sanitized[field].replace(/^(\d{2})\.?(\d{3})\.?(\d{3})\/?(\d{4})-?(\d{2})$/, '**.***.***/$4-$5');
      } else if (field === 'email') {
        // Mascara email: user@domain.com -> u***@domain.com
        sanitized[field] = sanitized[field].replace(/^(.)(.*)(@.*)$/, '$1***$3');
      } else if (field === 'phone') {
        // Mascara telefone: (11) 98765-4321 -> (11) *****-4321
        sanitized[field] = sanitized[field].replace(/^(\(\d{2}\)\s?)(\d{4,5})-?(\d{4})$/, '$1*****-$3');
      }
    }
  }

  return sanitized;
}

/**
 * Gera hash SHA-256 de uma string
 * Útil para comparações sem expor dados sensíveis
 *
 * @param {string} data - Dados para gerar hash
 * @returns {string} Hash SHA-256 em hexadecimal
 */
function generateHash(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Verifica força de senha
 *
 * @param {string} password - Senha para verificar
 * @returns {object} { strength: 'weak'|'medium'|'strong', score: number, feedback: string[] }
 */
function checkPasswordStrength(password) {
  const feedback = [];
  let score = 0;

  if (!password || password.length < 8) {
    return { strength: 'weak', score: 0, feedback: ['Senha deve ter no mínimo 8 caracteres'] };
  }

  // Comprimento
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;

  // Complexidade
  if (/[a-z]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Adicione letras minúsculas');
  }

  if (/[A-Z]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Adicione letras maiúsculas');
  }

  if (/\d/.test(password)) {
    score += 1;
  } else {
    feedback.push('Adicione números');
  }

  if (/[^a-zA-Z0-9]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Adicione caracteres especiais');
  }

  // Padrões comuns (penalidade)
  if (/^(password|123456|qwerty)/i.test(password)) {
    score = Math.max(0, score - 3);
    feedback.push('Evite senhas comuns');
  }

  // Sequências (penalidade)
  if (/(.)\1{2,}/.test(password)) {
    score = Math.max(0, score - 1);
    feedback.push('Evite caracteres repetidos');
  }

  // Determinar força
  let strength;
  if (score <= 3) {
    strength = 'weak';
  } else if (score <= 5) {
    strength = 'medium';
  } else {
    strength = 'strong';
  }

  return { strength, score, feedback };
}

/**
 * Gera token seguro para reset de senha ou convites
 *
 * @param {number} length - Comprimento do token em bytes (padrão: 32)
 * @returns {string} Token hexadecimal
 */
function generateSecureToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

module.exports = {
  generateSecurePassword,
  validateCPF,
  validateCNPJ,
  validateDocument,
  sanitizeForLogging,
  generateHash,
  checkPasswordStrength,
  generateSecureToken,
};
