---
id: 12
slug: paginacao
titulo: Paginação nas listas de tarefas e filas (PM)
status_alya: falta
categoria: pm
portabilidade: replicar
depends_on: []
migration_next: null           # #12 não tem migration
impgeo_commits:
  - 1c38b58   # backend: paginação opt-in + testes
  - 0141fc0   # front: infra (component + api paginada)
  - f50c727   # front: ligar a navegação
impgeo_files:
  - server/services/pm/pagination.js
  - server/services/pm/__tests__/pagination.test.js
  - server/services/pm/task-service.js
  - server/routes/pm.js                 # (endpoints; era server.js antes do #3)
  - src/subsistemas/gerenciamento/modulos/_pm/Pagination.tsx
  - src/subsistemas/gerenciamento/modulos/_pm/usePaginatedList.ts
  - src/subsistemas/gerenciamento/modulos/_pm/taskApi.ts
  - src/subsistemas/gerenciamento/modulos/Tarefas.tsx
  - src/subsistemas/gerenciamento/modulos/_pm/PendingTasksBanner.tsx
alya_files_novos:
  - server/services/pm/pagination.js
  - server/services/pm/__tests__/pagination.test.js   # se #1 já feito
  - src/subsistemas/gerenciamento/modulos/_pm/Pagination.tsx
  - src/subsistemas/gerenciamento/modulos/_pm/usePaginatedList.ts
alya_files_editados:
  - server/services/pm/task-service.js
  - server/server.js                    # endpoints (Alya NÃO modularizado — ver delta)
  - src/subsistemas/gerenciamento/modulos/_pm/taskApi.ts
  - src/subsistemas/gerenciamento/modulos/Tarefas.tsx
  - src/subsistemas/gerenciamento/modulos/_pm/PendingTasksBanner.tsx
---

# #12 · Paginação nas listas de tarefas e filas

## 1. Objetivo
As listas do PM (3 de tarefas + 4 filas de aprovação) não paginam — degradam com
volume, e a pior (`available-tasks`) dispara N queries extras (prereqs por tarefa).
Adicionar **paginação opt-in por query param**: sem `?limit`, o backend devolve
tudo (comportamento atual preservado); com `limit`, liga LIMIT/OFFSET + envelope
`pagination`. Frontend ganha navegação Anterior/Próxima nas 7 seções.

## 2. Referência no IMPGEO (fonte da verdade)
Leia os diffs — **não** reescreva de memória:
```
git -C /Users/fernandocarvalho/impgeo show 1c38b58   # backend: helper + task-service + endpoints + testes
git -C /Users/fernandocarvalho/impgeo show 0141fc0   # front: Pagination.tsx + usePaginatedList + taskApi
git -C /Users/fernandocarvalho/impgeo show f50c727   # front: Tarefas.tsx liga a navegação
```
Copiar **~verbatim** (agnósticos de TC/negócio): `pagination.js`, `pagination.test.js`,
`Pagination.tsx`, `usePaginatedList.ts`. Adaptar: `task-service.js`, os endpoints,
`taskApi.ts`, `Tarefas.tsx` (encaixe nas assinaturas locais + paleta).

## 3. Pré-condições no Alya (rodar ANTES — se falhar, parar)
```bash
cd /Users/fernandocarvalho/alya/server
# (a) as 7 funções de listagem existem?  → esperado: as 7
grep -cE "listMyTasks|listAvailableUnassignedTasks|listProjectTasks|listPendingReviews|listPendingDelegations|listPendingUncompleteRequests|listPendingDueDateRequests" services/pm/task-service.js
# (b) NÃO deve existir pagination.js ainda
ls services/pm/pagination.js 2>/dev/null && echo "JÁ EXISTE — reavaliar" || echo "ok, ausente"
# (c) o front tem Tarefas.tsx e o _pm/
ls ../src/subsistemas/gerenciamento/modulos/Tarefas.tsx ../src/subsistemas/gerenciamento/modulos/_pm/taskApi.ts
```
> **Confirmado na inspeção (2026-07-10):** as 7 funções existem; `listMyTasks`,
> `listAvailableUnassignedTasks` e `listProjectTasks` **já aceitam `{limit, offset}`**
> (plumbing parcial — bom, reduz o trabalho). As 4 filas ainda não. `pagination.js`
> ausente. `Tarefas.tsx` presente.

## 4. Passo a passo
**Grupo 1 — Backend (mergeável sozinho; sem quebrar o front):**
1. Criar `server/services/pm/pagination.js` — copiar **verbatim** do IMPGEO (helper puro `parsePagination(q, opts)`; `limit` ausente/0 → `{limit:null, offset:0}` = sem paginação; `offset` deriva de `page` 1-based; clamp ao `PM_PAGE_LIMIT_MAX`). Envs: `PM_PAGE_LIMIT_DEFAULT` (25), `PM_PAGE_LIMIT_MAX` (200).
2. `task-service.js` — nas 7 funções, aceitar `{limit, offset}`. Quando `limit != null`: rodar `SELECT COUNT(*)` com **o mesmo WHERE/params** (sem LIMIT/OFFSET) + a query com `LIMIT $n OFFSET $m`; retornar `{ items, total }`. Quando `limit == null`: `{ items, total: items.length }` (query atual intacta). Preservar o pós-processamento no `.map` (ex.: `can_review`). *(3 das 7 já têm `{limit,offset}` no Alya — só falta o COUNT + o shape `{items,total}`.)*
3. **Endpoints** — `const pg = parsePagination(req.query)`, passar pra função, responder `{ success, data: items, pagination: { total, limit, offset, page, totalPages } }`. `data` continua array. Em `available-tasks`, aplicar `completion_prereqs` **só sobre a página** (o ganho real de perf). ⚠️ **Delta Alya:** no IMPGEO esses endpoints vivem em `routes/pm.js` (pós-#3); **no Alya vivem em `server.js`** (monolito) — editar lá. Confirmar com `grep -n "me/available-tasks" server/server.js`.
4. `pagination.test.js` — copiar verbatim (só roda se o #1 já tiver posto o vitest; senão, guardar e ligar junto do #1).

**Grupo 2 — Frontend infra (app roda igual, sem navegação ainda):**
5. Criar `_pm/Pagination.tsx` (Anterior/Próxima + "Página X de Y" + total) e `_pm/usePaginatedList.ts` (hook `{items,total,page,loading,setPage,reload}` sobre `fetchFn(pageOpts)`) — copiar do IMPGEO; **adaptar cor pra paleta amber/orange** do Alya (ver `_DELTAS-ALYA.md §7`).
6. `taskApi.ts` — adicionar `parseWithPagination()` (lê `j.data` **e** `j.pagination`) e o tipo `Paginated<T>`/`PageOpts`; as 7 funções de listagem aceitam `(args, pageOpts)` e retornam `Paginated<T>`. **Não** alterar a `parse()` original.
7. Atualizar callers pra ler `.data` (`Tarefas.tsx`, `PendingTasksBanner.tsx`) **sem** navegação ainda (chamam sem `limit` → recebem tudo, idêntico a hoje).

**Grupo 3 — Frontend navegação (feature visível):**
8. `Tarefas.tsx` — cada uma das 7 seções passa a usar `usePaginatedList` (state próprio), envia `limit` (default 25) e renderiza `<Pagination>` no rodapé. Trocar de página refaz só o fetch daquela lista.

## 5. Deltas de adaptação (Alya)
- **Endpoints em `server.js`, não `routes/pm.js`** (Alya não modularizado — ver §3 do passo 3).
- **Paleta:** `Pagination.tsx` → amber/orange (`_DELTAS-ALYA.md §7`).
- **Sem migration** (#12 não toca schema).
- **3 funções já têm `{limit,offset}`** → nelas só falta COUNT + `{items,total}`.
- Globais: [`_DELTAS-ALYA.md`](_DELTAS-ALYA.md).

## 6. Pegadinhas (aprendidas no IMPGEO)
- **Opt-in é sagrado:** sem `limit` → devolver **tudo** (retrocompat). Isso deixa o Grupo 1 mergeável sem tocar o front. Não inverter o default.
- **COUNT tem que reusar o WHERE/params EXATO** da query paginada (mesmos `$n`), senão o `total` mente. Cuidado ao espelhar os parâmetros.
- **`available-tasks`:** mover o cálculo de `completion_prereqs` pra **depois** do LIMIT (só a página) — é o ganho de performance; se rodar antes, continua N queries.
- **Envelope aditivo:** `data` continua array; `pagination` é campo novo. Não quebrar quem lê `j.data`.
- **`parse()` original intacto** — criar `parseWithPagination()` à parte (é compartilhada por ~20 funções).
- Filas com WHERE por papel (`uncomplete`/`due-date`): manter o WHERE ao adicionar o COUNT.

## 7. Verificação (portão — só seguir se passar)
```bash
cd /Users/fernandocarvalho/alya/server
node -c services/pm/pagination.js
node -c server.js
# se #1 já feito:
npm test 2>&1 | grep -E "pagination|Tests"        # suíte de pagination verde
# boot + smoke:
node server.js &   # sobe sem erro
# sem ?limit → devolve tudo (como hoje):
curl -s "http://localhost:PORTA/api/me/tasks" -H "Cookie: accessToken=<tok>" | jq '.data | length, .pagination'
# com ?limit=2 → 2 itens + total correto:
curl -s "http://localhost:PORTA/api/me/tasks?limit=2&offset=0" -H "Cookie: accessToken=<tok>" | jq '.data | length, .pagination.total'
```
Front (após Grupo 3): numa lista com >25 itens, confirmar Anterior/Próxima + "Página X de Y"; trocar página refaz só aquele fetch; dark mode e mobile ok.

## 8. Rollout (Alya)
Refactor **sem migration** → só deploy de código. `git pull` no `/home/deploy/alya` → build → `pm2 restart alya-api`. Smoke nas listas do PM (Tarefas + filas). Reversível por `git revert` (comportamento idêntico; envelope aditivo). Ver `_DELTAS-ALYA.md §1` p/ os nomes exatos de processo/caminho.
