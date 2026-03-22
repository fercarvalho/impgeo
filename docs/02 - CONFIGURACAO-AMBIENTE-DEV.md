# 🛠️ Configuração do Ambiente de Desenvolvimento — IMPGEO

---

## Pré-requisitos

- Node.js 18+
- npm 9+
- PostgreSQL 14+
- Git

---

## 1. Clonar o repositório

```bash
git clone <URL-DO-REPOSITORIO> impgeo
cd impgeo
```

---

## 2. Instalar dependências

```bash
# Dependências do frontend (raiz)
npm install

# Dependências do backend
cd server && npm install && cd ..
```

---

## 3. Configurar variáveis de ambiente

```bash
cp server/.env.example server/.env
```

Edite `server/.env`:

```env
# Banco de dados local
DATABASE_URL=postgresql://fernandocarvalho:sua-senha@localhost:5432/impgeo

# JWT (pode usar qualquer string longa em dev)
JWT_SECRET=dev-secret-minimo-32-caracteres-aqui

# Segurança
ENCRYPTION_KEY=dev-encryption-key-32-bytes-ok
ENCRYPTION_SALT=impgeo-dev-salt

# Configurações
MAX_SESSIONS_PER_USER=5
CORS_ORIGINS=http://localhost:9000
NODE_ENV=development
PORT=9001

# SendGrid (opcional em dev — deixe em branco para desabilitar emails)
SENDGRID_API_KEY=
ALERT_EMAIL_FROM=
ALERT_EMAIL_TO=
```

---

## 4. Criar e configurar o banco de dados

```bash
# Criar banco
psql -U fernandocarvalho -h localhost -c "CREATE DATABASE impgeo;"

# Executar todas as migrações em ordem
for file in server/migrations/*.sql; do
  echo "Executando: $file"
  psql -U fernandocarvalho -d impgeo -h localhost -f "$file"
done
```

---

## 5. Rodar o projeto

Você precisa de dois terminais abertos simultaneamente.

**Terminal 1 — Backend (Node.js na porta 9001):**

```bash
cd server
node server.js
# ou, com auto-reload:
npx nodemon server.js
```

**Terminal 2 — Frontend (Vite na porta 9000):**

```bash
# Na raiz do projeto
npm run dev
```

Acesse: `http://localhost:9000`

---

## 6. Verificar que está funcionando

```bash
# Testar backend
curl http://localhost:9001/api/health

# Deve retornar algo como:
# {"status":"ok","timestamp":"..."}
```

---

## Configuração do Vite (portas)

O frontend roda na porta **9000** em dev. Veja `vite.config.ts`:

```typescript
export default defineConfig({
  server: {
    port: 9000,
    proxy: {
      '/api': 'http://localhost:9001'  // Proxy para o backend
    }
  }
})
```

---

## Usuário admin padrão

Após executar as migrações, um usuário admin inicial pode ser criado pela migration. Consulte o arquivo de migration inicial para verificar as credenciais padrão.

Se não houver usuário padrão, crie via psql:

```sql
-- Conectar ao banco
psql -U fernandocarvalho -d impgeo -h localhost

-- Verificar usuários existentes
SELECT id, username, role FROM users;
```

---

## Estrutura de portas

| Serviço | Porta | URL |
|---------|-------|-----|
| Frontend (dev) | 9000 | http://localhost:9000 |
| Backend (API) | 9001 | http://localhost:9001 |
| PostgreSQL | 5432 | localhost:5432 |

---

## Comandos úteis

```bash
# Verificar erros de TypeScript sem buildar
npx tsc --noEmit

# Build de produção (frontend)
npm run build

# Lint
npm run lint

# Ver logs do PostgreSQL (macOS)
tail -f /usr/local/var/log/postgresql@14.log
```

---

## Problemas comuns

### Porta 9001 já em uso

```bash
lsof -i :9001
kill -9 PID
```

### Erro de conexão com PostgreSQL

```bash
# Verificar se PostgreSQL está rodando (macOS)
brew services list | grep postgresql
brew services start postgresql@14

# Linux
systemctl status postgresql
systemctl start postgresql
```

### Erro "relation does not exist"

Significa que alguma migration não foi executada. Execute todas:

```bash
for file in server/migrations/*.sql; do
  psql -U fernandocarvalho -d impgeo -h localhost -f "$file"
done
```

---

*Última atualização: 2026-03-22*
