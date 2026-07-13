---
id: 4
slug: task-authz
titulo: Separar _canManageTask em canActOnTask/canAssignTo (PM)
status_alya: falta
categoria: pm
portabilidade: replicar
depends_on: []
migration_next: null           # #4 não tem migration (só código)
impgeo_commits:
  - 7109f09   # refactor: extrai task-authz.js + rewire dos 3 call-sites + 16 testes
impgeo_files:
  - server/services/pm/task-authz.js
  - server/services/pm/__tests__/task-authz.test.js
  - server/routes/pm.js                 # call-sites (era server.js antes do #3)
alya_files_novos:
  - server/services/pm/task-authz.js
  - server/services/pm/__tests__/task-authz.test.js   # só roda se #1 (vitest) já feito
alya_files_editados:
  - server/server.js                    # helper + call-sites (Alya NÃO modularizado — ver delta)
---

# #4 · Separar `_canManageTask` em `canActOnTask` / `canAssignTo`

## 1. Objetivo
O helper `_canManageTask(db, actor, task, targetUserId)` é **dual-use**: responde
DUAS perguntas diferentes conforme o valor de `targetUserId` — ora o assignee
**atual** ("posso agir nesta tarefa?"), ora o **novo** responsável ("posso
atribuir a este alvo?"). Extrair a lógica de escopo para
`server/services/pm/task-authz.js` (`scopeCheck`, **corpo verbatim** →
behavior-preserving) e expor por dois nomes que tornam a intenção explícita no
call-site: `canActOnTask(actor, task)` (escopo sobre o dono **atual**) e
`canAssignTo(actor, task, alvo)` (escopo sobre o **alvo**). Refactor cirúrgico,
baixo risco — **comportamento idêntico**.

## 2. Referência no IMPGEO (fonte da verdade)
Leia o diff — **não** reescreva de memória:
```
git -C /Users/fernandocarvalho/impgeo show 7109f09   # extração + rewire + testes
```
Copiar **~verbatim** (agnóstico de TC/negócio): `task-authz.js` (o `scopeCheck` é
literalmente o corpo do antigo `_canManageTask`) e `task-authz.test.js` (16
testes travando a matriz de autorização). Adaptar apenas: os **call-sites** e o
**caminho do arquivo** (no Alya é `server.js`, não `routes/pm.js` — ver §5).

## 3. Pré-condições no Alya (rodar ANTES — se falhar, parar)
```bash
cd /Users/fernandocarvalho/alya/server
# (a) o helper dual-use existe? (esperado: 1 definição + 3 call-sites)
grep -n "_canManageTask" server.js
# (b) NÃO deve existir task-authz.js ainda
ls services/pm/task-authz.js 2>/dev/null && echo "JÁ EXISTE — reavaliar" || echo "ok, ausente"
# (c) rotas NÃO modularizadas (só bling/nuvemshop) → editar server.js
ls routes/
```
> **Confirmado na inspeção (2026-07-13):** `_canManageTask` está em
> `server/server.js:7498`, com **corpo idêntico** ao original do IMPGEO
> (behavior-preserving garantido). **3 call-sites**: `:7862` (assign, `okCurrent`
> — assignee atual), `:7886` (assign, `okTarget` — alvo `req.body.userId`),
> `:7906` (due-date, sem `targetUserId` → cai no assignee). `task-authz.js`
> ausente. `routes/` só tem `bling.js`/`nuvemshop.js` (monolito). ⚠️ Existe um
> **`_annotateCanManage`** (`:7533`) que **inlina** a mesma lógica de escopo mas
> **não chama** `_canManageTask` — está **fora do escopo** do #4 (o commit do
> IMPGEO também não o tocou); não mexer.

## 4. Passo a passo
**Grupo único — Backend (mergeável sozinho; front não muda):**
1. Criar `server/services/pm/task-authz.js` — copiar **verbatim** do IMPGEO:
   `scopeCheck(db, actor, task, targetUserId)` (corpo idêntico ao antigo
   `_canManageTask`) + os dois wrappers `canActOnTask(db, actor, task)` (=
   `scopeCheck` com `task.assignee_user_id`) e `canAssignTo(db, actor, task,
   targetUserId)` (= `scopeCheck` com o alvo). `module.exports = { scopeCheck,
   canActOnTask, canAssignTo }`.
2. `server.js` — **remover** a definição inline de `_canManageTask` (`:7498–7530`)
   e **importar** os wrappers no topo (junto dos outros `require('./services/pm/…')`):
   `const { canActOnTask, canAssignTo } = require('./services/pm/task-authz');`.
   ⚠️ **Delta Alya:** no IMPGEO isso vive em `routes/pm.js` (pós-#3) e o require é
   `require('../services/pm/task-authz')`; **no Alya é `server.js`** → caminho
   relativo `./services/…`.
3. **Rewire dos 3 call-sites** (comportamento idêntico):
   - `:7862` `_canManageTask(db, req.user, existing, existing.assignee_user_id)` → `canActOnTask(db, req.user, existing)`
   - `:7886` `_canManageTask(db, req.user, existing, req.body.userId)` → `canAssignTo(db, req.user, existing, req.body.userId)`
   - `:7906` `_canManageTask(db, req.user, existing)` → `canActOnTask(db, req.user, existing)`
4. `task-authz.test.js` — copiar verbatim (16 testes: superadmin/admin/manager/user
   × alvo × projeto × histórico + os wrappers). **Só roda se o #1 já tiver posto o
   vitest**; senão, guardar o arquivo e ligar junto do #1 (Alya não tem vitest —
   `_DELTAS-ALYA.md §8`).

## 5. Deltas de adaptação (Alya)
- **Helper + call-sites em `server.js`, não `routes/pm.js`** (Alya não modularizado
  — ver §3). Import relativo `./services/pm/task-authz` (não `../`).
- **Sem migration** (#4 não toca schema).
- **`_annotateCanManage` fora de escopo** — inlina a lógica mas não usa o helper;
  não refatorar aqui (o commit-fonte também não tocou).
- **Testes só com #1** — sem vitest, a verificação se apoia em `node -c` + boot +
  smoke (§7).
- Globais: [`_DELTAS-ALYA.md`](_DELTAS-ALYA.md).

## 6. Pegadinhas (aprendidas no IMPGEO)
- **`scopeCheck` tem que ser byte-a-byte o corpo antigo** — é a garantia de
  behavior-preserving. Não "melhorar" a lógica de passagem (ex.: early-returns,
  ordem dos ifs); qualquer mudança altera a matriz de autorização.
- **`canActOnTask` vs `canAssignTo` não são intercambiáveis:** o `assign`
  (`:7862/:7886`) usa os **dois** — primeiro `canActOnTask` (posso agir no estado
  atual?), depois `canAssignTo` (posso repassar ao alvo?). Trocar um pelo outro
  muda a semântica. Respeitar o mapeamento do §4.3 à risca.
- **`targetUserId === undefined` vs `null`:** `scopeCheck` distingue os dois
  (`undefined` → deriva do assignee; `null`/id → usa o valor). `canActOnTask`
  passa `task.assignee_user_id` explícito; não simplificar para chamada sem o 4º
  arg (mudaria o caminho `undefined`).
- **`db` é o objeto, não `db.pool`** — a assinatura recebe `db` e usa `db.pool.query`
  dentro. Manter a passagem de `db` (não `db.pool`) nos call-sites.
- **Confirmar que sobrou zero `_canManageTask`** após o rewire (`grep -c` = 0),
  senão fica símbolo órfão / referência quebrada.

## 7. Verificação (portão — só seguir se passar)
```bash
cd /Users/fernandocarvalho/alya/server
node -c services/pm/task-authz.js
node -c server.js
grep -c "_canManageTask" server.js        # esperado: 0 (todos os call-sites migrados)
# se #1 já feito:
npm test 2>&1 | grep -E "task-authz|Tests"   # 16 testes verdes
# boot + smoke:
node server.js &                           # sobe sem erro
# smoke da autorização (mesmo comportamento de antes):
#  - manager atribuindo tarefa da equipe dele  → 200
#  - admin tentando mexer em tarefa de outro admin → 403 "Fora do seu escopo"
#  - admin ajustando prazo de tarefa de usuário comum → 200
```
Comportamento **idêntico** ao anterior (refactor puro): as três rotas
(`/assign` e `/due-date`) devem responder exatamente como antes para cada papel.

## 8. Rollout (Alya)
Refactor **sem migration** → só deploy de código. `git pull` no `/home/deploy/alya`
→ build → `pm2 restart alya-api`. Smoke nas rotas de atribuição/prazo do PM
(gestor atribui, admin×admin bloqueado, admin ajusta prazo). Reversível por
`git revert` (comportamento idêntico; extração pura). Ver `_DELTAS-ALYA.md §1`
p/ os nomes exatos de processo/caminho.
