---
id: 13
slug: timezone
titulo: Timezone configurável via env (APP_TIMEZONE)
status_alya: falta
categoria: infra
portabilidade: replicar
depends_on: []
migration_next: null           # #13 não toca schema
impgeo_commits:
  - 6ba025b   # feat(pm): timezone configurável via APP_TIMEZONE (#13)
impgeo_files:
  - server/utils/timezone.js                       # NOVO — fonte única
  - server/utils/__tests__/timezone.test.js         # NOVO — 7 testes (vitest)
  - server/services/pm/pomodoro-service.js
  - server/services/pm/report-service.js
  - server/services/pm/task-service.js
  - server/utils/security-alerts.js
alya_files_novos:
  - server/utils/timezone.js
  - server/utils/__tests__/timezone.test.js   # se #1 já feito (vitest)
alya_files_editados:
  - server/services/pm/pomodoro-service.js
  - server/services/pm/report-service.js
  - server/services/pm/task-service.js
  - server/utils/security-alerts.js
  - server/.env.example                        # adicionar APP_TIMEZONE
  - server/.env                                # (opcional em dev — default já cobre)
---

# #13 · Timezone configurável via env (APP_TIMEZONE)

## 1. Objetivo
O fuso `America/Sao_Paulo` está **hardcoded** em 4 lugares (Pomodoro, relatórios,
`due_date` e o e-mail de alerta de segurança) — o "dia" local é calculado em BRT
fixo. **Centralizar num helper** `server/utils/timezone.js` que lê `APP_TIMEZONE`
(env), valida como IANA (inválido → cai no default BRT + `warn`) e exporta o valor
efetivo. Além de tornar o fuso configurável, a validação **fecha o risco de
typo/injeção**, já que o valor é interpolado em SQL (`NOW() AT TIME ZONE '<tz>'`).
Comportamento idêntico enquanto `APP_TIMEZONE` não for setado (default = valor atual).

## 2. Referência no IMPGEO (fonte da verdade)
Leia o diff — **não** reescreva de memória:
```
git -C /Users/fernandocarvalho/impgeo show 6ba025b   # cria utils/timezone.js + troca os 4 usos hardcoded + testes
```
Copiar **verbatim** (agnóstico de negócio/TC): `timezone.js` e `timezone.test.js`.
Adaptar (só a linha do `const TZ`/interpolação): `pomodoro-service.js`,
`report-service.js`, `task-service.js`, `security-alerts.js`.

## 3. Pré-condições no Alya (rodar ANTES — se falhar, parar)
```bash
cd /Users/fernandocarvalho/alya/server
# (a) a pasta utils/ existe (lar do novo helper)?
ls utils/ | head
# (b) NÃO deve existir timezone.js ainda
ls utils/timezone.js 2>/dev/null && echo "JÁ EXISTE — reavaliar" || echo "ok, ausente"
# (c) os 4 call-sites hardcoded (esperado: os mesmos 4 do IMPGEO)
grep -rn "America/Sao_Paulo" services/pm utils
```
> **Confirmado na inspeção (2026-07-13):** `server/utils/` existe (audit,
> session-manager, security-alerts, encryption…). `utils/timezone.js` **ausente**.
> Os **4 call-sites batem 1:1 com o IMPGEO**: `pomodoro-service.js:27` (`const TZ`),
> `report-service.js:17` (`const TZ`, usado no `Intl.DateTimeFormat` da linha 59),
> `task-service.js:711` (`NOW() AT TIME ZONE 'America/Sao_Paulo'` no `due_date`) e
> `utils/security-alerts.js:135` (`toLocaleString('pt-BR', { timeZone: … })`).
> `.env`/`.env.example` presentes e **sem** `APP_TIMEZONE`/`TZ` hoje.

## 4. Passo a passo
**Grupo único (mergeável sozinho; sem migration, sem front):**
1. Criar `server/utils/timezone.js` — copiar **verbatim** do IMPGEO: `DEFAULT_TZ =
   'America/Sao_Paulo'`, `isValidTimeZone(tz)` (tenta `new Intl.DateTimeFormat` →
   `false` no `RangeError`), `resolveTimezone(envValue, {warn})` (função **pura**,
   testável) e `const APP_TIMEZONE = resolveTimezone(process.env.APP_TIMEZONE)`
   resolvido uma vez no load. `module.exports = { APP_TIMEZONE, DEFAULT_TZ,
   isValidTimeZone, resolveTimezone }`.
2. `pomodoro-service.js` — trocar `const TZ = 'America/Sao_Paulo'` por
   `const { APP_TIMEZONE: TZ } = require('../../utils/timezone')`. `TODAY_LOCAL` /
   `STARTED_LOCAL_DATE` continuam interpolando `${TZ}` (agora vindo do módulo).
3. `report-service.js` — mesma troca do `const TZ`; o `Intl.DateTimeFormat({ timeZone: TZ })`
   passa a usar o valor do módulo. Atualizar o comentário de cabeçalho ("Datas em
   America/Sao_Paulo" → "…no timezone da app, APP_TIMEZONE, default BRT — #13").
4. `task-service.js` — `const { APP_TIMEZONE } = require('../../utils/timezone')` no
   topo; no `startTask`, trocar `AT TIME ZONE 'America/Sao_Paulo'` por
   `AT TIME ZONE '${APP_TIMEZONE}'`.
5. `utils/security-alerts.js` — `const { APP_TIMEZONE } = require('./timezone')`
   (mesma pasta → `./`); no `generateEmailHTML`, `toLocaleString('pt-BR', { timeZone: APP_TIMEZONE })`.
6. `server/utils/__tests__/timezone.test.js` — copiar verbatim (7 testes: IANA
   válido, default por ausência, default+warn por inválido, ausente-não-avisa,
   `DEFAULT_TZ`, `isValidTimeZone`, `APP_TIMEZONE` sempre válido). **Só roda se o #1
   já tiver posto o vitest** (Alya não tem — ver `_DELTAS-ALYA.md §8`); senão,
   guardar o arquivo e ligar junto do #1.
7. Adicionar `APP_TIMEZONE` ao `server/.env.example` (documentar: IANA, default
   `America/Sao_Paulo` se ausente/inválido). Opcional no `.env` de dev — o default
   já reproduz o comportamento atual.

## 5. Deltas de adaptação (Alya)
- **Helper em `server/utils/`** — a pasta já existe no Alya (mesmo padrão do IMPGEO); é o lar natural (`_DELTAS-ALYA.md §5`).
- **`APP_TIMEZONE` no `.env.example`** (e opcionalmente `.env`) do Alya — não existe hoje.
- **Sem migration** (#13 não toca schema).
- **4 call-sites idênticos** aos do IMPGEO → troca mecânica linha-a-linha.
- **Teste depende do #1** (vitest ainda não configurado no Alya — `_DELTAS-ALYA.md §8`).
- **Nada de TerraControl** aqui — os 4 usos são PM + util de segurança, todos presentes no Alya.
- Globais: [`_DELTAS-ALYA.md`](_DELTAS-ALYA.md).

## 6. Pegadinhas (aprendidas no IMPGEO)
- **Default = valor atual:** `DEFAULT_TZ = 'America/Sao_Paulo'`. Sem `APP_TIMEZONE` setado, comportamento **idêntico** a hoje — o refactor é invisível até alguém configurar. Não inverter.
- **Validação IANA não é decorativa:** o valor é **interpolado em SQL** (`AT TIME ZONE '${TZ}'`). `isValidTimeZone` (via `Intl`) barra typo/injeção. Um valor não-validado no `${…}` seria um vetor — por isso o helper é a **única** porta de entrada.
- **`resolveTimezone` é pura de propósito** (recebe `envValue` + `{warn}`) — é o que deixa os 7 testes rodarem sem mexer em `process.env`. Não colapsar direto em `process.env` dentro dela.
- **Ausente NÃO avisa; inválido avisa.** Ausência é o caminho normal (dev sem `.env`); só `warn` quando há um valor e ele é lixo. Não logar no caminho feliz.
- **Resolvido uma vez no load** (`const APP_TIMEZONE = …`). Trocar `APP_TIMEZONE` em runtime exige restart — é intencional (env é setado no boot).
- **`require` relativo correto:** services PM sobem 2 níveis (`../../utils/timezone`); `security-alerts.js` mora **na** `utils/` → `./timezone`.

## 7. Verificação (portão — só seguir se passar)
```bash
cd /Users/fernandocarvalho/alya/server
node -c utils/timezone.js
node -c services/pm/pomodoro-service.js
node -c services/pm/report-service.js
node -c services/pm/task-service.js
node -c utils/security-alerts.js
# helper resolve certo (default por ausência; IANA válido; default+warn por inválido):
node -e "const t=require('./utils/timezone'); console.log(t.APP_TIMEZONE, t.resolveTimezone(undefined), t.resolveTimezone('UTC'), t.resolveTimezone('Nao/Existe'))"
# com env setado → passa a valer:
APP_TIMEZONE=UTC node -e "console.log(require('./utils/timezone').APP_TIMEZONE)"   # → UTC
# se #1 já feito:
npm test 2>&1 | grep -E "timezone|Tests"        # suíte timezone verde (7)
# boot: sobe sem erro
node server.js &   # smoke
```
Smoke funcional: com `APP_TIMEZONE` **não** setado, contador diário do Pomodoro e
data dos relatórios idênticos a hoje; com `APP_TIMEZONE=UTC`, o "hoje" do Pomodoro
vira meia-noite UTC (confirma que o fuso passou a ser lido do env).

## 8. Rollout (Alya)
Refactor **sem migration** → só deploy de código + (opcional) uma env. `git pull` no
`/home/deploy/alya` → build → `pm2 restart alya-api`. Se quiser mudar o fuso, setar
`APP_TIMEZONE` no `.env` de prod antes do restart (senão fica no default BRT =
comportamento atual). Smoke no Pomodoro (contador diário) e num relatório. Reversível
por `git revert` (default reproduz o hardcoded). Ver `_DELTAS-ALYA.md §1` p/ os nomes
exatos de processo/caminho.
