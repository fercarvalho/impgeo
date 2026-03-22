# 🗄️ Conexão DBeaver com o Banco no VPS — IMPGEO

Este guia mostra como conectar o **DBeaver** (ou qualquer cliente SQL) ao banco PostgreSQL que roda no VPS, via SSH Tunnel.

---

## Por que usar SSH Tunnel?

O PostgreSQL no VPS não está exposto na internet (porta 5432 não está aberta no firewall). Para conectar remotamente, usamos um túnel SSH que "faz de conta" que o banco está rodando localmente.

---

## Pré-requisitos

- DBeaver instalado localmente
- Acesso SSH ao VPS (chave ou senha)
- PostgreSQL rodando no VPS

---

## Configuração no DBeaver

### Passo 1 — Nova conexão

1. Abra o DBeaver
2. Clique em **Nova Conexão** (ícone de plug com +)
3. Selecione **PostgreSQL**
4. Clique em **Próximo**

### Passo 2 — Aba "Principal" (conexão local simulada)

Preencha como se o banco estivesse local:

| Campo | Valor |
|-------|-------|
| Host | `localhost` |
| Port | `5432` |
| Database | `impgeo` |
| Username | `fernandocarvalho` |
| Password | senha do PostgreSQL no VPS |

### Passo 3 — Aba "SSH"

Ative o SSH Tunnel e preencha:

| Campo | Valor |
|-------|-------|
| Use SSH Tunnel | ✅ Ativado |
| Host/IP | `IP-DO-SEU-VPS` |
| Port | `22` |
| User Name | usuário SSH do VPS |
| Authentication | **Public Key** (recomendado) ou **Password** |
| Private Key | caminho para sua chave SSH (ex: `~/.ssh/id_rsa`) |

### Passo 4 — Testar e conectar

1. Clique em **Testar Conexão**
2. Se aparecer "Conexão estabelecida com sucesso", clique em **Concluir**

---

## Usando psql direto no VPS

Se você está no terminal do VPS (via SSH), use:

```bash
psql -U fernandocarvalho -d impgeo -h localhost
```

Comandos úteis dentro do psql:

```sql
-- Listar tabelas
\dt

-- Ver estrutura de uma tabela
\d users

-- Sair
\q
```

---

## Tabelas principais do banco impgeo

| Tabela | Descrição |
|--------|-----------|
| `users` | Usuários do sistema |
| `projects` | Projetos |
| `services` | Serviços |
| `transactions` | Transações financeiras |
| `clients` | Clientes |
| `metas` | Metas financeiras |
| `acompanhamentos` | Acompanhamentos |
| `modules_catalog` | Catálogo de módulos disponíveis |
| `user_module_permissions` | Permissões de módulos por usuário |
| `refresh_tokens` | Tokens de longa duração |
| `active_sessions` | Sessões ativas por dispositivo |
| `audit_logs` | Log de auditoria de segurança |

---

## Queries úteis de manutenção

```sql
-- Ver usuários e seus roles
SELECT id, username, email, role, created_at FROM users ORDER BY created_at DESC;

-- Ver sessões ativas
SELECT u.username, s.device_name, s.browser, s.os, s.country, s.last_activity_at
FROM active_sessions s
JOIN users u ON s.user_id = u.id
WHERE s.is_active = true
ORDER BY s.last_activity_at DESC;

-- Ver últimas entradas do log de auditoria
SELECT timestamp, username, operation, status, ip_address
FROM audit_logs
ORDER BY timestamp DESC
LIMIT 20;

-- Limpar sessões expiradas manualmente
UPDATE active_sessions
SET is_active = false, revoked_at = NOW(), revoked_reason = 'expired'
WHERE expires_at < NOW() AND is_active = true;

-- Ver tamanho das tabelas
SELECT schemaname, tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

---

## Solução de problemas

### Erro "Connection refused" na porta 5432

O PostgreSQL não está acessível diretamente. Verifique se o SSH Tunnel está ativado.

### Erro de autenticação SSH

```bash
# Testar conexão SSH manualmente
ssh -i ~/.ssh/id_rsa usuario@IP-DO-VPS
```

### Erro "role does not exist"

```bash
# No VPS, criar o usuário se necessário
psql -U postgres -c "CREATE USER fernandocarvalho WITH PASSWORD 'senha';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE impgeo TO fernandocarvalho;"
```

---

*Última atualização: 2026-03-22*
