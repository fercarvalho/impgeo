---
id: 1
slug: testes-ci
titulo: Testes versionados (vitest) + CI de backend
status_alya: falta
categoria: infra
portabilidade: replicar
depends_on: []                 # é a fundação — nada depende dela antes dela
migration_next: null           # #1 não tem migration
impgeo_commits:
  - e6fffe9   # versiona 9 testes PM + vitest.config + CI + .gitignore
  - 45ef59c   # cobre negociação de prazo (due-date requests)
  - 90b0efe   # cobre delegação e reabertura (task-workflow)
impgeo_files:
  - server/vitest.config.mjs
  - server/package.json                 # scripts test / test:watch + devDeps vitest
  - .gitignore                          # exceções pra versionar __tests__ do PM
  - .github/workflows/ci.yml            # job backend-tests (npm ci + npm test)
  - server/services/pm/__tests__/state-machine.test.js
  - server/services/pm/__tests__/review-workflow.test.js
  - server/services/pm/__tests__/task-service.test.js
  - server/services/pm/__tests__/due-date-negotiation.test.js
  - server/services/pm/__tests__/task-workflow.test.js
  - server/routes/__tests__/route-ordering.test.js     # guard (relevante p/ #9/#3)
  - server/routes/__tests__/router-imports.test.js     # guard (relevante p/ #9/#3)
alya_files_novos:
  - server/vitest.config.mjs
  - .github/workflows/ci.yml            # (ou job novo num workflow existente)
  - server/services/pm/__tests__/*.test.js   # subconjunto que casa com os services do Alya
alya_files_editados:
  - server/package.json                 # scripts test/test:watch + devDeps
  - .gitignore                          # exceções pra versionar os testes
---

# #1 · Testes versionados (vitest) + CI de backend

## 1. Objetivo
O Alya **não tem** rede de testes: `server/package.json` sem script `test`, zero
arquivos `.test.js`, nenhum vitest. Só existe um smoke manual
(`server/test/qa-pm-smoke.js`). Esta ficha planta a **fundação**: vitest isolado no
backend, os testes de unidade dos services do PM **versionados** (o `.gitignore` do
Alya hoje ignora `**/__tests__/` e `*.test.*`), scripts `test`/`test:watch` e um job
de CI que roda em cada push/PR. **Pré-requisito das demais melhorias** — a seção
"7. Verificação" de quase toda ficha se apoia em `npm test`; sem o #1, cai pra
`node -c` + boot + smoke manual. Fazer este **primeiro**.

## 2. Referência no IMPGEO (fonte da verdade)
Leia os diffs — **não** reescreva de memória:
```
git -C /Users/fernandocarvalho/impgeo show e6fffe9   # vitest.config + CI + .gitignore + 9 testes iniciais + package.json/lock
git -C /Users/fernandocarvalho/impgeo show 45ef59c   # due-date-negotiation.test.js (guards de estado/autorização)
git -C /Users/fernandocarvalho/impgeo show 90b0efe   # task-workflow.test.js (delegação, reabertura)
```
Peças agnósticas (copiar **~verbatim**): `server/vitest.config.mjs`, o job de CI
(`.github/workflows/ci.yml`), o bloco de exceções do `.gitignore`. Os **testes**
são específicos das assinaturas dos services — copiar e **reconferir cada import/mock**
contra o service correspondente do Alya (ver §5). Os services-alvo já existem no Alya:
```
git -C /Users/fernandocarvalho/impgeo show e6fffe9:server/vitest.config.mjs
git -C /Users/fernandocarvalho/impgeo show e6fffe9:.github/workflows/ci.yml
git -C /Users/fernandocarvalho/impgeo show e6fffe9 -- .gitignore
```

## 3. Pré-condições no Alya (rodar ANTES — se falhar, parar)
```bash
cd /Users/fernandocarvalho/alya
# (a) NÃO deve haver vitest configurado nem script "test"
grep -c '"test"' server/package.json                 # esperado: 0
ls server/vitest.config.mjs 2>/dev/null && echo "JÁ EXISTE — reavaliar" || echo "ok, ausente"
# (b) zero testes hoje (só o smoke manual)
find server -name "*.test.js" -not -path "*/node_modules/*" | wc -l   # esperado: 0
ls server/test/qa-pm-smoke.js && echo "smoke existe (será complementado, não removido)"
# (c) os services-alvo existem
ls server/services/pm/state-machine.js server/services/pm/review-workflow.js server/services/pm/task-service.js
# (d) o .gitignore realmente barra os testes (precisará das exceções)
grep -nE "__tests__|\*\.test\.|coverage" .gitignore
# (e) CI atual só tem segurança (falta o de testes)
ls .github/workflows/                                 # esperado: snyk / sonarcloud / zap
```
> **Confirmado na inspeção (2026-07-13):** `server/package.json` sem `test`; **0**
> arquivos `.test.js`; `server/test/qa-pm-smoke.js` presente; os 3 services-alvo
> (`state-machine.js`, `review-workflow.js`, `task-service.js`) existem. `.gitignore`
> ignora `**/__tests__/`, `**/*.test.*` e já tem `coverage/` (linha 84 — não
> reduplicar). Workflows existentes: `snyk-security.yml`, `sonarcloud.yml`,
> `zap-scan.yml` (nenhum roda testes). Há `server/package-lock.json` (CI usa `npm ci`).

## 4. Passo a passo
**Grupo 1 — Infra de teste (vitest sobe e roda vazio):**
1. `server/package.json` — adicionar devDeps `vitest` + `@vitest/coverage-v8` (mesmas ranges do IMPGEO: `^4.x`) e os scripts `"test": "vitest run --config vitest.config.mjs"` e `"test:watch": "vitest --config vitest.config.mjs"`. Rodar `npm install` (regenera o `package-lock.json` — versionar).
2. Criar `server/vitest.config.mjs` — copiar **verbatim** do IMPGEO: `root: __dirname`, `environment: 'node'`, `include: ['**/__tests__/**/*.test.js','**/*.test.js']`, `globals: false`. O comentário do arquivo é importante: config **isolada** do backend, **não** herda o `vite.config.ts` do root (plugins React / `/src`) — testa só os services CJS do servidor.
3. `.gitignore` — adicionar as exceções (ver diff de `e6fffe9`): **primeiro** re-incluir o diretório (desfaz `**/__tests__/`) e **depois** o conteúdo (desfaz `**/*.test.*`):
   ```gitignore
   !/server/services/pm/__tests__/
   !/server/services/pm/__tests__/**
   ```
   ⚠️ `coverage/` **já existe** no `.gitignore` do Alya (linha 84) — **não** reduplicar. Se for versionar os guards de rota (passo 6), acrescentar também as exceções pra `server/routes/__tests__/`.

**Grupo 2 — Portar os testes dos services (a rede real):**
4. Copiar do IMPGEO o subconjunto de `server/services/pm/__tests__/*.test.js` cujos services **existem** no Alya, começando pelos críticos: `state-machine.test.js`, `review-workflow.test.js`, `task-service.test.js`, e os de fluxo `due-date-negotiation.test.js` (`45ef59c`) e `task-workflow.test.js` (`90b0efe`). **Reconferir cada `import`/mock** contra a assinatura local (ver §5 — nem todo teste do IMPGEO tem service-par no Alya).
5. Rodar `npm test` e ajustar até verde. Testes cujo service **não existe** no Alya → **não portar** (anotar no `port-state.json`).

**Grupo 3 — Guards de rota (opcional, mas barato e útil pro #9/#3):**
6. Portar `server/routes/__tests__/route-ordering.test.js` e `router-imports.test.js` do IMPGEO. Eles pegam bugs de ordenação/registro de rotas — **diretamente relevantes** pro #9 (impersonation/rotas) e pro #3 (modularização do `server.js`). No Alya `routes/` só tem `bling.js`/`nuvemshop.js` hoje; o guard vale mais **depois** do #3, mas versionar já cria o hábito. Se portar, incluir as exceções de `.gitignore` correspondentes.

**Grupo 4 — CI:**
7. Adicionar o job de testes: criar `.github/workflows/ci.yml` (copiar de `e6fffe9`) **ou** um `job` novo num workflow existente. Estrutura do IMPGEO: `on: [push (main), pull_request]`; job `backend-tests` com `working-directory: server`, `setup-node@v4` (Node **20**, `cache: npm`, `cache-dependency-path: server/package-lock.json`), `npm ci`, `npm test`. Preferir **arquivo novo** (`ci.yml`) — os workflows atuais do Alya são de segurança e têm gatilhos próprios; não misturar.

## 5. Deltas de adaptação (Alya)
- **Só portar testes com service-par.** Services do PM no Alya: `cost-service, dashboard-service, dependency-resolver, goals-service, help-service, notification-service, notification-strings, pomodoro-service, project-finalizer, project-service, report-service, review-workflow, state-machine, task-service, template-service, trigger-runner`. O IMPGEO tem testes extras (ex.: `goals-batch`, `audit-service`, `approvals-service`, `reconcile-service`, `task-authz`, `modules-consistency`, `notification-defaults`) cujos services **não existem** no Alya → pular esses. Focar nos que casam.
- **`.gitignore`:** o Alya já ignora `coverage/` — só faltam as **exceções** dos `__tests__`. Não reduplicar `coverage/`.
- **CI novo, isolado dos de segurança** (snyk/sonar/zap têm gatilho próprio).
- **Sem migration** (#1 não toca schema).
- Globais: [`_DELTAS-ALYA.md`](_DELTAS-ALYA.md) (esp. §5 layout de código, §8 testes).

## 6. Pegadinhas (aprendidas no IMPGEO)
- **Config isolada é o pulo do gato.** Sem `vitest.config.mjs` próprio no `server/`, o vitest herda o `vite.config.ts` do root (plugins React, alias pra `/src`) e explode ao carregar os services CJS. `root: __dirname` + `environment: 'node'` resolve.
- **Exceção de `.gitignore` é em DUAS linhas.** `!/…/__tests__/` sozinho não basta: o `**/*.test.*` continua barrando os arquivos **dentro** do diretório. Precisa do `!/…/__tests__/**` também — na ordem certa (diretório antes do conteúdo).
- **Testes são espelho da assinatura.** Copiar o `.test.js` sem reconferir o `import`/mock contra o service local gera falha ou (pior) falso-verde. Rodar `npm test` a cada teste portado, não em lote.
- **`npm ci` no CI exige `package-lock.json` versionado e coerente** com o `package.json`. Depois de adicionar as devDeps, commitar o lock regenerado — senão o `npm ci` do CI quebra.
- **Node 20 no CI** (o IMPGEO fixa isso). Conferir que os services do Alya rodam nessa versão.
- **Não remover o `qa-pm-smoke.js`.** Ele é smoke de integração (outro nível); os testes unitários do vitest **complementam**, não substituem.

## 7. Verificação (portão — só seguir se passar)
```bash
cd /Users/fernandocarvalho/alya/server
node -c vitest.config.mjs
npm test 2>&1 | grep -E "Test Files|Tests|passed|failed"   # tudo verde
# confirmar que os testes estão VERSIONADOS (não ignorados):
cd /Users/fernandocarvalho/alya
git check-ignore server/services/pm/__tests__/state-machine.test.js && echo "AINDA IGNORADO — exceção faltando" || echo "ok, versionado"
git status --porcelain server/services/pm/__tests__/   # devem aparecer como novos/rastreados
# CI: validar o YAML (sem push):
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('yaml ok')"
```
Após o primeiro push/PR: conferir que o job **backend-tests** aparece verde no GitHub Actions.

## 8. Rollout (Alya)
Mudança **só de dev-tooling** (testes + CI) — **não** vai pra runtime da VPS, **sem
migration**, **sem** `pm2 restart`. O deploy de produção ignora `devDependencies` e
os `__tests__`. Efeito prático: a partir do merge, todo push/PR roda a suíte no CI.
Reversível por `git revert` (nada de estado). Ver `_DELTAS-ALYA.md §1` p/ nomes de
processo/caminho caso precise (não se aplica aqui). **Fazer esta ficha primeiro** —
ela é a rede que as demais usam na sua própria verificação.
