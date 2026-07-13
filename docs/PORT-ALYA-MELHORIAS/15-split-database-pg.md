---
id: 15
slug: split-database-pg
titulo: Modularizar o data-layer database-pg.js (split por mixin — abordagem A)
status_alya: falta
categoria: infra
portabilidade: replicar
depends_on: [1]                # a guarda de inventário é um teste (vitest do #1)
migration_next: null          # #15 não tem migration (refactor puro)
impgeo_commits:
  - 880d6c1   # FUNDAÇÃO: db/_shared.js + guarda de inventário (db/__tests__) + 1º domínio (feedback)
  - 09616a9   # rodada: financeiro
  - f1a3ebc   # rodada: transações
  - 300886c   # rodada: cadastros
  - f4360e7   # rodada: usuarios/subsistemas/módulos
  - cf80dfe   # rodada: permissoes/defaults/roles
impgeo_files:
  - server/db/_shared.js
  - server/db/__tests__/db-methods.test.js
  - server/db/__tests__/db-methods.snapshot.json
  - server/db/feedback.js
  - server/db/financeiro.js
  - server/db/transactions.js
  - server/db/cadastros.js
  - server/db/usuarios.js
  - server/db/permissoes.js
  - server/database-pg.js               # core: importa _shared + Object.assign no fim
alya_files_novos:
  - server/db/_shared.js
  - server/db/__tests__/db-methods.test.js
  - server/db/__tests__/db-methods.snapshot.json
  - server/db/<dominio>.js              # 1 por rodada (ver §4 p/ o conjunto real do Alya)
alya_files_editados:
  - server/database-pg.js               # extrair métodos + importar _shared + Object.assign no fim
---

# #15 · Modularizar o data-layer database-pg.js (split por mixin)

## 1. Objetivo
`database-pg.js` é um monolito (IMPGEO ~4000 linhas, **Alya 4629**) com todos os
métodos do data-layer numa classe `Database` só. Fatiar por **domínio** sem trocar
a API: mover grupos de métodos para `server/db/<dominio>.js` e reagregar no fim do
core com

```js
Object.assign(Database.prototype, require('./db/feedback'), require('./db/financeiro'), …);
```

Continua **uma** instância `db`, `this` preservado (this.pool, this.generateId…),
**todos os call-sites `db.metodo()` / `this.metodo()` intactos**. Ganho: arquivos
por domínio navegáveis, diffs menores, AI-friendly. Cada rodada é validada por uma
**guarda de inventário** (snapshot de `Object.getOwnPropertyNames(prototype)`:
0 faltando / 0 extra) + checagem de colisão entre domínios + boot + testes.

## 2. Referência no IMPGEO (fonte da verdade)
Leia os diffs — **não** reescreva de memória:
```
git -C /Users/fernandocarvalho/impgeo show 880d6c1   # FUNDAÇÃO: _shared.js + guarda + 1º domínio (feedback)
git -C /Users/fernandocarvalho/impgeo show 09616a9   # rodada exemplo: financeiro
git -C /Users/fernandocarvalho/impgeo show f1a3ebc   # rodada exemplo: transações
git -C /Users/fernandocarvalho/impgeo show 300886c   # rodada exemplo: cadastros
git -C /Users/fernandocarvalho/impgeo show f4360e7   # rodada exemplo: usuarios
git -C /Users/fernandocarvalho/impgeo show cf80dfe   # rodada exemplo: permissoes
```
Minerar **principalmente a FUNDAÇÃO** (`880d6c1`) — dela sai a mecânica inteira:
`db/_shared.js` (o `toCamelCase` sai do topo do core pra cá; no Alya **sem** o
`TC_USER_PUBLIC_FIELDS`, ver §5), a guarda `db/__tests__/db-methods.test.js` +
`db-methods.snapshot.json`, e o padrão de 1 arquivo-domínio (`db/feedback.js`) +
o `Object.assign` no fim de `database-pg.js`. As rodadas são todas o **mesmo
molde** repetido — 1–2 servem de exemplo.

> ⚠️ **DESCARTAR (TerraControl — não existem no Alya):** `0210927` (terracontrol),
> `b04293d` (budget), `a41b87e` (push-prefs, tem parte tc). O Alya não tem
> `db/terracontrol.js`, `db/budget.js` nem o scope `tc` de push. Ver
> [`_DELTAS-ALYA.md §3`](_DELTAS-ALYA.md). O Web Push do Alya é **single-scope**
> (já consolidado no core, sem tc-users separados) → entra numa rodada
> `notificações` normal, sem o desdobramento tc do IMPGEO.

## 3. Pré-condições no Alya (rodar ANTES — se falhar, parar)
```bash
cd /Users/fernandocarvalho/alya/server
# (a) #1 já feito? A guarda é um teste vitest — precisa do runner.
ls package.json && grep -q '"vitest"' package.json && echo "vitest ok" || echo "FALTA #1 (vitest) — fazer antes"
# (b) NÃO deve existir db/ ainda
ls db/ 2>/dev/null && echo "JÁ EXISTE db/ — reavaliar" || echo "ok, ausente"
# (c) a classe e o tamanho
grep -n "class Database" database-pg.js && wc -l database-pg.js
```
> **Confirmado na inspeção (2026-07-13):** `class Database extends FileDatabase`
> na linha 122; **4629 linhas**; **`db/` ausente** (só `routes/bling.js` e
> `routes/nuvemshop.js` existem). O Alya **não usa** o banner `// Métodos para …`
> do IMPGEO — as seções são marcadas por comentários `// ===== NOME =====` /
> `// ---- Nome ----` (ex.: `Web Push`, `ROADMAP`, `FAQ`, `FEEDBACK`,
> `DOCUMENTAÇÃO`, `RODAPÉ`, `LEGAL / LGPD`). São ~**215 métodos** na classe (vs 336
> no IMPGEO) → **o número da guarda é outro** (ver §5). #1 (vitest) é
> **pré-requisito** da guarda.

## 4. Passo a passo
**Rodada 0 — FUNDAÇÃO (minerar `880d6c1`):**
1. Criar `server/db/_shared.js` — mover pra cá o `toCamelCase` do topo do
   `database-pg.js` e exportar (`module.exports = { toCamelCase }`). **Sem**
   `TC_USER_PUBLIC_FIELDS` (é símbolo só-TC — ver §5). O core passa a
   `const { toCamelCase } = require('./db/_shared')`.
2. Criar `server/db/__tests__/db-methods.test.js` + `db-methods.snapshot.json` —
   copiar do IMPGEO. O teste lê `Object.getOwnPropertyNames(Database.prototype)`
   (sem `constructor`, ordenado) e compara com o snapshot: `{missing:[], extra:[]}`.
   **Gerar o snapshot ANTES do 1º recorte** (rodar uma vez imprimindo o array e
   salvar) — ele congela o conjunto real do Alya (~215, não 336).
3. Escolher o **1º domínio** (recomendo `feedback` — pequeno, autocontido, igual
   ao IMPGEO): criar `server/db/feedback.js` com `module.exports = { … }`, mover os
   métodos **verbatim**, e no fim do `database-pg.js` adicionar
   `Object.assign(Database.prototype, require('./db/feedback'));`. Rodar a guarda:
   0/0. Commit.

**Rodadas seguintes — 1 domínio por rodada (molde repetido):**
4. Para cada domínio: criar `server/db/<dominio>.js`, mover os métodos daquele
   grupo, **encadear no `Object.assign`** já existente (`require('./db/<dominio>')`),
   deixar um comentário-âncora no lugar de onde saíram (ex.:
   `// FEEDBACK — movido para db/feedback.js (#15 A); anexado via Object.assign no fim.`).
   Rodar guarda + boot + testes. Commit por domínio (grupo testável).

   **Conjunto de domínios do Alya** (inferido da inspeção — reconferir ao recortar):
   `feedback` · `financeiro` (transações, regras, projeção) · `cadastros`
   (clients, com cifragem AES em `utils/encryption`) · `produtos` (products, do
   subsistema `especial`) · `usuarios` (CRUD equipe + subsistemas + catálogo de
   módulos) · `permissoes` · `notificacoes` (Web Push single-scope + prefs +
   `NOTIFICATION_DEFAULTS`) · `roadmap` · `faq` · `documentacao` · `rodape`
   (footer + bottom-links + commits pendentes) · `legal` (termos/privacidade/
   cookies/consentimentos LGPD). **Sem** `terracontrol`/`budget`/`push-prefs-tc`.

**Transform mecânico (o único cuidado de sintaxe):** método-de-classe →
método-de-objeto. Some o `async foo(x) {…}` (sem vírgula, corpo de classe) e vira
`async foo(x) {…},` (**com vírgula**, propriedade de objeto literal). Estáticos
(`static NOTIFICATION_DEFAULTS = …`) **não** vão pro mixin — ficam no core (ou
migram pra `_shared.js` se compartilhados). Nada de lógica muda; é recorte puro.

## 5. Deltas de adaptação (Alya)
- **Guarda com o número real do Alya:** ~**215** métodos (não 336). O snapshot é
  gerado localmente na Rodada 0 — a guarda "336-like" do IMPGEO vira "215-like".
- **`_shared.js` sem `TC_USER_PUBLIC_FIELDS`** — é símbolo exclusivo de TerraControl.
  No Alya o `_shared` provavelmente exporta **só** `toCamelCase` (adicionar outros
  símbolos de módulo só se algum domínio do Alya realmente compartilhar).
- **Sem os domínios TC:** nada de `db/terracontrol.js`, `db/budget.js`, nem o
  scope `tc` de push. O conjunto de domínios do Alya é **menor e diferente**
  (§4). Web Push é single-scope → cabe numa rodada `notificacoes` só.
- **Endereços cifrados (`cadastros`):** o Alya cifra `cpf/phone/email/address` em
  colunas `*_encrypted`/`*_hash` via `utils/encryption` — os helpers de cifragem/
  decifragem no topo do core (`serializeAddress`, o decifra-linha camelCase) vão
  junto do domínio `cadastros` (ou pra `_shared` se outro domínio usar). Só recorte.
- **Sem migration** (#15 é refactor puro — não toca schema).
- **Por último no port:** deixar o #15 pro fim (mexe no arquivo mais central;
  melhor portar as features primeiro pra o snapshot já refletir tudo).
- Globais: [`_DELTAS-ALYA.md`](_DELTAS-ALYA.md) (§3 SEM TerraControl; §5 layout;
  §8 testes/vitest = pré-req do #1).

## 6. Pegadinhas (aprendidas no IMPGEO)
- **`Object.assign` sobrescreve em silêncio:** dois domínios com um método de mesmo
  nome → o segundo vence sem erro. A guarda pega isso como `extra`/`missing`? **Não
  diretamente** — pega o *count* mudando; para colisão explícita, checar duplicados
  entre os `module.exports` (o IMPGEO faz isso na guarda; portar essa parte também).
- **Snapshot congelado ANTES do 1º recorte:** se gerar o snapshot depois de já ter
  movido métodos, ele "aprova" um estado potencialmente já quebrado. Gerar no baseline.
- **`this` continua sendo a instância:** métodos movidos usam `this.pool`,
  `this.generateId`, `this.<outroMetodo>()` — tudo segue funcionando porque
  `Object.assign` cola no `prototype`. **Não** virar arrow function (perde o `this`).
- **Vírgula entre métodos:** é objeto literal agora, não corpo de classe. Faltou
  vírgula → SyntaxError no boot. `node -c server/database-pg.js` pega na hora.
- **Estáticos e símbolos de módulo:** `static X = …` e constantes de topo não são
  métodos de instância — decidir explicitamente entre "fica no core" e "vai pro
  `_shared`". Não jogar dentro do `module.exports` do domínio como se fosse método.
- **Um domínio por commit:** rodada testável isolada; se a guarda vermelha, o diff
  culpado é pequeno.

## 7. Verificação (portão — só seguir se passar)
```bash
cd /Users/fernandocarvalho/alya/server
# sintaxe de cada arquivo tocado:
node -c database-pg.js
node -c db/_shared.js
node -c db/<dominio>.js
# guarda de inventário (precisa do #1 / vitest):
npm test 2>&1 | grep -E "inventário|db-methods|Tests"      # 0 missing / 0 extra
# boot limpo (o require do core dispara o Object.assign):
node -e "const D=require('./database-pg'); const n=Object.getOwnPropertyNames(D.prototype).filter(x=>x!=='constructor').length; console.log('métodos:', n)"
# smoke: subir o server sem erro
node server.js &   # boot sem SyntaxError/require quebrado
```
A cada rodada: **inventário 0/0**, sem colisão, boot ok, suíte verde. `wc -l
database-pg.js` deve **cair** a cada rodada (métodos saindo) e a soma
core+db/*.js bater com o baseline.

## 8. Rollout (Alya)
Refactor **sem migration** e sem mudança de comportamento → só deploy de código.
`git pull` no `/home/deploy/alya` → build → `pm2 restart alya-api`. Como cada
rodada preserva o inventário e a API, é **reversível por `git revert`** de qualquer
commit-domínio isolado. Smoke rápido nas telas que batem no data-layer (financeiro,
cadastros, roadmap/faq, feedback). Ver [`_DELTAS-ALYA.md §1`](_DELTAS-ALYA.md) p/
os nomes exatos de processo/caminho (`alya-api`, `/home/deploy/alya`).
