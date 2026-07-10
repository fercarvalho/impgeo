// ═══════════════════════════════════════════════════════════════════════════
// server/db/_shared.js
// Símbolos de nível de módulo compartilhados pelos arquivos-domínio do data-layer
// (#15 A). Antes viviam no topo do database-pg.js; ao fatiar a classe em
// db/<dominio>.js (via Object.assign no prototype), cada domínio importa daqui o
// que precisa. O `database-pg.js` (core) também passa a importar daqui.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

// Converte chaves snake_case → camelCase recursivamente (preserva Date/arrays).
function toCamelCase(obj) {
  if (Array.isArray(obj)) return obj.map(toCamelCase);
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
    return Object.keys(obj).reduce((acc, key) => {
      const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      acc[camel] = toCamelCase(obj[key]);
      return acc;
    }, {});
  }
  return obj;
}

// Colunas públicas de tc_users (sem hash de senha etc.). Antes era o estático
// `Database.TC_USER_PUBLIC_FIELDS`; virou constante compartilhada para os
// arquivos-domínio (db/terracontrol.js, db/push-prefs.js) e o core referenciarem.
const TC_USER_PUBLIC_FIELDS = [
  'id', 'username', 'first_name', 'last_name', 'email', 'email_verified_at',
  'phone', 'cpf', 'birth_date', 'gender', 'address', 'photo_url',
  'force_password_change', 'is_active', 'can_share',
  'edit_records_permission', 'delete_records_permission',
  'created_via', 'last_login', 'created_at', 'updated_at'
].join(', ');

module.exports = { toCamelCase, TC_USER_PUBLIC_FIELDS };
