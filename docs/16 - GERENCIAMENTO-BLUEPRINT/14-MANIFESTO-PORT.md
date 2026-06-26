# 14 · Manifesto de portabilidade (checklist arquivo-por-arquivo)

> Apêndice **mecânico** para a execução do port. Lista cada artefato real do IMPGEO, o destino no Alya e
> a **transformação** (verbatim / adaptar / podar / criar). Gerado do filesystem real
> (`server/services/pm/`, `server/migrations/`, `src/subsistemas/gerenciamento/modulos/`), não de memória.
>
> Legenda: **= verbatim** (copiar e só trocar imports) · **~ adaptar** (mudança pontual descrita) ·
> **✄ podar** (remover/ignorar) · **+ criar** (não existe no Alya, escrever novo).
> Caminhos-fonte relativos a `/Users/fernandocarvalho/impgeo`.

---

## A. Migrations (consolidar 045→067 com poda)

No Alya as migrations continuam após o número atual (hoje vão até ~026). Pode-se **consolidar** o schema
PM em poucos arquivos novos numerados em sequência, contanto que o resultado final bata com o DDL dos
docs 02. **Backup antes** (memória `feedback_backups_before_migration`); **SQL colado na conversa**
(memória `feedback_sql_migrations_share`).

| Fonte (impgeo) | Transformação | Notas de poda |
|---|---|---|
| `migrations/045-PM-PROJECTS-CLIENTS-EXTEND.sql` | ~ adaptar | `projects.source` CHECK → `('manual','imported')`; **✄** `terracontrol_id`, `budget_id` e suas FKs; **✄** seção 4 (terracontrol client_id/project_id); `clients` **✄** `tc_user_id`/FK tc_users; **manter** `transactions.project_id` + financeiro (`*_cents`, `profit_cents` GENERATED) |
| `migrations/046-PM-SERVICE-TEMPLATES.sql` | ~ adaptar | **✄** seed `svc_terracontrol_default` (serviço + 5 stages + 5 tasks + dep). Estrutura das 4 tabelas template = verbatim |
| `migrations/047-PM-PROJECT-STAGES-TASKS.sql` | = verbatim | `project_events`/`task_events.actor_type` → `('user','system','cron')` (✄ `abacatepay`) |
| `migrations/048-PM-TASK-STATE-MACHINE.sql` | ~ adaptar | `task_assignments_history` = verbatim; o INSERT no catálogo/permissões adapta para o módulo do Alya |
| `migrations/049-PM-POMODORO.sql` | = verbatim | inclui trigger `trg_seed_pomodoro_config` |
| `migrations/050-PM-REVIEW-AND-HELP.sql` | = verbatim | |
| `migrations/051-PM-NOTIFICATIONS-AND-REPORTS.sql` | = verbatim | |
| `migrations/052-PM-COSTS-AND-REPORTS.sql` | = verbatim | **trigger de custo + progresso + views** — porta direto (transactions do Alya é `value DECIMAL`/`type='Despesa'`) |
| `migrations/053-PM-FINAL-CONSTRAINTS.sql` | = verbatim | índices |
| `migrations/054-PM-SERVICE-STATUS.sql` | = verbatim | |
| `migrations/055-PM-CLIENTS-MODERN-FIELDS.sql` | ~ adaptar | `clients` **já existe no Alya** (com encryption) — **estender** in-place, não recriar; conciliar `address`→JSONB se ainda não for |
| `migrations/056-PM-TASK-TIME-TRACKING.sql` | = verbatim | |
| `migrations/057-PM-CUSTOM-FOCUS.sql` | = verbatim | |
| `migrations/058-PM-POMODORO-OVERAGE.sql` | = verbatim | |
| `migrations/059-PM-BREAK-ACCUMULATION.sql` | = verbatim | |
| `migrations/060-PM-DUE-DATE-REQUESTS.sql` | = verbatim | |
| `migrations/061-PM-REVIEW-SUBMITTER.sql` | = verbatim | |
| `migrations/062-PM-TASK-GESTOR-ONLY.sql` | = verbatim | |
| `migrations/063-PM-UNCOMPLETE-REQUESTS.sql` | = verbatim | |
| `migrations/064-PM-UNCOMPLETE-TARGET-POOL.sql` | = verbatim | |
| `migrations/065-PM-GOALS.sql` | = verbatim | |
| `migrations/066-PM-DELEGATION-REQUESTS.sql` | = verbatim | |
| `migrations/067-PM-DUE-DATE-NEGOTIATION.sql` | = verbatim | |

Cada migration tem par `-rollback.sql` no impgeo — replicar o padrão.

---

## B. Serviços de backend (`server/services/pm/` → mesmo caminho no Alya)

| Fonte | Transformação | Detalhe |
|---|---|---|
| `state-machine.js` | ~ adaptar | `PROJECT_SOURCES` ✄ `terracontrol_pix`; `CLIENT_SOURCES` ✄ `terracontrol`; `PROJECT_EVENT_ACTOR_TYPES` ✄ `abacatepay`; `PROJECT_EVENT_TYPES` ✄ `project_created_from_pix` |
| `task-service.js` | = verbatim | maior arquivo (1236 ln); revisar só imports |
| `template-service.js` | = verbatim | |
| `pomodoro-service.js` | = verbatim | |
| `project-service.js` | ~ adaptar | **✄** `createProjectFromTerraControlPayment` e `TC_SERVICE_ID`; manter `createProjectFromTemplate` |
| `report-service.js` | = verbatim | timezone BRT hardcoded (melhoria #13 opcional) |
| `goals-service.js` | = verbatim | |
| `dashboard-service.js` | = verbatim | |
| `dependency-resolver.js` | = verbatim | puro, sem I/O |
| `help-service.js` | = verbatim | |
| `client-service.js` | ~ adaptar | **✄** `findOrCreateFromTcUser` (sync tc_users); manter `serializeAddress` + adicionar CRUD simples de clients |
| `notification-service.js` | ~ adaptar | `pushDispatcher.send(db,'impgeo',userId,…)` → `send(db,userId,…)`; `IMPGEO_PUBLIC_URL`→`ALYA_PUBLIC_URL`; usar `createNotification`/`getNotificationPreference`/email do Alya |
| `notification-strings.js` | ~ adaptar | remover `pm_project_paid` → **22 tipos** restantes |
| `trigger-runner.js` | = verbatim | |
| `review-workflow.js` | = verbatim | |
| `project-finalizer.js` | = verbatim | |
| `cost-service.js` | = verbatim | (F4) |

---

## C. Backend — peças que NÃO são arquivo isolado (estão no `server.js`/`database-pg.js`)

| Item | Transformação | Onde |
|---|---|---|
| `requireModulePermission(moduleKey, level)` | **+ criar** | middleware no `server.js` do Alya, sobre `user_module_permissions` (espelha doc 07) |
| Rotas PM (`/api/pm/*`, `/api/projects`, `/api/services`, `/api/clients`, `/api/pomodoro`, `/api/tasks/*`) | ~ portar | adicionar ao `server.js` do Alya com os gates do doc 05 |
| `NOTIFICATION_DEFAULTS` | ~ adaptar | acrescentar **22 tipos `pm_*`** (todos menos `pm_project_paid`) ao mapa do Alya |
| `getDefaultModulesCatalog()` | ~ adaptar | substituir entradas do `gerenciamento` (sai `products`; mantém `clients`; adiciona os 10 módulos PM) |
| Cron jobs `detectAndMarkOverdue` / `sendDueReports` | ~ portar | registrar no boot do backend do Alya |

---

## D. Frontend (`src/subsistemas/gerenciamento/modulos/` → mesmo caminho no Alya)

Todos os módulos e `_pm/*` portam; a única adaptação transversal é **imports de auth/permissões** para os
hooks do Alya (`usePermissions` + `hasModuleEdit`). São **self-contained** (buscam seus dados) → entram
no `if/switch` do `App.tsx` do Alya sem prop-drilling.

| Grupo | Arquivos | Transformação | Fase |
|---|---|---|---|
| Módulos raiz | `Tarefas`, `DashboardGerenciamento`, `MetasGerenciamento`, `Projects`, `Services`, `Clients`, `Pomodoro`, `RelatoriosTarefas`, `ProjecaoGerenciamento`, `RelatoriosGerenciamento` | ~ adaptar (imports) | F3 |
| `_pm/` helpers | `taskApi.ts`, `pomodoroApi.ts` | ~ adaptar (base URL/auth) | F3 |
| `_pm/` charts | `charts.tsx` | = verbatim (recharts já existe) | F0 |
| `_pm/` modais | `AssignTaskModal`, `ClaimTaskModal`, `TaskReviewModal`, `TaskDueDateModal`, `DueProposalModal`, `UncompleteTaskModal`, `HelpRequestModal`, `PomodoroStartModal`, `IdleAlertModal`, `TemplateImportModal` | = verbatim (via `<Modal>`) | F3 |
| `_pm/` widgets/páginas | `PendingTasksBanner`, `PomodoroFloatingWidget`, `PmEmailReportsPanel`, `ProjectDetailPage`, `ServiceTemplateEditor` | = verbatim | F3 |
| `_pm/` financeiro | `LinkTransactionModal` | = verbatim | F4 |

## E. Frontend — compartilhados

| Fonte | Transformação | Nota |
|---|---|---|
| `src/components/Modal.tsx` | **+ criar** (portar) | não existe no Alya (F0) |
| `src/components/DialogProvider.tsx` | **+ criar** (portar) + montar no root | não existe no Alya (F0) |
| `src/components/CapturarUsuarioModal.tsx` | **✄ NÃO portar** | é **impersonation do superadmin** (`startImpersonation`), fora do PM; nenhum `_pm/*` o importa |
| `src/subsistemas/manifest.ts` (entrada `gerenciamento`) | ~ adaptar | trocar `moduleKeys` de `[products, clients, …]` pelos 10 do PM |
| Seleção de usuário em atribuir/ajudar | — | **não** é componente; é `<select>` + `fetchAssignableUsers`/`fetchPmUsers` (já em `taskApi.ts`) |

---

## F. Resumo da poda (TerraControl/PIX) — checklist único

- [ ] `projects.source`: remover `terracontrol_pix`
- [ ] `projects`: remover `terracontrol_id`, `budget_id` (+ FKs)
- [ ] migration 045: remover seção `terracontrol` (client_id/project_id)
- [ ] `clients`: remover `tc_user_id` (+ FK)
- [ ] `project_events`/`task_events.actor_type`: remover `abacatepay`
- [ ] `state-machine.js`: limpar `PROJECT_SOURCES`/`CLIENT_SOURCES`/`PROJECT_EVENT_*`
- [ ] `project-service.js`: remover `createProjectFromTerraControlPayment` + `TC_SERVICE_ID`
- [ ] `client-service.js`: remover `findOrCreateFromTcUser`
- [ ] `notification-strings.js` + `NOTIFICATION_DEFAULTS`: remover `pm_project_paid`
- [ ] migration 046: remover seed `svc_terracontrol_default`
- [ ] `CapturarUsuarioModal` + impersonation: não portar

> Use este manifesto junto com o **13-ROADMAP-ALYA** (ordem das fases) e o **11-PORTABILIDADE-ALYA**
> (o "porquê" de cada decisão). O código-fonte real a copiar está em `/Users/fernandocarvalho/impgeo`.
