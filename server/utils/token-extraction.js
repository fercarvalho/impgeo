// ═══════════════════════════════════════════════════════════════════════════
// server/utils/token-extraction.js
// Extração do JWT de acesso a partir da requisição — função pura e testável
// (melhoria #9). Ordem de prioridade:
//
//   1. cookie httpOnly `impersonationToken` (impersonation é autoritativa)
//   2. header Authorization: Bearer (fallback dev cross-port / same-origin)
//   3. cookie httpOnly `accessToken` (ou `tcAdminAccessToken` no origin tc-admin)
//
// Durante impersonation, o cookie httpOnly vence header e accessToken: assim o
// token de impersonation NUNCA precisa trafegar por JS (sem cookie-pai legível,
// fim da superfície de exfiltração via XSS) e o header não pode "voltar" pro
// superadmin por engano.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

function extractAccessToken(req) {
  // 1. Impersonation (cookie httpOnly) — autoritativa quando presente.
  if (req.cookies && req.cookies.impersonationToken) {
    return req.cookies.impersonationToken;
  }

  // 2. Header Bearer — fallback para dev cross-port (localhost:9000 → :9001,
  //    onde a cookie pode não viajar) e chamadas same-origin explícitas.
  const authHeader = req.headers && req.headers['authorization'];
  const headerToken = authHeader && authHeader.split(' ')[1];
  const isValidHeaderToken =
    headerToken &&
    headerToken !== 'null' &&
    headerToken !== 'undefined' &&
    headerToken.length > 10;
  if (isValidHeaderToken) return headerToken;

  // 3. Cookie de sessão padrão. `tcAdminAccessToken` existe em admin.terracontrol.*
  //    (PR #5/PWA) e contém o mesmo JWT do impgeo — tratado como fallback.
  if (req.cookies) {
    return req.cookies.accessToken || req.cookies.tcAdminAccessToken;
  }

  return undefined;
}

module.exports = { extractAccessToken };
