# KICKOFF — Fase 3 (implementar as melhorias no Alya)

> **Como usar:** abra uma sessão nova **com o diretório de trabalho no repo do Alya**
> (`/Users/fernandocarvalho/alya`), garanta que o repo do IMPGEO
> (`/Users/fernandocarvalho/impgeo`) também está no disco (as fichas fazem `git show`
> nele), e **cole o bloco abaixo como primeira mensagem**. Faça **um item por vez**
> — o `port-state.json` permite retomar entre sessões.

---

## Prompt para colar (primeira mensagem da sessão do Alya)

```
Contexto: este repo (Alya) vai receber, uma a uma, as melhorias técnicas já feitas
no IMPGEO. A documentação de port está em docs/PORT-ALYA-MELHORIAS/ (copie de
/Users/fernandocarvalho/impgeo/docs/PORT-ALYA-MELHORIAS/ se ainda não estiver aqui).
O repo do IMPGEO está em /Users/fernandocarvalho/impgeo e é a fonte de referência
(as fichas apontam commits reais via `git -C /Users/fernandocarvalho/impgeo show <sha>`).

Como trabalhar (NÃO leia as 13 fichas de uma vez):
1. Leia a tríade de orientação: docs/PORT-ALYA-MELHORIAS/00-MAPA.md,
   _DELTAS-ALYA.md e port-state.json.
2. Escolha o próximo item ELEGÍVEL no port-state.json: status "pending" com todos
   os depends_on em "done", menor "order". (Comece pelo #1 — testes+CI, a fundação.)
3. Abra SÓ a ficha daquele item (NN-<slug>.md). Rode o bloco "Pré-condições no Alya"
   — se falhar, pare e me reporte (não porte às cegas).
4. Antes de implementar, entre em PLANO e me mostre o plano do item. Só depois de eu
   aprovar, implemente lendo os diffs reais do IMPGEO + aplicando os deltas do Alya.
5. Verifique com o portão da ficha (node -c, boot, testes/smoke). Só siga se passar.
6. Ao concluir: atualize o item para "done" + ported_commit no port-state.json, e me
   entregue o commit. Depois seguimos pro próximo item.

Regras de processo (valem em TODAS as entregas — o Alya não herda as memórias do IMPGEO):
- COMMITS: devolva SEMPRE em DOIS blocos shell separados — um `git add` e um
  `git commit` — PRONTOS, mas NUNCA execute o commit (eu executo). Lista de arquivos
  EXPLÍCITA no add (nunca diretório). Mensagem via HEREDOC. SEM rodapé
  "Co-Authored-By". NUNCA faça `git add` de .claude/.
- Um commit por GRUPO testável (ou por item), ao fim de cada grupo.
- BANCO: backup antes de qualquer operação de DB (pg_dump do banco `alya`).
- PROD/VPS: qualquer mudança em produção vem com passo-a-passo executável, na ordem
  certa, backup antes e rollback junto. Migrations rodam via `node run-migrations.js`
  (o runner do Alya; nomes COM espaço, ex.: "042 - NOME.sql").
- Antes de implementar cada item, PLANO primeiro (me mostre e aguarde aprovação).
- pt-BR, tom técnico e direto, sem resumos finais não solicitados.
- Frontend: reusar os componentes-padrão do Alya (Modal, etc.) e a paleta amber/orange
  (não a azul/índigo do IMPGEO).

Comece agora pelo passo 1 (ler a tríade) e me diga qual é o próximo item elegível e o
que as pré-condições dele acusam. Ainda NÃO implemente — vamos item a item, com plano
e aprovação.
```

---

## Checklist de abertura (você, humano, antes de colar)
- [ ] Sessão nova com cwd = `/Users/fernandocarvalho/alya`.
- [ ] IMPGEO presente em `/Users/fernandocarvalho/impgeo` (para os `git show`).
- [ ] `docs/PORT-ALYA-MELHORIAS/` copiado pra dentro do Alya (recomendado — nasce versionado junto):
      `cp -R /Users/fernandocarvalho/impgeo/docs/PORT-ALYA-MELHORIAS /Users/fernandocarvalho/alya/docs/`
- [ ] Confirmar o processo PM2 e o comando de deploy do Alya (ver `server/ecosystem.config.js`) e
      atualizar `_DELTAS-ALYA.md §1` se necessário.

## Ordem sugerida (do 00-MAPA)
`1 → 2 → 13 → 6 → 7 → 12 → 11 → 8 → 4 → 5 → 10·14 → 3 → 15`
(#9 é só auditoria — já feito no Alya; ver o mini-item no 00-MAPA.)
