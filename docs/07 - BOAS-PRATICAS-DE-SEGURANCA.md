# 🛡️ Boas Práticas de Segurança — IMPGEO

Guia para desenvolvedores que contribuem com o projeto.

---

## Regras Fundamentais

### 1. NUNCA commitar o arquivo `.env`

O `.env` já está no `.gitignore`. Verifique antes de cada commit:

```bash
git status  # .env NÃO deve aparecer aqui
```

Se acidentalmente commitar:

```bash
git rm --cached server/.env
git commit -m "Remove .env do versionamento"
# OBRIGATÓRIO: rotacionar TODAS as credenciais expostas
```

---

### 2. Sempre usar Prepared Statements

```javascript
// ✅ CORRETO — usa prepared statement
const result = await pool.query(
  'SELECT * FROM users WHERE id = $1 AND role = $2',
  [userId, role]
);

// ❌ ERRADO — vulnerável a SQL Injection
const result = await pool.query(
  `SELECT * FROM users WHERE id = ${userId}`  // NUNCA FAÇA ISSO
);
```

---

### 3. Autenticação em todas as rotas protegidas

```javascript
// ✅ CORRETO — middleware de autenticação
app.get('/api/projects', authenticateToken, async (req, res) => { ... });

// Para rotas de admin:
app.get('/api/users', authenticateToken, requireAdmin, async (req, res) => { ... });

// Para rotas de superadmin:
app.post('/api/auth/impersonate/:id', authenticateToken, requireSuperAdmin, async (req, res) => { ... });
```

---

### 4. Validar e sanitizar inputs

Todo input do usuário deve ser validado **no backend**. O frontend valida para UX, mas o backend é a fonte de verdade.

```javascript
// Usando express-validator
const { body, validationResult } = require('express-validator');

app.post('/api/transactions',
  authenticateToken,
  [
    body('value').isFloat({ min: 0.01 }).withMessage('Valor deve ser positivo'),
    body('type').isIn(['Receita', 'Despesa']).withMessage('Tipo inválido'),
    body('description').trim().isLength({ min: 1, max: 255 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    // ...
  }
);
```

---

### 5. Registrar operações críticas no audit log

```javascript
const { logAudit, AUDIT_OPERATIONS, AUDIT_STATUS } = require('./utils/audit');

// Ao criar um usuário:
await logAudit({
  operation: AUDIT_OPERATIONS.CREATE_USER,
  userId: req.user.id,
  username: req.user.username,
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'],
  details: { createdUserId: newUser.id, role: newUser.role },
  status: AUDIT_STATUS.SUCCESS
});
```

**Operações que DEVEM ser auditadas:**
- Login / Logout
- Criação, edição, exclusão de usuários
- Mudança de role/permissões
- Acesso a dados sensíveis
- Impersonation (início e fim)
- Tentativas de acesso negadas

---

### 6. Usar autenticação no frontend corretamente

Sempre use o `axiosInterceptor` para chamadas à API — ele gerencia tokens automaticamente:

```typescript
// ✅ CORRETO — usar axios configurado com interceptor
import axios from '../utils/axiosInterceptor';

const response = await axios.get('/api/sessions');

// ⚠️ Ao usar fetch diretamente, incluir header manualmente:
const res = await fetch('/api/endpoint', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
    'Content-Type': 'application/json'
  }
});
```

---

### 7. Não expor informações sensíveis em erros

```javascript
// ✅ CORRETO — mensagem genérica para o cliente
res.status(401).json({ error: 'Credenciais inválidas' });

// ✅ Log detalhado apenas no servidor
console.error('Login falhou para usuario:', username, '- Erro:', err.message);

// ❌ ERRADO — expõe detalhes internos
res.status(500).json({ error: err.message, stack: err.stack });
```

---

### 8. Nunca armazenar senhas em texto puro

```javascript
// ✅ CORRETO — hash com bcrypt
const bcrypt = require('bcrypt');
const passwordHash = await bcrypt.hash(password, 12);

// Para verificar:
const isValid = await bcrypt.compare(inputPassword, storedHash);

// ❌ ERRADO
const passwordHash = password; // JAMAIS
```

---

### 9. Verificar permissões no backend, não só no frontend

O frontend pode ser manipulado. **Toda verificação de permissão deve existir no backend.**

```javascript
// Frontend pode esconder o botão, mas o backend deve recusar a ação:
app.delete('/api/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  // Verificação adicional: admin não pode deletar superadmin
  const targetUser = await db.getUserById(req.params.id);
  if (targetUser.role === 'superadmin' && req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Sem permissão' });
  }
  // ...
});
```

---

### 10. Variáveis de ambiente para configurações sensíveis

```javascript
// ✅ CORRETO
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  console.error('JWT_SECRET não definido — encerrando');
  process.exit(1);
}

// ❌ ERRADO — hardcoded
const jwtSecret = 'meu-secret-super-secreto';
```

---

## Checklist de Code Review de Segurança

Antes de aprovar um PR, verifique:

- [ ] Nenhuma concatenação de strings em queries SQL
- [ ] Todas as novas rotas protegidas com `authenticateToken`
- [ ] Rotas administrativas com `requireAdmin` ou `requireSuperAdmin`
- [ ] Inputs validados com express-validator
- [ ] Operações críticas registradas no audit log
- [ ] Nenhuma credencial hardcoded no código
- [ ] Nenhum `console.log` com dados sensíveis (senhas, tokens)
- [ ] `res.json()` não expõe stack traces ou mensagens internas

---

## Como Reportar Vulnerabilidades

Se encontrar uma vulnerabilidade de segurança:

1. **Não crie uma issue pública** no repositório
2. Entre em contato diretamente com o responsável pelo projeto
3. Descreva a vulnerabilidade, o impacto e como reproduzir
4. Aguarde confirmação antes de divulgar

Veja também: [SECURITY.md](../SECURITY.md)

---

*Última atualização: 2026-03-22*
