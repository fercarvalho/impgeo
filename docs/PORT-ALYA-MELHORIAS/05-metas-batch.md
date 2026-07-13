---
id: 5
slug: metas-batch
titulo: Progresso de metas calculado em LOTE (PM)
status_alya: falta
categoria: pm
portabilidade: replicar
depends_on: []
migration_next: null           # #5 não tem migration (só código)
impgeo_commits:
  - 09670e7   # perf(pm): progresso de metas em lote — N queries → ≤3
impgeo_files:
  - server/services/pm/goals-service.js
  - server/services/pm/__tests__/goals-batch.test.js
alya_files_novos:
  - server/services/pm/__tests__/goals-batch.test.js   # se #1 já feito
alya_files_editados:
  - server/services/pm/goals-service.js
---

# #5 · Progresso de metas calculado em LOTE

## 1. Objetivo
Hoje `listGoals` computa o progresso **1 query por meta**: `_withProgress` roda um
loop chamando `_metricValue(db, g)` para cada linha — M queries sequenciais. Pesa
para o admin/superadmin, que vê **todas** as metas. A melhoria agrupa as metas
pelas **3 formas de query** (tasks / projects / focus) e computa cada grupo numa
query só, via `unnest` de arrays tipados + `LATERAL` correlacionado por meta:
**N queries → ≤3**. Contrato do `listGoals` **inalterado** (mesmos `current`/`pct`/
`status`) → **o frontend não muda**. Perf pura, comportamento idêntico.

## 2. Referência no IMPGEO (fonte da verdade)
Leia o diff — **não** reescreva de memória:
```
git -C /Users/fernandocarvalho/impgeo show 09670e7   # goals-service: _metricValuesBatch + _SHAPE + _SQL + _withProgress; testes
```
Copiar **~verbatim** (agnóstico de negócio; só toca SQL de metas): o bloco
`Batch (#5)` de `goals-service.js` (`_SHAPE`, `_UNNEST`, `_SQL`, `_unnestParams`,
`_metricValuesBatch`), a reescrita do `_withProgress` e os novos exports. O arquivo
de teste `goals-batch.test.js` também é copiável verbatim. **`_metricValue` é
mantido intacto** como referência per-meta (prova de equivalência).

## 3. Pré-condições no Alya (rodar ANTES — se falhar, parar)
```bash
cd /Users/fernandocarvalho/alya/server
# (a) padrão N-queries atual: _withProgress faz loop chamando _metricValue?  → esperado: 1+
grep -nE "_withProgress|for \(const g of rows\)|await _metricValue" services/pm/goals-service.js
# (b) NÃO deve existir batch ainda (nem helpers)
grep -cE "_metricValuesBatch|_SHAPE|unnest\(" services/pm/goals-service.js   # esperado: 0
# (c) literais de SQL que o batch espelha existem iguais no _metricValue?
grep -nE "project_tasks|status='completed'|status='concluido'|pomodoro_daily_stats|total_minutes_worked" services/pm/goals-service.js
```
> **Confirmado na inspeção (2026-07-13):** `_withProgress` é o **loop sequencial**
> (`for (const g of rows) { const current = await _metricValue(db, g); … }`) — **sem
> batch hoje**. Não há `_metricValuesBatch`/`_SHAPE`/`unnest`. Os literais de SQL do
> `_metricValue` no Alya são **idênticos** aos do IMPGEO (`project_tasks`,
> `status='completed'`, `p.status='concluido'`, `pomodoro_daily_stats`,
> `total_minutes_worked`, `manager_user_id`, `assignee_user_id`, `completed_at::date`,
> `due_date`) → os 3 blocos `_SQL` copiam **1:1**, sem reescrever WHERE/params.

## 4. Passo a passo
**Grupo único — Backend (mergeável sozinho; front intacto):**
1. Em `goals-service.js`, **abaixo** do `_status` (e mantendo `_metricValue` intacto),
   inserir o bloco `Batch (#5)`:
   - `_SHAPE(metric)` — mapeia as 4 métricas nas 3 formas: `tasks_completed`/
     `on_time_pct` → `'tasks'`; `projects_completed` → `'projects'`; resto → `'focus'`.
   - `_UNNEST` — colunas comuns do unnest (`goal_id, scope, target_user_id, period_start, period_end`) com arrays tipados (`::text[]`, `::date[]`).
   - `_SQL` — os 3 SQLs (`tasks`/`projects`/`focus`), cada um com `LEFT JOIN LATERAL`
     por meta. **Cada bloco espelha 1:1 a condição de escopo e o FILTER de período/
     status do `_metricValue`.** Copiar verbatim.
   - `_unnestParams(goals)` — os 5 arrays paralelos (ids, scopes, targets, starts, ends).
   - `_metricValuesBatch(db, rows)` — agrupa por forma, roda uma query por forma
     **presente** (`Promise.all`), mapeia `goalId → current` num `Map`. `tasks_completed`
     → `completed`; `on_time_pct` → `round(on_time/completed*100)` (0 se `completed=0`,
     sem divisão por zero); `projects` → `n`; `focus` → `m`. Meta sem linha → `0`.
2. Reescrever `_withProgress`: se `rows` vazio → `[]`; senão `const values = await
   _metricValuesBatch(db, rows)` e `rows.map(g => { const current = values.get(g.id) ?? 0;
   … })`. **Sem mudar** a montagem do objeto (`{ ...g, target: Number, current, pct, status }`).
3. Exportar `_metricValue, _metricValuesBatch, _SHAPE` (além dos exports atuais) —
   necessário para o teste e a prova de equivalência.
4. `goals-batch.test.js` — copiar verbatim (db fake que roteia por marcador de cada
   SQL; valida dispatch/mapeamento). **Só roda se o #1 já tiver posto o vitest**;
   senão, guardar o arquivo e ligar junto do #1.

## 5. Deltas de adaptação (Alya)
- **Só código** — sem migration, sem front (contrato do `listGoals` inalterado).
- **SQL copia 1:1** — os literais de tabela/status/coluna do Alya batem com os do
  IMPGEO (ver §3c); não há WHERE a "traduzir".
- **`_metricValue` fica** como referência — não apagar; é o espelho per-meta.
- **Teste depende do vitest (#1)** — se ainda não feito, guardar e ligar no #1.
- Globais: [`_DELTAS-ALYA.md`](_DELTAS-ALYA.md).

## 6. Pegadinhas (aprendidas no IMPGEO)
- **Espelhar 1:1 o `_metricValue`:** cada `_SQL[shape]` tem que reproduzir a **mesma**
  condição de escopo (`self`/`user` → assignee; `team` → manager; `global` → todos) e
  o **mesmo** FILTER de período/status. Se divergir, o `current` muda em silêncio.
- **`unnest` com arrays TIPADOS** (`::text[]`, `::date[]`) — evita a inferência frágil
  de tipos do `VALUES`. `target_user_id` pode ser `null` (`global`): usar `?? null`.
- **`on_time_pct` com 0 concluídas → 0** (não dividir por zero). Mesmo cuidado do
  per-meta.
- **Meta sem linha no resultado → 0** — o `LEFT JOIN LATERAL` já garante 1 linha por
  meta com `COALESCE(...,0)`; no map, `byId.get(g.id)` pode faltar → `Number(row?.x || 0)`.
- **`period_start`/`period_end` como `date`** — normalizar com `String(...).slice(0,10)`
  antes de virar array (idem `_validateScope`/`createGoal`).
- **Query por forma PRESENTE:** se um grupo está vazio, **não** dispara query (o
  `if (!goals.length) return`). Por isso "≤3" e não "sempre 3".

## 7. Verificação (portão — só seguir se passar)
```bash
cd /Users/fernandocarvalho/alya/server
node -c services/pm/goals-service.js
# se #1 já feito:
npm test 2>&1 | grep -E "goals-batch|_metricValuesBatch|Tests"   # suíte de batch verde
# boot + smoke:
node server.js &    # sobe sem erro
# listar metas (idêntico a antes) — como admin, várias metas:
curl -s "http://localhost:PORTA/api/pm/goals" -H "Cookie: accessToken=<tok>" \
  | jq '.data[] | {id, metric, current, pct, status}'
```
**Equivalência (o ponto):** o resultado (`current`/`pct`/`status` de cada meta) tem
que ser **idêntico** ao anterior. E a **contagem de queries cai**: antes = M (uma por
meta); depois = número de formas presentes (**≤3**). Para provar no banco, comparar
`_metricValuesBatch` vs `_metricValue` meta a meta (script local numa transação com
rollback, como no IMPGEO — 7 cenários self/team/global × 3 formas). No smoke, ligar
log de queries do pool e confirmar a queda.

## 8. Rollout (Alya)
Refactor **sem migration** → só deploy de código. `git pull` no `/home/deploy/alya`
→ build (se aplicável) → `pm2 restart alya-api`. Smoke na aba de Metas do PM
(listar como admin — o pior caso). Reversível por `git revert` (comportamento
idêntico; `_metricValue` segue no arquivo). Ver `_DELTAS-ALYA.md §1` p/ os nomes
exatos de processo/caminho.
