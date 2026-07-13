---
id: "10-14"
slug: reconciliacao
titulo: Reconciliação de totais dos projetos do PM (view drift + heal + job)
status_alya: falta
categoria: pm
portabilidade: replicar
depends_on: [2]                 # usa o runner de migrations (cria a view)
migration_next: "042 - PM-TOTALS-DRIFT-VIEW"
impgeo_commits:
  - 5a5ae69   # feat(pm): view drift + reconcile-service + endpoints + job auto-heal
impgeo_files:
  - server/migrations/069-PM-TOTALS-DRIFT-VIEW.sql
  - server/migrations/069-PM-TOTALS-DRIFT-VIEW-rollback.sql
  - server/services/pm/reconcile-service.js
  - server/services/pm/__tests__/reconcile-service.test.js
  - server/server.js                    # (endpoints + timer; monolito no IMPGEO também aqui)
alya_files_novos:
  - server/migrations/042 - PM-TOTALS-DRIFT-VIEW.sql
  - server/migrations/042 - PM-TOTALS-DRIFT-VIEW-rollback.sql
  - server/services/pm/reconcile-service.js
  - server/services/pm/__tests__/reconcile-service.test.js   # só liga com #1 (vitest)
alya_files_editados:
  - server/server.js                    # endpoints /api/pm/reports/reconciliation[/heal] + pmReconcileTimer
---

# #10+#14 · Reconciliação de totais dos projetos do PM

## 1. Objetivo
Os totais denormalizados de `projects` — `expenses_cents` (soma das despesas) e
`progress_pct` (% de tarefas concluídas) — são mantidos por **trigger** (Alya:
migration `034 - PM-COSTS-TRIGGERS`; IMPGEO: 052). Se um trigger falha, é
desabilitado, ou há escrita direta, os valores **dessincronizam em silêncio**.
Esta melhoria adiciona a rede de reconciliação:
- **VIEW** `pm_totals_drift_v` — expõe **só** os projetos cujo total armazenado
  diverge do valor recomputado da fonte (esperado vs. armazenado).
- **Service** `reconcile-service` — `checkTotals` (read-only, lê a view) e
  `healTotals` (conserta recomputando via **as funções de recalc da 034**, não
  reimplementa a fórmula → correto por construção).
- **Endpoints** `GET /api/pm/reports/reconciliation` (relatório) e
  `POST .../heal` (só admin/superadmin).
- **Job diário** `pmReconcileTimer` — loga a divergência (nunca silencioso) e
  **auto-corrige** via `healTotals`.

## 2. Referência no IMPGEO (fonte da verdade)
Leia o diff — **não** reescreva de memória:
```
git -C /Users/fernandocarvalho/impgeo show 5a5ae69
```
Um único commit cobre tudo: migration 069 (view + rollback), `reconcile-service.js`,
os 2 endpoints, o timer no `app.listen`, e 5 testes. Copiar **~verbatim**
(agnósticos de negócio/TC): `reconcile-service.js` e `reconcile-service.test.js`.
Adaptar: o **corpo SQL da view** (nº da migration + espelhar as fórmulas do
Alya), os endpoints (assinatura local) e o timer (posição local).

## 3. Pré-condições no Alya (rodar ANTES — se falhar, PARAR)
> ⚠️ **CRÍTICO:** a view precisa espelhar **1:1 as fórmulas reais das funções de
> recalc DO ALYA** (não do IMPGEO). Se o Alya não tivesse os mesmos triggers/
> funções, isto seria **bloqueador** e a view teria de ser reescrita sobre as
> fórmulas locais. **Confira antes de escrever o SQL.**
```bash
cd /Users/fernandocarvalho/alya/server
# (a) as DUAS funções de recalc existem? → esperado: 2
grep -clE "pm_recalc_project_expenses|pm_project_progress_recalc" "migrations/034 - PM-COSTS-TRIGGERS.sql"
# (b) reconcile-service e a view NÃO devem existir ainda
ls services/pm/reconcile-service.js 2>/dev/null && echo "JÁ EXISTE — reavaliar" || echo "ok, ausente"
ls migrations/ | grep -i drift && echo "JÁ EXISTE — reavaliar" || echo "ok, ausente"
# (c) próximo número de migration (máx atual = 041 → próximo = 042)
ls migrations/ | grep -oE '^[0-9]{3}' | sort -n | tail -1
```
> **Confirmado na inspeção (2026-07-13):** ✅ **NÃO é bloqueador.** O Alya tem as
> duas funções portadas **VERBATIM** da 052 do IMPGEO, na migration
> `034 - PM-COSTS-TRIGGERS.sql`, com nomes idênticos
> (`pm_recalc_project_expenses`, `pm_project_progress_recalc`) e **fórmulas
> idênticas**:
> - `expenses_cents = COALESCE(ROUND(SUM(value)*100)::BIGINT WHERE type='Despesa', 0)`
> - `progress_pct = CASE WHEN total=0 THEN 0 ELSE ROUND((done/total)*100, 2) END`,
>   `total = COUNT(*) FILTER (status NOT IN ('canceled','refused'))`,
>   `done = COUNT(*) FILTER (status='completed')`.
>
> Logo a view do IMPGEO (069) espelha o Alya sem mudança de fórmula — só muda o
> **número/nome** da migration. `reconcile-service.js` e a view estão ausentes.
> Próximo nº = **042**.

## 4. Passo a passo
**Grupo 1 — Migration da view (mergeável sozinha; nada a mais depende dela):**
1. Criar `server/migrations/042 - PM-TOTALS-DRIFT-VIEW.sql` (nome **COM espaço**,
   ver `_DELTAS-ALYA.md §2`) a partir da 069 do IMPGEO. `CREATE OR REPLACE VIEW
   pm_totals_drift_v` com `expected_expenses_cents` e `expected_progress_pct`
   **espelhando as fórmulas da 034 do Alya** (que, confirmado, são idênticas às
   da 069) + `WHERE stored IS DISTINCT FROM expected` (só linhas divergentes) +
   `DO $$` validador final. Ajustar o cabeçalho: trocar "migration 052" →
   **"034 - PM-COSTS-TRIGGERS"** na nota de invariante.
2. Criar `server/migrations/042 - PM-TOTALS-DRIFT-VIEW-rollback.sql` →
   `DROP VIEW IF EXISTS pm_totals_drift_v;` (nome de rollback COM espaço).
3. Aplicar via runner do Alya: `npm run migrate:up` (ver `_DELTAS-ALYA.md §2` —
   **não** é `db:migrate:*`). Conferir `npm run migrate:status`.

**Grupo 2 — Service + endpoints + job (backend):**
4. Criar `server/services/pm/reconcile-service.js` — copiar **verbatim** do
   IMPGEO: `checkTotals(db)` (`SELECT * FROM pm_totals_drift_v ORDER BY
   project_id`) e `healTotals(db, {projectId})` (sem id → lê os ids da view;
   depois `SELECT pm_recalc_project_expenses($1)` + `pm_project_progress_recalc($1)`
   por projeto; retorna `{fixed, projectIds}`). Nomes das funções batem com a 034.
5. `server.js` — registrar `const pmReconcileService =
   require('./services/pm/reconcile-service');` junto dos outros `pm*Service`.
6. `server.js` — adicionar os 2 endpoints **perto do bloco `/api/pm/reports/*`**
   (Alya: ~L8314–8380). ⚠️ **Delta Alya:** os endpoints de reports do Alya usam
   a cadeia `authenticateToken, requireModulePermission(REL, 'view')` — replicar
   essa assinatura (o snippet do IMPGEO mostra só `requireModulePermission`).
   `REL = 'relatorios_tarefas_gerenciamento'` já existe (L8193).
   - `GET /api/pm/reports/reconciliation` → `{ success, data: { drifts, count } }`.
   - `POST /api/pm/reports/reconciliation/heal` → gate `role admin|superadmin`
     (403 senão), chama `healTotals(db, { projectId: req.body?.projectId || null })`.
7. `server.js` — adicionar `pmReconcileTimer` (diário) dentro do callback do
   `app.listen`, **junto dos outros timers** (`pmOverdueTimer` L8397 /
   `pmReportTimer` L8407). Loga `console.warn` com os `project_id` divergentes e
   chama `healTotals`; `unref()` no fim. ⚠️ **Delta Alya:** o `app.listen` do
   Alya é `app.listen(port, () => {…})` (sync, sem `async` e sem migrations no
   boot); só encaixar o `setInterval` — **não** copiar o corpo `async` do
   IMPGEO em volta.

**Grupo 3 — Testes (só quando o #1/vitest existir):**
8. Criar `server/services/pm/__tests__/reconcile-service.test.js` — copiar
   **verbatim** (5 testes: `db.pool.query` fake roteado por regex
   `FROM pm_totals_drift_v` / `pm_recalc_project_expenses($1)` /
   `pm_project_progress_recalc($1)`). ⚠️ **Alya não tem vitest** ainda
   (`_DELTAS-ALYA.md §8`) — guardar o arquivo e ligar junto do **#1**. Sem o #1,
   a verificação se apoia em `node -c` + boot + smoke SQL (§7).

## 5. Deltas de adaptação (Alya)
- **Migration `042 - PM-TOTALS-DRIFT-VIEW.sql`** — nome **COM espaço** + rollback
  homônimo; aplicar pelo runner do Alya (`migrate:up`). Ver `_DELTAS-ALYA.md §2`.
- **View espelha a 034 do Alya** (fórmulas confirmadas idênticas à 069) — trocar
  a referência "052" → "034" no cabeçalho de invariante.
- **Endpoints em `server.js`** (Alya não modularizado, `_DELTAS-ALYA.md §5`),
  com `authenticateToken` explícito na cadeia (delta de assinatura local).
- **Timer** no `app.listen(port, () => {…})` **síncrono** do Alya, ao lado de
  `pmOverdueTimer`/`pmReportTimer` — só o `setInterval`, sem wrapper `async`.
- **Testes atrás do #1** (vitest ausente, `_DELTAS-ALYA.md §8`).
- **Sem TerraControl** — esta melhoria não toca TC (`_DELTAS-ALYA.md §3`).
- Globais: [`_DELTAS-ALYA.md`](_DELTAS-ALYA.md).

## 6. Pegadinhas (aprendidas no IMPGEO)
- **Invariante da view = fórmula das funções.** A view **duplica** as fórmulas
  de recalc em SQL. Se um dia mudar `pm_recalc_project_expenses` ou
  `pm_project_progress_recalc` (034), **mude a view junto** — senão a
  reconciliação passa a acusar drift falso (ou a esconder drift real). Deixar o
  aviso no cabeçalho da 042.
- **`healTotals` reusa as funções, não reimplementa.** O conserto chama
  `pm_recalc_project_expenses($1)` + `pm_project_progress_recalc($1)` — idempotentes
  e a mesma fonte de verdade dos triggers. Nunca `UPDATE` manual do total.
- **`profit_cents` é GENERATED** e `paid_cents`/`total_cents` são definidos pela
  app (não são agregados de linhas-filhas) → **fora** da view; só `expenses_cents`
  e `progress_pct` divergem.
- **`IS DISTINCT FROM`** (não `<>`) no WHERE — trata `NULL` corretamente; a view
  devolve **só** linhas com drift real.
- **Job nunca silencioso:** loga a divergência **antes** de corrigir
  (`console.warn` com os ids) e loga quantos corrigiu. Erro no job → `console.log`
  e segue (não derruba o processo).
- **Heal é admin-only** no endpoint (gate `role`), mas o **job** roda sem gate
  (é o próprio sistema) — não confundir os dois caminhos.
- **Migration é o 1º up/down real** da view no Alya → testar `migrate:up` **e**
  o rollback antes de commitar (drift injetado → view acusa → heal restaura).

## 7. Verificação (portão — só seguir se passar)
```bash
cd /Users/fernandocarvalho/alya/server
node -c services/pm/reconcile-service.js
node -c server.js
# migration aplica e reverte (1º up/down real da view):
npm run migrate:up && npm run migrate:status
psql "$DB..." -c "\dv pm_totals_drift_v"            # view existe
# smoke da reconciliação (injetar drift → view acusa → heal restaura):
psql "$DB..." -c "UPDATE projects SET progress_pct = 999 WHERE id = (SELECT id FROM projects LIMIT 1);"
psql "$DB..." -c "SELECT project_id, stored_progress_pct, expected_progress_pct FROM pm_totals_drift_v;"  # 1 linha
# boot + endpoints:
node server.js &                                    # sobe sem erro (timer registra)
curl -s "http://localhost:PORTA/api/pm/reports/reconciliation" -H "Cookie: accessToken=<tok>" | jq '.data.count'
curl -s -X POST "http://localhost:PORTA/api/pm/reports/reconciliation/heal" -H "Cookie: accessToken=<tok-admin>" | jq '.data'
psql "$DB..." -c "SELECT COUNT(*) FROM pm_totals_drift_v;"   # 0 após heal
# se #1 já feito:
npm test 2>&1 | grep -E "reconcile|Tests"           # 5 testes verdes
# rollback limpo:
npm run migrate:down   # (ou o comando de rollback do runner do Alya) → DROP VIEW ok
```

## 8. Rollout (Alya)
Tem migration → seguir o **portão de migrations** (`_DELTAS-ALYA.md §1/§2` e
ficha #2): backup antes, `migrate:up` da 042, depois deploy do código
(`reconcile-service` + endpoints + timer). Na VPS: `git pull` no
`/home/deploy/alya` → aplicar a 042 pelo runner → build → `pm2 restart alya-api`.
Smoke: `GET /api/pm/reports/reconciliation` responde e o log mostra o
`pmReconcileTimer` no boot. Reversível: `git revert` do código + rollback da 042
(`DROP VIEW`, read-only, sem dado de negócio). Confirmar nomes de processo/caminho
em `_DELTAS-ALYA.md §1`.
