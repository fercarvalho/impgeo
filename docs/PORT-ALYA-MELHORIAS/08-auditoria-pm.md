---
id: 8
slug: auditoria-pm
titulo: Auditoria central do PM — view unificada + endpoint + aba "Auditoria"
status_alya: falta
categoria: pm
portabilidade: replicar
depends_on: []                 # ver §3: acoplamento com #12 (Pagination/parsePagination) é soft
migration_next: "042 - PM-AUDIT-VIEW"   # próximo nº no Alya (máx. atual = 041)
impgeo_commits:
  - 5dcffc7   # backend: migration 072 (view) + audit-service.js + endpoint + testes
  - 0fae3bc   # front: aba Auditoria em RelatoriosTarefas.tsx
impgeo_files:
  - server/migrations/072-PM-AUDIT-VIEW.sql
  - server/migrations/072-PM-AUDIT-VIEW-rollback.sql
  - server/services/pm/audit-service.js
  - server/services/pm/__tests__/audit-service.test.js
  - server/routes/pm.js                 # endpoint (era server.js antes do #3)
  - src/subsistemas/gerenciamento/modulos/RelatoriosTarefas.tsx
alya_files_novos:
  - server/migrations/042 - PM-AUDIT-VIEW.sql
  - server/migrations/042 - PM-AUDIT-VIEW-rollback.sql
  - server/services/pm/audit-service.js
  - server/services/pm/__tests__/audit-service.test.js   # se #1 já feito
alya_files_editados:
  - server/server.js                    # endpoint (Alya NÃO modularizado — ver delta)
  - src/subsistemas/gerenciamento/modulos/RelatoriosTarefas.tsx
---

# #8 · Auditoria central do PM (view unificada + endpoint + aba)

## 1. Objetivo
O PM tem **três** stores de evento por-entidade — `task_events`, `project_events`,
`pomodoro_events` — e hoje investigar "o que aconteceu" exige consultar cada tabela
separada. Criar uma **VIEW read-only `pm_audit_v`** que normaliza os três num shape
comum `(id, source, entity_type, entity_id, event_type, actor_type, actor_id,
payload, occurred_at)`, um **endpoint `GET /api/pm/audit`** filtrável+paginado
(gestor-only) e uma **aba "Auditoria"** nos Relatórios de Tarefas. **Nenhum write
path muda** — a auditoria por-entidade continua idêntica; só ganhamos leitura
cross-entidade.

## 2. Referência no IMPGEO (fonte da verdade)
Leia os diffs — **não** reescreva de memória:
```
git -C /Users/fernandocarvalho/impgeo show 5dcffc7   # migration 072 (view) + audit-service.js + endpoint + 6 testes
git -C /Users/fernandocarvalho/impgeo show 0fae3bc   # front: aba Auditoria em RelatoriosTarefas.tsx
```
Copiar **~verbatim** (agnósticos de TC/negócio): a SQL da view, `audit-service.js`
(`buildWhere` puro + `queryPmAudit`), `audit-service.test.js`. Adaptar: o endpoint
(vai pro `server.js` no Alya, não `routes/pm.js`) e o bloco da aba em
`RelatoriosTarefas.tsx` (paleta amber).

## 3. Pré-condições no Alya (rodar ANTES — se falhar, parar)
```bash
cd /Users/fernandocarvalho/alya/server
# (a) as 3 tabelas de evento existem?  → esperado: 3
grep -clE "CREATE TABLE (IF NOT EXISTS )?(task_events|project_events|pomodoro_events)" migrations/*.sql | : 
grep -rniE "CREATE TABLE (IF NOT EXISTS )?(task_events|project_events|pomodoro_events)" migrations/ | wc -l
# (b) NÃO deve existir a view/serviço ainda
ls services/pm/audit-service.js 2>/dev/null && echo "JÁ EXISTE — reavaliar" || echo "ok, ausente"
# (c) próximo nº de migration (esperado 042)
ls migrations/ | grep -oE '^[0-9]+' | sort -n | tail -1
# (d) o front tem RelatoriosTarefas.tsx
ls ../src/subsistemas/gerenciamento/modulos/RelatoriosTarefas.tsx
```
> **Confirmado na inspeção (2026-07-13):** as 3 tabelas existem no Alya
> (`030 - PM-TASKS.sql`, `028 - PM-CORE.sql`, `031 - PM-POMODORO.sql`) e as **colunas
> batem exatamente** com o que a view do IMPGEO faz `SELECT` (ver §5) → a SQL da view
> copia quase verbatim. `REL = 'relatorios_tarefas_gerenciamento'` já existe
> (`server.js:8193`); `db.pool.query` é o handle padrão; `users.id` é `VARCHAR(255)`
> e casa com `actor_id VARCHAR` no `LEFT JOIN`. `audit-service.js` ausente. Próximo
> nº = **042**. `RelatoriosTarefas.tsx` presente (já usa paleta amber na aba ativa).
>
> ⚠️ **Sobre `audit_logs` / `utils/audit.js`:** o Alya tem uma infra de auditoria
> **de segurança** (tabela `audit_logs`, `utils/audit.js`, `archive-audit-logs.js`,
> migration `003 - SEGURANCA.sql`). **Ela NÃO é a fonte da `pm_audit_v`** — a view do
> #8 se apoia **exclusivamente** em `task_events`/`project_events`/`pomodoro_events`.
> `audit_logs` fica **intocada**; são coisas separadas (segurança vs. eventos-do-PM).
> Não confundir nem tentar unir as duas.

## 4. Passo a passo
**Grupo 1 — Backend (mergeável sozinho; o front continua igual):**
1. Criar `server/migrations/042 - PM-AUDIT-VIEW.sql` (**nome COM espaço** — regra Alya,
   `_DELTAS-ALYA.md §2`) — copiar a SQL do IMPGEO **~verbatim**: `CREATE OR REPLACE
   VIEW pm_audit_v AS` com **3× `SELECT ... UNION ALL`** normalizando os campos
   (`'task'/'project'/'pomodoro'` como `source`; pomodoro dobra
   `from_mode/to_mode/work_session_id` dentro de `payload` via `jsonb_build_object` e
   usa `'user'` como `actor_type` + `user_id` como `actor_id`; `entity_id` do pomodoro
   = `COALESCE(task_id, work_session_id)`). Transacional (`BEGIN/COMMIT`), idempotente
   (`CREATE OR REPLACE`), com validador `DO $$ ... information_schema.views ... $$`.
2. Criar `server/migrations/042 - PM-AUDIT-VIEW-rollback.sql` — `DROP VIEW IF EXISTS
   pm_audit_v;` dentro de `BEGIN/COMMIT` (view read-only, sem dado de negócio; as
   tabelas de evento permanecem).
3. Rodar a migration pelo runner do Alya (`_DELTAS-ALYA.md §2`):
   `npm run migrate:status` → `npm run migrate:up`.
4. Criar `server/services/pm/audit-service.js` — copiar **verbatim**: `buildWhere`
   (função pura, WHERE parametrizado a partir de `source/entityId/actorId/eventType/
   from/to`, todos opcionais) + `queryPmAudit(db, filters)` que faz `SELECT COUNT(*)`
   com o **mesmo WHERE/params** + a query com `LEFT JOIN users` (resolve
   `actor_username`), `ORDER BY a.occurred_at DESC` e `LIMIT/OFFSET` quando
   `limit != null`. Retorna `{ items, total }` (mesmo contrato do #12). *Ajuste de
   comentário:* o Alya não tem `abacatepay` no `actor_type` (podado) — trocar a nota
   "system/cron/abacatepay" por "system/cron".
5. **Endpoint** — ⚠️ **Delta Alya:** no IMPGEO vive em `routes/pm.js` (pós-#3); **no
   Alya vai pro `server.js`** (monolito, sem `routes/pm.js`). Registrar `const
   pmAuditService = require("./services/pm/audit-service");` no topo (junto dos outros
   `pm*Service`, ~linha 22-31) e adicionar, perto dos outros `/api/pm/reports/*`
   (~linha 8314+):
   ```js
   app.get('/api/pm/audit', authenticateToken, requireModulePermission(REL, 'view'), async (req, res) => {
     try {
       const pg = parsePagination(req.query);                 // do #12 (pagination.js)
       const { source, entityId, actorId, eventType, from, to } = req.query;
       const { items, total } = await pmAuditService.queryPmAudit(db, {
         source, entityId, actorId, eventType, from, to, limit: pg.limit, offset: pg.offset,
       });
       res.json({ success: true, data: items, pagination: pageEnvelope(pg, total) });
     } catch (error) { res.status(500).json({ success: false, error: error.message }); }
   });
   ```
   `authenticateToken` é obrigatório no Alya (todo `/api/pm/*` o usa) — no IMPGEO a
   factory já injeta auth. `REL` já existe (`server.js:8193`).
6. `server/services/pm/__tests__/audit-service.test.js` — copiar verbatim (6 testes:
   `buildWhere` + `queryPmAudit` com `db.pool.query` fake). **Só roda se o #1 já tiver
   posto o vitest**; senão, guardar e ligar junto do #1 (`_DELTAS-ALYA.md §8`).

**Grupo 2 — Frontend (aba visível):**
7. `RelatoriosTarefas.tsx` — adicionar a aba `'audit'` ao `type`/state de `tab` e ao
   array de abas (`['audit', 'Auditoria', History]`, ícone `History` do lucide). No
   `load()`, novo ramo `tab === 'audit'` monta a query (`from/to/limit/page` + `source`
   + `eventType`), bate em `GET /api/pm/audit`, seta `audit` e `auditMeta`
   (`total/totalPages`). Filtros extras (só quando `tab==='audit'`): `<select>` de
   **Fonte** (Todas/Tarefas/Projetos/Pomodoro) e `<input>` de **Tipo de evento**;
   qualquer mudança de filtro chama `resetAuditPage()` (volta pra pág. 1). Tabela com
   Data/hora, Fonte (badge), Evento, Entidade, Ator (`actor_username` resolvido) e
   Detalhes (payload). Rodapé com `<Pagination>` do #12.

## 5. Deltas de adaptação (Alya)
- **`audit_logs` é OUTRA coisa** — não é a fonte da view; deixar intocada (ver §3).
- **Migration com nome-espaço:** `042 - PM-AUDIT-VIEW.sql` (+ `-rollback`). Runner
  `npm run migrate:up` (`_DELTAS-ALYA.md §2`).
- **Endpoint em `server.js`, não `routes/pm.js`** (Alya não modularizado —
  `_DELTAS-ALYA.md §5`); precisa de `authenticateToken` explícito.
- **Colunas idênticas:** as 3 tabelas do Alya têm exatamente as colunas que a view
  faz `SELECT` — nenhum rename necessário:
  - `task_events(id, task_id, event_type, actor_type, actor_id, payload, created_at)`
  - `project_events(id, project_id, event_type, actor_type, actor_id, payload, created_at)`
  - `pomodoro_events(id, user_id, work_session_id, task_id, event_type, from_mode, to_mode, occurred_at, metadata)`
  `actor_type CHECK` no Alya é `('user','system','cron')` (sem `abacatepay`) — bate com
  o `UNION`, só ajustar o comentário do service.
- **Paleta amber** na aba (`_DELTAS-ALYA.md §7`): a aba ativa **já herda** o
  `border-amber-500 text-amber-600` do map de abas existente do Alya — só entrar no
  array. Para os **badges de fonte**, manter 3 hues distintos com amber presente:
  `pomodoro` → amber (já é no IMPGEO), `task`/`project` → sky/violet (ok manter, o Alya
  já usa violet como cor secundária no módulo). Não introduzir azul/índigo do IMPGEO.
- **`pageEnvelope`/`parsePagination` vêm do #12** — ver §Pegadinhas.
- Globais: [`_DELTAS-ALYA.md`](_DELTAS-ALYA.md).

## 6. Pegadinhas (aprendidas no IMPGEO)
- **View read-only, zero write path:** nada de trigger/coluna nova; a auditoria
  por-entidade continua escrevendo como sempre. `pm_audit_v` só **lê**.
- **`COUNT` reusa o WHERE/params EXATO** da query paginada (mesmos `$n`), senão o
  `total` mente. `queryPmAudit` já faz isso via `buildWhere` compartilhado — copiar
  verbatim, não "otimizar".
- **`LEFT JOIN users` (não INNER):** `actor_id` pode ser `null` (eventos `system`/
  `cron`) ou não-usuário — INNER sumiria com esses eventos. Manter LEFT; `actor_username`
  fica `null` e o front cai no fallback (`actor_type`).
- **Pomodoro é o caso torto:** não tem `actor_type` nem `payload` homogêneo. A view
  força `'user'`/`user_id` e **dobra** `from_mode/to_mode/work_session_id` dentro de
  `payload` — não perder isso ao copiar.
- **Acoplamento com #12 (não é `depends_on` rígido, mas real):** o backend usa
  `parsePagination` (de `services/pm/pagination.js`) e a resposta usa `pageEnvelope`;
  o front reusa `_pm/Pagination.tsx`. **Ambos nascem no #12.** Se o #12 ainda não foi
  feito no Alya: (a) fazer o #12 antes, **ou** (b) inline mínimo — no endpoint,
  construir o envelope à mão (`{ total, limit, offset, page, totalPages }`) e no front
  um pager simples. Recomendado: **fazer o #12 primeiro** (a paginação da aba já sai
  de graça). `Pagination.tsx` e `parsePagination` estão **ausentes** hoje no Alya.
- **Gestor-only:** `requireModulePermission(REL, 'view')` — mesma permissão dos outros
  relatórios. Não criar permissão nova.
- **Envelope aditivo:** `data` continua array; `pagination` é campo novo. Não quebrar
  quem lê `j.data`.

## 7. Verificação (portão — só seguir se passar)
```bash
cd /Users/fernandocarvalho/alya/server
# migration aplica limpa (validador não deve abortar):
npm run migrate:up
# a view existe e responde:
psql "$DB_URL" -c "SELECT source, count(*) FROM pm_audit_v GROUP BY source;"
# sintaxe do service + boot:
node -c services/pm/audit-service.js
node -c server.js
# se #1 já feito:
npm test 2>&1 | grep -E "audit-service|Tests"     # 6 testes verdes
# boot + smoke (gestor-only; use um token de gestor):
node server.js &
curl -s "http://localhost:PORTA/api/pm/audit?limit=5" -H "Cookie: accessToken=<tok>" \
  | jq '.success, (.data | length), .pagination.total'
# filtro por fonte:
curl -s "http://localhost:PORTA/api/pm/audit?source=task&limit=5" -H "Cookie: accessToken=<tok>" \
  | jq '.data[0].source'
```
Front (após Grupo 2): abrir Relatórios de Tarefas → aba **Auditoria**; conferir tabela
carregando eventos das 3 fontes, filtro de Fonte/Tipo de evento, badge amber no
pomodoro, ator resolvido, e paginação Anterior/Próxima. Dark mode e mobile ok.

## 8. Rollout (Alya)
Migration **aditiva read-only** (só cria a view) + código. Ordem: `git pull` no
`/home/deploy/alya` → **backup antes** (`backups/backup-pre-042-$(date +%F).sql`) →
`npm run migrate:up` → build front → `pm2 restart alya-api`. Smoke na aba Auditoria +
nos outros relatórios (regressão). Reversível: `042 - PM-AUDIT-VIEW-rollback.sql`
(`DROP VIEW`) + `git revert` — sem risco de dado, a view não guarda nada. Ver
`_DELTAS-ALYA.md §1` p/ nomes exatos de processo/caminho.
