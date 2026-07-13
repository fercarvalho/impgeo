---
id: 7
slug: notif-defaults
titulo: Defaults de notificação em tabela editável + aba admin
status_alya: parcial            # schema/cache JÁ existem (migration 036); falta admin CRUD + API + UI
categoria: infra
portabilidade: replicar
depends_on: []
migration_next: null            # ⚠️ tabela JÁ existe no Alya (036 - NOTIFICATION-DEFAULTS-TABLE); NÃO criar 042
impgeo_commits:
  - 5c3d14a   # backend: defaults em tabela + cache + API admin (#7)
  - f8718eb   # front: aba admin de defaults de notificação (#7)
  # dc7f79a DESCARTADO (é TerraControl — fora do Alya)
impgeo_files:
  - server/services/pm/notification-defaults.js
  - server/services/pm/__tests__/notification-defaults.test.js
  - server/migrations/071-NOTIFICATION-DEFAULTS.sql
  - server/database-pg.js
  - server/server.js
  - src/subsistemas/admin/modulos/Admin/NotificationDefaultsManagement.tsx
  - src/subsistemas/admin/modulos/Admin/index.tsx
  - src/components/NotificationPreferencesSection.tsx
alya_files_novos:
  - src/subsistemas/admin/modulos/Admin/NotificationDefaultsManagement.tsx
  # server/services/pm/notification-defaults.js → OPCIONAL (Alya já inlinou o merge; ver §5)
  # server/services/pm/__tests__/notification-defaults.test.js → só se #1 já feito
alya_files_editados:
  - server/database-pg.js                # add listNotificationDefaults/setNotificationDefault + invalidar cache
  - server/server.js                     # GET/PUT /api/admin/notification-defaults (Alya NÃO modularizado)
  - src/subsistemas/admin/modulos/Admin/index.tsx           # nova aba "Notificações" (Bell)
  - src/components/NotificationPreferencesSection.tsx        # exportar labelFor/TYPE_LABELS
  # server/migrations/*  → NENHUMA (tabela já criada no 036)
---

# #7 · Defaults de notificação em tabela editável + aba admin

## 1. Objetivo
Os defaults de notificação (push/email por tipo, aplicados a quem **não**
personalizou) saíam de um objeto estático `NOTIFICATION_DEFAULTS` hardcoded na
classe `Database` — mudar um default exigia **deploy**. A melhoria move esses
defaults para uma **tabela editável** com **cache em memória** (hot path de
`getNotificationPreference` sem query extra) + uma **aba admin** pra editar o
grid tipo × {push, email}. i18n dos rótulos fica **fora** (follow-up).

> ⚠️ **Metade já feita no Alya.** A tabela + o cache-com-fallback **já existem**
> (migration `036 - NOTIFICATION-DEFAULTS-TABLE.sql` + `_getTypeDefaults()` no
> `database-pg.js`). O que **falta** é só a camada admin: CRUD no data-layer,
> API e a aba no painel. Ver §3 e §5.

## 2. Referência no IMPGEO (fonte da verdade)
Leia os diffs — **não** reescreva de memória:
```
git -C /Users/fernandocarvalho/impgeo show 5c3d14a   # backend: service + migration 071 + cache + CRUD admin + endpoints + testes
git -C /Users/fernandocarvalho/impgeo show f8718eb   # front: NotificationDefaultsManagement.tsx + aba + export labelFor
```
> **NÃO** minerar `dc7f79a` — é TerraControl (fora do Alya, ver `_DELTAS-ALYA.md §3`).

Adaptar (não copiar verbatim): o IMPGEO usa tabela **LONG com `scope`**
(`notification_defaults(scope, notification_type, channel, enabled)`, escopos
`impgeo`/`tc`) e um cache tipo `Map` por `(scope,type,channel)`. **O Alya já tem
outra forma** — tabela **WIDE sem scope** (`notification_type_defaults(notification_type PK,
push, email)`) e cache-objeto por tipo. **O CRUD admin do port precisa casar com
a forma do Alya**, não recriar a do IMPGEO. Copiar o **UI** (`NotificationDefaultsManagement.tsx`)
é o item mais reaproveitável — adaptando shape (wide) + tirando o seletor de escopo + paleta.

## 3. Pré-condições no Alya (rodar ANTES — se divergir, reavaliar)
```bash
cd /Users/fernandocarvalho/alya/server
# (a) a tabela JÁ existe (migration 036)?  → esperado: presente
ls "migrations/036 - NOTIFICATION-DEFAULTS-TABLE.sql" && echo "ok, 036 presente"
# (b) o objeto estático a "mover" ainda está no código?  → esperado: presente (vira FALLBACK)
grep -n "NOTIFICATION_DEFAULTS = Object.freeze" database-pg.js
# (c) o cache-com-merge já existe?  → esperado: _getTypeDefaults presente
grep -n "_getTypeDefaults\|_typeDefaultsCache\|notification_type_defaults" database-pg.js
# (d) o admin CRUD / API NÃO deve existir ainda
grep -n "listNotificationDefaults\|setNotificationDefault" database-pg.js || echo "ok, CRUD admin ausente"
grep -n "admin/notification-defaults" server.js || echo "ok, endpoints ausentes"
# (e) o front tem o painel Admin e a section de labels
ls ../src/subsistemas/admin/modulos/Admin/index.tsx ../src/components/NotificationPreferencesSection.tsx
```
> **Confirmado na inspeção (2026-07-13):**
> - Migration `036 - NOTIFICATION-DEFAULTS-TABLE.sql` **presente** → tabela
>   `notification_type_defaults(notification_type PK, push BOOL, email BOOL, updated_at)`,
>   seed de 24 tipos (`transaction_confirm_needed`, `_meta:foreground` + 22 `pm_*`).
> - `Database.NOTIFICATION_DEFAULTS` **ainda no código** (linha ~1008) — **mantido como fallback**.
> - `_getTypeDefaults()` (linha ~1123): lê a tabela, mescla **por cima** do mapa estático,
>   **cache TTL 60s** (`_typeDefaultsCache`/`_typeDefaultsCacheAt`). Já usado por
>   `getNotificationPreference` **e** `listNotificationPreferences`.
> - `listNotificationDefaults`/`setNotificationDefault` **ausentes**; endpoints admin **ausentes**.
> - `NotificationPreferencesSection.tsx` tem `TYPE_LABELS`/`labelFor` porém **NÃO exportados**.
> - Painel Admin: `Admin/index.tsx` com `type AdminTab` (union) + array `tabs` + render condicional.

## 4. Passo a passo
**Grupo 1 — Backend admin CRUD + invalidação (mergeável sozinho):**
1. `database-pg.js` — adicionar duas funções que operam na **tabela wide** do Alya:
   - `async listNotificationDefaults()` → devolve o grid **efetivo** (a partir de `_getTypeDefaults()`, achatado em linhas `{ notification_type, channel, enabled }` para push **e** email; assim a UI recebe o merge tabela+fallback, não só o que está gravado).
   - `async setNotificationDefault(notificationType, channel, enabled)` → `UPSERT` na `notification_type_defaults` mexendo **só a coluna do canal** (`push` **ou** `email`), `updated_at = NOW()`. Como a tabela é wide (uma linha por tipo, 2 colunas), o UPSERT precisa preservar a outra coluna: `INSERT ... ON CONFLICT (notification_type) DO UPDATE SET <canal> = EXCLUDED.<canal>, updated_at = NOW()`.
2. **Invalidar o cache no write** — em `setNotificationDefault`, zerar `this._typeDefaultsCache = null` (ou `this._typeDefaultsCacheAt = 0`) para o próximo `_getTypeDefaults()` recarregar na hora. Sem isso, a edição do admin só reflete após ≤60s (delta vs IMPGEO — ver §5).
3. **Endpoints** em `server.js` (Alya monolito — ver §5): `GET /api/admin/notification-defaults` (admin/superadmin → `db.listNotificationDefaults()`) e `PUT /api/admin/notification-defaults` (valida `notification_type`≤64, `channel ∈ {push,email}`, `enabled: boolean` → `db.setNotificationDefault(...)`). **Sem `scope`** (Alya single-origin). Confirmar guarda de role com `grep -n "role !== 'admin'" server.js`.
4. *(Opcional)* `notification-defaults.test.js` — só se o #1 já pôs o vitest; senão, guardar e ligar junto do #1.

**Grupo 2 — Frontend aba admin (feature visível):**
5. Criar `Admin/NotificationDefaultsManagement.tsx` — copiar do IMPGEO (`f8718eb`) e **adaptar**: (a) remover o seletor de escopo e o `scope` da URL/body; (b) shape wide — agrupar por `notification_type` e renderizar 2 toggles (push/email); (c) toggles otimistas + `savingKey`; (d) ignorar tipos `_meta:*` no grid visível se assim já faz o `NotificationPreferencesSection`; (e) **paleta amber/orange** (`_DELTAS-ALYA.md §7`).
6. `NotificationPreferencesSection.tsx` — **exportar** `labelFor` (e `TYPE_LABELS` se preciso) para reuso dos rótulos pt-BR sem duplicar. O componente novo importa `labelFor`.
7. `Admin/index.tsx` — registrar a aba: adicionar `'notifications'` ao union `AdminTab`, um item `{ id: 'notifications', name: 'Notificações', icon: Bell }` no array `tabs` (importar `Bell` de `lucide-react`) e o render condicional `{activeTab === 'notifications' && <NotificationDefaultsManagement />}`. Decidir gating (provável só superadmin, como Módulos/Padrões de Função).

## 5. Deltas de adaptação (Alya)
- **SEM migration nova.** A tabela já existe (migration `036`). **NÃO** criar `042` nem portar o `071` do IMPGEO. `migration_next: null`.
- **Forma da tabela diverge do IMPGEO.** Alya = **WIDE sem scope** (`notification_type_defaults(type, push, email)`); IMPGEO = **LONG com scope** (`notification_defaults(scope, type, channel, enabled)`). O CRUD e a UI seguem a forma **wide** do Alya.
- **SEM `scope`** — Alya é single-origin (sem TerraControl, `_DELTAS-ALYA.md §3`). Tirar seletor de escopo, param `?scope`, campo `scope` no body. Um escopo só.
- **Objeto estático fica como FALLBACK.** No IMPGEO o mapa virou `FACTORY_DEFAULTS` num service e saiu da classe; **no Alya o `NOTIFICATION_DEFAULTS` continua na classe** como rede de segurança (o `_getTypeDefaults` já mescla por cima). O service `notification-defaults.js` é **opcional** — a lógica de merge já está inline; só vale portá-lo se quiser os helpers puros testáveis (`resolveDefault`/`buildDefaultsGrid`) para a suíte do #1.
- **Cache: invalidar no write.** IMPGEO recarrega o cache na edição; o Alya usa **TTL 60s** sem invalidação → adicionar bust explícito no `setNotificationDefault` (passo 2).
- **Endpoints em `server.js`, não `routes/pm.js`** (Alya não modularizado — `_DELTAS-ALYA.md §5`).
- **Paleta:** aba admin → amber/orange (`_DELTAS-ALYA.md §7`).
- **i18n fora** (igual IMPGEO; follow-up).
- Globais: [`_DELTAS-ALYA.md`](_DELTAS-ALYA.md).

## 6. Pegadinhas (aprendidas no IMPGEO)
- **Cache é hot path:** `getNotificationPreference` roda a cada dispatch de push/email. Não trocar por query direta — manter o cache. Ao editar, **invalidar** (senão o admin acha que "não salvou").
- **UPSERT wide preserva a outra coluna:** ao setar só `push`, não zerar `email` (e vice-versa). Usar `ON CONFLICT (notification_type) DO UPDATE SET <canal> = EXCLUDED.<canal>` — nunca um `INSERT` que sobrescreve ambas.
- **Grid = merge, não só o gravado:** `listNotificationDefaults` deve devolver o **efetivo** (`_getTypeDefaults` = tabela mesclada sobre o fallback), senão tipos que ainda não têm linha explícita somem da UI.
- **`_meta:*` não é evento:** `_meta:foreground` é toggle de comportamento, não um tipo de notificação — a UI de defaults deve tratá-lo como o `NotificationPreferencesSection` faz (ignorar ou seção à parte), não listar como "notificação".
- **Fallback defensivo:** se a tabela sumisse (`catch` no `_getTypeDefaults`), o sistema cai no mapa estático — não quebrar esse caminho ao adicionar o CRUD.
- **Reuso de rótulos:** exportar `labelFor` de um lugar só; não duplicar `TYPE_LABELS` no componente novo (fonte única pt-BR).

## 7. Verificação (portão — só seguir se passar)
```bash
cd /Users/fernandocarvalho/alya/server
node -c database-pg.js
node -c server.js
# se #1 já feito (service opcional portado):
npm test 2>&1 | grep -E "notification|Tests"
# boot + smoke:
node server.js &   # sobe sem erro
# GET grid (admin) → lista com push/email por tipo:
curl -s "http://localhost:PORTA/api/admin/notification-defaults" -H "Cookie: accessToken=<tok-admin>" | jq '.data | length, .data[0]'
# PUT um default → reflete NA HORA (cache invalidado):
curl -s -X PUT "http://localhost:PORTA/api/admin/notification-defaults" \
  -H "Cookie: accessToken=<tok-admin>" -H "Content-Type: application/json" \
  -d '{"notification_type":"pm_task_assigned","channel":"email","enabled":true}' | jq '.success'
# confirmar no DB:
psql "$DB..." -c "SELECT notification_type, push, email FROM notification_type_defaults WHERE notification_type='pm_task_assigned';"
```
Verificar também que um usuário **sem** linha em `notification_preferences` para `(pm_task_assigned, email)` passa a receber `true` em `getNotificationPreference` **sem deploy** (era o objetivo). Guarda de role: um user comum recebe **403** no GET/PUT.
Front (após Grupo 2): abrir Admin → aba **Notificações**, alternar um toggle (otimista), recarregar e confirmar persistência; dark mode e mobile ok; paleta amber/orange.

## 8. Rollout (Alya)
Refactor **sem migration** (tabela já existe desde o 036) → só deploy de código.
`git pull` no `/home/deploy/alya` → build → `pm2 restart alya-api`. Smoke: painel
Admin (aba Notificações) + um dispatch real de push/email conferindo que o default
editado valeu. Reversível por `git revert` (o comportamento pré-#7 usava o mesmo
`_getTypeDefaults`; sem os endpoints/UI, os defaults só voltam a ser editáveis via
SQL direto na tabela). Ver `_DELTAS-ALYA.md §1` p/ nomes exatos de processo/caminho.
