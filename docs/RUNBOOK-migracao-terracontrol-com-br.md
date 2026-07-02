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

A. **Migrar o DNS pra Cloudflare** (PRIMEIRÍSSIMO — nameserver demora a propagar)
1. **SendGrid domain auth** (DKIM também demora horas)
2. **DNS** do `terracontrol.com.br` (registros criados no Cloudflare)
3. **Nginx** + certificado (certbot)
4. **`.env`** do backend
5. **Deploy** (build + pm2 restart)
6. **Verificação**
7. **Comunicação aos clientes**

Faça o **Passo A primeiro** — enquanto o nameserver propaga (Cloudflare fica
"Active"), você já adianta o SendGrid (passo 1). Só faça o passo 5 (deploy)
depois que DNS + cert estiverem de pé, senão o site fica no ar sem HTTPS.

---

## A. Migrar o DNS: GoDaddy → Cloudflare

O domínio foi comprado na **GoDaddy**, mas o DNS será gerenciado na
**Cloudflare**. O registro (propriedade do domínio) continua na GoDaddy — só os
**nameservers** apontam pra Cloudflare. Faça isto ANTES de tudo, porque a troca
de nameserver leva de minutos a ~24h pra propagar.

### A.1 Adicionar o site na Cloudflare

1. Crie conta em <https://dash.cloudflare.com> (plano **Free** basta).
2. **Add a site** → digite `terracontrol.com.br` → escolha **Free**.
3. A Cloudflare escaneia os registros DNS existentes. Como o domínio é novo
   (parkeado na GoDaddy), provavelmente não há nada útil — pode seguir.
4. A Cloudflare mostra **2 nameservers** dela, algo como:
   ```
   dana.ns.cloudflare.com
   rob.ns.cloudflare.com
   ```
   (os seus serão diferentes — anote os que aparecerem).

### A.2 Trocar os nameservers na GoDaddy

1. Entre na GoDaddy → **My Products** → domínio `terracontrol.com.br` → **DNS**
   / **Manage DNS** → seção **Nameservers**.
2. **Change** → **Enter my own nameservers (I'll use my own)**.
3. Apague os nameservers da GoDaddy e cole os **2 da Cloudflare** (passo A.1).
4. Salvar. A GoDaddy avisa que a mudança pode levar até 48h (na prática costuma
   ser bem mais rápido).

### A.3 Confirmar ativação

- Na Cloudflare, o status do site vira **Active** quando o nameserver propagou
  (chega email também).
- Cheque por linha de comando:
  ```bash
  dig +short NS terracontrol.com.br
  # deve listar os nameservers da Cloudflare (…​.ns.cloudflare.com)
  ```

> A partir daqui, **todos os registros DNS** (DKIM do SendGrid no passo 1, A
> record no passo 2) são criados **no painel da Cloudflare**, não na GoDaddy.

### A.4 Regra de ouro: proxy DESLIGADO (nuvem cinza)

Ao criar cada registro na Cloudflare há um toggle **Proxy status**:
- 🟠 **Proxied** (nuvem laranja) = tráfego passa pela CDN/SSL da Cloudflare.
- ⚪ **DNS only** (nuvem cinza) = Cloudflare é só DNS; o tráfego vai direto pra VPS.

**Use nuvem cinza (DNS only) em TODOS os registros deste runbook.** Motivos:
- O `certbot` (passo 3) valida direto na origem e o Nginx serve o próprio
  certificado Let's Encrypt — como está escrito aqui, sem mudança.
- Os registros **CNAME de DKIM do SendGrid DEVEM ficar em DNS only** (proxied
  quebra a verificação).
- Evita conflito com os headers `no-store` de `sw.js`/manifests (a CDN da
  Cloudflare poderia cachear e furar o deploy do Service Worker).

> Se um dia quiser a CDN/proxy da Cloudflare (nuvem laranja no A record), é
> possível, mas exige: **SSL/TLS → Full (strict)** (senão dá loop de redirect) +
> regra de cache pra **bypass** de `/sw.js`, `/manifests/*`, `/index.html`.
> Fora do escopo desta virada — deixe cinza por enquanto.

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
   e o link de retorno). Adicione-os **na Cloudflare** (DNS → Records → Add
   record → CNAME), com **Proxy status = DNS only (nuvem cinza)**. Dica: ao
   colar o `Name`, a Cloudflare às vezes adiciona o domínio sozinho — não
   duplique o `terracontrol.com.br` no fim.
3. Crie/verifique um **Single Sender** ou use o domain-auth para
   `naoresponder@terracontrol.com.br`.
4. Espere propagar (pode levar de minutos a algumas horas) e clique **Verify**.

> Enquanto o domínio não estiver "verified", os emails do TerraControl
> (aprovação/edição/orçamento) continuam saindo com a autenticação antiga.
> Não troque o `SENDGRID_FROM_EMAIL` (passo 4) até o novo domínio estar verde.

---

## 2. DNS — `terracontrol.com.br` (na Cloudflare)

### 2.1 Descobrir os IPs da VPS (IPv4 + IPv6)

**Rode NA VPS** (SSH):

```bash
# IPv4 público
ip -4 addr show scope global | grep -oP 'inet \K[\d.]+'
curl -4 -s https://ifconfig.co; echo        # confirma o IPv4 de saída

# IPv6 público (global — começa com 2xxx:/2axx:, NÃO fe80:: que é link-local)
ip -6 addr show scope global | grep -oP 'inet6 \K[0-9a-f:]+'
curl -6 -s https://ifconfig.co; echo        # confirma o IPv6 de saída
```

- O comando `ip -4 …` te dá o `<IPV4_DA_VPS>`; o `ip -6 …` te dá o `<IPV6_DA_VPS>`.
- Se o `curl -6` **falhar** ou o `ip -6 addr show scope global` **não retornar
  nada**, a VPS **não tem IPv6 público** → pule o registro AAAA (passo 2.2) e o
  `listen [::]` do Nginx (passo 3). Se quiser habilitar IPv6, peça ao provedor
  da VPS pra atribuir um `/64` e configure a interface — fora do escopo aqui.
- Anote os dois IPs; são o mesmo par que o impgeo já usa (é a mesma VPS).

### 2.2 Criar os registros na Cloudflare

Cloudflare → **DNS → Records → Add record**. Aponta pra **mesma VPS** do impgeo:

| Type  | Name (Cloudflare)      | Content / Target         | Proxy status        | TTL  |
|-------|------------------------|--------------------------|---------------------|------|
| A     | `@` (= terracontrol.com.br) | `<IPV4_DA_VPS>`     | **DNS only (cinza)** | Auto |
| AAAA  | `@`                    | `<IPV6_DA_VPS>`          | **DNS only (cinza)** | Auto | (só se a VPS tiver IPv6) |
| CNAME | `www`                  | `terracontrol.com.br`    | **DNS only (cinza)** | Auto | (opcional) |

- O IPv6 entra pelo **AAAA no apex (`@`)**. Tenha **A + AAAA** apontando pra
  mesma VPS — cliente IPv6 usa o AAAA, cliente IPv4 usa o A. Faltando o AAAA,
  quem só tem IPv6 pode não abrir o site.
- **`www` como CNAME pro apex cobre IPv4 E IPv6 sozinho** — ao resolver, o DNS
  segue o CNAME e devolve o A ou o AAAA do `@` conforme o cliente. NÃO crie
  A/AAAA em `www` além do CNAME: um CNAME não pode coexistir com A/AAAA no mesmo
  nome. Se já existe esse CNAME, **deixe como está** (só confirme nuvem cinza).
- **Proxy status = DNS only (nuvem cinza)** em TODOS — obrigatório pro certbot e
  pros headers de PWA (ver Passo A.4).

### 2.3 Confirmar propagação (antes do certificado)

```bash
dig +short A    terracontrol.com.br    # → <IPV4_DA_VPS>
dig +short AAAA terracontrol.com.br    # → <IPV6_DA_VPS>  (vazio se sem IPv6)

# confirme que NÃO está proxiado: os IPs devem ser os da VPS, não da Cloudflare
# (IPv4 104.x/172.67.x ou IPv6 2606:4700:: são da Cloudflare = registro laranja).
```

---

## 3. Nginx + certificado

> **Ordem importa (ovo-e-galinha):** o bloco HTTPS aponta pro `fullchain.pem`,
> que só existe DEPOIS que o certbot roda. Se você já colar o bloco `listen 443`
> com `ssl_certificate` antes de emitir, o `nginx -t` falha
> (`cannot load certificate … No such file`). Por isso: **primeiro** sobe um
> config só-HTTP, **emite o cert via webroot**, e **só então** põe o config
> completo com HTTPS.

### 3.1 Fase 1 — config só-HTTP (pro certbot validar)

```bash
sudo tee /etc/nginx/sites-available/terracontrol.com.br > /dev/null <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name terracontrol.com.br www.terracontrol.com.br;
    root /var/www/impgeo/dist;
    index index.html;
    location /.well-known/acme-challenge/ { root /var/www/impgeo/dist; }
    location / { try_files $uri $uri/ /index.html; }
}
EOF

sudo ln -s /etc/nginx/sites-available/terracontrol.com.br /etc/nginx/sites-enabled/terracontrol.com.br
sudo nginx -t && sudo nginx -s reload
```

> As linhas `listen [::]:…` habilitam **IPv6**. Se a VPS não tiver IPv6
> (passo 2.1 vazio), remova-as — senão o Nginx pode falhar ao subir.

### 3.2 Emitir o certificado (webroot — não mexe no nginx)

```bash
sudo certbot certonly --webroot -w /var/www/impgeo/dist \
  -d terracontrol.com.br -d www.terracontrol.com.br
```

Deve terminar com `Successfully received certificate` e criar
`/etc/letsencrypt/live/terracontrol.com.br/fullchain.pem`.

> Pré-requisito: A/AAAA já apontando pra VPS em **nuvem cinza**. Se der erro de
> challenge (timeout/404): DNS não propagou ou o registro está laranja
> (`dig +short A terracontrol.com.br` tem que dar o IP da VPS, não 104.x/172.67.x).

### 3.3 Fase 2 — config completo com HTTPS (cert já existe)

```bash
sudo tee /etc/nginx/sites-available/terracontrol.com.br > /dev/null <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name terracontrol.com.br www.terracontrol.com.br;
    return 301 https://terracontrol.com.br$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
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
EOF

sudo nginx -t && sudo nginx -s reload
sudo certbot renew --dry-run   # sanidade da renovação automática
```

> Remova as linhas `listen [::]:…` também aqui se a VPS não tiver IPv6.
> Se algum dia a renovação falhar por 404 no challenge, avise — o `try_files`
> serve o `.well-known` a partir do `root`, mas dá pra readicionar o
> `location /.well-known/acme-challenge/` explícito.

<details><summary>Alternativa: <code>certbot --nginx</code> num config já pronto</summary>

Se preferir o plugin `--nginx` (que injeta o SSL sozinho), o config **não pode**
já conter `ssl_certificate` apontando pra arquivo inexistente. Suba só o bloco
`listen 80` (sem 443), rode `sudo certbot --nginx -d terracontrol.com.br -d
www.terracontrol.com.br`, e depois reconcilie as `location` do bloco 443 que o
certbot gerou. A abordagem webroot acima é mais previsível.
</details>

### 3.4 Redirecionar os domínios antigos → novo

Nos server blocks antigos (`terracontrol.viverdepj.com.br` e
`admin.terracontrol.viverdepj.com.br`), troque o conteúdo por um 301. Isso
protege links já enviados por email (convites/reset apontam pro domínio antigo)
e bookmarks:

```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
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

# Remetente DEDICADO dos emails do TerraControl (não mexe no do impgeo)
+ SENDGRID_FROM_EMAIL_TC=naoresponder@terracontrol.com.br
```

Notas:
- `TC_COOKIE_DOMAIN` também passa a valer pro cookie da equipe (o resolver de
  cookie admin agora herda `TC_COOKIE_DOMAIN` quando `TC_ADMIN_COOKIE_DOMAIN`
  não está setado). Pode remover `TC_ADMIN_COOKIE_DOMAIN` se existir.
- `SENDGRID_FROM_EMAIL_TC` é o remetente **só dos emails do TerraControl**
  (reset/convite/aprovação/edição/orçamento). Os emails internos do impgeo
  continuam saindo de `SENDGRID_FROM_EMAIL` — **não mexa nele**. Só ative o
  `_TC` depois do domínio estar **verified** no SendGrid (passo 1); se não
  setar, o TC cai no fallback (`SENDGRID_FROM_EMAIL`) sem quebrar.
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

# 6.4 Site responde por IPv4 E IPv6 (pule o -6 se a VPS não tiver IPv6)
curl -4 -s -o /dev/null -w 'IPv4 %{http_code}\n' https://terracontrol.com.br/
curl -6 -s -o /dev/null -w 'IPv6 %{http_code}\n' https://terracontrol.com.br/
# → ambos 200
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

- [ ] Cloudflare: site **Active** (nameservers trocados na GoDaddy, `dig NS` ok)
- [ ] Backup (DB + nginx + .env)
- [ ] SendGrid: `terracontrol.com.br` **verified** (CNAMEs DKIM na Cloudflare, cinza)
- [ ] IPs da VPS descobertos (IPv4 + IPv6 via `ip -4/-6 addr show scope global`)
- [ ] DNS (Cloudflare): **A + AAAA** `@` → IPs da VPS, **DNS only (cinza)**, propagado
- [ ] Nginx: server block novo (com `listen [::]` p/ IPv6) + certbot + 301 dos antigos + `nginx -t` ok
- [ ] `.env`: `TC_PUBLIC_URL`, `TC_COOKIE_DOMAIN`, `TC_PUBLIC_BASE_URL`, `SENDGRID_FROM_EMAIL_TC`
- [ ] Pré-flight: 0 usernames duplicados entre `users` e `tc_users`
- [ ] Deploy: `git pull` + build + migrations + `pm2 restart`
- [ ] Verificação: curl (kind tc_user/impgeo), cookie domain, redirect, browser, email real
- [ ] Comunicado enviado aos clientes
