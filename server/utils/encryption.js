/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Encryption Utilities - AES-256-GCM
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Funções para criptografar/descriptografar campos sensíveis no banco de dados.
 *
 * Campos sensíveis:
 *   - CPF
 *   - Telefone
 *   - Email (opcional)
 *   - Endereço
 *
 * Algoritmo: AES-256-GCM (Galois/Counter Mode)
 *   - Autenticação integrada
 *   - Proteção contra adulteração
 *   - Melhor performance que CBC
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const crypto = require('crypto');

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURAÇÃO
// ═══════════════════════════════════════════════════════════════════════════════

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // bytes (128 bits)
const AUTH_TAG_LENGTH = 16; // bytes (128 bits)
const SALT_LENGTH = 64; // bytes para derivação de chave

/**
 * Obter chave de criptografia do ambiente
 * IMPORTANTE: Esta chave NUNCA deve ser commitada no Git!
 */
const getEncryptionKey = () => {
  const key = process.env.ENCRYPTION_KEY;

  if (!key) {
    throw new Error(
      'ENCRYPTION_KEY não configurada! ' +
      'Adicione ao .env: ENCRYPTION_KEY=$(openssl rand -base64 32)'
    );
  }

  // Derivar chave de 256 bits a partir da chave base
  const salt = process.env.ENCRYPTION_SALT || 'alya-default-salt-change-me';
  return crypto.pbkdf2Sync(key, salt, 100000, 32, 'sha256');
};

// ═══════════════════════════════════════════════════════════════════════════════
// FUNÇÕES PRINCIPAIS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Criptografa um valor
 *
 * @param {string} plaintext - Texto a ser criptografado
 * @returns {string} - Texto criptografado no formato: iv:authTag:encrypted
 * @throws {Error} - Se plaintext for vazio ou inválido
 */
const encrypt = (plaintext) => {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('Texto para criptografia deve ser uma string não-vazia');
  }

  try {
    // Gerar IV aleatório
    const iv = crypto.randomBytes(IV_LENGTH);

    // Obter chave de criptografia
    const key = getEncryptionKey();

    // Criar cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    // Criptografar
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Obter authentication tag
    const authTag = cipher.getAuthTag();

    // Retornar formato: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  } catch (error) {
    console.error('[Encryption] Erro ao criptografar:', error.message);
    throw new Error('Falha ao criptografar dados');
  }
};

/**
 * Descriptografa um valor
 *
 * @param {string} encryptedData - Texto criptografado no formato: iv:authTag:encrypted
 * @returns {string} - Texto descriptografado
 * @throws {Error} - Se dados forem inválidos ou corrompidos
 */
const decrypt = (encryptedData) => {
  if (!encryptedData || typeof encryptedData !== 'string') {
    throw new Error('Dados criptografados devem ser uma string não-vazia');
  }

  try {
    // Separar componentes
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Formato de dados criptografados inválido');
    }

    const [ivHex, authTagHex, encrypted] = parts;

    // Converter de hex para Buffer
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    // Obter chave de criptografia
    const key = getEncryptionKey();

    // Criar decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    // Descriptografar
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('[Encryption] Erro ao descriptografar:', error.message);
    throw new Error('Falha ao descriptografar dados (dados corrompidos ou chave inválida)');
  }
};

/**
 * Hash one-way para busca/indexação
 * Use para criar índices searchable sem expor dados sensíveis
 *
 * @param {string} value - Valor a ser hasheado
 * @returns {string} - Hash SHA-256
 */
const hash = (value) => {
  if (!value || typeof value !== 'string') {
    throw new Error('Valor para hash deve ser uma string não-vazia');
  }

  return crypto
    .createHash('sha256')
    .update(value)
    .digest('hex');
};

/**
 * Máscara parcial para exibição (ex: CPF)
 * Mostra apenas últimos 4 dígitos
 *
 * @param {string} value - Valor a ser mascarado
 * @param {number} visibleChars - Número de caracteres visíveis (default: 4)
 * @returns {string} - Valor mascarado (ex: ***-***-234)
 */
const mask = (value, visibleChars = 4) => {
  if (!value || typeof value !== 'string') {
    return '***';
  }

  if (value.length <= visibleChars) {
    return '*'.repeat(value.length);
  }

  const masked = '*'.repeat(value.length - visibleChars);
  const visible = value.slice(-visibleChars);

  return masked + visible;
};

/**
 * Máscara de CPF (formato brasileiro)
 * Exemplo: 123.456.789-01 → ***.***.***-01
 *
 * @param {string} cpf - CPF a ser mascarado
 * @returns {string} - CPF mascarado
 */
const maskCPF = (cpf) => {
  if (!cpf || typeof cpf !== 'string') {
    return '***.***.***-**';
  }

  // Remover formatação
  const numbers = cpf.replace(/\D/g, '');

  if (numbers.length !== 11) {
    return '***.***.***-**';
  }

  // Mostrar apenas últimos 2 dígitos
  return `***.***.***-${numbers.slice(-2)}`;
};

/**
 * Máscara de telefone
 * Exemplo: (11) 98765-4321 → (11) ****-4321
 *
 * @param {string} phone - Telefone a ser mascarado
 * @returns {string} - Telefone mascarado
 */
const maskPhone = (phone) => {
  if (!phone || typeof phone !== 'string') {
    return '(**) ****-****';
  }

  // Remover formatação
  const numbers = phone.replace(/\D/g, '');

  if (numbers.length < 10) {
    return '(**) ****-****';
  }

  // Extrair DDD e últimos 4 dígitos
  const ddd = numbers.slice(0, 2);
  const last4 = numbers.slice(-4);

  return `(${ddd}) ****-${last4}`;
};

/**
 * Máscara de email
 * Exemplo: usuario@exemplo.com → us****@exemplo.com
 *
 * @param {string} email - Email a ser mascarado
 * @returns {string} - Email mascarado
 */
const maskEmail = (email) => {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return '****@****.***';
  }

  const [localPart, domain] = email.split('@');

  if (localPart.length <= 2) {
    return `**@${domain}`;
  }

  const visibleStart = localPart.slice(0, 2);
  const masked = '*'.repeat(Math.min(localPart.length - 2, 4));

  return `${visibleStart}${masked}@${domain}`;
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS PARA BANCO DE DADOS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Prepara dados para inserção no banco (criptografa campos sensíveis)
 *
 * @param {Object} data - Dados a serem preparados
 * @param {Array<string>} sensitiveFields - Lista de campos sensíveis
 * @returns {Object} - Dados com campos criptografados
 */
const prepareForDatabase = (data, sensitiveFields = ['cpf', 'phone', 'email', 'address']) => {
  const prepared = { ...data };

  sensitiveFields.forEach(field => {
    if (prepared[field]) {
      prepared[field] = encrypt(prepared[field]);
    }
  });

  return prepared;
};

/**
 * Prepara dados para exibição (descriptografa campos sensíveis)
 *
 * @param {Object} data - Dados do banco
 * @param {Array<string>} sensitiveFields - Lista de campos sensíveis
 * @returns {Object} - Dados com campos descriptografados
 */
const prepareForDisplay = (data, sensitiveFields = ['cpf', 'phone', 'email', 'address']) => {
  if (!data) return null;

  const prepared = { ...data };

  sensitiveFields.forEach(field => {
    if (prepared[field]) {
      try {
        prepared[field] = decrypt(prepared[field]);
      } catch (error) {
        console.error(`[Encryption] Erro ao descriptografar campo ${field}:`, error.message);
        prepared[field] = null; // Ou manter criptografado
      }
    }
  });

  return prepared;
};

/**
 * Prepara dados para exibição com máscara (não descriptografa, apenas mascara)
 *
 * @param {Object} data - Dados do banco
 * @param {Object} maskConfig - Configuração de máscaras por campo
 * @returns {Object} - Dados com campos mascarados
 */
const prepareForDisplayMasked = (data, maskConfig = {
  cpf: maskCPF,
  phone: maskPhone,
  email: maskEmail
}) => {
  if (!data) return null;

  const prepared = { ...data };

  Object.entries(maskConfig).forEach(([field, maskFn]) => {
    if (prepared[field]) {
      try {
        const decrypted = decrypt(prepared[field]);
        prepared[field] = maskFn(decrypted);
      } catch (error) {
        console.error(`[Encryption] Erro ao descriptografar/mascarar campo ${field}:`, error.message);
        prepared[field] = '***';
      }
    }
  });

  return prepared;
};

// ═══════════════════════════════════════════════════════════════════════════════
// KEY ROTATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Re-criptografa um valor com nova chave
 * Use durante rotação de chaves
 *
 * @param {string} encryptedData - Dados criptografados com chave antiga
 * @param {string} oldKey - Chave antiga
 * @param {string} newKey - Chave nova
 * @returns {string} - Dados re-criptografados com nova chave
 */
const reEncrypt = (encryptedData, oldKey, newKey) => {
  // Temporariamente usar chave antiga
  const originalKey = process.env.ENCRYPTION_KEY;
  process.env.ENCRYPTION_KEY = oldKey;

  try {
    // Descriptografar com chave antiga
    const decrypted = decrypt(encryptedData);

    // Usar nova chave
    process.env.ENCRYPTION_KEY = newKey;

    // Re-criptografar com nova chave
    return encrypt(decrypted);
  } finally {
    // Restaurar chave original
    process.env.ENCRYPTION_KEY = originalKey;
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  encrypt,
  decrypt,
  hash,
  mask,
  maskCPF,
  maskPhone,
  maskEmail,
  prepareForDatabase,
  prepareForDisplay,
  prepareForDisplayMasked,
  reEncrypt
};
