# Guia de Deploy — IMPGEO

> **Caminho do projeto na VPS:** `/var/www/impgeo`
> **Processo backend (PM2):** `impgeo-api`
> **Porta do backend:** `9001`
> **Domínio:** `impgeo.sistemas.viverdepj.com.br`
> **Banco de dados:** PostgreSQL — usuário `seuusuario`, banco `impgeo`, host `localhost`
> **Frontend:** build estático em `dist/`, servido pelo Nginx
> **Backups:** `/var/www/impgeo/backups/`

---

## Índice

1. [Pré-requisitos](#1-pré-requisitos)
2. [Deploy recorrente — fluxo padrão](#2-deploy-recorrente--fluxo-padrão)
3. [Primeiro deploy das mudanças de segurança](#3-primeiro-deploy-das-mudanças-de-segurança)
4. [Variáveis de ambiente](#4-variáveis-de-ambiente)
5. [Configuração do Nginx](#5-configuração-do-nginx)
6. [Backup do banco de dados](#6-backup-do-banco-de-dados)
7. [Comandos úteis de verificação](#7-comandos-úteis-de-verificação)
8. [Resolução de problemas](#8-resolução-de-problemas)

---

## 1. Pré-requisitos

Antes de qualquer deploy, certifique-se de que na VPS estão instalados:

```bash
node --version      # v18+ recomendado
npm --version       # v9+
pm2 --version       # gerenciador de processos
psql --version      # cliente PostgreSQL
nginx -v            # servidor web
```

Se PM2 não estiver instalado globalmente:

```bash
npm install -g pm2
```

---

## 2. Deploy recorrente — fluxo padrão

> Use este fluxo em **todos os deploys após o primeiro**. Leva em torno de 2–3 minutos.

```bash
# 1. Acessar a VPS
ssh usuario@ip-da-vps

# 2. Entrar no projeto
cd /var/www/impgeo

# 3. Puxar as mudanças
git pull origin main

# 4. Instalar dependências do backend (seguro rodar sempre)
cd server && npm install && cd ..

# 5. Instalar dependências do frontend (seguro rodar sempre)
npm install --legacy-peer-deps

# 6. Build do frontend
npm run build

# 7. Reiniciar o backend
pm2 restart impgeo-api

# 8. Verificar os logs (aguardar ~5 segundos)
pm2 logs impgeo-api --lines 30 --nostream
```

**O que confirma sucesso nos logs:**
- `Servidor rodando na porta 9001`
- `Monitoramento de anomalias iniciado`
- Ausência de `Cannot find module` ou `ECONNREFUSED`

**Após o build, o Nginx já serve o novo frontend automaticamente** — não é necessário reiniciá-lo em deploys normais. Só reinicie o Nginx se você alterar o arquivo de configuração dele.

---

## 3. Primeiro deploy das mudanças de segurança

> Siga este fluxo **uma única vez** para aplicar todas as mudanças desta atualização.
> Nos próximos deploys, use o [fluxo padrão](#2-deploy-recorrente--fluxo-padrão).

### 3.1 — Fazer backup antes de qualquer coisa

```bash
cd /var/www/impgeo

# Criar pasta de backups (se ainda não existir)
mkdir -p backups

# Backup completo do banco
pg_dump -U seuusuario -d impgeo -h localhost \
  > backups/impgeo_backup_$(date +%Y%m%d_%H%M%S).sql

# Confirmar que o backup foi criado e tem tamanho razoável
ls -lh backups/
```

> ⚠️ **Nunca pule o backup.** Se algo der errado, restaure com:
> ```bash
> psql -U seuusuario -d impgeo -h localhost \
>   < backups/nome-do-arquivo.sql
> ```

---

### 3.2 — Atualizar o código

```bash
cd /var/www/impgeo
git pull origin main
```

---

### 3.3 — Atualizar as variáveis de ambiente

```bash
nano /var/www/impgeo/server/.env
```

Adicionar as linhas abaixo que ainda não existem no arquivo (ver valores na seção [4. Variáveis de ambiente](#4-variáveis-de-ambiente)):

```env
CORS_ORIGINS=https://impgeo.sistemas.viverdepj.com.br
BASE_URL=https://impgeo.sistemas.viverdepj.com.br
ENCRYPTION_KEY=COLE_AQUI_A_CHAVE_GERADA
ENCRYPTION_SALT=impgeo-salt-change-me
MAX_SESSIONS_PER_USER=5
ALERT_EMAIL_FROM=naoresponder@impgeo.sistemas.viverdepj.com.br
ALERT_EMAIL_TO=fernando@viverdepj.com.br
```

Salvar: `Ctrl+O` → `Enter` → `Ctrl+X`

> ⚠️ Se já existia a variável `CORS_ORIGIN` (sem o S), ela pode coexistir — o sistema usa `CORS_ORIGINS` com prioridade, mantendo retrocompatibilidade com a antiga.

---

### 3.4 — Instalar novas dependências do backend

Pacotes adicionados nesta atualização: `hpp`, `xss-clean`, `express-mongo-sanitize`, `express-validator`, `geoip-lite`, `ua-parser-js`

```bash
cd /var/www/impgeo/server
npm install
cd ..
```

---

### 3.5 — Instalar novas dependências do frontend

Pacote adicionado nesta atualização: `axios`

```bash
cd /var/www/impgeo
npm install --legacy-peer-deps
```

---

### 3.6 — Executar a migration de segurança

> ⚠️ **Execute apenas uma vez.** Rodar novamente é seguro — todos os comandos usam `IF NOT EXISTS` e `ON CONFLICT DO NOTHING` — mas é desnecessário após a primeira execução.

```bash
psql -U seuusuario -d impgeo -h localhost \
  -f /var/www/impgeo/server/migrations/create-tables.sql
```

**O que esta migration cria:**
- Tabela `audit_logs` — log detalhado de operações de segurança
- Tabela `refresh_tokens` — tokens de longa duração com rotação automática
- Tabela `active_sessions` — sessões ativas por dispositivo com geolocalização
- 3 novos módulos no catálogo: `sessions`, `anomalies`, `security_alerts`
- Role `superadmin` na constraint de roles da tabela `users`
- Funções de limpeza automática de registros expirados

**Verificar se as tabelas foram criadas:**

```bash
psql -U seuusuario -d impgeo -h localhost \
  -c "\dt" | grep -E "active_sessions|refresh_tokens|audit_logs"
```

Saída esperada:
```
 public | active_sessions | table | seuusuario
 public | audit_logs      | table | seuusuario
 public | refresh_tokens  | table | seuusuario
```

**Verificar se os novos módulos foram inseridos:**

```bash
psql -U seuusuario -d impgeo -h localhost \
  -c "SELECT module_key, module_name FROM modules_catalog WHERE module_key IN ('sessions', 'anomalies', 'security_alerts');"
```

Saída esperada:
```
   module_key    |     module_name
-----------------+---------------------
 sessions        | Sessões Ativas
 anomalies       | Anomalias
 security_alerts | Alertas de Segurança
```

**Verificar se a constraint de roles foi atualizada:**

```bash
psql -U seuusuario -d impgeo -h localhost \
  -c "SELECT conname, consrc FROM pg_constraint WHERE conname LIKE '%role%' AND conrelid = 'users'::regclass;"
```

A saída deve conter `superadmin` entre os valores permitidos.

---

### 3.7 — Build do frontend

```bash
cd /var/www/impgeo
npm run build
```

O Vite gera a pasta `dist/` com o frontend compilado. O Nginx já aponta para ela — nenhuma mudança de configuração é necessária.

**Verificar o resultado do build:**

```bash
ls -lh /var/www/impgeo/dist/
# Deve conter: index.html  assets/
```

---

### 3.8 — Reiniciar o backend

```bash
pm2 restart impgeo-api
```

**Se for a primeira vez que o PM2 gerencia este processo na VPS** (nunca rodou antes):

```bash
cd /var/www/impgeo/server
pm2 start server.js --name impgeo-api
pm2 save
pm2 startup
# O comando acima imprime um comando para executar — copie e execute-o
# Exemplo: sudo env PATH=... pm2 startup systemd -u usuario --hp /home/usuario
```

---

### 3.9 — Verificar os logs do backend

```bash
pm2 logs impgeo-api --lines 50 --nostream
```

**Deve aparecer:**
```
Servidor rodando na porta 9001
Monitoramento de anomalias iniciado
```

**Não deve aparecer:**
```
Cannot find module './utils/audit'
Cannot find module './utils/session-manager'
Cannot find module './utils/refresh-tokens'
Cannot find module './utils/anomaly-detection'
Cannot find module 'hpp'
Cannot find module 'xss-clean'
Error: connect ECONNREFUSED
```

---

### 3.10 — Promover o primeiro usuário superadmin

O sistema agora tem a role `superadmin` que dá acesso às abas de Sessões, Anomalias e Alertas de Segurança, além do poder de representar outros usuários (impersonation).

Promova o administrador principal:

```bash
psql -U seuusuario -d impgeo -h localhost \
  -c "UPDATE users SET role = 'superadmin' WHERE username = 'SEU_USERNAME_ADMIN';"
```

> Substitua `SEU_USERNAME_ADMIN` pelo username real.

**Confirmar a promoção:**

```bash
psql -U seuusuario -d impgeo -h localhost \
  -c "SELECT id, username, role FROM users WHERE role = 'superadmin';"
```

---

### 3.11 — Teste final no navegador

1. Acesse `https://impgeo.sistemas.viverdepj.com.br`
2. Faça login com o usuário superadmin
3. Verifique se as abas **Sessões**, **Anomalias** e **Alertas** aparecem na navbar
4. Acesse a aba **Sessões** — deve listar a sessão atual com o dispositivo e IP
5. No painel **Admin → Usuários**, verifique se o botão de representação (ícone de usuário) aparece ao lado de outros usuários

---

## 4. Variáveis de ambiente

Arquivo: `/var/www/impgeo/server/.env`

### Variáveis novas (adicionadas nesta atualização)

```env
# CORS — domínio do frontend (sem barra final)
CORS_ORIGINS=https://impgeo.sistemas.viverdepj.com.br

# URL base usada em links de email (recuperação de senha, etc.)
BASE_URL=https://impgeo.sistemas.viverdepj.com.br

# Criptografia de campos sensíveis no banco
# GERAR COM: openssl rand -base64 32
# ATENÇÃO: se perder esta chave, campos criptografados ficam irrecuperáveis
ENCRYPTION_KEY=COLE_AQUI_A_CHAVE_GERADA
ENCRYPTION_SALT=impgeo-salt-change-me

# Limite de sessões simultâneas por usuário
MAX_SESSIONS_PER_USER=5

# Emails de alertas de segurança
ALERT_EMAIL_FROM=naoresponder@impgeo.sistemas.viverdepj.com.br
ALERT_EMAIL_TO=fernando@viverdepj.com.br
```

### Gerar o ENCRYPTION_KEY

```bash
openssl rand -base64 32
```

Copie o resultado e cole no `.env`. Exemplo de saída: `k3Fg9xZp2...` (32 bytes em base64).

### .env completo de referência

Este é o estado esperado do `.env` na VPS após esta atualização (sem os valores sensíveis):

```env
# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=impgeo
DB_USER=seuusuario
DB_PASSWORD=sua_senha

# JWT
JWT_SECRET=sua_chave_jwt

# Porta
PORT=9001

# URLs
BASE_URL=https://impgeo.sistemas.viverdepj.com.br
CORS_ORIGINS=https://impgeo.sistemas.viverdepj.com.br

# SendGrid
SENDGRID_API_KEY=SG.sua_api_key
SENDGRID_FROM_EMAIL=naoresponder@impgeo.sistemas.viverdepj.com.br
SENDGRID_FROM_NAME=IMPGEO

# Recuperação de senha
PASSWORD_RESET_TOKEN_TTL_MINUTES=60
PASSWORD_RESET_CLEANUP_INTERVAL_MINUTES=60

# Criptografia
ENCRYPTION_KEY=sua_chave_gerada_com_openssl
ENCRYPTION_SALT=impgeo-salt-change-me

# Sessões
MAX_SESSIONS_PER_USER=5

# Alertas de segurança
ALERT_EMAIL_FROM=naoresponder@impgeo.sistemas.viverdepj.com.br
ALERT_EMAIL_TO=fernando@viverdepj.com.br
```

> ⚠️ **Nunca commite o `.env` no repositório.** Ele está no `.gitignore`.

---

## 5. Configuração do Nginx

O Nginx da VPS deve estar configurado para:
- Servir o frontend estático da pasta `/var/www/impgeo/dist/`
- Fazer proxy reverso das chamadas `/api/` para o backend na porta `9001`
- Redirecionar HTTP para HTTPS

### Localizar o arquivo de configuração

```bash
# Ver qual arquivo está ativo para o domínio
ls /etc/nginx/sites-enabled/
cat /etc/nginx/sites-enabled/impgeo   # ou o nome que estiver lá
```

### Configuração esperada

Se precisar criar ou corrigir o arquivo, o conteúdo deve ser:

```nginx
server {
    listen 80;
    server_name impgeo.sistemas.viverdepj.com.br;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name impgeo.sistemas.viverdepj.com.br;

    # Certificado SSL (gerado pelo Certbot/Let's Encrypt)
    ssl_certificate     /etc/letsencrypt/live/impgeo.sistemas.viverdepj.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/impgeo.sistemas.viverdepj.com.br/privkey.pem;

    # Frontend — arquivos estáticos do build do Vite
    root /var/www/impgeo/dist;
    index index.html;

    # SPA: todas as rotas não encontradas retornam o index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy reverso para o backend Express
    location /api/ {
        proxy_pass         http://localhost:9001;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Avatares e documentos servidos diretamente pelo backend
    location /api/avatars/ {
        proxy_pass http://localhost:9001;
    }

    location /api/documents/ {
        proxy_pass http://localhost:9001;
    }
}
```

### Aplicar mudanças no Nginx

```bash
# Testar se a configuração está correta (sempre antes de aplicar)
sudo nginx -t

# Recarregar sem derrubar conexões ativas
sudo nginx -s reload

# Ou reiniciar completamente (derruba conexões)
sudo systemctl restart nginx
```

### Verificar status do Nginx

```bash
sudo systemctl status nginx
```

### Renovação de certificado SSL

O Certbot renova automaticamente. Para forçar renovação manual:

```bash
sudo certbot renew --nginx
sudo nginx -s reload
```

---

## 6. Backup do banco de dados

### Fazer backup

```bash
cd /var/www/impgeo

# Criar pasta se não existir
mkdir -p backups

# Backup completo sem compressão
pg_dump -U seuusuario -d impgeo -h localhost \
  > backups/impgeo_backup_$(date +%Y%m%d_%H%M%S).sql

# Backup comprimido (recomendado — ocupa muito menos espaço)
pg_dump -U seuusuario -d impgeo -h localhost \
  | gzip > backups/impgeo_backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

### Listar backups

```bash
ls -lh /var/www/impgeo/backups/
```

### Restaurar um backup

```bash
# Sem compressão
psql -U seuusuario -d impgeo -h localhost \
  < backups/impgeo_backup_YYYYMMDD_HHMMSS.sql

# Com compressão
gunzip -c backups/impgeo_backup_YYYYMMDD_HHMMSS.sql.gz \
  | psql -U seuusuario -d impgeo -h localhost
```

### Limpar backups antigos (opcional)

```bash
# Remover backups com mais de 30 dias
find /var/www/impgeo/backups/ -name "*.sql*" -mtime +30 -delete
```

> A pasta `backups/` está no `.gitignore` — os arquivos nunca são enviados ao repositório.

---

## 7. Comandos úteis de verificação

### Status geral

```bash
pm2 status                              # processos rodando
pm2 logs impgeo-api --lines 50 --nostream  # últimas linhas de log
pm2 monit                               # monitor em tempo real (Ctrl+C para sair)
```

### Testar o backend diretamente

```bash
# Verificar se o backend está respondendo na porta 9001
curl -s http://localhost:9001/api/auth/verify \
  -X POST \
  -H "Content-Type: application/json" | python3 -m json.tool

# Verificar via domínio (passa pelo Nginx)
curl -s https://impgeo.sistemas.viverdepj.com.br/api/auth/verify \
  -X POST \
  -H "Content-Type: application/json" | python3 -m json.tool
```

### Verificar banco de dados

```bash
# Listar todas as tabelas
psql -U seuusuario -d impgeo -h localhost -c "\dt"

# Contagem de sessões ativas
psql -U seuusuario -d impgeo -h localhost \
  -c "SELECT COUNT(*) AS sessoes_ativas FROM active_sessions WHERE is_active = true;"

# Contagem de refresh tokens válidos
psql -U seuusuario -d impgeo -h localhost \
  -c "SELECT COUNT(*) AS tokens_ativos FROM refresh_tokens WHERE revoked = false AND expires_at > NOW();"

# Últimas 10 entradas no audit log
psql -U seuusuario -d impgeo -h localhost \
  -c "SELECT username, operation, status, ip_address, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 10;"

# Módulos cadastrados
psql -U seuusuario -d impgeo -h localhost \
  -c "SELECT module_key, module_name, is_active FROM modules_catalog ORDER BY module_key;"

# Usuários e suas roles
psql -U seuusuario -d impgeo -h localhost \
  -c "SELECT username, role, is_active FROM users ORDER BY role, username;"
```

### Verificar o build do frontend

```bash
# Listar arquivos gerados
ls -lh /var/www/impgeo/dist/
ls -lh /var/www/impgeo/dist/assets/ | head -10

# Data do último build
stat /var/www/impgeo/dist/index.html
```

### Verificar o Nginx

```bash
sudo nginx -t                    # testar configuração
sudo systemctl status nginx      # status do serviço
cat /etc/nginx/sites-enabled/impgeo   # ver configuração ativa
sudo tail -f /var/log/nginx/access.log    # ver requisições em tempo real
sudo tail -f /var/log/nginx/error.log     # ver erros em tempo real
```

### Verificar uso de disco (backups)

```bash
du -sh /var/www/impgeo/backups/
du -sh /var/www/impgeo/dist/
du -sh /var/www/impgeo/server/node_modules/
```

---

## 8. Resolução de problemas

### Backend não inicia — `Cannot find module`

Alguma dependência nova não foi instalada.

```bash
cd /var/www/impgeo/server
npm install
pm2 restart impgeo-api
pm2 logs impgeo-api --lines 20 --nostream
```

### Backend não inicia — erro de conexão com o banco

```bash
# Verificar se o PostgreSQL está rodando
sudo systemctl status postgresql

# Testar conexão manual
psql -U seuusuario -d impgeo -h localhost -c "SELECT NOW();"
```

Se falhar, verificar `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` no `.env`.

### Frontend mostra versão antiga após deploy

O Nginx serviu um arquivo em cache ou o build não foi gerado corretamente.

```bash
# Verificar a data do build
stat /var/www/impgeo/dist/index.html

# Forçar novo build
cd /var/www/impgeo
npm run build

# Recarregar o Nginx (limpa cache de arquivos estáticos)
sudo nginx -s reload
```

Se o problema persistir no browser, forçar hard-reload: `Ctrl+Shift+R`.

### Erro `502 Bad Gateway` no navegador

O Nginx não consegue se comunicar com o backend.

```bash
# Verificar se o backend está rodando
pm2 status
pm2 logs impgeo-api --lines 30 --nostream

# Se estiver parado, reiniciar
pm2 restart impgeo-api

# Verificar se está escutando na porta 9001
ss -tlnp | grep 9001
```

### Erro `CORS` no browser (requisição bloqueada)

A URL no `CORS_ORIGINS` do `.env` não bate exatamente com a origem do browser.

```bash
# Ver o valor atual
grep CORS /var/www/impgeo/server/.env
```

Deve ser exatamente: `CORS_ORIGINS=https://impgeo.sistemas.viverdepj.com.br` (sem barra final, com `https://`).

```bash
# Após corrigir o .env
pm2 restart impgeo-api
```

### Login funciona mas sessões/tokens não aparecem

A migration de segurança pode não ter sido executada.

```bash
# Verificar se as tabelas existem
psql -U seuusuario -d impgeo -h localhost \
  -c "\dt" | grep -E "active_sessions|refresh_tokens|audit_logs"
```

Se não aparecerem, executar a migration (é seguro rodar mesmo que parcialmente executada):

```bash
psql -U seuusuario -d impgeo -h localhost \
  -f /var/www/impgeo/server/migrations/create-tables.sql
pm2 restart impgeo-api
```

### Abas Sessões / Anomalias / Alertas não aparecem para o usuário

O usuário não tem a role `superadmin` ou não tem os módulos atribuídos.

```bash
# Ver a role do usuário
psql -U seuusuario -d impgeo -h localhost \
  -c "SELECT username, role FROM users WHERE username = 'SEU_USERNAME';"

# Promover para superadmin se necessário
psql -U seuusuario -d impgeo -h localhost \
  -c "UPDATE users SET role = 'superadmin' WHERE username = 'SEU_USERNAME';"
```

### Usuários desconectados após deploy

Comportamento normal quando o `JWT_SECRET` ou o `ENCRYPTION_KEY` foram alterados. Os tokens antigos ficam inválidos e todos os usuários precisam fazer login novamente. Não é um erro — é uma medida de segurança.

### Migration falhou — reverter para o backup

```bash
# Listar backups disponíveis
ls -lh /var/www/impgeo/backups/

# Restaurar o backup mais recente (substitua o nome do arquivo)
psql -U seuusuario -d impgeo -h localhost \
  < /var/www/impgeo/backups/impgeo_backup_YYYYMMDD_HHMMSS.sql
```

### Certificado SSL expirado

```bash
sudo certbot renew --nginx
sudo nginx -s reload
```

---

## Checklist — Primeiro deploy desta atualização

```
[ ] 1.  Backup do banco criado em /var/www/impgeo/backups/
[ ] 2.  git pull origin main executado
[ ] 3.  Variáveis novas adicionadas ao server/.env:
        [ ] CORS_ORIGINS=https://impgeo.sistemas.viverdepj.com.br
        [ ] BASE_URL=https://impgeo.sistemas.viverdepj.com.br
        [ ] ENCRYPTION_KEY  (gerado com: openssl rand -base64 32)
        [ ] ENCRYPTION_SALT=impgeo-salt-change-me
        [ ] MAX_SESSIONS_PER_USER=5
        [ ] ALERT_EMAIL_FROM=naoresponder@impgeo.sistemas.viverdepj.com.br
        [ ] ALERT_EMAIL_TO=fernando@viverdepj.com.br
[ ] 4.  cd server && npm install && cd ..
[ ] 5.  npm install --legacy-peer-deps
[ ] 6.  Migration executada:
        psql -U seuusuario -d impgeo -h localhost \
          -f /var/www/impgeo/server/migrations/create-tables.sql
[ ] 7.  Tabelas verificadas: active_sessions, refresh_tokens, audit_logs existem
[ ] 8.  Módulos verificados: sessions, anomalies, security_alerts no banco
[ ] 9.  Usuário promovido para superadmin
[ ] 10. npm run build executado sem erros
[ ] 11. pm2 restart impgeo-api
[ ] 12. pm2 logs impgeo-api --lines 30 --nostream — sem erros
[ ] 13. https://impgeo.sistemas.viverdepj.com.br carrega corretamente
[ ] 14. Login funcionando
[ ] 15. Abas Sessões, Anomalias e Alertas visíveis para superadmin
[ ] 16. Aba Sessões lista a sessão atual com dispositivo e IP
[ ] 17. ImpersonationBanner aparece ao representar outro usuário
```

---

## Checklist — Deploys recorrentes

```
[ ] 1. ssh usuario@ip-da-vps
[ ] 2. cd /var/www/impgeo
[ ] 3. git pull origin main
[ ] 4. cd server && npm install && cd ..
[ ] 5. npm install --legacy-peer-deps
[ ] 6. npm run build
[ ] 7. pm2 restart impgeo-api
[ ] 8. pm2 logs impgeo-api --lines 30 --nostream  — sem erros
[ ] 9. https://impgeo.sistemas.viverdepj.com.br funcionando
```
