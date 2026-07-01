# Runbook — Migração de domínio do TerraControl → `terracontrol.com.br`

Virada do subsaas TerraControl do subdomínio antigo
(`terracontrol.viverdepj.com.br` + `admin.terracontrol.viverdepj.com.br`) para o
domínio próprio **`terracontrol.com.br`**, com **login unificado** (cliente
tc_user + equipe impgeo no mesmo formulário) e emails saindo de
**`@terracontrol.com.br`**.

> A parte de código já está mergeada (login unificado, unicidade de username,
> cookies/CORS/hosts, PWA). Este runbook cobre só o que roda **na VPS / painéis
> externos**. Comandos prontos, backup antes, rollback junto.

**Fatos da VPS** (ver [DEPLOY.md](../DEPLOY.md)):
- Projeto: `/var/www/impgeo` · Backend PM2: `impgeo-api` · Backend porta `9001`
- Frontend estático: `/var/www/impgeo/dist` servido pelo Nginx
- Env do backend: `/var/www/impgeo/server/.env`

---

## Ordem recomendada

1. **SendGrid domain auth** (PRIMEIRO — DKIM demora horas a propagar)
2. **DNS** do `terracontrol.com.br`
3. **Nginx** + certificado (certbot)
4. **`.env`** do backend
5. **Deploy** (build + pm2 restart)
6. **Verificação**
7. **Comunicação aos clientes**

Passos 1 e 2 podem começar em paralelo. Só faça o passo 5 (deploy do código
novo) depois que DNS + cert estiverem de pé, senão o site fica no ar sem HTTPS.

---

## 0. Backup (antes de tudo)

```bash
# Banco (padrão do projeto)
cd /var/www/impgeo
pg_dump "$DATABASE_URL_IMPGEO" > backups/backup-pre-terracontrol-dominio-$(date +%F).sql

# Configs que vamos mexer
sudo cp /etc/nginx/sites-available/impgeo /etc/nginx/sites-available/impgeo.bak-$(date +%F)
cp /var/www/impgeo/server/.env /var/www/impgeo/server/.env.bak-$(date +%F)
```

---

## 1. SendGrid — autenticar `terracontrol.com.br`

No painel SendGrid → **Settings → Sender Authentication → Authenticate Your Domain**:

1. Domínio: `terracontrol.com.br`.
2. O SendGrid gera ~3 registros **CNAME** (DKIM `s1._domainkey`, `s2._domainkey`
   e o link de retorno). Adicione-os no DNS do `terracontrol.com.br`.
3. Crie/verifique um **Single Sender** ou use o domain-auth para
   `naoresponder@terracontrol.com.br`.
4. Espere propagar (pode levar de minutos a algumas horas) e clique **Verify**.

> Enquanto o domínio não estiver "verified", os emails do TerraControl
> (aprovação/edição/orçamento) continuam saindo com a autenticação antiga.
> Não troque o `SENDGRID_FROM_EMAIL` (passo 4) até o novo domínio estar verde.

---

## 2. DNS — `terracontrol.com.br`

No provedor de DNS do domínio novo:

```
# Aponta o domínio pro IP da VPS (o MESMO IP do impgeo/terracontrol antigo)
@     A      <IP_DA_VPS>       TTL 300
www   CNAME  terracontrol.com.br.   TTL 300   (opcional)
```

- Use **TTL 300** durante a virada (rollback rápido).
- Confirme a propagação antes de emitir o certificado:

```bash
dig +short terracontrol.com.br
# deve retornar o IP da VPS
```

---

## 3. Nginx + certificado

### 3.1 Novo server block

Crie `/etc/nginx/sites-available/terracontrol` (bloco HTTP + HTTPS). Reaproveita
o mesmo `root` e proxy do impgeo — é a MESMA build/backend, só muda o
`server_name`:

```nginx
server {
    listen 80;
    server_name terracontrol.com.br www.terracontrol.com.br;
    return 301 https://terracontrol.com.br$request_uri;
}

server {
    listen 443 ssl;
    server_name terracontrol.com.br;

    ssl_certificate     /etc/letsencrypt/live/terracontrol.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/terracontrol.com.br/privkey.pem;

    root /var/www/impgeo/dist;
    index index.html;

    location / { try_files $uri $uri/ /index.html; }

    location /api/ {
        proxy_pass         http://localhost:9001;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;               # << preserva terracontrol.com.br p/ cookie/CORS
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    location /api/avatars/   { proxy_pass http://localhost:9001; }
    location /api/documents/ { proxy_pass http://localhost:9001; }
    location /v/             { proxy_pass http://localhost:9001; }   # sub-share links

    # PWA — headers de cache (idênticos ao impgeo)
    location = /sw.js            { add_header Cache-Control "no-store, must-revalidate"; try_files $uri =404; }
    location = /sw-killswitch.js { add_header Cache-Control "no-store, must-revalidate"; try_files $uri =404; }
    location ~ ^/manifests/      { add_header Cache-Control "no-store, must-revalidate"; }
    location = /offline.html     { add_header Cache-Control "no-store, must-revalidate"; }
    location = /index.html       { add_header Cache-Control "no-store, must-revalidate"; }
    location ~ ^/assets/         { add_header Cache-Control "public, max-age=31536000, immutable"; }
    location ~ ^/icons/          { add_header Cache-Control "public, max-age=86400"; }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/terracontrol /etc/nginx/sites-enabled/terracontrol
```

### 3.2 Certificado (certbot)

```bash
# HTTP-01 via Nginx (o bloco :80 já precisa existir p/ o desafio)
sudo certbot --nginx -d terracontrol.com.br -d www.terracontrol.com.br
sudo nginx -t && sudo nginx -s reload
```

### 3.3 Redirecionar os domínios antigos → novo

Nos server blocks antigos (`terracontrol.viverdepj.com.br` e
`admin.terracontrol.viverdepj.com.br`), troque o conteúdo por um 301. Isso
protege links já enviados por email (convites/reset apontam pro domínio antigo)
e bookmarks:

```nginx
server {
    listen 443 ssl;
    server_name terracontrol.viverdepj.com.br admin.terracontrol.viverdepj.com.br;
    # certificados antigos continuam válidos até expirarem
    ssl_certificate     /etc/letsencrypt/live/terracontrol.viverdepj.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/terracontrol.viverdepj.com.br/privkey.pem;
    return 301 https://terracontrol.com.br$request_uri;
}
```

```bash
sudo nginx -t && sudo nginx -s reload
```

---

## 4. `.env` do backend

```bash
nano /var/www/impgeo/server/.env
```

Aplique:

```diff
- TC_PUBLIC_URL=https://terracontrol.viverdepj.com.br
+ TC_PUBLIC_URL=https://terracontrol.com.br

+ TC_COOKIE_DOMAIN=.terracontrol.com.br
+ TC_PUBLIC_BASE_URL=https://terracontrol.com.br

- SENDGRID_FROM_EMAIL=naoresponder@impgeo.sistemas.viverdepj.com.br
+ SENDGRID_FROM_EMAIL=naoresponder@terracontrol.com.br
```

Notas:
- `TC_COOKIE_DOMAIN` também passa a valer pro cookie da equipe (o resolver de
  cookie admin agora herda `TC_COOKIE_DOMAIN` quando `TC_ADMIN_COOKIE_DOMAIN`
  não está setado). Pode remover `TC_ADMIN_COOKIE_DOMAIN` se existir.
- `SENDGRID_FROM_EMAIL` só troque depois do domínio estar **verified** no
  SendGrid (passo 1). Se o `impgeo` usa esse MESMO `SENDGRID_FROM_EMAIL` para
  emails do sistema interno, avalie usar `SENDGRID_FROM_EMAIL_TC` dedicado — mas
  hoje os templates TC usam o mesmo `SENDGRID_FROM_EMAIL`; trocá-lo muda o
  remetente também dos emails do impgeo. **Confirmar antes de trocar.**
- `IMPGEO_PUBLIC_URL` continua `https://impgeo.sistemas.viverdepj.com.br`
  (usado no deep-link do email opt-in pra equipe).

---

## 5. Deploy do código novo

```bash
cd /var/www/impgeo
git pull

# backend
cd server && npm ci --omit=dev && cd ..

# frontend
npm ci
npm run build

# aplica migrations pendentes (se 033/034 ainda não rodaram — features de
# notificação por email; a migração de domínio em si NÃO tem migration)
psql "$DATABASE_URL_IMPGEO" -f server/migrations/033-USER-TC-EMAIL-NOTIFICATIONS.sql
psql "$DATABASE_URL_IMPGEO" -f server/migrations/034-TC-USER-EMAIL-NOTIFICATIONS.sql

# reinicia backend
pm2 restart impgeo-api
pm2 logs impgeo-api --lines 30 --nostream
```

### Pré-flight de dados (unicidade de username)

O login unificado exige que nenhum username exista nas duas tabelas. Rode:

```bash
psql "$DATABASE_URL_IMPGEO" -c "
  SELECT LOWER(u.username) AS username
  FROM users u JOIN tc_users t ON LOWER(t.username) = LOWER(u.username);
"
# Esperado: 0 linhas. Se vier alguma, renomeie o conflitante ANTES da virada.
```

---

## 6. Verificação pós-virada

```bash
# 6.1 Login unificado responde e roteia por tipo
curl -s -X POST https://terracontrol.com.br/api/tc-entry/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"<tc_user>","password":"<senha>"}' | jq '{success,kind}'
# → kind:"tc_user"

curl -s -X POST https://terracontrol.com.br/api/tc-entry/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"<user_impgeo>","password":"<senha>"}' | jq '{success,kind}'
# → kind:"impgeo"  (403 se o impgeo não tiver o módulo terracontrol)

# 6.2 Cookie sai com Domain=.terracontrol.com.br
curl -s -i -X POST https://terracontrol.com.br/api/tc-entry/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"<tc_user>","password":"<senha>"}' | grep -i 'set-cookie'
# → tcAccessToken=...; Domain=.terracontrol.com.br

# 6.3 Redirect do domínio antigo
curl -s -I https://terracontrol.viverdepj.com.br/ | grep -i 'location'
# → Location: https://terracontrol.com.br/
```

**No browser** (`https://terracontrol.com.br`):
- Login como tc_user → área do cliente (dashboard, registros).
- Login como equipe (credencial impgeo c/ módulo) → shell da equipe.
- Sem barra de erro no console; manifest `tc-public.webmanifest` carrega;
  theme-color verde.
- Testar um email real (aprovar um registro) → confere remetente
  `@terracontrol.com.br` e link apontando pro domínio novo.

---

## 7. Rollback

Se algo travar:

```bash
# Nginx: remove o site novo, restaura os antigos sem o 301
sudo rm -f /etc/nginx/sites-enabled/terracontrol
sudo cp /etc/nginx/sites-available/impgeo.bak-<data> /etc/nginx/sites-available/impgeo
# (e reverter o 301 nos blocos antigos)
sudo nginx -t && sudo nginx -s reload

# .env
cp /var/www/impgeo/server/.env.bak-<data> /var/www/impgeo/server/.env

# código
cd /var/www/impgeo && git reset --hard <commit_anterior>
npm ci && npm run build
cd server && npm ci --omit=dev && cd ..
pm2 restart impgeo-api
```

O DNS do domínio antigo nunca foi tocado, então ele volta a funcionar
imediatamente. O `terracontrol.com.br` pode ficar apontado (inofensivo) até a
próxima tentativa.

---

## 8. Comunicação aos clientes (obrigatório)

A virada **desloga todo mundo** (cookie muda de domínio) e **quebra o PWA
instalado** no domínio antigo. Antes/durante a virada, avisar os tc_users:

- "O TerraControl mudou de endereço para **https://terracontrol.com.br**."
- "Você vai precisar **entrar de novo**."
- "Se instalou o app no celular, **remova o antigo e reinstale** pelo endereço
  novo (Menu → Instalar app)."
- "Se ativou notificações, **reative** no endereço novo."

Push antigo (subscriptions em `tc_push_subscriptions` com endpoint do domínio
velho) para de funcionar. Opcional limpar depois da virada:

```bash
# só depois de confirmar que a virada deu certo e clientes migraram
psql "$DATABASE_URL_IMPGEO" -c "
  DELETE FROM tc_push_subscriptions WHERE last_seen_at < NOW() - INTERVAL '30 days';
"
```

---

## Checklist rápido

- [ ] Backup (DB + nginx + .env)
- [ ] SendGrid: `terracontrol.com.br` **verified**
- [ ] DNS: `terracontrol.com.br` → IP da VPS (propagado)
- [ ] Nginx: server block novo + certbot + 301 dos antigos + `nginx -t` ok
- [ ] `.env`: `TC_PUBLIC_URL`, `TC_COOKIE_DOMAIN`, `TC_PUBLIC_BASE_URL`, `SENDGRID_FROM_EMAIL`
- [ ] Pré-flight: 0 usernames duplicados entre `users` e `tc_users`
- [ ] Deploy: `git pull` + build + migrations + `pm2 restart`
- [ ] Verificação: curl (kind tc_user/impgeo), cookie domain, redirect, browser, email real
- [ ] Comunicado enviado aos clientes
