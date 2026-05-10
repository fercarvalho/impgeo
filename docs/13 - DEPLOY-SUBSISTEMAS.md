# 13 — Deploy dos Subsistemas

Pré-requisitos e procedimento para subir o redesenho de organização e
acesso (5 subsistemas, subdomínios, cookie compartilhado, 4 módulos novos
do Gerenciamento) em produção.

> Este documento **complementa** o [01 - GUIA-DE-DEPLOY-PRODUCAO.md](./01%20-%20GUIA-DE-DEPLOY-PRODUCAO.md).
> Use o 01 como referência geral de deploy do impgeo; este 13 cobre apenas o
> que muda para a feature de subsistemas funcionar.

---

## 1. Visão geral

| O que era | O que passa a ser |
|---|---|
| Single domain `impgeo.sistemas.viverdepj.com.br` | Domínio raiz + 5 subdomínios |
| Sem agrupamento de módulos | 5 subsistemas (admin, gestao, financeiro, gerenciamento, especial) |
| Auth via JWT em `localStorage` | Auth via cookie httpOnly compartilhado entre subdomínios |
| 17 módulos | 21 módulos (4 novos no Gerenciamento) |
| 3 chaves antigas | Renomeadas: `dashboard` → `dashboard_financeiro`, `metas` → `metas_financeiro`, `reports` → `relatorios_financeiro` |

Os subdomínios em produção:

| Subsistema | URL |
|---|---|
| Domínio raiz (Picker) | `https://impgeo.sistemas.viverdepj.com.br` |
| Admin | `https://admin.impgeo.sistemas.viverdepj.com.br` |
| Gestão | `https://gestao.impgeo.sistemas.viverdepj.com.br` |
| Financeiro | `https://financeiro.impgeo.sistemas.viverdepj.com.br` |
| Gerenciamento | `https://gerenciamento.impgeo.sistemas.viverdepj.com.br` |
| Módulos Extras | `https://especial.impgeo.sistemas.viverdepj.com.br` |

---

## 2. DNS

Você precisa de uma das duas opções:

### Opção A — wildcard (recomendado)

Um único registro DNS resolve todos os subdomínios:

```
*.impgeo.sistemas.viverdepj.com.br.   IN   A   <IP-DA-VPS>
```

Requer suporte do provedor de DNS. Cobre subsistemas futuros sem mexer em DNS.

### Opção B — registros individuais

Cinco entradas A apontando para a mesma VPS:

```
admin.impgeo.sistemas.viverdepj.com.br.          IN   A   <IP>
gestao.impgeo.sistemas.viverdepj.com.br.         IN   A   <IP>
financeiro.impgeo.sistemas.viverdepj.com.br.     IN   A   <IP>
gerenciamento.impgeo.sistemas.viverdepj.com.br.  IN   A   <IP>
especial.impgeo.sistemas.viverdepj.com.br.       IN   A   <IP>
```

Funciona, mas cada novo subsistema exige novo registro. Use só se o provedor
não permitir wildcard.

### Verificação

```bash
dig +short admin.impgeo.sistemas.viverdepj.com.br
dig +short financeiro.impgeo.sistemas.viverdepj.com.br
# Deve retornar o IP da VPS para todos os subdomínios.
```

---

## 3. SSL — certificado wildcard

Um certificado wildcard (`*.impgeo.sistemas.viverdepj.com.br`) cobre todos
os subdomínios com uma única emissão. Let's Encrypt **só emite wildcard via
DNS-01 challenge** — HTTP-01 não funciona para wildcards.

### Pré-requisito

A API do seu provedor de DNS precisa estar disponível para o `certbot` ou
`acme.sh` automatizar a criação do registro `_acme-challenge`.

### Com certbot (Cloudflare como exemplo)

```bash
# Instalar plugin DNS
sudo apt install python3-certbot-dns-cloudflare

# Salvar credenciais
sudo nano /root/.secrets/certbot/cloudflare.ini
# Conteúdo:
#   dns_cloudflare_api_token = <seu-token-com-permissão-Zone:DNS:Edit>
sudo chmod 600 /root/.secrets/certbot/cloudflare.ini

# Emitir
sudo certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /root/.secrets/certbot/cloudflare.ini \
  -d "impgeo.sistemas.viverdepj.com.br" \
  -d "*.impgeo.sistemas.viverdepj.com.br" \
  --agree-tos \
  --email contato@fercarvalho.com
```

Substitua `dns-cloudflare` pelo plugin certo do seu provedor (`dns-route53`,
`dns-digitalocean`, `dns-google`, etc.).

### Renovação

Adicionar ao crontab do root:

```cron
0 3 * * * certbot renew --quiet --post-hook "systemctl reload nginx"
```

---

## 4. Nginx

### server_name aceitando wildcard

```nginx
# /etc/nginx/sites-available/impgeo

server {
    listen 80;
    server_name impgeo.sistemas.viverdepj.com.br *.impgeo.sistemas.viverdepj.com.br;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name impgeo.sistemas.viverdepj.com.br *.impgeo.sistemas.viverdepj.com.br;

    ssl_certificate     /etc/letsencrypt/live/impgeo.sistemas.viverdepj.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/impgeo.sistemas.viverdepj.com.br/privkey.pem;

    # SSL hardening (mantenha o que já está no 01 - GUIA-DE-DEPLOY-PRODUCAO.md)
    include /etc/nginx/snippets/ssl-params.conf;

    root /var/www/impgeo/dist;
    index index.html;

    # Frontend (SPA fallback)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend
    location /api/ {
        proxy_pass http://127.0.0.1:9001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;                    # ← preserva subdomínio original
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;        # ← idem (resolveCookieDomain usa)
    }

    location /v/ {
        proxy_pass http://127.0.0.1:9001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
    }
}
```

**Pontos críticos:**

1. `server_name` lista o domínio raiz **e** o wildcard `*.impgeo.sistemas...`.
2. `proxy_set_header Host $host` (e `X-Forwarded-Host`) — sem isso, o backend
   recebe `Host: 127.0.0.1` e o `resolveCookieDomain` vai falhar em detectar
   o subdomínio. **Não use `proxy_set_header Host` com valor fixo.**
3. O `root` aponta para o **mesmo** `dist/` para todos os hosts. O SPA
   detecta o subsistema via `window.location.hostname` (manifest.ts).

Aplicar:

```bash
sudo nginx -t                          # valida sintaxe
sudo systemctl reload nginx
```

---

## 5. Backend — variáveis de ambiente

O backend lê o domínio do cookie dinamicamente a partir do `Host` do request,
mas pode ser sobrescrito via env var. Em **produção** configure:

```bash
# server/.env

# (...) demais variáveis já existentes (...)

# CORS — frontend principal. O backend também aceita automaticamente
# qualquer subdomínio em *.impgeo.sistemas.viverdepj.com.br via regex.
CORS_ORIGIN=https://impgeo.sistemas.viverdepj.com.br

# OPCIONAL: força um domain fixo no cookie de auth. Se vazio, o backend
# detecta dinamicamente baseado em req.hostname (recomendado em produção
# já que o Nginx envia Host real).
# COOKIE_DOMAIN=.impgeo.sistemas.viverdepj.com.br
```

**Não defina `COOKIE_DOMAIN` se o Nginx está enviando `Host`/`X-Forwarded-Host`
corretamente** — a detecção dinâmica é mais robusta.

Reiniciar o backend após mudanças:

```bash
pm2 restart impgeo-api
```

---

## 6. Migrations SQL

Aplicar **em ordem** no banco de produção:

```bash
# 0. Backup obrigatório (sempre!)
pg_dump impgeo > /var/backups/impgeo/pre-subsistemas-$(date +%Y%m%d-%H%M).sql

# 1. Subsistemas + ALTER modules_catalog + renomeio das 3 chaves antigas
psql -d impgeo -v ON_ERROR_STOP=1 -f server/migrations/016-SUBSISTEMAS.sql

# 2. Permissões dos 4 módulos novos do gerenciamento para usuários existentes
psql -d impgeo -v ON_ERROR_STOP=1 -f server/migrations/017-PERMISSOES-NOVOS-MODULOS-GERENCIAMENTO.sql
```

Verificação:

```sql
-- Esperado: 21 módulos, 5 subsistemas, todos com subsystem_key NOT NULL
SELECT COUNT(*) FROM modules_catalog;          -- 21
SELECT COUNT(*) FROM subsystems;               -- 5
SELECT COUNT(*) FROM modules_catalog WHERE subsystem_key IS NULL;  -- 0

-- Permissões: cada usuário tem 4 registros novos
SELECT module_key, COUNT(*) FROM user_module_permissions
WHERE module_key IN (
  'dashboard_gerenciamento','metas_gerenciamento',
  'projecao_gerenciamento','relatorios_gerenciamento'
) GROUP BY module_key;
```

Rollback (apenas se algo der errado):

```bash
psql -d impgeo -v ON_ERROR_STOP=1 -f server/migrations/017-PERMISSOES-NOVOS-MODULOS-GERENCIAMENTO-rollback.sql
psql -d impgeo -v ON_ERROR_STOP=1 -f server/migrations/016-SUBSISTEMAS-rollback.sql
```

---

## 7. Procedimento de deploy completo

```bash
# 1. Backup
pg_dump impgeo > /var/backups/impgeo/pre-subsistemas-$(date +%Y%m%d-%H%M).sql

# 2. Pull do código novo
cd /var/www/impgeo
git pull

# 3. Aplicar migrations
psql -d impgeo -v ON_ERROR_STOP=1 -f server/migrations/016-SUBSISTEMAS.sql
psql -d impgeo -v ON_ERROR_STOP=1 -f server/migrations/017-PERMISSOES-NOVOS-MODULOS-GERENCIAMENTO.sql

# 4. Backend deps + restart
cd server
npm install --omit=dev
pm2 restart impgeo-api

# 5. Frontend build
cd ..
npm install
npm run build

# 6. Nginx (se ainda não atualizado)
# Editar /etc/nginx/sites-available/impgeo conforme seção 4
sudo nginx -t
sudo systemctl reload nginx

# 7. Logs em paralelo para acompanhar
pm2 logs impgeo-api    &
sudo tail -f /var/log/nginx/error.log
```

---

## 8. Checklist pós-deploy

- [ ] DNS resolve para os 5 subdomínios + raiz (`dig`)
- [ ] HTTPS válido em todos os 6 hosts (`curl -I https://...`)
- [ ] `https://impgeo.sistemas.viverdepj.com.br` carrega o login
- [ ] Após login com superadmin/admin: cai no SubsystemPicker com 5 cards
- [ ] Click num card redireciona para o subdomínio correto
- [ ] No subdomínio, header mostra os módulos do subsistema (Financeiro = 6, Gerenciamento = 7, Admin = 4, Gestão = 3, Especial = 1)
- [ ] DevTools → Application → Cookies → `accessToken` com `Domain: .impgeo.sistemas.viverdepj.com.br`
- [ ] Trocar de subdomínio mantém sessão (sem novo login)
- [ ] Botão "Trocar de módulo" no header lista os outros 4 e tem item "Trocar de módulo" para voltar
- [ ] Login com `user`/`guest` cai no Picker com empty state ("Nenhum módulo disponível")
- [ ] Tentar `https://financeiro.impgeo.sistemas.viverdepj.com.br` como `user` → tela `AcessoNegado`
- [ ] DRE, Projeção, Transações, etc. continuam funcionando normalmente
- [ ] Os 4 módulos novos do Gerenciamento aparecem (Dashboard com dados reais; Metas/Projeção/Relatórios com placeholders)
- [ ] Backend logs sem erros 500 em `/api/auth/login`, `/api/auth/refresh`, `/api/auth/verify`

---

## 9. Troubleshooting comum

### Sintoma: login funciona em `impgeo.sistemas...` mas ao trocar de subsistema pede login de novo

**Causa:** cookie sem `Domain` correto (vinculado a um único host).

**Diagnóstico:** DevTools → Cookies. Se `Domain` for `impgeo.sistemas.viverdepj.com.br` (sem o ponto inicial), está vinculado àquele host só.

**Correção:** verificar que o backend está recebendo o `Host` original do navegador. No Nginx, `proxy_set_header Host $host;` precisa estar presente. Sem isso, `req.hostname` no Express vira `127.0.0.1` e o `resolveCookieDomain` retorna `undefined`.

### Sintoma: subdomínio retorna 404

**Causa:** ou DNS não está resolvendo, ou Nginx `server_name` não cobre.

**Diagnóstico:**
```bash
dig +short financeiro.impgeo.sistemas.viverdepj.com.br
sudo nginx -T | grep server_name
```

### Sintoma: SSL inválido em subdomínios

**Causa:** o certificado emitido foi só para o domínio raiz, sem o wildcard.

**Diagnóstico:**
```bash
openssl s_client -connect financeiro.impgeo.sistemas.viverdepj.com.br:443 \
  -servername financeiro.impgeo.sistemas.viverdepj.com.br < /dev/null \
  | openssl x509 -noout -ext subjectAltName
# Deve listar DNS:*.impgeo.sistemas.viverdepj.com.br
```

**Correção:** re-emitir com `-d "impgeo.sistemas.viverdepj.com.br" -d "*.impgeo.sistemas.viverdepj.com.br"` (seção 3).

### Sintoma: CORS error em subdomínio

**Causa:** o `CORS_ORIGIN` no `.env` cobre só o domínio raiz, e por algum motivo o regex de subdomínio falhou (ex.: alteração no backend).

**Diagnóstico:** ver browser console — `Access-Control-Allow-Origin` ausente ou diferente.

**Correção:** verificar [server/server.js](../server/server.js) → `isAllowedSubsystemOrigin`. O regex aceita `*.impgeo.sistemas.viverdepj.com.br` automaticamente; se não estiver casando, é mudança recente que precisa revisão.

### Sintoma: módulos com nome interno (`dashboard_financeiro`, etc.) na barra

**Causa:** `loadModulesCatalog` no frontend não conseguiu carregar (auth ou rede).

**Diagnóstico:** DevTools → Network → `/api/modules-catalog`. Se 401, é auth. Se erro, é backend.

**Correção:** verificar cookies + permissões do usuário em `user_module_permissions`.

---

## 10. Reverter (se necessário)

Em ordem inversa:

```bash
# 1. Voltar código
cd /var/www/impgeo
git revert <commit-do-deploy>

# 2. Reverter migrations
psql -d impgeo -f server/migrations/017-PERMISSOES-NOVOS-MODULOS-GERENCIAMENTO-rollback.sql
psql -d impgeo -f server/migrations/016-SUBSISTEMAS-rollback.sql

# 3. Rebuild + restart
cd server && npm install && pm2 restart impgeo-api
cd .. && npm install && npm run build

# 4. (Opcional) restaurar do backup, se rollback SQL não bastou
psql -d impgeo < /var/backups/impgeo/pre-subsistemas-<timestamp>.sql
```

DNS e SSL podem permanecer — não atrapalham o sistema antigo.
