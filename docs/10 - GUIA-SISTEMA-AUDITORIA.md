# 📊 Guia do Sistema de Auditoria — IMPGEO

---

## O que é o Sistema de Auditoria?

O sistema registra automaticamente **todas as operações críticas** no banco de dados, com timestamp, usuário, IP e detalhes da ação. Isso permite:

- Rastrear quem fez o quê e quando
- Detectar comportamentos suspeitos
- Investigar incidentes de segurança
- Conformidade com LGPD

---

## Estrutura da Tabela

```sql
CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  operation VARCHAR(100) NOT NULL,
  user_id VARCHAR(255),
  username VARCHAR(255),
  ip_address VARCHAR(45),
  user_agent TEXT,
  details JSONB,
  status VARCHAR(50),        -- 'success', 'failure', 'error'
  error_message TEXT
);

-- Índices para performance
CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_operation ON audit_logs(operation);
CREATE INDEX idx_audit_status ON audit_logs(status);
```

---

## Como Registrar uma Auditoria

**Arquivo:** `server/utils/audit.js`

```javascript
const { logAudit, AUDIT_OPERATIONS, AUDIT_STATUS } = require('./utils/audit');

// Exemplo de uso em um endpoint
app.post('/api/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const newUser = await db.createUser(req.body);

    await logAudit({
      operation: AUDIT_OPERATIONS.CREATE_USER,
      userId: req.user.id,
      username: req.user.username,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: {
        createdUserId: newUser.id,
        createdUsername: newUser.username,
        role: newUser.role
      },
      status: AUDIT_STATUS.SUCCESS
    });

    res.status(201).json({ user: newUser });
  } catch (err) {
    await logAudit({
      operation: AUDIT_OPERATIONS.CREATE_USER,
      userId: req.user.id,
      username: req.user.username,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { attemptedUsername: req.body.username },
      status: AUDIT_STATUS.ERROR,
      errorMessage: err.message
    });

    res.status(500).json({ error: 'Erro interno' });
  }
});
```

---

## Operações Registradas

```javascript
AUDIT_OPERATIONS = {
  // Autenticação
  LOGIN: 'login',
  LOGOUT: 'logout',
  LOGIN_FAILED: 'login_failed',
  TOKEN_REFRESH: 'token_refresh',
  TOKEN_REFRESH_FAILED: 'token_refresh_failed',

  // Usuários
  CREATE_USER: 'create_user',
  UPDATE_USER: 'update_user',
  DELETE_USER: 'delete_user',
  CHANGE_PASSWORD: 'change_password',
  CHANGE_ROLE: 'change_role',

  // Impersonation
  IMPERSONATION_START: 'impersonation_start',
  IMPERSONATION_STOP: 'impersonation_stop',

  // Sessões
  SESSION_CREATED: 'session_created',
  SESSION_REVOKED: 'session_revoked',
  ALL_SESSIONS_REVOKED: 'all_sessions_revoked',

  // Dados
  CREATE_TRANSACTION: 'create_transaction',
  UPDATE_TRANSACTION: 'update_transaction',
  DELETE_TRANSACTION: 'delete_transaction',
  CREATE_CLIENT: 'create_client',
  UPDATE_CLIENT: 'update_client',
  DELETE_CLIENT: 'delete_client',

  // Segurança
  ANOMALY_DETECTED: 'anomaly_detected',
  SECURITY_ALERT_SENT: 'security_alert_sent',
  BRUTE_FORCE_DETECTED: 'brute_force_detected',
}
```

---

## Queries de Análise Úteis

### Ver atividade recente (últimas 24h)

```sql
SELECT timestamp, username, operation, status, ip_address
FROM audit_logs
WHERE timestamp > NOW() - INTERVAL '24 hours'
ORDER BY timestamp DESC
LIMIT 50;
```

### Ver tentativas de login falhas

```sql
SELECT timestamp, username, ip_address,
       details->>'reason' as reason
FROM audit_logs
WHERE operation = 'login_failed'
  AND timestamp > NOW() - INTERVAL '7 days'
ORDER BY timestamp DESC;
```

### Detectar brute force manual

```sql
SELECT ip_address, COUNT(*) as tentativas,
       MIN(timestamp) as primeira,
       MAX(timestamp) as ultima
FROM audit_logs
WHERE operation = 'login_failed'
  AND timestamp > NOW() - INTERVAL '1 hour'
GROUP BY ip_address
HAVING COUNT(*) >= 5
ORDER BY tentativas DESC;
```

### Ver histórico de um usuário específico

```sql
SELECT timestamp, operation, status, ip_address, details
FROM audit_logs
WHERE username = 'nome-do-usuario'
ORDER BY timestamp DESC
LIMIT 100;
```

### Estatísticas gerais

```sql
SELECT
  operation,
  COUNT(*) as total,
  SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as sucesso,
  SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END) as falha,
  SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as erro
FROM audit_logs
WHERE timestamp > NOW() - INTERVAL '30 days'
GROUP BY operation
ORDER BY total DESC;
```

### Logins de IPs suspeitos (múltiplos usuários do mesmo IP)

```sql
SELECT ip_address,
       COUNT(DISTINCT username) as usuarios_diferentes,
       COUNT(*) as total_logins
FROM audit_logs
WHERE operation = 'login'
  AND status = 'success'
  AND timestamp > NOW() - INTERVAL '24 hours'
GROUP BY ip_address
HAVING COUNT(DISTINCT username) > 2
ORDER BY usuarios_diferentes DESC;
```

---

## Manutenção da Tabela

### Ver tamanho atual

```sql
SELECT pg_size_pretty(pg_total_relation_size('audit_logs')) AS tamanho;
```

### Arquivar logs antigos (manter apenas 90 dias)

```sql
-- Criar tabela de arquivo (uma vez)
CREATE TABLE audit_logs_archive (LIKE audit_logs INCLUDING ALL);

-- Mover logs com mais de 90 dias
INSERT INTO audit_logs_archive
SELECT * FROM audit_logs
WHERE timestamp < NOW() - INTERVAL '90 days';

DELETE FROM audit_logs
WHERE timestamp < NOW() - INTERVAL '90 days';
```

### Contar registros por período

```sql
SELECT
  DATE_TRUNC('day', timestamp) as dia,
  COUNT(*) as registros
FROM audit_logs
WHERE timestamp > NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY 1 DESC;
```

---

## Sanitização de Dados Sensíveis

O sistema **nunca** registra dados sensíveis em texto puro nos logs.

**Campos automaticamente sanitizados pela função `sanitizeForLogging`:**
- `password`, `senha` → `[REDACTED]`
- `token`, `refreshToken` → `[REDACTED]`
- `secret`, `apiKey` → `[REDACTED]`
- CPF → `***.***.***-**` (mascarado)
- Email → `u***@dominio.com` (mascarado)

---

## Conformidade LGPD

O sistema de auditoria está em conformidade com a Lei Geral de Proteção de Dados:

- ✅ Dados sensíveis mascarados nos logs
- ✅ Registro de atividades (art. 46, LGPD)
- ✅ Rastreabilidade de acesso a dados pessoais
- ✅ Logs com retenção controlável (cleanup configurável)

---

*Última atualização: 2026-03-22*
