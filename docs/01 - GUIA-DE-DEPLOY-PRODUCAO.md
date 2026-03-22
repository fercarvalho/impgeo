# 🚀 Guia Completo de Deploy em Produção — IMPGEO

**VPS Path:** `/var/www/impgeo`
**PM2 App:** `impgeo-api`
**Backend Port:** `9001`
**Domínio:** `impgeo.sistemas.viverdepj.com.br`

> Este é o guia detalhado. Para o resumo rápido, veja [DEPLOY.md](../DEPLOY.md) na raiz.

---

## 📋 Pré-requisitos

Antes de começar, confirme que o VPS possui:

- [ ] Node.js 18+ instalado
- [ ] npm instalado
- [ ] PM2 instalado globalmente (`npm install -g pm2`)
- [ ] PostgreSQL instalado e rodando
- [ ] Nginx instalado e configurado
- [ ] Certificado SSL válido (Let's Encrypt)
- [ ] Repositório clonado em `/var/www/impgeo`

---

## 🔄 Deploy Recorrente (após cada `git push`)

Este é o processo que você vai executar na maioria das vezes.

### Passo 1 — Conectar ao VPS e ir ao diretório

```bash
ssh usuario@seu-servidor
cd /var/www/impgeo
```

### Passo 2 — Fazer backup antes de atualizar

```bash
mkdir -p backups
pg_dump -U fernandocarvalho -d impgeo -h localhost > backups/backup-$(date +%Y%m%d-%H%M%S).sql
echo "Backup criado em: backups/backup-$(date +%Y%m%d-%H%M%S).sql"
```

### Passo 3 — Puxar as mudanças

```bash
git pull origin main
```

### Passo 4 — Instalar dependências (se package.json mudou)

```bash
# Frontend
npm install

# Backend
cd server && npm install && cd ..
```

> **Dica:** Se não houve mudança no `package.json`, você pode pular este passo. Em caso de dúvida, execute mesmo assim.

### Passo 5 — Executar migrações SQL (se houver novas)

Verifique se há novos arquivos em `server/migrations/` desde o último deploy:

```bash
git diff HEAD~1 HEAD --name-only | grep migrations
```

Se houver arquivos novos, execute cada um:

```bash
psql -U fernandocarvalho -d impgeo -h localhost -f server/migrations/NOME-DO-ARQUIVO.sql
```

### Passo 6 — Buildar o frontend

```bash
npm run build
```

O output vai para `dist/`. O Nginx serve esses arquivos estáticos.

### Passo 7 — Reiniciar o backend

```bash
pm2 restart impgeo-api
pm2 status
```

### Passo 8 — Verificar se tudo está funcionando

```bash
# Ver logs em tempo real (aguarde 10 segundos para ver se há erros)
pm2 logs impgeo-api --lines 30

# Testar endpoint de saúde
curl http://localhost:9001/api/health

# Verificar processo rodando
pm2 list
```

### Passo 9 — Verificar no browser

Acesse `https://impgeo.sistemas.viverdepj.com.br` e confirme:

- [ ] Site carregou sem erros
- [ ] Login funcionando
- [ ] Funcionalidades principais operando

---

## 🆕 Primeiro Deploy (configuração inicial)

Se é a primeira vez que está fazendo o deploy neste servidor.

### 1. Clonar o repositório

```bash
cd /var/www
git clone <URL-DO-REPOSITORIO> impgeo
cd impgeo
```

### 2. Instalar dependências

```bash
# Frontend
npm install

# Backend
cd server && npm install && cd ..
```

### 3. Configurar variáveis de ambiente

```bash
cp server/.env.example server/.env
nano server/.env
```

Preencha **todos** os valores (veja a seção [Variáveis de Ambiente](#variáveis-de-ambiente) abaixo).

### 4. Criar o banco de dados

```bash
psql -U fernandocarvalho -h localhost -c "CREATE DATABASE impgeo;"
```

### 5. Executar todas as migrações em ordem

```bash
for file in server/migrations/*.sql; do
  echo "Executando: $file"
  psql -U fernandocarvalho -d impgeo -h localhost -f "$file"
done
```

### 6. Buildar o frontend

```bash
npm run build
```

### 7. Iniciar o backend com PM2

```bash
cd server
pm2 start server.js --name impgeo-api
pm2 save
pm2 startup  # Seguir as instruções exibidas para auto-start
cd ..
```

### 8. Configurar Nginx (veja seção abaixo)

---

## 🔐 Variáveis de Ambiente

Arquivo: `/var/www/impgeo/server/.env`

```env
# Banco de dados
DATABASE_URL=postgresql://fernandocarvalho:SENHA@localhost:5432/impgeo

# JWT
JWT_SECRET=gere-com-openssl-rand-base64-64

# Segurança
ENCRYPTION_KEY=gere-com-openssl-rand-base64-32
ENCRYPTION_SALT=impgeo-salt-mude-este-valor

# Sessões
MAX_SESSIONS_PER_USER=5

# CORS
CORS_ORIGINS=https://impgeo.sistemas.viverdepj.com.br

# Ambiente
NODE_ENV=production
PORT=9001

# Email (SendGrid) — opcional mas recomendado
SENDGRID_API_KEY=sua-chave-aqui
ALERT_EMAIL_FROM=security@seudominio.com
ALERT_EMAIL_TO=admin@seudominio.com
```

**Gerar chaves seguras:**

```bash
# JWT_SECRET (64 bytes)
openssl rand -base64 64

# ENCRYPTION_KEY (32 bytes)
openssl rand -base64 32
```

> ⚠️ **NUNCA** commite o arquivo `.env` no repositório. Ele já está no `.gitignore`.

---

## 🌐 Configuração do Nginx

Arquivo: `/etc/nginx/sites-available/impgeo`

```nginx
# Redirecionar HTTP → HTTPS
server {
    listen 80;
    server_name impgeo.sistemas.viverdepj.com.br;
    return 301 https://$host$request_uri;
}

# HTTPS — servidor principal
server {
    listen 443 ssl http2;
    server_name impgeo.sistemas.viverdepj.com.br;

    # Certificados SSL (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/impgeo.sistemas.viverdepj.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/impgeo.sistemas.viverdepj.com.br/privkey.pem;

    # Arquivos estáticos do frontend (build do Vite)
    root /var/www/impgeo/dist;
    index index.html;

    # SPA: qualquer rota serve o index.html (React Router)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy reverso para o backend Node.js
    location /api/ {
        proxy_pass http://localhost:9001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

**Ativar e testar:**

```bash
# Criar link simbólico para ativar o site
ln -s /etc/nginx/sites-available/impgeo /etc/nginx/sites-enabled/

# Testar configuração
nginx -t

# Recarregar Nginx
systemctl reload nginx
```

**Gerar certificado SSL com Let's Encrypt:**

```bash
certbot --nginx -d impgeo.sistemas.viverdepj.com.br
```

---

## 💾 Backup

### Criar backup manual

```bash
cd /var/www/impgeo
mkdir -p backups
pg_dump -U fernandocarvalho -d impgeo -h localhost > backups/backup-$(date +%Y%m%d-%H%M%S).sql
```

### Restaurar backup

```bash
# ATENÇÃO: Isso sobrescreve o banco atual!
psql -U fernandocarvalho -d impgeo -h localhost < backups/NOME-DO-BACKUP.sql
```

### Backup automático com cron (opcional)

```bash
crontab -e
```

Adicione:

```cron
# Backup diário às 3h da manhã
0 3 * * * pg_dump -U fernandocarvalho -d impgeo -h localhost > /var/www/impgeo/backups/backup-$(date +\%Y\%m\%d).sql
# Manter apenas os últimos 30 backups
0 4 * * * find /var/www/impgeo/backups -name "*.sql" -mtime +30 -delete
```

---

## ✅ Checklist de Verificação Pós-Deploy

### Verificações Rápidas

```bash
# PM2 rodando
pm2 list

# Backend respondendo
curl http://localhost:9001/api/health

# Nginx ativo
systemctl status nginx

# Logs sem erros críticos
pm2 logs impgeo-api --lines 50 --nostream
```

### Verificações no Browser

- [ ] `https://impgeo.sistemas.viverdepj.com.br` carrega
- [ ] Login funciona
- [ ] Dashboard carrega dados
- [ ] Admin panel acessível (para admin/superadmin)
- [ ] Sessões ativas listadas corretamente
- [ ] Console do browser sem erros vermelhos

---

## 🔧 Resolução de Problemas

### PM2 não inicia / cai imediatamente

```bash
# Ver logs de erro
pm2 logs impgeo-api --err --lines 100

# Verificar se .env existe e está correto
cat server/.env

# Testar iniciar manualmente (para ver erros no terminal)
cd server && node server.js
```

### Erro 502 Bad Gateway no Nginx

```bash
# Backend não está rodando
pm2 status

# Reiniciar
pm2 restart impgeo-api

# Verificar se está na porta certa
netstat -tlnp | grep 9001
```

### Erro de conexão com banco de dados

```bash
# Testar conexão
psql -U fernandocarvalho -d impgeo -h localhost -c "SELECT 1;"

# Verificar se PostgreSQL está rodando
systemctl status postgresql
```

### Build do frontend falhou

```bash
# Ver erros de TypeScript
npm run build 2>&1 | head -50

# Limpar cache e rebuild
rm -rf node_modules/.vite dist
npm install
npm run build
```

### Nginx não serve o site

```bash
# Testar configuração
nginx -t

# Ver erros do Nginx
tail -50 /var/log/nginx/error.log

# Verificar se dist/ existe
ls -la /var/www/impgeo/dist/
```

---

## 📋 Checklist Completo do Primeiro Deploy

- [ ] Node.js 18+ instalado
- [ ] PostgreSQL instalado e rodando
- [ ] PM2 instalado globalmente
- [ ] Nginx instalado
- [ ] Repositório clonado em `/var/www/impgeo`
- [ ] `npm install` executado (raiz e server/)
- [ ] `.env` criado com todos os valores preenchidos
- [ ] Banco `impgeo` criado
- [ ] Todas as migrações executadas
- [ ] `npm run build` executado com sucesso
- [ ] PM2 iniciado com `impgeo-api`
- [ ] `pm2 save` e `pm2 startup` executados
- [ ] Nginx configurado e recarregado
- [ ] SSL configurado com Let's Encrypt
- [ ] Site acessível no domínio
- [ ] Login funcionando

---

*Última atualização: 2026-03-22*
