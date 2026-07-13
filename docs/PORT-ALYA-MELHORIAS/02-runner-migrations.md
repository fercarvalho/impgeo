---
id: 2
slug: runner-migrations
titulo: Runner de migrations (idempotente + schema_migrations + down/drift)
status_alya: delta                 # o Alya JÁ TEM ~70% (server/run-migrations.js)
categoria: infra
portabilidade: delta               # NÃO substituir — completar o runner existente
depends_on: []
migration_next: null               # #2 não cria migration
impgeo_commits:
  - 0d0f51e   # runner idempotente + schema_migrations (up/status/baseline/down) + testes
impgeo_files:
  - server/migrations/runner.js
  - server/migrations/__tests__/runner.test.js
  - server/package.json                   # scripts db:migrate:status|up|baseline|down
  - server/vitest.config.mjs
alya_files_novos:
  - server/migrations/__tests__/run-migrations.test.js   # se #1 já feito (helpers puros)
alya_files_editados:
  - server/run-migrations.js              # ENRIQUECER (não recriar) — mantém a regex com-espaço
  - server/package.json                   # adicionar script migrate:down
---

# #2 · Runner de migrations (delta — completar o existente)

## 1. Objetivo
O Alya **já tem** um runner (`server/run-migrations.js`, ~70% do que o IMPGEO
tem): cria `schema_migrations(version, name, applied_at)`, entende os nomes
`NNN - NOME.sql` (com espaço), aplica pendentes em ordem numérica, tem
`--baseline` e `--status`, usa `ON CONFLICT`. **Não** é para substituir pelo
runner do IMPGEO — é para **completar** o que falta, copiando a *lógica* (não o
arquivo) dos deltas do commit-fonte:

1. **Comando `down <version>`** — os pares `NNN - NOME-rollback.sql` já existem
   no `migrations/`, mas não há runner que os aplique + remova a linha.
2. **Detecção de drift** — coluna `checksum` (sha256 do arquivo): gravar no `up`
   e comparar no `--status`, avisando quando um arquivo já aplicado mudou.
3. **`execution_ms`** (opcional) — quanto cada migration levou.
4. **Envelope transacional-fallback** — hoje o runner **assume** que toda
   migration traz seu próprio `BEGIN/COMMIT`; envelopar as que não trazem.

## 2. Referência no IMPGEO (fonte da verdade)
Leia o diff — é de onde sai a **lógica** a portar (helpers puros + comandos):
```
git -C /Users/fernandocarvalho/impgeo show 0d0f51e   # runner.js + testes + scripts
```
Arquivo canônico: `server/migrations/runner.js`. O que importa aqui:
- Helpers puros `checksum(sql)` (sha256 hex), `hasOwnTransaction(sql)`
  (`/\bBEGIN\s*;/i`), `rollbackFilenameFor(version, filenames)`.
- Comandos `up` (grava `checksum` + `execution_ms`; envelopa em `BEGIN/COMMIT`
  quando o SQL não tem transação própria), `status` (calcula `drift` comparando
  checksum do arquivo × gravado), `down(db, version)` (roda o `-rollback.sql` e
  faz `DELETE FROM schema_migrations WHERE version=$1`, tudo em transação).

> ⚠️ **Copiar a lógica, não o arquivo.** O `runner.js` do IMPGEO usa a regex
> `^(\d{3})-` (prefixo colado), que **NÃO** casa os nomes-com-espaço do Alya
> (`042 - PAGINACAO.sql`). O Alya já resolve isso com `^(\d+)\s*-\s*(.+)\.sql$`.
> Ver §6.

## 3. Pré-condições no Alya (rodar ANTES — se falhar, parar)
```bash
cd /Users/fernandocarvalho/alya/server
# (a) o runner existente está lá?
ls run-migrations.js
# (b) a tabela tem SÓ (version, name, applied_at)? (falta checksum/execution_ms)
grep -nE "schema_migrations|checksum|execution_ms|applied_at" run-migrations.js
# (c) existem pares -rollback.sql para o down operar?  → esperado: vários
ls migrations | grep -c -- "-rollback.sql"
# (d) scripts atuais (migrate:up/status/baseline — NÃO db:migrate:*)
grep -nE "migrate:(up|status|baseline|down)" package.json
```
> **Confirmado na inspeção (2026-07-13):** `run-migrations.js` presente. Tabela
> `schema_migrations(version VARCHAR(16), name TEXT, applied_at TIMESTAMPTZ)` —
> **sem** `checksum` nem `execution_ms`. Regex já com-espaço:
> `^(\d+)\s*-\s*(.+)\.sql$`, filtro `!f.includes('-rollback')`. Comandos por
> flag: `--baseline`, `--status`; scripts `migrate:up`/`migrate:status`/
> `migrate:baseline` (**não** existe `migrate:down`). Há dezenas de
> `NNN - NOME-rollback.sql` no `migrations/` (015, 016, 017, 018, 019, 020…).
> Vitest **não** configurado (ver #1) → o teste é condicional.

## 4. Passo a passo
**Grupo 1 — Coluna checksum + drift (mergeável sozinho; retrocompat):**
1. `ensureTable()` — adicionar, além do `CREATE TABLE IF NOT EXISTS`, um
   `ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum TEXT` (e,
   opcional, `... ADD COLUMN IF NOT EXISTS execution_ms INTEGER`). Idempotente:
   bancos já baselineados só ganham a coluna nova (NULL nas linhas antigas).
2. Helper puro `checksum(sql)` — copiar do IMPGEO (`crypto.createHash('sha256')
   .update(sql,'utf8').digest('hex')`). No caminho de aplicação (`up`) e no
   `--baseline`, ler o arquivo, calcular o sha256 e gravá-lo na coluna
   (`INSERT ... (version, name, checksum[, execution_ms]) VALUES ...`).
3. `--status` — para cada migration **já aplicada** com `checksum` gravado,
   recomputar o sha256 do arquivo atual; se divergir, listar como
   `⚠️ Drift (checksum divergente): <version>`. Migrations com `checksum` NULL
   (linhas antigas pré-coluna) → **pular** o aviso (não é drift, é ausência).

**Grupo 2 — Envelope transacional-fallback (endurecimento):**
4. Helper puro `hasOwnTransaction(sql)` (`/\bBEGIN\s*;/i`). No loop de aplicação:
   se o SQL **já** traz `BEGIN;` → rodar como hoje (`await pool.query(sql)` +
   INSERT). Se **não** traz → envelopar: `BEGIN` → `query(sql)` → `INSERT` →
   `COMMIT`, com `ROLLBACK` no `catch`. ⚠️ Isso exige um **client dedicado**
   (`pool.connect()`), não `pool.query` solto — senão o `BEGIN/COMMIT` não valem
   entre chamadas. Ver pegadinha §6.

**Grupo 3 — Comando `down <version>` (feature nova):**
5. `rollbackFilenameFor(version, filenames)` — copiar do IMPGEO, mas **adaptar a
   regex ao padrão do Alya**: procurar `^<version>\s*-\s*.+-rollback\.sql$`
   (com o `\s*-\s*` do espaço). Retorna o nome do `-rollback.sql` ou null.
6. `down(version)` — validar que a `version` está aplicada (senão erro claro);
   achar o `-rollback.sql` (senão erro "reverta manualmente"); num client
   dedicado: `BEGIN` → `query(rollbackSql)` → `DELETE FROM schema_migrations
   WHERE version=$1` → `COMMIT` (ROLLBACK no catch).
7. **CLI** — o Alya despacha por **flag** (`--baseline`/`--status`), o IMPGEO por
   **subcomando posicional** (`up`/`down <v>`). Manter o estilo do Alya:
   adicionar `--down <version>` (lendo `process.argv`), **não** trocar para
   subcomandos. `package.json`: `"migrate:down": "node run-migrations.js --down"`.

**Grupo 4 — Teste (só se #1 já feito):**
8. Se o #1 (vitest) já estiver no Alya, portar o `runner.test.js` do IMPGEO
   **adaptado** para os helpers do `run-migrations.js` (nomes/paths locais):
   testar `checksum` (determinístico/sensível), `hasOwnTransaction`,
   `rollbackFilenameFor` **com nomes-com-espaço** (`042 - PAGINACAO-rollback.sql`)
   e o filtro/ordenação numérica de `listMigrations`. Se #1 **não** feito,
   guardar o teste e ligar junto do #1.

## 5. Deltas de adaptação (Alya)
- **Enriquecer, não recriar:** editar o `run-migrations.js` existente — manter
  sua regex `^(\d+)\s*-\s*(.+)\.sql$` e o filtro `!f.includes('-rollback')`.
- **CLI por flag, não subcomando:** `--down <v>` (não `down <v>`); coerente com
  `--baseline`/`--status`.
- **Rollback com espaço:** `NNN - NOME-rollback.sql` → a regex do
  `rollbackFilenameFor` precisa do `\s*-\s*` (não o `^<v>-` colado do IMPGEO).
- **Scripts:** o Alya usa `migrate:*` (**não** `db:migrate:*`) — só adicionar
  `migrate:down`. Não renomear os existentes.
- **Sem migration** (#2 não toca schema de negócio; só evolui `schema_migrations`
  via `ALTER ... ADD COLUMN IF NOT EXISTS`, fora do fluxo NNN).
- Globais: [`_DELTAS-ALYA.md`](_DELTAS-ALYA.md) — em especial **§2** (o critério
  "não copiar o runner.js do IMPGEO verbatim" aponta pra cá).

## 6. Pegadinhas (aprendidas no IMPGEO)
- **NÃO copiar `runner.js` do IMPGEO verbatim (delta crítico):** a regex
  `^(\d{3})-` dele é para prefixo colado e **não casa** `042 - PAGINACAO.sql`.
  Se sobrescrever o `run-migrations.js`, o Alya para de enxergar as próprias
  migrations. Enriqueça o arquivo existente; preserve a regex com-espaço.
- **Transação exige client dedicado:** o runner atual usa `pool.query` solto —
  ok enquanto cada migration traz seu `BEGIN/COMMIT` (uma statement por chamada).
  Para o **fallback** (envelopar as sem transação) e para `down`, é preciso
  `const client = await pool.connect()` e rodar `BEGIN/…/COMMIT` no **mesmo**
  client; com `pool.query`, cada chamada pode pegar conexão diferente e o
  `BEGIN` não vale nada.
- **Drift ≠ ausência:** linhas antigas (baselineadas antes da coluna) têm
  `checksum` NULL — **não** são drift. Só compare quando há checksum gravado.
- **`ADD COLUMN IF NOT EXISTS` é o que torna o delta seguro:** bancos já
  migrados (local/VPS) só ganham a coluna; nada reroda. Não recrie a tabela.
- **`down` só reverte o que está aplicado e só se houver `-rollback.sql`:**
  errar claro nos dois casos (evita "revert fantasma" que apaga a linha sem
  desfazer o schema).
- **`baseline` grava checksum também:** senão, migrations baselineadas nunca
  disparariam drift (ficariam eternamente NULL). Calcule o sha256 no baseline.

## 7. Verificação (portão — só seguir se passar)
```bash
cd /Users/fernandocarvalho/alya/server
node -c run-migrations.js
# coluna nova aplicada (idempotente):
node run-migrations.js --status            # não deve quebrar em banco já baselineado
psql "$DB..." -c "\d schema_migrations" | grep -E "checksum|execution_ms"
# drift: mexer 1 char num arquivo JÁ aplicado e conferir o aviso:
#   (editar migrations/0XX - ....sql já aplicado) →
node run-migrations.js --status | grep -i drift     # deve avisar a version
#   (reverter a edição) → aviso some.
# down (num banco de teste, com um NNN - NOME-rollback.sql existente):
node run-migrations.js --down 0XX          # roda o rollback + remove a linha
node run-migrations.js --status            # a version 0XX volta a "pendente"
# se #1 já feito:
npm test 2>&1 | grep -E "run-migrations|checksum|rollback|Tests"
```
Erros esperados e claros: `--down` de version não-aplicada → mensagem "não está
aplicada"; `--down` sem `-rollback.sql` correspondente → "reverta manualmente".

## 8. Rollout (Alya)
Ferramenta operacional — **sem migration de negócio**. Deploy de código +
evolução da própria `schema_migrations` (colunas via `ADD COLUMN IF NOT EXISTS`,
aplicadas na 1ª execução do `--status`/`up`). Ordem: `git pull` no
`/home/deploy/alya` → build/deps → `pm2 restart alya-api` (o runner **não** roda
no boot; é chamado à mão). Rode `node run-migrations.js --status` uma vez na VPS
para materializar as colunas e conferir 0 drift. Reversível por `git revert` (as
colunas novas ficam órfãs mas inofensivas — NULL). Ver `_DELTAS-ALYA.md §1` para
nomes exatos de processo/caminho.
