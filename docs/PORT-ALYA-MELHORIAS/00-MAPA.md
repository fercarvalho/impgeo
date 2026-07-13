# 00 · MAPA — Port das melhorias técnicas IMPGEO → Alya

> **O que é isto.** Um doc-set para uma **IA implementar**, no Alya, as melhorias
> técnicas já feitas no IMPGEO (mesma stack, ~90% idêntico). Cada ficha aponta
> pros **commits reais** do IMPGEO (fonte da verdade) e carrega os **deltas de
> adaptação** + **portões de verificação**. Constantes de adaptação: [`_DELTAS-ALYA.md`](_DELTAS-ALYA.md).
> Estado/ordem machine-readable: [`port-state.json`](port-state.json).
>
> **Pré-condição de uso:** ter os dois repos locais (IMPGEO e Alya) para poder
> `git show <sha>` a referência.

## Como o agente trabalha
1. Lê `port-state.json` → escolhe o item **elegível** (`status: pending`, todos os `depends_on` em `done`, menor `order`).
2. Abre a ficha `NN-<slug>.md`.
3. Roda o bloco **Pré-condições no Alya** — se falhar, para e reporta (não porta às cegas).
4. Executa o **Passo a passo**, lendo os diffs reais do IMPGEO e aplicando os **deltas**.
5. Roda o **Portão de verificação** — só segue se passar.
6. Marca o item `done` + `ported_commit` no `port-state.json`.

## Gap-analysis (estado do Alya hoje)
| # | Item | Alya | Ação |
|---|---|---|---|
| 1 | Testes + CI | 0 testes unitários (só 1 script smoke) | **Replicar** |
| 2 | Runner de migrations | `run-migrations.js` ~70% | **Delta** (down + drift) |
| 3 | Modularizar `server.js` | monolito 8415 linhas | **Replicar** (sem routers TC) |
| 4 | task-authz | sem `task-authz.js` | **Replicar** |
| 5 | Metas em lote | `goals-service` sem batch | **Replicar** |
| 6 | 3 sync points | sem `modules-catalog`/teste | **Replicar** |
| 7 | Defaults de notif. em tabela | ausente | **Replicar** |
| 8 | Auditoria PM | sem `pm_audit_v`/service | **Replicar** |
| 9 | Impersonation httpOnly | **feito (Fase 1.9)** | **N/A** — só verificar (abaixo) |
| 10·14 | Reconciliação de totais | ausente | **Replicar** |
| 11 | Central de Aprovações | filas espalhadas, sem módulo | **Replicar** |
| 12 | Paginação | listas sem limite | **Replicar** ⟵ *piloto* |
| 13 | Timezone configurável | hardcoded | **Replicar** |
| 15 | Split `database-pg.js` | monolito 4629 linhas | **Replicar** (sem domínios TC) |

## Grafo de dependências / ordem de implementação
```
              ┌─────────────┐
              │ #1 Testes+CI │  (rede de segurança — habilita verificar tudo com confiança)
              └──────┬──────┘
                     │
   ┌─────────────────┼───────────────────────────────┐
   ▼                 ▼                                ▼
#2 runner(delta)   #13 timezone   #6 sync   #7 notif-defaults    (infra barata, paralelizável)
   │                                                   
   ▼
#12 paginação ──► #11 Central de Aprovações       (Central consome a infra de paginação)
                  #8 auditoria PM
   
#4 task-authz   #5 metas-batch   #10·14 reconciliação(← depende do #2)   (PM cirúrgicos)

#3 modularizar server.js        (estrutural — DEPOIS das features, p/ não conflitar em server.js)
        │
        ▼
#15 split database-pg.js        (estrutural — por último; mesmo motivo)
```
Ordem linear sugerida: **1 → 2 → 13 → 6 → 7 → 12 → 11 → 8 → 4 → 5 → 10·14 → 3 → 15**.

**Por que #3 e #15 por último:** são refactors que reescrevem `server.js` e `database-pg.js` inteiros. Fazer as features antes evita rebase/conflito manual dentro desses dois arquivos gigantes. (No IMPGEO foi assim que doeu menos.)

## Impacto no sistema (visão macro)
- **Infra (#1, #2, #6, #13):** não muda comportamento de usuário; muda a base de manutenção/segurança. #1 é multiplicador (habilita verificar os demais).
- **PM (#4, #5, #8, #10·14, #11, #12):** tudo dentro do subsistema `gerenciamento`. #11 e #12 mexem no `Tarefas.tsx` e criam/movem UI; #8 adiciona aba; os demais são backend/serviço.
- **Notificações (#7):** cross-subsistema (backend + aba no Admin).
- **Estruturais (#3, #15):** refactor puro, comportamento idêntico; alto valor de manutenção, zero valor de usuário — por isso vêm por último e são reversíveis por `git revert`.

## Regra global: SEM TerraControl
Alya não tem TerraControl. Em toda ficha, **descartar** qualquer passo/arquivo TC (ver [`_DELTAS-ALYA.md` §3](_DELTAS-ALYA.md)). Itens afetados: #3 (routers `tc-*`), #15 (domínios `terracontrol/budget/tc-users/push-prefs`). Restante é agnóstico.

## Mini-item: verificar o #9 no Alya (não é port, é auditoria)
O #9 (impersonation httpOnly) **já está feito** no Alya (Fase 1.9). Porém a inspeção achou um **risco de ordenação de rotas** idêntico ao bug que mordeu o IMPGEO:
- `POST /api/admin/impersonate/:userId` (server.js ~5655) está registrada **antes** de `POST /api/admin/impersonate/stop` (~5717).
- Em Express, um `POST /stop` pode casar `/:userId` com `userId="stop"` primeiro → o "voltar ao meu usuário" falharia.

**Verificar:** logar como superadmin, impersonar, clicar em "voltar" → deve retornar 200 e restaurar. Se falhar, o fix é **reordenar** (registrar `/impersonate/stop` antes de `/impersonate/:userId`) — 1 linha. No IMPGEO isso virou inclusive um teste-guarda (`route-ordering.test.js`); vale portar junto com o #1.

## Índice das fichas
| Ficha | Item | Status doc |
|---|---|---|
| [12-paginacao.md](12-paginacao.md) | #12 Paginação | ✅ escrita (piloto) |
| 01-testes-ci.md | #1 | ⏳ |
| 02-runner-migrations.md | #2 (delta) | ⏳ |
| 03-modularizar-server.md | #3 | ⏳ |
| 04-task-authz.md | #4 | ⏳ |
| 05-metas-batch.md | #5 | ⏳ |
| 06-sync-points.md | #6 | ⏳ |
| 07-notif-defaults.md | #7 | ⏳ |
| 08-auditoria-pm.md | #8 | ⏳ |
| 10-14-reconciliacao.md | #10·14 | ⏳ |
| 11-central-aprovacoes.md | #11 | ⏳ |
| 13-timezone.md | #13 | ⏳ |
| 15-split-database-pg.md | #15 | ⏳ |
