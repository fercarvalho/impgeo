---
id: 11
slug: central-aprovacoes
titulo: Central de Aprovações (módulo gestor-only + badge de contador)
status_alya: falta
categoria: pm
portabilidade: replicar
depends_on: [12]              # a Central consome a infra de paginação (backend `{items,total}` + Pagination/usePaginatedList)
migration_next: "042 - PM-APROVACOES"   # próximo nº real no Alya (máx. atual = 041); nome COM espaço
impgeo_commits:
  - e8d26ed   # backend: migration 070 + approvals-service.js + endpoint /count
  - f2469a6   # front: CentralAprovacoes.tsx + move 5 filas do Tarefas + registro no App
  - 5c0dc7e   # front: badge de pendências no menu (polling do /count)
impgeo_files:
  - server/migrations/070-PM-APROVACOES.sql
  - server/migrations/070-PM-APROVACOES-rollback.sql
  - server/services/pm/approvals-service.js
  - server/services/pm/__tests__/approvals-service.test.js
  - server/database-pg.js                 # getDefaultModulesCatalog (upsert no boot) — NÃO existe no Alya
  - server/server.js                      # GET /api/pm/approvals/count (era assim já no IMPGEO)
  - src/subsistemas/gerenciamento/modulos/CentralAprovacoes.tsx
  - src/subsistemas/gerenciamento/modulos/Tarefas.tsx          # remove as 5 seções de aprovação
  - src/App.tsx                           # lazy import + TabType + lista 'all' + iconMap + render + badge
  - src/subsistemas/manifest.ts           # moduleKeys do 'gerenciamento'
alya_files_novos:
  - "server/migrations/042 - PM-APROVACOES.sql"
  - "server/migrations/042 - PM-APROVACOES-rollback.sql"
  - server/services/pm/approvals-service.js
  - server/services/pm/__tests__/approvals-service.test.js     # se #1 (vitest) já feito
  - src/subsistemas/gerenciamento/modulos/CentralAprovacoes.tsx
alya_files_editados:
  - server/server.js                      # endpoint (Alya NÃO modularizado — ver delta) + authenticateToken
  - src/subsistemas/gerenciamento/modulos/Tarefas.tsx          # remove as 5 seções
  - src/App.tsx                           # lazy import + lista 'all' + iconMap + render + badge (SEM TabType inline)
  - src/types/tabType.ts                  # TabType extraído no Alya — é AQUI, não no App.tsx
  - src/subsistemas/manifest.ts           # moduleKeys (array multi-linha)
  # NÃO editar database-pg.js: Alya não tem getDefaultModulesCatalog — catálogo é 100% via migration
---

# #11 · Central de Aprovações

## 1. Objetivo
Hoje as 5 filas de aprovação do gestor vivem espalhadas **dentro do `Tarefas.tsx`**
(prazo, reabertura, delegação, revisão) + o overage/tempo-extra (que nem tinha UI
de fila). Criar um **módulo dedicado `aprovacoes_gerenciamento`** (gestor-only) que
agrega as 5 filas num lugar só, e um **badge de contador** no item de menu com o
total de pendências. O `Tarefas.tsx` fica só com o que é do usuário (minhas tarefas,
disponíveis, contrapropostas de prazo, ajudas). Módulo novo = registro em todos os
pontos de sincronização + migration de catálogo/permissão gestor-only.

## 2. Referência no IMPGEO (fonte da verdade)
Leia os diffs — **não** reescreva de memória:
```
git -C /Users/fernandocarvalho/impgeo show e8d26ed   # backend: migration 070 + approvals-service + endpoint /count + testes
git -C /Users/fernandocarvalho/impgeo show f2469a6   # front: CentralAprovacoes.tsx + tira 5 filas do Tarefas + registra no App/manifest
git -C /Users/fernandocarvalho/impgeo show 5c0dc7e   # front: badge de pendências no menu
```
Copiar **~verbatim** (agnóstico de negócio): `approvals-service.js`, `approvals-service.test.js`,
`CentralAprovacoes.tsx`. Adaptar: a migration (nome-com-espaço + nº 042 + padrão de
registro do Alya), o endpoint (vai pro `server.js`), os pontos de registro no `App.tsx`/
`manifest.ts`, o badge (auth do Alya) e a paleta.

## 3. Pré-condições no Alya (rodar ANTES — se falhar, parar)
```bash
cd /Users/fernandocarvalho/alya
# (a) #12 FEITO? — as 4 filas planas precisam devolver {items,total} e o front ter Pagination/usePaginatedList
grep -nE "listPendingReviews|listPendingDelegations|listPendingUncompleteRequests|listPendingDueDateRequests" server/services/pm/task-service.js
ls src/subsistemas/gerenciamento/modulos/_pm/Pagination.tsx src/subsistemas/gerenciamento/modulos/_pm/usePaginatedList.ts 2>/dev/null && echo "#12 ok" || echo "#12 AUSENTE — fazer #12 antes"
# (b) helper de papel-gestor no server.js
grep -nE "_isManagerRole" server/server.js
# (c) deps do frontend do CentralAprovacoes existem?
ls src/subsistemas/gerenciamento/modulos/_pm/pomodoroApi.ts \
   src/subsistemas/gerenciamento/modulos/_pm/DueProposalModal.tsx \
   src/subsistemas/gerenciamento/modulos/_pm/TaskReviewModal.tsx
grep -nE "fetchPendingOverages|decideOverage|OverageRequest" src/subsistemas/gerenciamento/modulos/_pm/pomodoroApi.ts
grep -nE "listPendingOverages" server/services/pm/pomodoro-service.js
# (d) próximo nº de migration
ls server/migrations/ | tail -3   # esperado: máx 041 → criar 042
```
> **Confirmado na inspeção (2026-07-13):** as 4 filas existem no `task-service.js` mas
> ainda com assinatura de **2 args** (`(db, viewer)`), **sem** `{limit,offset}`/`{items,total}`
> → **é o #12 que adiciona esse shape**, e o `approvals-service` lê justamente `.total`.
> Por isso **depends_on: [12]** (não é opcional). `_isManagerRole` existe (`server.js:7493`,
> mesma assinatura do IMPGEO). `pomodoroApi.ts` tem `fetchPendingOverages/decideOverage/OverageRequest`;
> `pomodoro-service.listPendingOverages(db)` existe (devolve array → conta por `.length`).
> `DueProposalModal.tsx` e `TaskReviewModal.tsx` presentes. Máx. de migration = **041** → próxima **042**.

## 4. Passo a passo
**Grupo 1 — Backend (mergeável sozinho; endpoint + service + migration):**
1. **Migration `042 - PM-APROVACOES.sql`** (nome COM espaço; ver `_DELTAS-ALYA.md §2`). Clonar o **padrão gestor-only** com que o `relatorios_tarefas_gerenciamento` foi registrado no Alya — que **não** é o `getDefaultModulesCatalog` (esse nem existe aqui), e sim as migrations **`035 - PM-MODULES-CATALOG`** (INSERT no `modules_catalog`) + **`038 - PM-PERMISSIONS-AND-REMOVE-PRODUCTS`** (grant só a admin/superadmin/manager). Na 042: `INSERT ... ON CONFLICT (module_key) DO UPDATE` no `modules_catalog` (`module_key='aprovacoes_gerenciamento'`, `icon_name='ClipboardCheck'`, `route_path='aprovacoes_gerenciamento'`, `subsystem_key='gerenciamento'`, `sort_order=11`, `is_system=TRUE`) + `INSERT` no `user_module_permissions` (`access_level='view'`) só para `role IN ('admin','superadmin','manager')`, com `NOT EXISTS`; validador `DO $$…$$` no fim; transacional/idempotente. Criar também o rollback `042 - PM-APROVACOES-rollback.sql` (remove perm + catálogo).
2. **`server/services/pm/approvals-service.js`** — copiar **verbatim** do IMPGEO. `getApprovalCounts(db, viewer)` roda `Promise.all` das 4 filas planas com `{limit:1,offset:0}` (só o COUNT, sem carregar linhas) lendo `.total`, + `pomodoroService.listPendingOverages(db)` usando `.length`; devolve `{ total, byType:{reviews,delegations,uncomplete,dueDate,overage} }`. **Só funciona porque o #12 fez as 4 filas devolverem `{items,total}`** — reconfirmar antes.
3. **Endpoint** `GET /api/pm/approvals/count` — no IMPGEO vive em `server.js`; **no Alya também é `server.js`** (monolito, não modularizado — `_DELTAS-ALYA.md §5`). ⚠️ **Delta:** as rotas PM do Alya são **explicitamente** protegidas por `authenticateToken` — o IMPGEO omite (auth global). Portanto: `app.get('/api/pm/approvals/count', authenticateToken, async (req,res) => {…})`, gate por `_isManagerRole(req.user)` → 403 senão, e responder `{ success, data }`. Pôr junto do bloco das outras rotas `/api/pm/*` (perto das filas, ~linha 8100–8300).
4. **`approvals-service.test.js`** — copiar verbatim (só roda se o #1 já tiver posto o vitest; senão guardar e ligar junto do #1). Ver `_DELTAS-ALYA.md §8`.

**Grupo 2 — Frontend: módulo + move as filas (feature visível, sem badge):**
5. **`CentralAprovacoes.tsx`** — copiar **~verbatim** do IMPGEO. Ele já importa `Pagination`/`usePaginatedList` do `_pm/` (**vêm do #12**), as 4 `fetch*`/`decide*` do `taskApi`, e `fetchPendingOverages/decideOverage/OverageRequest` do `pomodoroApi`, + `DueProposalModal`/`TaskReviewModal` — **todos já existem no Alya** (ver §3). As 4 filas planas usam `usePaginatedList` (o `.total` é o contador visível); overage não pagina (volume baixo → `useState`). Refresca via `load()` + evento global `pm-tasks-changed`. **Adaptar só a paleta** (amber/orange — `_DELTAS-ALYA.md §7`).
6. **`Tarefas.tsx`** — **remover** as 5 seções de aprovação (revisão, reabertura/uncomplete, delegação, prazo-decider, overage) + os hooks/estados/imports que só elas usavam (`pendingReviews`, `uncReqs`, `delReqs`, `dueReqs`/`dueModal`, `fetchPendingReviews`/`fetchPendingUncompleteRequests`/`decideUncompleteRequest`/`fetchPendingDelegations`/`decideDelegation`, e o que sobrar sem uso). **Manter** o que é do usuário: minhas tarefas, disponíveis, **contrapropostas de prazo p/ mim** (`dueProps`/`respondDueRequest`) e ajudas (`incomingHelp`). Conferir o diff do IMPGEO — ele mostra exatamente o que sai e o que fica.
7. **Registro do módulo** — no Alya são estes pontos (o `getDefaultModulesCatalog` do IMPGEO **NÃO existe aqui** → catálogo já foi feito na migration do passo 1):
   - `src/subsistemas/manifest.ts` → adicionar `'aprovacoes_gerenciamento'` ao `moduleKeys` do subsistema `gerenciamento` (array **multi-linha** no Alya, ~linha 139).
   - `src/App.tsx` → `lazy(() => import('@/subsistemas/gerenciamento/modulos/CentralAprovacoes'))`; ícone `ClipboardCheck` no import do `lucide-react`; entrada no `iconMap` do menu; bloco de `render` `{activeTab === 'aprovacoes_gerenciamento' && hasModuleAccess(...) && (<Suspense…><CentralAprovacoes/></Suspense>)}`; e a chave na **lista 'all'** de módulos (o array de defaults/`availableModuleKeys`).
   - ⚠️ **`src/types/tabType.ts`** → **é AQUI que o `TabType` mora no Alya** (extraído; `App.tsx:213 import type { TabType }`). Adicionar `| 'aprovacoes_gerenciamento'` **neste arquivo**, **não** no `App.tsx` (no IMPGEO era inline).

**Grupo 3 — Frontend: badge de contador (polish visível):**
8. **`App.tsx`** — clonar o molde do `NotificationBell`: `useEffect` que faz **polling** de `GET /api/pm/approvals/count` (fetch inicial + `setInterval(60s)` + refetch em `focus` e no evento `pm-tasks-changed`), **só quando** o usuário vê o módulo (`availableModuleKeys.has('aprovacoes_gerenciamento')`); guarda `approvalsCount`. Renderizar badge vermelho no item de menu `aprovacoes_gerenciamento` (`99+` acima de 99; some quando 0); incluir `approvalsCount` nas deps do `useMemo` do nav. ⚠️ **Delta auth:** o IMPGEO usa `fetch()` cru (cookie); o Alya usa **`authedFetch(token, …)`** (Bearer) — usar o mesmo padrão do `NotificationBell` do Alya, **não** o `fetch` cru do diff do IMPGEO.

## 5. Deltas de adaptação (Alya)
- **`TabType` em `src/types/tabType.ts`** (extraído), **não** inline no `App.tsx`.
- **SEM `getDefaultModulesCatalog`** no Alya → o catálogo do módulo é registrado **só pela migration** (padrão 035+038), não há edição de `database-pg.js`. Os "6 pontos" do checklist viram **5** (manifest + 4 pontos no App/tabType) + a migration.
- **Endpoint em `server.js`** (não modularizado) **+ `authenticateToken` explícito** (rotas PM do Alya sempre têm).
- **Migration `042 - …` com espaço** no nome (`_DELTAS-ALYA.md §2`); rollback `042 - PM-APROVACOES-rollback.sql`.
- **Badge com `authedFetch(token,…)`** (Bearer), padrão do `NotificationBell` do Alya — não `fetch` cru.
- **Paleta:** `CentralAprovacoes.tsx` e a chrome do badge/menu → amber/orange (`_DELTAS-ALYA.md §7`). O badge de contagem em si permanece **vermelho** (cor semântica de pendência).
- **SEM TerraControl** (`_DELTAS-ALYA.md §3`): ignorar qualquer linha do diff que registre `terracontrol` no catálogo/iconMap.
- Globais: [`_DELTAS-ALYA.md`](_DELTAS-ALYA.md) — em especial **§4 subsistemas/manifest** e **§7 paleta**.

## 6. Pegadinhas (aprendidas no IMPGEO)
- **`depends_on: [12]` é duro:** sem o shape `{items,total}` das 4 filas (backend) e sem `Pagination`/`usePaginatedList` (front), nem o `approvals-service` nem o `CentralAprovacoes` compilam/funcionam. Fazer o #12 **antes**.
- **Overage é o patinho fora do padrão:** não é paginado — no service conta por `.length`, no front é `useState` simples. Não tentar encaixá-lo no `usePaginatedList`.
- **`{limit:1}` no service de contagem** roda o COUNT sem materializar as linhas — é de propósito (barato). Não trocar por buscar tudo e contar.
- **Mover, não duplicar:** as 5 seções **saem** do `Tarefas.tsx`. Deixá-las nos dois lugares gera ação dupla e contadores divergentes. Conferir que os imports/estados órfãos também saíram (senão o `tsc` acusa).
- **Gestor-only mora na permissão, não em default por role:** o módulo não tem default de visibilidade por papel — a visibilidade vem do `user_module_permissions` semeado na migration só p/ admin/superadmin/manager. Não criar default global.
- **`_isManagerRole` já existe no Alya** (`server.js:7493`) — reusar, não redefinir.
- **Badge só polla p/ quem vê o módulo:** o `useEffect` sai cedo se `!canSeeApprovals` (zera o contador). Sem isso, usuário comum toma 403 a cada 60s.

## 7. Verificação (portão — só seguir se passar)
```bash
cd /Users/fernandocarvalho/alya/server
node -c services/pm/approvals-service.js
node -c server.js
# migration (nome COM espaço — aspas):
npm run migrate:up && npm run migrate:status | tail -5      # 042 aplicada
# se #1 já feito:
npm test 2>&1 | grep -E "approvals|Tests"                   # suíte approvals verde
# boot + smoke do contador (gestor):
node server.js &
curl -s "http://localhost:PORTA/api/pm/approvals/count" -H "Cookie: accessToken=<tok-gestor>" | jq '.data.total, .data.byType'
curl -s "http://localhost:PORTA/api/pm/approvals/count" -H "Cookie: accessToken=<tok-comum>" -o /dev/null -w '%{http_code}\n'   # → 403
```
DB (opcional): `SELECT module_key, sort_order, subsystem_key FROM modules_catalog WHERE module_key='aprovacoes_gerenciamento';`
e `SELECT count(*) FROM user_module_permissions WHERE module_key='aprovacoes_gerenciamento';` (= nº de gestores).
Front (após Grupos 2+3): logado como **gestor**, o item "Central de Aprovações" aparece no menu do subsistema Gerenciamento com badge (se houver pendências); a página agrega as 5 filas com paginação; aprovar/recusar numa fila atualiza a lista e o badge (via `pm-tasks-changed`); o `Tarefas.tsx` **não** mostra mais as filas de gestor. Logado como **usuário comum**, o módulo **não** aparece. Dark mode e mobile ok; paleta amber.

## 8. Rollout (Alya)
Tem migration → seguir o portão do runner (`_DELTAS-ALYA.md §2`): backup antes, `npm run migrate:up` (ou o script de deploy do Alya), depois deploy de código. Ordem: **042 up → build → `pm2 restart alya-api`**. Smoke: contador (`/api/pm/approvals/count`), a página nova e o `Tarefas.tsx` sem as filas. Reversível por `042 - PM-APROVACOES-rollback.sql` + `git revert` (remove catálogo/permissão e as mudanças de código; o `Tarefas.tsx` volta a exibir as filas). Nomes exatos de processo/caminho de deploy em `_DELTAS-ALYA.md §1`.
