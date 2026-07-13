---
id: 6
slug: sync-points
titulo: Consistência dos 3 pontos de sincronização (manifest ↔ catálogo ↔ subsystems)
status_alya: falta
categoria: infra
portabilidade: replicar
depends_on: [1]                # precisa do vitest do #1 (o teste é a entrega principal)
migration_next: null          # #6 não tem migration
impgeo_commits:
  - 35417fd   # modules-catalog.js + modules-consistency.test.js + boot-warn
impgeo_files:
  - server/modules-catalog.js
  - server/database-pg.js                                   # extraiu o catálogo + boot-warn
  - server/services/pm/__tests__/modules-consistency.test.js
  - src/subsistemas/manifest.ts                              # a outra ponta comparada (não editada)
alya_files_novos:
  - server/modules-catalog.js
  - server/services/pm/__tests__/modules-consistency.test.js   # só roda com o vitest do #1
alya_files_editados:
  - server/database-pg.js       # boot-warn (catálogo ↔ subsystems); opcional: seed via catálogo
  # manifest.ts NÃO é editado — é a fonte da verdade do front, só lido pelo teste
---

# #6 · Consistência dos 3 pontos de sincronização

## 1. Objetivo
O sistema mantém a mesma verdade em **três lugares** que precisam concordar:
1. **manifest TS** (`src/subsistemas/manifest.ts` → `SUBSYSTEMS[].moduleKeys`) — o front usa pra montar o nav e detectar o subsistema por subdomínio.
2. **catálogo de módulos** no backend — o seed dos módulos-padrão (`modules`).
3. **tabela `subsystems`** — as chaves de subsistema válidas.

Quando divergem, o sintoma é silencioso e chato: **módulo some do menu** ou **vai pro subsistema errado**. A melhoria adiciona uma **rede de segurança** (não um refactor de fonte única):
- **Extrai o catálogo pra um módulo importável** (`server/modules-catalog.js`) — pode ser lido por um teste sem instanciar a classe `Database` (sem tocar no banco).
- **Teste de consistência no CI** (`modules-consistency.test.js`) — importa o manifest TS **e** o catálogo e **reprova** se divergirem (bidirecional, por subsistema, nomeando o módulo).
- **Boot-warn** no `database-pg.js` — no boot, só **avisa** (não trava) se o catálogo referenciar um subsistema ausente na tabela `subsystems`.

## 2. Referência no IMPGEO (fonte da verdade)
Leia o diff — **não** reescreva de memória:
```
git -C /Users/fernandocarvalho/impgeo show 35417fd   # cria modules-catalog.js + o teste + o boot-warn
```
O commit faz 3 coisas: (a) move o array literal de dentro de `getDefaultModulesCatalog()` pra `server/modules-catalog.js` exportando `MODULES_CATALOG` (o método passa a só `return MODULES_CATALOG`); (b) cria o teste que compara `SUBSYSTEMS` (manifest) ↔ `MODULES_CATALOG` via esbuild do vitest; (c) adiciona um `console.warn` no setup do `Database` conferindo catálogo ↔ tabela `subsystems`.

Copiar **~verbatim** (agnóstico de negócio): a **estrutura** do `modules-catalog.js` (o array + `catalogModuleKeysBySubsystem()` + `module.exports`) e o **teste inteiro** (`modules-consistency.test.js`). Adaptar: o **conteúdo** do catálogo (moduleKeys/subsistemas do Alya, não os do IMPGEO — ver §5) e o **ponto de enxerto** do boot-warn (o Alya não tem `getDefaultModulesCatalog()` — ver §3).

## 3. Pré-condições no Alya (rodar ANTES — se falhar, parar)
```bash
cd /Users/fernandocarvalho/alya/server
# (a) NÃO existe getDefaultModulesCatalog() no Alya (confirmado — a extração é "criar", não "mover")
grep -c "getDefaultModulesCatalog" database-pg.js          # esperado: 0
# (b) o seed de módulos hoje é o array `mods` bare [name,key,icon], sem subsystemKey
grep -n "const mods = \[" database-pg.js                    # ~linha 313
# (c) modules-catalog.js NÃO deve existir ainda
ls modules-catalog.js 2>/dev/null && echo "JÁ EXISTE — reavaliar" || echo "ok, ausente"
# (d) a tabela subsystems existe (migration 018) e o manifest tem os 5 subsistemas
grep -n "FROM subsystems" database-pg.js | head -1
grep -c "key: '" ../src/subsistemas/manifest.ts            # 5 subsistemas
# (e) esbuild presente? (o teste transpila manifest.ts) — precisa pro import TS no vitest
ls ../node_modules/.bin/esbuild && echo "esbuild ok"
```
> **Confirmado na inspeção (2026-07-13):** o Alya **NÃO tem** `getDefaultModulesCatalog()`.
> O catálogo do Alya está **espalhado**: o seed inicial é um array `mods` mínimo
> (`[name, key, icon]`, **sem** `subsystem_key`/`sortOrder`/`route`/`description`) em
> `database-pg.js:313`; o `subsystem_key` e os módulos que faltam entram depois, via
> **migrations** (018 subsistemas + placeholders; 025 bling; 035 PM-modules-catalog:
> services/tarefas/pomodoro/relatorios_tarefas; 038 remove products do gerenciamento;
> 039 realoca products → especial). Ou seja: **a verdade pós-migrations = o manifest**,
> mas não há um objeto único no código que a represente. `modules-catalog.js` ausente.
> `esbuild` presente (o teste consegue importar `manifest.ts`).
>
> ⚠️ **Consequência-chave:** no Alya a "extração" é na verdade **autoria**. Você
> escreve `modules-catalog.js` do zero como o **catálogo canônico completo** (espelho
> do estado pós-migrations = o manifest), não copia um método existente. Isso torna o
> #6 **mais valioso** aqui (o Alya não tinha catálogo canônico em código nenhum).

## 4. Passo a passo
> Tudo é **um grupo só** (mergeável junto), mas o teste (passo 2) só roda verde se o **#1** já
> tiver posto o vitest. Se o #1 ainda não foi feito: escrever os 3 arquivos, validar por
> `node -c` + boot, e ligar o teste no CI junto do #1.

1. **Criar `server/modules-catalog.js`** — `MODULES_CATALOG` = array canônico com o shape rico do IMPGEO (`{ moduleKey, moduleName, iconName, routePath, isSystem, description, subsystemKey, sortOrder }`), mas com **as chaves do Alya** (§5). Exportar também `catalogModuleKeysBySubsystem()` e `module.exports = { MODULES_CATALOG, catalogModuleKeysBySubsystem }`. Reproduzir o cabeçalho-comentário de sincronização (aponta pros 3 pontos + o teste + o boot-warn). `sortOrder` é ordem **dentro** do subsistema.
2. **Criar `server/services/pm/__tests__/modules-consistency.test.js`** — copiar **verbatim** do IMPGEO. Ele importa `SUBSYSTEMS` de `../../../../src/subsistemas/manifest` (o esbuild do vitest transpila o TS) e `MODULES_CATALOG` de `../../../modules-catalog`, e checa: (a) chaves de subsistema batem bidirecional; (b) por subsistema, `moduleKeys` do manifest == do catálogo (mensagem nomeia o módulo divergente); (c) todo moduleKey do manifest existe no catálogo e vice-versa; (d) sem moduleKey duplicado; (e) `sortOrder` único por subsistema; (f) todo módulo tem `moduleKey`/`subsystemKey` não-vazios. **Conferir o caminho relativo** `../../../../src/subsistemas/manifest` a partir de `server/services/pm/__tests__/` (4 níveis até a raiz — mesmo layout do IMPGEO).
3. **`database-pg.js` — boot-warn** — copiar o bloco do IMPGEO pra **dentro do setup** (o método que roda o seed de `mods`, ~linha 313, depois do ensure de módulos): `SELECT subsystem_key FROM subsystems`, montar `Set(knownSubs)`, comparar com os `subsystemKey` do `MODULES_CATALOG`; se faltar algum → `console.warn('[modules] ⚠️  subsistema(s) do catálogo ausentes na tabela subsystems: …')`. Envolver em `try/catch` vazio (se `subsystems` não existir — migration 018 não aplicada — ignora). `require('./modules-catalog')` no topo do arquivo.
4. **(Opcional, recomendado) alinhar o seed ao catálogo** — hoje o `mods` bare (14 módulos, sem `subsystem_key`) diverge do catálogo. O mínimo do #6 é **só** o boot-warn + teste (não precisa mexer no seed). Se quiser fechar o loop de verdade, trocar o loop do `mods` por um `for (const m of MODULES_CATALOG)` que insere `name/key/icon/description/route/is_system/sort_order/subsystem_key` — mas isso só afeta **bancos novos** (o seed só roda com `modules` vazio) e precisa bater com o que as migrations 018/035/039 produziram. **Decisão:** manter o seed como está (o boot-warn + teste já são a rede de segurança); anotar no `port-state.json` se ficar pra depois.

## 5. Deltas de adaptação (Alya)
- **NÃO há `getDefaultModulesCatalog()`** → o `modules-catalog.js` é **escrito do zero** (autoria), não extraído. O `database-pg.js` **não** ganha um `return MODULES_CATALOG` (não existe o método); ganha só o `require` + o boot-warn.
- **Conteúdo do catálogo = as 5 chaves do Alya + moduleKeys do manifest** (`_DELTAS-ALYA.md §4`):
  - `admin`: `admin`, `activeSessions`, `anomalies`, `securityAlerts`  *(camelCase no Alya — não `sessions`/`security_alerts`)*
  - `gestao`: `roadmap`, `documentacao`, `faq`
  - `financeiro`: `dashboard`, `transactions`, `reports`, `metas`, `dre`, `projecao`  *(sem sufixo `_financeiro` — difere do IMPGEO)*
  - `gerenciamento`: `dashboard_gerenciamento`, `metas_gerenciamento`, `projecao_gerenciamento`, `relatorios_gerenciamento`, `projects`, `services`, `clients`, `tarefas_gerenciamento`, `pomodoro_gerenciamento`, `relatorios_tarefas_gerenciamento`
  - `especial`: `nuvemshop`, `bling`, `products`
- **SEM TerraControl** (`_DELTAS-ALYA.md §3`): o catálogo do IMPGEO tem `terracontrol` em `especial` — **remover**. No Alya `especial` = nuvemshop/bling/products.
- **`products` está em `especial`, não em `gerenciamento`** — a migration 018 pôs products/clients em gerenciamento, mas 038 removeu products do gerenciamento e 039 realocou pra especial. **A verdade é o manifest** (`especial`). Se o catálogo puser products no lugar errado, o próprio teste do #6 reprova (é o objetivo).
- **Depende do #1** (vitest não configurado — `_DELTAS-ALYA.md §8`). Sem o #1, o teste fica escrito mas não roda; ligar junto.
- **Sem migration** (#6 não toca schema — `migration_next: null`).
- Globais: [`_DELTAS-ALYA.md`](_DELTAS-ALYA.md) (§3 sem-TC, §4 subsistemas, §5 layout, §8 testes).

## 6. Pegadinhas (aprendidas no IMPGEO)
- **O teste importa TS de dentro do backend** — só funciona porque o vitest usa esbuild pra transpilar `manifest.ts`. Confirmar `esbuild` presente (§3e) e o `manifest.ts` **self-contained** o bastante pra importar `SUBSYSTEMS` sem puxar o mundo do front. ⚠️ **No Alya o `manifest.ts` importa `@/utils/permissions`** (`listAccessibleModuleKeys`, `isSuperadmin`) no fim do arquivo — o vitest precisa resolver o alias `@/`. Se o esbuild/vitest do #1 não resolver `@/`, o import do manifest quebra o teste. **Mitigação:** configurar o alias no `vitest.config` (herdado do #1) **ou** o teste importar direto o arquivo e confiar que o esbuild resolve; validar rodando. (No IMPGEO o manifest não tinha esse import de alias — é um delta real do Alya.)
- **Boot-warn só avisa, não trava** — é `console.warn` + `try/catch` vazio. Nunca lançar: o boot não pode morrer por causa de drift de menu.
- **A prova negativa importa** — depois de escrever, renomear 1 moduleKey no catálogo e rodar o teste: tem que **falhar** apontando o módulo divergente. Se passar mesmo com drift, o teste está inerte (caminho de import errado, `manifest` não carregou, etc.).
- **`sortOrder` único por subsistema** (não global) — o Alya tem `dashboard_gerenciamento` com `sortOrder` que não colide com `dashboard` do financeiro porque são subsistemas diferentes. Não zerar todos.
- **Não editar o `manifest.ts`** — ele é a fonte da verdade do front; o teste **se ajusta a ele**, não o contrário. Se manifest e catálogo divergirem, corrige o **catálogo** (a menos que o manifest esteja de fato errado).

## 7. Verificação (portão — só seguir se passar)
```bash
cd /Users/fernandocarvalho/alya/server
node -c modules-catalog.js
node -c database-pg.js
# boot sobe sem erro e, se subsystems ⊃ catálogo, sem warn:
node server.js &   # observar ausência de "[modules] ⚠️"; Ctrl-C depois
# se o #1 já foi feito (vitest configurado):
cd /Users/fernandocarvalho/alya
npm test 2>&1 | grep -E "modules-consistency|manifest ↔ catálogo|Tests"   # suíte verde
# prova negativa (obrigatória): renomear 1 moduleKey no catálogo → o teste FALHA apontando o módulo:
#   ex.: trocar 'clients' por 'clientsX' em modules-catalog.js, rodar npm test → deve reprovar; reverter.
```
Sanidade do catálogo (o próprio teste cobre, mas dá pra olhar): 5 subsistemas, sem moduleKey duplicado, `especial` sem `terracontrol`, `products` em `especial`.

## 8. Rollout (Alya)
Puro código, **sem migration** e **sem efeito em runtime de prod** (o catálogo novo só é lido pelo teste e pelo boot-warn; o seed de `mods` só roda em banco vazio). `git pull` no `/home/deploy/alya` → build → `pm2 restart alya-api`. Smoke: subir e confirmar que o log **não** tem `[modules] ⚠️` (se tiver, um subsistema do catálogo falta na tabela `subsystems` — investigar antes de seguir). Reversível por `git revert` (nada persistente muda). Ver `_DELTAS-ALYA.md §1` p/ nomes exatos de processo/caminho.
