# 15 — Plano AI-Friendly

> Tornar o impgeo utilizável por **navegadores de IA** (Atlas, Opera Neon, browser-use) **e** por **agentes programáticos** (Claude/MCP, Hermes), com **operação completa** (leitura + escrita) respeitando as permissões de cada papel.

Status: **planejamento** (nenhum código de produto tocado). Decisões base: ambas as frentes; operação completa; roadmap faseado.

> **Revisão 2 (2026-07-13)** — reescrito após reestudo completo do sistema. Desde a v1, o backend foi **modularizado** (15 routers + 14 db-modules), migrations foram de 044→**072**, e várias premissas mudaram. As correções de diagnóstico estão marcadas com **[Δ v1]**.

---

## Princípio norteador: uma única fonte de capacidade

Não construir duas implementações paralelas. O alvo:

```
                    ┌─────────────────────────────┐
  Navegador de IA → │  UI React (URLs reais + DOM  │ ┐
  (Atlas/Opera)     │  semântico/acessível)        │ │
                    └─────────────────────────────┘ │
                                                     ├─→  API REST v1 (contrato OpenAPI)
                    ┌─────────────────────────────┐ │         │
  Agente MCP/API  → │  MCP server (thin wrapper)  │ ┘         ↓
  (Claude/Hermes)   │  + chamada REST direta       │   requireModulePermission
                    └─────────────────────────────┘   (modelo de permissões ATUAL)
```

A **autorização é a mesma para humano e IA**: um token de agente é atrelado a um `user_id`/role e herda as permissões daquele papel via `requireModulePermission` (`server.js:909`) e `role_default_permissions`. "Operação completa respeitando permissões" se apoia no modelo granular que o PM já usa — **com duas ressalvas críticas** (ver Fase 0): o bypass admin/superadmin e a ausência de `actor_type`.

---

## Estado atual (diagnóstico revisado)

| Item | Estado | Impacto |
|------|--------|---------|
| Backend modularizado | ✅ **[Δ v1]** `server.js` 1.116 linhas (composition root) + **15 routers factory** em `server/routes/` + **14 db-modules** em `server/db/` (mixin `Object.assign`) | A "dívida do monólito" da v1 **não existe mais** — terreno pronto p/ OpenAPI |
| Runner de migrations | ✅ **[Δ v1]** `runner.js` + `schema_migrations` + `scripts/migrate.sh` (portão de deploy) | Migrations versionadas/idempotentes; migrations vão até **072** |
| Roteamento por URL (frontend) | ❌ 100% `activeTab` em state (`App.tsx:317`); subsistema por subdomínio; zero deep-linking | **Bloqueio nº1 p/ navegadores de IA** |
| OpenAPI/Swagger + `/api/v1` | ❌ inexistente; paths string-literal espalhados, sem registro central | Sem contrato p/ agentes (mas `zod` inline + `pageEnvelope()` reaproveitáveis) |
| Envelope de resposta | ⚠️ convenção `{success,data,error}` ad-hoc por handler; `pageEnvelope()` só p/ paginação | Padronizar antes de expor |
| Token de máquina (PAT/API key) | ❌ só cookie httpOnly + JWT sessão | Agente headless não autentica |
| 2FA / TOTP | ❌ **[Δ v1]** **não existe** — login single-factor (bcrypt) | v1 dizia "2FA a cada login"; premissa errada, corrigida |
| Auth stateful | ⚠️ JWT HS256 **24h** (login) / **15m** (refresh); refresh rotacionado e revogável; **access token não revogável** | PAT precisa ser stateful p/ revogar na hora |
| `actor_type` p/ auditar IA | ⚠️ **`pm_audit_v` TEM** (`system`/`abacatepay`/`tc`); **`audit_logs` de segurança NÃO tem** | Adicionar coluna p/ paridade |
| Bypass admin/superadmin | ⚠️ `requireModulePermission` (`server.js:912`) dá next() direto p/ admin/superadmin | Agente c/ role alto ganharia bypass total — **role dedicado** |
| Permissão granular por domínio | ⚠️ **só `routes/pm.js`** usa `requireModulePermission`; demais routers usam `requireAdmin`/`requireSuperAdmin` | "Operação completa respeitando permissões" fora do PM é grosseira |
| DOM semântico/acessível | ✅ **[Δ v1]** 919 `<button>` vs 8 `<div onClick>`; 879 `aria-*`; 157 `role` | Fase 4 encolhe muito — resta a nav principal sem `role="tab"`/`aria-current` |
| Paginação / DialogProvider | ✅ `usePaginatedList` + `Pagination.tsx`; `DialogProvider` (substitui `window.confirm`) | Base pronta p/ respostas determinísticas |

---

## Fases

Esforço relativo: **S** (dias) · **M** (1-2 semanas) · **L** (semanas).

### Fase 0 — Fundação de identidade e segurança de agente · **M** · _pré-requisito de tudo_
Dar a uma IA acesso de operação completa a dados sensíveis (clientes, REURB, **PIX**) é superfície de segurança nova. Vem primeiro.

- **Tabela `agent_tokens`** (migration nova, par `-rollback.sql`, aplicada pelo `runner.js`): `id, user_id FK, name, token_hash (sha256), scopes[], last_used_at, expires_at, revoked_at, created_at`. **Stateful e revogável** — diferente do JWT stateless (que não revoga access token).
- **Auth estendida**: `extractAccessToken` (`utils/token-extraction.js`) passa a reconhecer PAT (prefixo próprio, ex. `impat_`) e resolvê-lo no banco. `authenticateToken` (`server.js:580`) popula `req.user` a partir do token.
- **Role/claim dedicado `actor_type='agent'`** nas claims — **e `requireModulePermission` NÃO deve dar bypass a agente** mesmo que o user tenha role admin/superadmin. O teto de capacidade do agente é `scopes ∩ permissões do papel` (o mais restritivo vence). Isso fecha o risco de bypass herdado.
- **Escopos = `moduleKey:level`** (ex.: `projects:edit`, `transactions:view`), reusando o vocabulário de `modules-catalog.js` / `permissions/defaults.js`.
- **Auditoria de IA**: adicionar coluna `actor_type` a `audit_logs` (hoje inexistente; `pm_audit_v` já tem o padrão) + `token_id`. Toda ação de IA rastreável.
- **Rate limiting** por token. **Escrita financeira/PIX** (decisão Fernando, 2026-07-13): liberada **por escopo dedicado `finance:write`, sem confirmação por ação**. Consequência de design — o token vira a única barreira, então: (a) `finance:write` é **opt-in explícito**, nunca incluído por padrão ao emitir um PAT; (b) **revogação stateful obrigatória** (matar na hora); (c) toda escrita registrada com `actor_type` + `token_id`. Deletes seguem o mesmo modelo de escopo.
- `robots.txt` na raiz pública.

### Fase 1 — Contrato de API v1 + padronização · **M** _(era L; encolheu)_
**[Δ v1]** A modularização já entregou 15 routers por domínio (`pm`, `financeiro`, `transactions`, `terracontrol`, `admin`, …) — a granularidade que a v1 propunha atacar. Não há mais extração de routers a fazer.
- **Envelope consistente**: generalizar `{success, data, error:{code,message}}` + `pagination` (já existe `pageEnvelope`) com códigos de erro estáveis.
- **OpenAPI 3.1**: como não há registro central, duas vias — (a) introspecção de `app._router` p/ paths+métodos + anotação de schemas; (b) reaproveitar os `zod` inline via `zod-to-openapi`. Decidir uma.
- **Namespace `/api/v1`**: alias versionado sobre os routers atuais.
- **Fechar o gap de permissão por domínio**: para "operação completa respeitando permissões", os routers fora do PM (financeiro, transactions, terracontrol) precisam de `requireModulePermission` em vez de só `requireAdmin` — senão o agente ou tem tudo (admin) ou nada.
- Paginação/filtros já consistentes (`usePaginatedList`); `Idempotency-Key` em escritas.

### Fase 2 — MCP server · **L** · _maior alavancagem p/ Claude/Hermes_
- Servidor MCP (Node + `@modelcontextprotocol/sdk`) como **thin wrapper sobre a API v1**, deploy junto ao backend (PM2 companion do `impgeo-api`).
- **Tools por domínio** com descrições ricas (incorporar o glossário REURB/GEO/PLAN/REG): `list_projects`, `get_project`, `create_task`, `assign_task`, `list_transactions`, etc. Reusar a auditoria `pm_audit_v` para tools de consulta de histórico.
- **Auth via PAT**; tools herdam escopos. Leitura primeiro, escrita com confirmação.
- **Portabilidade Alya** (decisão Fernando, 2026-07-13: **nascer portável**): tools organizadas por domínio, com o domínio TerraControl/PIX **isolado num módulo separado e opcional** — o núcleo (projetos, tarefas, clientes, transações, financeiro) não importa nada de TC, para o MCP e a `/api/v1` reaproveitarem no Alya (que poda TC) sem cirurgia.

### Fase 3 — Navegadores de IA: roteamento por URL · **L** · _o item mais pesado_
- Introduzir `react-router`. Mapear subsistema (subdomínio) + módulo + recurso: `/financeiro/transactions`, `/gerenciamento/projects/:id`, `/gerenciamento/tarefas?status=in_progress`.
- **Compat na migração**: rota → `setActiveTab` para não quebrar o fluxo; aposentar `activeTab`-as-truth gradualmente. O `key={subsystem.key}` que força remount (`App.tsx:305`) precisa conviver com a rota.
- Estado de filtros/abas em query params → a IA reproduz e compartilha estados.

### Fase 4 — Navegadores de IA: DOM semântico · **S** _(era M; encolheu)_
**[Δ v1]** O DOM já está forte (919 buttons, 8 div-onClick, 879 aria). Resta:
- Barra de módulos (`App.tsx:1197`): `role="tab"` + `aria-current`/`aria-selected` + `aria-label` no `<nav>`. Hoje o estado ativo é só visual — o agente não sabe por ARIA qual aba está ativa.
- Skip-link "pular para conteúdo"; `aria-live` nos toasts.
- Atributos estáveis `data-action`/`data-testid` em elementos-chave (servem p/ IA **e** testes E2E — que já existem via #1).

### Fase 5 — Auth amigável a agente + UI de gestão · **M**
- **TTL/sessão**: sem 2FA hoje, o atrito não é segundo fator, e sim o TTL de 24h/15m. Definir TTL explícito p/ PAT + refresh; "dispositivo confiável" p/ navegadores de IA.
- **Módulo novo "Tokens de API / Agentes"** (subsistema `admin`; segue o checklist de feature): criar/revogar PAT, ver escopos e `last_used`, limites. Reusar `DialogProvider` p/ confirmações.
- Política de confirmação para ações financeiras/destrutivas centralizada.
- Dashboard de uso por agente sobre `audit_logs` (com o novo `actor_type`).

### Fase 6 — Documentação para IA · **S**
- `llms.txt` na raiz: o que é o sistema, capacidades, links p/ OpenAPI + MCP.
- Docs navegáveis com exemplos de tools/prompts + glossário de domínio.

---

## Ordem sugerida de execução

1. **Fase 0** (segurança/identidade) — destrava tudo.
2. **Fase 1** (API v1/OpenAPI + fechar gap de permissão por domínio) — contrato que sustenta MCP e docs.
3. **Fase 2** (MCP) e **Fase 3** (router) em **paralelo** — uma serve agentes, outra navegadores.
4. **Fase 4** (DOM, curta) e **Fase 5** (auth/UI tokens).
5. **Fase 6** (docs).

**Fatia fina de validação** antes de escalar: PAT só-leitura (Fase 0 mínima) → 1 domínio do PM em `/api/v1` com envelope+OpenAPI → 1 tool MCP `list_projects`. Ponta-a-ponta em dias.

---

## Riscos / decisões em aberto

- **Bypass de role alto** — um agente atrelado a user admin/superadmin herdaria bypass total em `requireModulePermission` e `scopeCheck`. Mitigação: `actor_type='agent'` sem bypass + escopos como teto. **Não portar tokens de agente para roles admin sem isso.**
- **Segurança financeira** — ✅ **decidido**: escrita financeira/PIX **permitida por escopo `finance:write`, sem confirmação por ação**. Como o token é a única barreira, o escopo é opt-in explícito, o PAT é revogável na hora e toda escrita é auditada com `actor_type`. Risco residual assumido: um `finance:write` vazado opera até ser revogado — mitigado por TTL curto + auditoria + rate limit.
- **`audit_logs` sem `actor_type`** — sem a coluna nova, ações de IA ficam indistinguíveis de humanas nos logs de segurança.
- **Access token não revogável** — PAT deve ser stateful (checado no DB por request) p/ revogação imediata; não copiar o modelo stateless do JWT.
- **Portabilidade Alya** — ✅ **decidido: nascer portável**. TerraControl/PIX fica isolado num módulo opcional; o núcleo (projetos/tarefas/clientes/transações/financeiro) não importa TC, para reaproveitar no Alya. Fechar o gap de permissão granular por domínio (Fase 1) serve às duas pontas.
- **`xlsx` vulnerável / anexos em disco local** (TECH-DEBT) — expor import/export ou anexos a uma IA amplia a superfície dessas dívidas.

---

## Apêndice A — PoC prototipada e revertida (2026-07-13)

> **Status: nada disto está no código.** Em 2026-07-13 a fatia fina foi **prototipada, verificada ponta-a-ponta e depois revertida por completo** (`git reset --hard` + `down` da migration + remoção da dep) — a implementação **não havia sido autorizada**. Este apêndice preserva **o que foi aprendido** para quando a implementação for aprovada, evitando repetir os tropeços. Não descreve código existente.

### O que a fatia fina montou (design validado)

```
tool MCP list_projects ──HTTP──▶ GET /api/v1/projects ──▶ authenticateAgent (PAT)
                                                          └▶ requireScope('projects:view')  ← sem bypass admin
                                                             └▶ db.getAllProjects() ─▶ envelope {success,data,pagination}
```

| Peça | Arquivo (então) | Papel |
|------|-----------------|-------|
| Schema | migration `073-AGENT-TOKENS` (+rollback) | Tabela `agent_tokens` — PAT stateful, só hash sha256 persistido |
| Token | `server/utils/agent-tokens.js` | Prefixo `impat_`, geração/hash puros |
| DB | `server/db/agent-tokens.js` | Métodos no prototype (create/resolve-by-hash/touch/revoke) |
| API | `server/routes/api-v1.js` | `/api/v1` **isolada** do auth de sessão: `authenticateAgent` + `requireScope` + `/me` + `/projects` |
| CLI | `server/scripts/mint-agent-token.js` | Emissão de PAT |
| MCP | `server/mcp/impgeo-mcp.mjs` | MCP server stdio, tool `list_projects` sobre a API v1 |

### Resultado da validação (prova de que o desenho fecha)

- `GET /api/v1/projects` **sem token** → `401 missing_token`
- token com escopo errado (`tasks:view`) → **`403 insufficient_scope`** (autorização veio do **escopo**, não de bypass — o token era de um usuário role `user`)
- token com `projects:view` → **`200`** + `{success, data, pagination:{total:6, page:1/3}}`
- **MCP ponta-a-ponta**: `list_projects(limit=2)` retornou os projetos reais via a API v1
- Guard tests `server/routes/__tests__` (ordenação + imports): **18/18 verdes** — o router novo não regrediu a modularização

### Aprendizados de engenharia (a parte que importa reter)

1. **`users.id` é `VARCHAR`, não `INTEGER`** — a FK `agent_tokens.user_id` tem que ser `VARCHAR(255)`. A 1ª tentativa da migration falhou com `foreign key constraint cannot be implemented` justamente por assumir INTEGER.
2. **Isolar `/api/v1` do auth global**: o gate `app.use('/api', authenticateToken)` (server.js) intercepta tudo sob `/api`. Para a v1 ter auth própria por PAT, adicionar `/v1/` a `publicApiPrefixes` — aí o gate dá `next()` e o router aplica seu próprio `authenticateAgent` em `router.use(...)`. Isso mantém a PoC **aditiva**, sem tocar o pipeline de sessão de produção.
3. **MCP SDK (`@modelcontextprotocol/sdk`) é ESM** — o server MCP precisa ser `.mjs`. Usar a **API low-level** (`Server` + `setRequestHandler(ListToolsRequestSchema/CallToolRequestSchema)`) com os schemas do próprio SDK evita conflito com o `zod` v4 do backend (o alto-nível `registerTool` casaria melhor com zod v3).
4. **Escopo como teto, sem bypass admin** — `requireScope` NÃO replica o bypass admin/superadmin do `requireModulePermission`. Um PAT só faz o que o escopo permite, mesmo atrelado a um user admin. Validado.
5. **CLI de emissão**: `new Database()` dispara auto-heal de schema em background no construtor; encerrar o pool logo depois gera ruído `pool after end` → o script sai com `process.exit()`.

### Como reproduzir (quando aprovado)

Sequência que funcionou: criar migration `073` (FK `VARCHAR`) → `runner.js up` → `utils/agent-tokens.js` + `db/agent-tokens.js` (registrar no `Object.assign` de `database-pg.js`) → `routes/api-v1.js` + wire no `server.js` (`/v1/` em `publicApiPrefixes` + `app.use`) → `scripts/mint-agent-token.js` → `npm i @modelcontextprotocol/sdk` + `mcp/impgeo-mcp.mjs`. **Núcleo sem importar TerraControl** (portável Alya).
