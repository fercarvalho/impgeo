# 🔑 Guia de Refresh Tokens — IMPGEO

---

## O que são Refresh Tokens?

O sistema usa **dois tipos de tokens**:

| Token | Duração | Propósito |
|-------|---------|-----------|
| **Access Token (JWT)** | 15 minutos | Autorizar requisições à API |
| **Refresh Token** | 7 dias | Obter novos access tokens sem novo login |

**Por que dois tokens?**

- Access tokens curtos limitam o dano se forem comprometidos (15min e expiram)
- Refresh tokens longos mantêm o usuário logado sem pedir senha repetidamente
- O backend pode revogar refresh tokens para forçar logout imediato

---

## Fluxo Completo

```
1. Usuário faz login
   POST /api/auth/login
   ← { token (15min), refreshToken (7 dias), user }

2. Frontend usa o token para chamadas normais
   GET /api/projects
   Authorization: Bearer <token>

3. Token expira após 15 minutos
   ← 401 Unauthorized

4. Interceptor axios detecta o 401 automaticamente
   POST /api/auth/refresh
   Body: { refreshToken }
   ← { token (novo, 15min), refreshToken (rotacionado) }

5. Requisição original é refeita com novo token

6. Se refresh também expirar (7 dias) → logout automático
```

---

## Rotação Automática

A cada vez que o refresh token é usado, um **novo refresh token é gerado** e o anterior é invalidado. Isso é chamado de "refresh token rotation".

**Por que é importante:**

Se um refresh token for roubado e usado pelo atacante, o token legítimo do usuário ficaria inválido. Na próxima tentativa do usuário real, o sistema detecta que está tentando usar um token já rotacionado e **revoga TODOS os tokens** daquela família — fazendo logout completo em todos os dispositivos.

---

## Implementação no Backend

**Arquivo:** `server/utils/refresh-tokens.js`

Funções principais:

```javascript
// Criar refresh token para um usuário
createRefreshToken(userId, ipAddress, userAgent)

// Verificar e obter dados de um refresh token
verifyRefreshToken(token)

// Rotacionar (invalidar o atual, gerar novo)
rotateRefreshToken(oldToken, ipAddress, userAgent)

// Revogar todos os tokens de um usuário
revokeAllUserTokens(userId)
```

**Endpoints:**

```javascript
// Renovar access token
POST /api/auth/refresh
Body: { refreshToken: "..." }
Response: { token: "...", refreshToken: "..." }

// Logout (revoga token atual)
POST /api/auth/logout
Body: { refreshToken: "..." }
Response: { message: "Logout realizado" }
```

---

## Implementação no Frontend

**Arquivo:** `src/utils/axiosInterceptor.ts`

O interceptor funciona **automaticamente** — você não precisa se preocupar com renovação de tokens:

```typescript
import axios from '../utils/axiosInterceptor';

// Basta usar normalmente:
const response = await axios.get('/api/projects');
// Se o token expirar, o interceptor renova automaticamente
```

**O que o interceptor faz:**
1. Adiciona `Authorization: Bearer <token>` em toda requisição
2. Se receber 401, chama `/api/auth/refresh` com o `refreshToken` do localStorage
3. Se renovação OK → refaz a requisição original com novo token
4. Se renovação falhar → chama `logout()` e redireciona para login

---

## Armazenamento no Banco

**Tabela:** `refresh_tokens`

```sql
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token VARCHAR(64) NOT NULL UNIQUE,  -- hash SHA-256 do token
  user_id UUID NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  revoked BOOLEAN DEFAULT FALSE,
  revoked_at TIMESTAMPTZ,
  ip_address INET,
  user_agent TEXT,
  replaced_by_token UUID REFERENCES refresh_tokens(id)
);
```

**Nunca armazenamos o token em texto puro** — apenas o hash SHA-256.

---

## Gerenciamento de Sessões

Cada refresh token está associado a uma sessão em `active_sessions`:

```sql
CREATE TABLE active_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  refresh_token_id UUID REFERENCES refresh_tokens(id),
  ip_address INET,
  user_agent TEXT,
  device_type VARCHAR(50),  -- 'desktop', 'mobile', 'tablet'
  device_name VARCHAR(255), -- 'iPhone 13', 'MacBook Pro'
  browser VARCHAR(100),     -- 'Chrome 120.0'
  os VARCHAR(100),          -- 'Windows 10'
  country VARCHAR(100),
  city VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT TRUE
);
```

---

## Revogar Sessões

**Via API (usuário logado):**

```javascript
// Revogar uma sessão específica
DELETE /api/sessions/:sessionId

// Revogar todas exceto a atual
DELETE /api/sessions
Body: { currentRefreshTokenId: "uuid-atual" }
```

**Via banco (admin):**

```sql
-- Revogar todas as sessões de um usuário
UPDATE refresh_tokens SET revoked = true, revoked_at = NOW()
WHERE user_id = 'uuid-do-usuario' AND revoked = false;

UPDATE active_sessions SET is_active = false, revoked_at = NOW()
WHERE user_id = 'uuid-do-usuario' AND is_active = true;
```

---

## Limite de Sessões Simultâneas

Configurável via `.env`:

```env
MAX_SESSIONS_PER_USER=5
```

Quando o usuário excede o limite, a sessão mais antiga é automaticamente revogada.

---

## Limpeza Automática

O servidor executa limpeza automática a cada hora:

```javascript
// server/server.js
setInterval(() => {
  cleanupExpiredSessions();
  cleanupExpiredTokens();
}, 60 * 60 * 1000);
```

---

## Troubleshooting

**"Token inválido" logo após login:**
- Verificar se `JWT_SECRET` é o mesmo entre deploys
- Verificar se o token não está sendo corrompido no localStorage

**Usuário sendo deslogado a cada 15 minutos:**
- Verificar se o interceptor axios está sendo importado corretamente
- Verificar se `refreshToken` existe no localStorage

**"Refresh token já utilizado":**
- Token foi rotacionado — o usuário tem duas abas/dispositivos usando o mesmo token
- É comportamento correto de segurança — o usuário precisará logar novamente

---

*Última atualização: 2026-03-22*
