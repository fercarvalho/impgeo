# _DELTAS-ALYA — constantes de adaptação IMPGEO → Alya

> **DRY.** Toda ficha do port aponta pra cá em vez de repetir. Se algo aqui muda,
> muda num lugar só. Estas são as diferenças **estruturais** entre os dois repos
> (mesma stack, ~90% idênticos) que afetam **qualquer** melhoria portada.
>
> Repos locais assumidos: IMPGEO em `/Users/fernandocarvalho/impgeo`, Alya em
> `/Users/fernandocarvalho/alya`. O agente precisa dos **dois** para `git show`
> os commits de referência.

---

## 1. Ambiente / deploy
| | IMPGEO | **Alya** |
|---|---|---|
| Banco | `impgeo` | **`alya`** |
| Deploy (VPS) | `/var/www/impgeo` | **`/home/deploy/alya`** |
| Processo PM2 | `impgeo-api` | **`alya-api`** *(confirmar em `server/ecosystem.config.js`)* |
| Comando de deploy | `deploy-impgeo` | *(confirmar — provável `git pull` + build + `pm2 restart`)* |
| Conexão DB local | `$DATABASE_URL_IMPGEO` | `DB_*` do `server/.env` (`DB_NAME=alya`) |
| Backups | `backups/` na raiz | `backups/` na raiz (idem) |

## 2. Migrations (diferença crítica)
- **Nome COM espaço:** Alya usa `NNN - NOME.sql` (ex.: `042 - PAGINACAO.sql`), IMPGEO usa `NNN-NOME.sql`. Rollback: `NNN - NOME-rollback.sql`.
- **Próximo número no Alya = `042`** (máx. atual = 041). *(Reconferir com `ls server/migrations` antes de criar.)*
- ⚠️ **Numeração é sequencial e global — `042` é de quem chegar primeiro.** Três itens que criam migration (#11, #8, #10·14) trazem `042` no frontmatter como "próximo disponível na época". Ao implementar em ordem (00-MAPA: #11 → #8 → … → #10·14), **cada um pega o próximo número livre** (#11=042, #8=043, #10·14=044, etc.). **Sempre rodar `ls server/migrations | tail` antes de criar** e usar o número real — não confie no `042` literal da ficha.
- **Runner:** Alya tem `server/run-migrations.js` com scripts `migrate:up` / `migrate:status` / `migrate:baseline`. **NÃO** existe `db:migrate:*` nem `server/migrations/runner.js`. Regex do runner: `^(\d+)\s*-\s*(.+)\.sql$` (entende o espaço).
- ⚠️ **Não** copiar o `runner.js` do IMPGEO verbatim: a regex `^\d{3}-` dele **não casaria** os nomes-com-espaço do Alya. Ver ficha `02-runner-migrations.md` (delta).

## 3. SEM TerraControl (descartar tudo)
Alya **não tem** o subsistema TerraControl. O 5º subsistema é `especial` (Nuvemshop/Bling/Products). Ao portar qualquer item, **descartar toda referência a**:
- Routers: `routes/terracontrol.js`, `routes/tc-auth.js`, `routes/tc-users.js`, `routes/asaas.js`, `upload-car`.
- Domínios do data-layer: `db/terracontrol.js`, `db/budget.js`, `db/push-prefs.js` (a parte `tc`), tabelas `tc_*`, `TC_USER_PUBLIC_FIELDS`, orçamentos/AbacatePay/PIX.
- Auth: contexto `TcAuth`, cookies `.terracontrol.*`.

Se um passo do IMPGEO só existe por causa do TC → **pular**, anotando no `port-state.json`.

## 4. Subsistemas & manifest
- Manifest: `src/subsistemas/manifest.ts` (mesmo caminho).
- Subsistemas do Alya: **`admin` · `gestao` · `financeiro` · `gerenciamento` (PM) · `especial`**.
- moduleKeys por subsistema (do manifest):
  - `admin`: admin, activeSessions, anomalies, securityAlerts
  - `gestao`: roadmap, documentacao, faq
  - `financeiro`: dashboard, transactions, reports, metas, dre, projecao
  - `gerenciamento`: (tarefas, pomodoro, relatórios… — o PM)
  - `especial`: nuvemshop, bling, products
- Os **3 pontos de sincronização** (ver ficha #6) miram este manifest + `getDefaultModulesCatalog()` do `database-pg.js` do Alya + tabela `subsystems`.

## 5. Layout de código (onde as coisas moram no Alya)
- **`server/utils/`** existe (audit, session-manager, refresh-tokens, encryption…). É o lar natural de helpers novos → `utils/timezone.js` (#13). *(No IMPGEO alguns helpers foram pra `server/utils/` também; mesmo padrão.)*
- **`server/permissions/`**: `defaults.js` + `index.js` (fonte da verdade de permissões — mesmo papel do IMPGEO).
- **`server/services/pm/`**: base do PM presente (state-machine, review-workflow, goals-service, task-service, cost-service, dashboard-service, etc.). É onde entram os services novos das melhorias PM.
- **`server/server.js` NÃO modularizado** (8415 linhas). ⚠️ Consequência: melhorias que no IMPGEO tocam `routes/pm.js` (pós-#3) **no Alya tocam `server.js`** — a menos que o #3 já tenha sido feito no Alya. Sempre checar: `ls server/routes/` (hoje só `bling.js`, `nuvemshop.js`).

## 6. Auth / cookies
- Cookies via `resolveCookieDomain(req)` + override `COOKIE_DOMAIN`. Domínios: `.alya.local` (dev) / `.alya.sistemas.viverdepj.com.br` (prod).
- Cookies **já são `httpOnly`** por default (`getAuthCookieOptions`). Impersonation httpOnly (#9) **já feito** (Fase 1.9) — ver `00-MAPA.md`.

## 7. Frontend (identidade visual)
- Paleta do Alya = **amber/orange** (marca). IMPGEO = azul/índigo. Ao portar componentes com UI (#7 admin, #8 aba, #11 módulo+badge, #12 paginação), **trocar as cores** para a paleta amber/orange do Alya. Reusar os componentes-padrão do Alya (Modal, etc.) quando existirem.
- Caminho dos módulos PM: `src/subsistemas/gerenciamento/modulos/` (mesmo do IMPGEO).

## 8. Testes
- Alya **não tem** vitest configurado (0 testes unitários; só `server/test/qa-pm-smoke.js`, um script). Ver ficha #1 — é pré-requisito das demais (a rede de segurança). Antes do #1, a verificação de cada ficha se apoia em `node -c` + boot + smoke manual.
