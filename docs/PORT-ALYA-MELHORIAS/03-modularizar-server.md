---
id: 3
slug: modularizar-server
titulo: Modularizar server.js (extrair routers por domínio via factory)
status_alya: falta
categoria: infra
portabilidade: replicar
depends_on: []
migration_next: null            # #3 é refactor puro — sem migration
nota_ordem: fazer DEPOIS das features PM (#4, #8, #11, #12…). O #3 reescreve server.js inteiro; se rodar antes, cada feature conflita no monolito. Rode por último entre as que tocam server.js.
impgeo_commits:
  # padrão (a prova) — extração do 1º domínio, factory (deps)=>Router()
  - cf4a3e0   # pm        → routes/pm.js  (PADRÃO — leia este primeiro)
  # demais domínios (mesmo padrão, 1 por rodada)
  - 2d42465   # financeiro → routes/financeiro.js
  - 27ad7b1   # content/CMS → routes/content.js
  - a788b10   # admin      → routes/admin.js
  - ff6b739   # notifications → routes/notifications.js
  - e08cbd2   # transactions/regras/subcategorias → routes/transactions.js
  - f32ad46   # user-profile → routes/user-profile.js
  - 2e3392d   # auth       → routes/auth.js
  - 8ba5545   # import-export (XLSX) → routes/import-export.js
  - dd5377f   # sessions/segurança → routes/sessions.js
  - 0e1c140   # misc/upload-avulsas → routes/misc.js
  # PEGADINHAS CRÍTICAS (os 2 bugs latentes + as guardas)
  - 7d1c8c2   # fix: imports órfãos (require desestruturado) + router-imports.test.js
  - ffd27be   # fix: import perdido no bloco app.listen (timer)
impgeo_commits_descartar:            # TerraControl — NÃO portar (Alya não tem TC)
  - da71d74   # tc (impgeo+público)
  - 7ac91d6   # tc-auth
  - 8bef1f5   # tc-users
  - 79b2df3   # asaas/AbacatePay
impgeo_files:
  - server/routes/pm.js
  - server/routes/financeiro.js
  - server/routes/content.js
  - server/routes/admin.js
  - server/routes/notifications.js
  - server/routes/transactions.js
  - server/routes/user-profile.js
  - server/routes/auth.js
  - server/routes/import-export.js
  - server/routes/sessions.js
  - server/routes/misc.js
  - server/routes/__tests__/router-imports.test.js    # guarda de regressão
  - server/routes/__tests__/route-ordering.test.js     # guarda de ordem
  - server/server.js                                   # require + app.use de cada router
alya_files_novos:
  - server/routes/pm.js
  - server/routes/financeiro.js
  - server/routes/transactions.js
  - server/routes/auth.js
  - server/routes/sessions.js
  - server/routes/admin.js
  - server/routes/notifications.js
  - server/routes/user-profile.js
  - server/routes/content.js
  - server/routes/import-export.js
  - server/routes/misc.js
  - server/routes/__tests__/router-imports.test.js     # se #1 já feito
  - server/routes/__tests__/route-ordering.test.js      # se #1 já feito
alya_files_editados:
  - server/server.js                                    # -N rotas por rodada; +require/+app.use
alya_routers_ja_extraidos:                              # NÃO mexer (já modularizados)
  - server/routes/bling.js
  - server/routes/nuvemshop.js
alya_sem_equivalente:                                   # TC — descartar
  - routes/terracontrol.js
  - routes/tc-auth.js
  - routes/tc-users.js
  - routes/asaas.js
---

# #3 · Modularizar server.js (routers por domínio via factory)

## 1. Objetivo
O `server/server.js` do Alya é um monolito de **8415 linhas** com **~305 rotas**.
Extrair cada domínio para `server/routes/<dominio>.js`, cada arquivo exportando
uma **factory** `module.exports = function createXRoutes({ ...deps }) => express.Router()`.
Os **handlers são movidos VERBATIM** (paths completos preservados, corpo inalterado);
o que muda é só o *shape*: as dependências server-local (db, middlewares, helpers)
passam a ser **injetadas** pela factory, e os `services`/`utils` são `require`
direto no topo do router. `server.js` fica só com bootstrap + `require` + `app.use(...)`
de cada router **na posição original** (ordem de registro preservada).
Comportamento idêntico — é refactor estrutural, **sem migration**.

## 2. Referência no IMPGEO (fonte da verdade)
Leia os diffs — **não** reescreva de memória. Comece pelo **padrão** (PM), que
prova a mecânica ponta-a-ponta:
```
git -C /Users/fernandocarvalho/impgeo show cf4a3e0   # PADRÃO: pm → routes/pm.js (factory + verbatim + app.use na posição)
```
Demais domínios (mesmo molde, 1 commit por rodada):
```
git -C /Users/fernandocarvalho/impgeo show 2d42465   # financeiro
git -C /Users/fernandocarvalho/impgeo show 27ad7b1   # content/CMS
git -C /Users/fernandocarvalho/impgeo show a788b10   # admin
git -C /Users/fernandocarvalho/impgeo show ff6b739   # notifications
git -C /Users/fernandocarvalho/impgeo show e08cbd2   # transactions/regras/subcategorias
git -C /Users/fernandocarvalho/impgeo show f32ad46   # user-profile
git -C /Users/fernandocarvalho/impgeo show 2e3392d   # auth
git -C /Users/fernandocarvalho/impgeo show 8ba5545   # import-export (XLSX)
git -C /Users/fernandocarvalho/impgeo show dd5377f   # sessions/segurança
git -C /Users/fernandocarvalho/impgeo show 0e1c140   # misc/avulsas
```
**As duas pegadinhas** (bugs latentes que escaparam boot+testes — leia com atenção, §6):
```
git -C /Users/fernandocarvalho/impgeo show 7d1c8c2   # fix: imports órfãos + router-imports.test.js (a guarda)
git -C /Users/fernandocarvalho/impgeo show ffd27be   # fix: import perdido no bloco app.listen (timer horário)
```
Guardas de regressão a portar quase **verbatim** (só ajustar nomes):
```
git -C /Users/fernandocarvalho/impgeo show cf4a3e0:server/routes/pm.js | head -35   # cabeçalho + assinatura da factory
sed -n '1,90p' /Users/fernandocarvalho/impgeo/server/routes/__tests__/router-imports.test.js
sed -n '1,40p' /Users/fernandocarvalho/impgeo/server/routes/__tests__/route-ordering.test.js
```
> **DESCARTAR** (TerraControl — Alya não tem): `da71d74`, `7ac91d6`, `8bef1f5`,
> `79b2df3`. Não crie `routes/terracontrol.js|tc-auth.js|tc-users.js|asaas.js`.
> Ver `_DELTAS-ALYA.md §3`.

## 3. Pré-condições no Alya (rodar ANTES — se falhar, parar)
```bash
cd /Users/fernandocarvalho/alya/server
# (a) confirmar o tamanho do monolito (esperado ~8415 linhas)
wc -l server.js
# (b) quantas rotas há p/ extrair (esperado ~305)
grep -cE "app\.(get|post|put|delete|patch)\(" server.js
# (c) o que já foi extraído (NÃO tocar): esperado só bling.js e nuvemshop.js
ls routes/
# (d) NÃO deve existir router de domínio ainda (pm/auth/financeiro…)
ls routes/pm.js routes/auth.js 2>/dev/null && echo "JÁ EXISTE — reavaliar" || echo "ok, ausentes"
# (e) as deps que a factory do PM precisa existem no server.js?
grep -nE "requireModulePermission|uploadPmAttachment|pmAttachmentsDir" server.js | head
# (f) mapa dos blocos de rota por domínio (candidatos p/ as rodadas):
grep -nE "app\.(get|post|put|delete|patch)\(" server.js | sed -E "s#.*/api/([^/'\"]+).*#\1#" | sort | uniq -c | sort -rn | head -40
```
> **Confirmado na inspeção (2026-07-13):** `server.js` = **8415 linhas**, **~305
> rotas**, `requireModulePermission` presente (function), `uploadPmAttachment` +
> `pmAttachmentsDir` presentes. `routes/` só tem `bling.js` + `nuvemshop.js`.
> Nenhum router de domínio existe. ⚠️ **Rotas do PM estão espalhadas, não
> contíguas:** `/api/clients` fica ~L4522, mas `/api/projects` + `/api/tasks` +
> `/api/me/*` ficam ~L7593–8160. **Blocos de rota candidatos** (por domínio):
> - **auth** (`/api/auth/*`, `/api/user/sessions`) ~L944–2330
> - **user-profile** (`/api/user/profile`, `/api/user/password`) ~L2500–2980
> - **import-export** (`/api/import/*`, `/api/export`) ~L3110–3260
> - **transactions** (`/api/transactions/*`, `/api/subcategories/*`, `/api/transaction-rules/*`) ~L3200–3790
> - **notifications** (`/api/notifications/*`, `/api/push/*`, `/api/notification-preferences`) ~L3790–3910
> - **admin** (`/api/admin/*`, `/api/users/:id/*-permissions`, roles/role-defaults) ~L3910–4520
> - **pm/gerenciamento** (`/api/clients`, `/api/projects`, `/api/tasks`, `/api/me/tasks`, `/api/pm/*`, pomodoro, relatórios) ~L4522 + ~L7593–8160
> - **especial** (Nuvemshop/Bling/Products) → **já extraídas** (`bling.js`/`nuvemshop.js`), pular
> - **misc/avulsas** (`/api/test`, `/api/modelo/:type`, `/api/csp/nonce`) — sobras

## 4. Passo a passo
Fazer **1 domínio por rodada** (o IMPGEO fez ~15). A cada rodada: extrair → boot →
smoke → commit. Nunca mover dois domínios no mesmo commit (dificulta o bisect).

**Por rodada (molde do `cf4a3e0`):**
1. **Criar `server/routes/<dominio>.js`** com o cabeçalho + `'use strict'` +
   `const express = require('express')`. **`require` no topo** de todo
   `service`/`util`/módulo que os handlers daquele domínio usam (varra o corpo —
   ver §6, o passo mais traiçoeiro).
2. **Factory:** `module.exports = function create<Dominio>Routes({ db, authenticateToken, requireModulePermission, … }) { const router = express.Router();` … `return router; }`.
   As deps injetadas = tudo que o handler referencia e que **não** é `require`
   local nem definido no arquivo (middlewares, `db`, helpers como `pageEnvelope`,
   `uploadPmAttachment`, `pmAttachmentsDir`, `logActivity`…). Assinaturas reais no
   IMPGEO (copie a lista de deps do domínio equivalente):
   - `createPmRoutes({ db, requireModulePermission, pageEnvelope, uploadPmAttachment, pmAttachmentsDir })`
   - `createFinanceiroRoutes({ db, authenticateToken, logActivity })`
   - `createContentRoutes({ db, authenticateToken, requireAdmin, requireSuperAdmin, optionalAuth, logActivity })`
   - `createNotificationsRoutes({ db, authenticateToken })`
   - `createMiscRoutes({ db, authenticateToken, requireAdmin, logActivity })`
   (auth/sessions/transactions/user-profile/import-export usam a forma multi-linha
   — abrir o `git show` do domínio p/ a lista exata.)
3. **Mover os handlers VERBATIM:** recortar cada bloco `app.get/post/put/delete(...)`
   do `server.js` e colar como `router.get/post/put/delete(...)` **preservando o
   path completo** (`/api/clients`, não `/clients`) e o corpo intacto. Se o
   domínio tiver helpers usados só por ele (ex.: no PM `_isManagerRole`,
   `_canManageTask`, consts `GOALS`/`REL`), mover junto pro router.
4. **Ligar no `server.js`:** `const create<Dominio>Routes = require('./routes/<dominio>');`
   no topo e `app.use(create<Dominio>Routes({ …deps }));` **na mesma posição** onde
   o primeiro handler daquele domínio estava (ver §6 sobre ordem). Middlewares
   *function-hoisted* (`requireModulePermission`) podem ser referenciados antes da
   linha de definição; `const`/`let` **não** (TDZ) — cuidado com a posição do `app.use`.
5. **Guardas (uma vez só, junto da 1ª ou 2ª rodada — se #1 já deu vitest):** portar
   `server/routes/__tests__/router-imports.test.js` (falha se um router usar símbolo
   de `const { X } = require(...)` do server.js sem importar) e
   `route-ordering.test.js` (adaptar o caso testado — ver §6).
6. **Portão por rodada:** `node -c routes/<dominio>.js && node -c server.js` →
   boot → smoke nas rotas daquele domínio → `npm test` (se #1) → commit.

## 5. Deltas de adaptação (Alya)
- **Sem routers TC:** não portar `terracontrol/tc-auth/tc-users/asaas`. O 5º
  subsistema do Alya é `especial` e **já está extraído** (`bling.js`/`nuvemshop.js`)
  — pular. (`_DELTAS-ALYA.md §3`.)
- **Nomes de domínio equivalentes** (mesma nomenclatura do IMPGEO): pm/financeiro/
  transactions/auth/sessions/admin/notifications/user-profile/content/import-export/misc.
- **Rotas espalhadas:** no Alya o PM não é contíguo (clients ~L4522 vs resto
  ~L7593+). Junte todos os blocos do domínio no mesmo router mesmo vindo de
  faixas distantes — só preserve a **ordem relativa** dentro do domínio.
- **Endpoints de OUTRAS melhorias:** o que no IMPGEO já vive em `routes/pm.js`
  (pós-#3) — ex.: os endpoints de paginação do **#12** — **no Alya ainda estão em
  `server.js`** até este #3 rodar. Por isso #3 vem **depois** dessas features
  (senão conflita). Ao extrair o PM, esses endpoints vão junto, verbatim.
- **Sem migration** (refactor puro).
- Globais (deploy/PM2/caminhos): [`_DELTAS-ALYA.md`](_DELTAS-ALYA.md).

## 6. Pegadinhas (aprendidas no IMPGEO — esta seção é o coração do #3)
Os dois bugs abaixo **passaram batido no boot, na enumeração de rotas e nos
testes** — viraram `ReferenceError` só em runtime. Trate-os como certos, não como
possíveis.

- **(A) Imports órfãos — `require` desestruturado escapa do scan** (`7d1c8c2`).
  O maior footgun. Ao extrair, é fácil ver `const foo = require('./x')` e mover;
  mas `const { logAudit, AUDIT_OPERATIONS } = require('../utils/audit')` (destruturado,
  **single OU multi-linha**) é usado **só dentro de handlers** e some no recorte →
  o router referencia o símbolo sem importar. Boot não pega (o handler não roda no
  boot), enum de rotas não pega, testes de service não pegam. **6 routers do IMPGEO
  quebraram assim** (auth: `createRefreshToken/createSession/enviarEmailRecuperacao`;
  sessions: `logAudit/AUDIT_*/…Session…/rotateRefreshToken`; content: `logAudit`;
  import-export: `parseExtrato`; +2 TC). **Como escanear certo:** para cada domínio,
  colete TODO símbolo que o server.js obtém por `const { … } = require(…)`
  (regex `/const\s*\{([^}]*)\}\s*=\s*require\(/gs` — o flag `s` casa multi-linha) e
  confira, para cada router, que cada símbolo usado no corpo está **importado, ou é
  param da factory, ou definido local**. É exatamente o que a guarda automatiza.
- **(B) Bloco `app.listen` também importa símbolos** (`ffd27be`). No IMPGEO um
  timer horário (Asaas) no `app.listen` usava `fetchReceived/DoneTransfers`, cujo
  `require` migrou pro router na extração → job quebrava "is not defined" a cada
  intervalo. **Boot/enum/testes não pegam — o timer só dispara no relógio.** No
  **Alya** o `app.listen` (L8382) tem **dois `setInterval` do PM** (`pmOverdueTimer`
  → `pmReportService.detectAndMarkOverdue`; `pmReportTimer` → `pmReportService.sendDueReports`)
  + `anomalyDetection.startAnomalyMonitoring`. Ao extrair o PM, **NÃO** deixe o
  `require('./services/pm/report-service')` ir só pro router: `pmReportService`
  ainda é usado no `app.listen`. Re-`require` no server.js (módulo é cacheado — ok
  nos dois lados). Depois de cada rodada, reler o bloco `app.listen` e conferir que
  todo símbolo que ele usa ainda tem `require` no server.js.
- **(C) Ordem de registro de rotas** (`7d1c8c2`/guarda `route-ordering.test.js`).
  Rota literal tem que ser registrada **antes** da param que a captura: `/api/x/acao`
  **antes** de `/api/x/:id`, senão `POST /x/acao` casa `:id="acao"`. Isso vale
  **dentro** de um router (mantenha a ordem original dos handlers) **e** entre
  `app.use(...)` de routers diferentes — por isso o `app.use` de cada domínio vai
  **na posição original** do 1º handler dele. No Alya rastreie casos `/:param`
  seguidos de literais no mesmo prefixo (ex.: `transaction-rules/:id` vs
  `transaction-rules/reorder|preview|reprocess`; `subcategories/:name` vs
  `subcategories/bulk-delete`) e garanta que os literais fiquem primeiro.
- **(D) TDZ na posição do `app.use`:** middlewares `function`-declarados
  (hoisted, ex.: `requireModulePermission`) podem ser injetados mesmo se o
  `app.use` estiver acima da linha de definição; middlewares `const`/`let` **não**
  (dão TDZ). Se um dep injetado é `const`, o `app.use` precisa vir **depois** da
  definição dele.
- **(E) Portar as DUAS guardas** (só valem com vitest → depende do #1):
  `router-imports.test.js` (adapta-se sozinho: lê `routes/*.js` + `server.js`, sem
  hard-code de nomes — copiar quase verbatim) e `route-ordering.test.js` (é
  específico; no IMPGEO testa impersonation em `sessions.js` — **reescrever o caso**
  para um par literal-vs-param real do Alya, ex. `transaction-rules/reorder` antes
  de `transaction-rules/:id`). Sem o #1, a rede de segurança é `node -c` + boot +
  smoke manual por rodada.

## 7. Verificação (portão — só seguir se passar)
Por rodada (após extrair um domínio):
```bash
cd /Users/fernandocarvalho/alya/server
node -c routes/<dominio>.js          # o router compila
node -c server.js                    # o server compila
# 0 referências remanescentes aos handlers movidos (paths ainda registrados 1x):
grep -cE "app\.(get|post|put|delete|patch)\(" server.js   # deve cair a cada rodada
# a factory roda sem erro com deps completas (pega dep faltando cedo):
node -e "require('./routes/<dominio>')({ db:{}, authenticateToken:(q,s,n)=>n(), requireModulePermission:()=> (q,s,n)=>n() /* +demais deps */ }).stack.length" 
# se #1 já feito:
npm test 2>&1 | grep -E "router-imports|route-ordering|Tests"   # guardas verdes
# boot + smoke do domínio:
node server.js &                     # sobe sem erro
curl -s "http://localhost:PORTA/api/<rota-do-dominio>" -H "Cookie: accessToken=<tok>" | jq '.success'
```
No fim de TODAS as rodadas:
```bash
grep -rn "require(" server.js | grep -iE "asaas|report-service|audit" # o app.listen ainda importa o que usa? (pegadinha B)
grep -nE "app\.(get|post|put|delete|patch)\(" server.js | grep -v "app.use" # server.js quase sem rotas diretas
ls routes/    # todos os domínios + __tests__/; SEM terracontrol/tc-*/asaas
```
Smoke funcional: login, listar tarefas/filas do PM, um CRUD financeiro, uma rota
admin, notificações, import/export — comportamento **idêntico** ao pré-refactor.
E **espere um ciclo do relógio** (ou baixe os intervalos temporariamente) p/
confirmar que os `setInterval` do PM no `app.listen` rodam sem `is not defined`
(pegadinha B).

## 8. Rollout (Alya)
Refactor **sem migration** → só deploy de código, e idealmente **rodada a rodada**
(cada domínio é um commit isolado; fácil de reverter por `git revert` sem tocar
schema). `git pull` no `/home/deploy/alya` → build → `pm2 restart alya-api`. Após
o restart, smoke amplo (todos os subsistemas) e **observar os cron jobs do PM** no
log por um ciclo (`pm2 logs alya-api | grep pm-report`). Reversível por `git revert`
do commit da rodada (comportamento idêntico por construção). Ver `_DELTAS-ALYA.md §1`
para nomes exatos de processo/caminho.
