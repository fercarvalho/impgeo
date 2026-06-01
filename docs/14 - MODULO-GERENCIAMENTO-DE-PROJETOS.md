# 14 — Módulo de Gerenciamento de Projetos (PM)

Motor operacional do subsistema `gerenciamento`: projetos a partir de serviços-template, execução de tarefas com workflow, controle de tempo (Pomodoro), métricas e relatórios. Implementado nas migrations **045 → 053**.

---

## Visão geral

Um **serviço** define um **template** de etapas e tarefas. Ao criar um **projeto** a partir de um serviço, o template é **copiado** para entidades reais (`project_stages`, `project_tasks`) — editáveis sem afetar o template. O projeto roda um workflow com dependências, triggers, revisão, aceite e pedidos de ajuda. O tempo é medido via Pomodoro server-side. Custos vêm de transações financeiras vinculadas. Relatórios consolidam produtividade e saúde dos projetos.

---

## Esquema (tabelas principais)

| Tabela | Papel |
|---|---|
| `services` (+ flags template) / `service_template_stages` / `service_template_tasks` / `service_template_task_deps` / `service_template_task_triggers` | Template do serviço (migration 046) |
| `projects` (estendida) / `project_stages` / `project_tasks` / `project_task_deps` / `project_task_triggers` | Entidades reais do projeto (045, 047) |
| `project_events` / `task_events` | Auditoria (espelham `tc_record_events`) |
| `task_assignments_history` | (Re)atribuições e colaborações (048) |
| `task_work_sessions` / `pomodoro_events` / `pomodoro_daily_stats` / `user_pomodoro_config` / `task_idle_tracking` | Pomodoro (049) |
| `task_attachments` / `task_help_requests` | Anexos e ajuda (050) |
| `pm_report_jobs` + `users.pm_email_reports/pm_report_frequencies` | Relatórios por e-mail (051) |
| `clients` (+ `tc_user_id/cpf/cnpj/source`) | Cliente, com auto-criação via PIX |

`server/services/pm/state-machine.js` espelha os domínios CHECK em JS (single source of truth).

---

## State machine da tarefa (10 estados)

`pending → available → in_progress → {pending_review → completed | completed} ` (+ `pending_acceptance`, `pending_adjustment`, `overdue`, `refused`, `canceled`). Matriz canônica em `state-machine.js` (`ALLOWED_TRANSITIONS`). Toda transição valida + grava `task_events`.

Status do **projeto** (PT): `inativo, ativo, pausado, concluido, cancelado`.

---

## Trigger ≠ Dependência

- **Dependência** (`*_task_deps`): LIBERA tarefa **existente**. `start_dependency` (gate de início) vs `completion_dependency` (gate de conclusão). Alvo pode ser `task` ou `stage` + `required_status`.
- **Trigger** (`*_task_triggers`): CRIA tarefa **nova** quando a source conclui (idempotente via `triggered_at`).

`dependency-resolver.js` (puro) resolve o que vira `available`; `trigger-runner.js` materializa tarefas novas.

---

## Revisão (regra admin vs manager)

Tarefa com `review_required` ao concluir → `pending_review`. Um revisor (admin/manager) aprova/reprova:
- **admin aprova** → `completed`, sem follow-up.
- **manager aprova** → `completed` + tarefa de acompanhamento criada para o **admin de menor carga** (`review-workflow.js`).
- **reprova** → `pending_adjustment` com notas.

---

## Hook PIX (TerraControl → projeto)

Em `budget-service.markPaidFromWebhook` (após aprovar o terreno): cria/acha o cliente (`client-service.findOrCreateFromTcUser`, dedup por `tc_user_id`/cpf/email), cria o projeto a partir de `svc_terracontrol_default` e vincula `terracontrol.project_id`/`client_id`. Idempotente (UNIQUE `projects.terracontrol_id`) e best-effort (não desfaz o pagamento).

---

## Pomodoro

Ciclo `running → break → completed` (+ `paused`, `aborted`, `daily_limit_reached`). Tempo derivado de timestamps no servidor (front só exibe). Regras: limite 400 min ativos/dia; 1 sessão viva por usuário; pular pausa (ciclo < 100) força o próximo (25→50→100); ciclo de 100 não pula; restore só se heartbeat < 30min (senão cron aborta). Widget flutuante global; pausa obrigatória vira modal "VÁ DESCANSAR".

---

## Crons (registrados no boot, `unref`)

- 5min: aborta sessões Pomodoro mortas (heartbeat > 30min).
- 1min: detector de atraso (`available`/`in_progress` vencidas → `overdue` + notifica).
- 5min: tick de relatórios por e-mail (período anterior fechado, idempotente via `pm_report_jobs`, fuso America/Sao_Paulo).

---

## Permissões

Módulos: `tarefas_gerenciamento`, `pomodoro_gerenciamento`, `relatorios_tarefas_gerenciamento` (este só admin/superadmin/manager). Gate backend via `requireModulePermission(moduleKey, level)`. Relatórios respeitam **escopo de equipe do manager** (assignados via `task_assignments_history` OU projetos onde é manager; admin vê tudo).

---

## Notificações

`notification-service.notify` = 3-way (sino + push + e-mail opt-in), respeitando `notification_preferences`. Tipos `pm_*` em `Database.NOTIFICATION_DEFAULTS.impgeo` (push on, email opt-in). Textos pt-BR em `notification-strings.js`.

---

## Dívidas conscientes

Ver `TECH-DEBT.md` (seção "Módulo PM"): `projects.client` legado mantido, `terracontrol.client_id` nullable (correto), vínculo transação→projeto sem UI dedicada, export só XLSX, testes local-only.

---

## Como rodar os testes

```bash
npm test --prefix server          # 61 testes Vitest (regras críticas)
npm test --prefix server -- --coverage   # cobertura (requer @vitest/coverage-v8)
```
