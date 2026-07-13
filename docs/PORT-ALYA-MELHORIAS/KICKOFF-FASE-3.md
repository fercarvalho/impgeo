# KICKOFF — Fase 3 (implementar as melhorias no Alya)

> **Como usar:** abra uma sessão nova **com o diretório de trabalho no repo do Alya**
> (`/Users/fernandocarvalho/alya`), garanta que o repo do IMPGEO
> (`/Users/fernandocarvalho/impgeo`) também está no disco (as fichas fazem `git show`
> nele), e **cole o bloco "Prompt" abaixo como primeira mensagem**. O próprio prompt faz
> o setup (copiar o doc-set + corrigir o `.gitignore`). Trabalhe **um item por vez** — o
> `port-state.json` permite retomar entre sessões.
>
> Este arquivo é a **fonte única** do prompt de kickoff. Se ajustar o nível de autonomia,
> edite o bloco abaixo.

---

## Prompt (cole como primeira mensagem da sessão do Alya)

```
Você vai implementar, NESTE repo (Alya), as melhorias técnicas já feitas no IMPGEO,
guiado por um doc-set de port. Trabalhe UM ITEM POR VEZ, com plano e minha aprovação
antes de cada implementação.

CONTEXTO E FONTES
- Repo de referência (só leitura): IMPGEO em /Users/fernandocarvalho/impgeo. As fichas
  apontam commits reais dele via `git -C /Users/fernandocarvalho/impgeo show <sha>`.
- Doc-set de port: docs/PORT-ALYA-MELHORIAS/ (13 fichas + 00-MAPA + _DELTAS-ALYA +
  port-state.json). É o mapa da implementação.

PASSO 0 — SETUP (faça e me reporte antes de seguir)
1. Se docs/PORT-ALYA-MELHORIAS/ ainda não existir aqui, copie de
   /Users/fernandocarvalho/impgeo/docs/PORT-ALYA-MELHORIAS e ADICIONE no .gitignore do
   Alya as exceções `!/docs/PORT-ALYA-MELHORIAS/` e `!/docs/PORT-ALYA-MELHORIAS/**`
   (senão o *.md é ignorado). Confirme com `git check-ignore docs/PORT-ALYA-MELHORIAS/00-MAPA.md`
   (não deve retornar nada).
2. Confirme que o repo do IMPGEO está acessível no disco.
3. Leia suas memórias de projeto e estude rapidamente a estrutura do Alya (server.js,
   database-pg.js, services/pm/, src/subsistemas/, manifest.ts) para se situar.
4. Leia a TRÍADE de orientação: docs/PORT-ALYA-MELHORIAS/00-MAPA.md, _DELTAS-ALYA.md e
   port-state.json. NÃO leia as 13 fichas de uma vez.

COMO TRABALHAR CADA ITEM (loop)
a. No port-state.json, escolha o próximo item ELEGÍVEL: status "pending" com todos os
   depends_on em "done", menor "order". (O primeiro é o #1 — testes+CI.)
b. Abra SÓ a ficha daquele item e rode o bloco "Pré-condições no Alya". Se falhar, pare
   e me reporte — não porte às cegas.
c. Entre em PLANO e me mostre o plano do item. AGUARDE minha aprovação.
d. Só após aprovado, implemente lendo os diffs reais do IMPGEO + aplicando os deltas do
   Alya (do _DELTAS-ALYA.md e da §5 da ficha).
e. Rode o PORTÃO de verificação da ficha (node -c, boot, testes/smoke). Só siga se passar.
f. Atualize o item para "done" + ported_commit no port-state.json e me entregue o commit.
   Depois seguimos pro próximo item.

REGRAS DE PROCESSO (valem SEMPRE — o Alya não herda as memórias do IMPGEO)
- COMMITS: devolva em DOIS blocos shell separados (um `git add`, um `git commit`),
  PRONTOS mas NUNCA execute o commit (eu executo). Lista de arquivos EXPLÍCITA no add
  (nunca diretório). Mensagem via HEREDOC. SEM rodapé "Co-Authored-By". NUNCA `git add`
  de .claude/.
- Um commit por grupo testável (ou por item).
- BANCO: backup (pg_dump do banco `alya`) ANTES de qualquer operação de DB. Migrations
  rodam via `node run-migrations.js` (nomes COM espaço, ex.: "042 - NOME.sql"); confira
  o próximo número real com `ls server/migrations` antes de criar (não confie no "042"
  literal das fichas — é sequencial).
- PROD/VPS: qualquer mudança em produção vem com passo-a-passo executável, ordem certa,
  backup antes e rollback junto.
- Antes de implementar cada item: PLANO primeiro, e aguarde minha aprovação.
- Frontend: reusar componentes-padrão do Alya (Modal etc.) e a paleta amber/orange (NÃO
  a azul/índigo do IMPGEO).
- pt-BR, tom técnico e direto, sem resumos finais não solicitados.

COMECE AGORA pelo PASSO 0 (setup + tríade) e me diga: qual é o próximo item elegível e o
que as pré-condições dele acusam. NÃO implemente ainda — vamos item a item, com plano e
aprovação.
```

---

## Pré-flight (você, humano, antes de colar)
- [ ] Sessão nova com cwd = `/Users/fernandocarvalho/alya`.
- [ ] IMPGEO presente em `/Users/fernandocarvalho/impgeo` (para os `git show`).
- [ ] (O PASSO 0 do prompt já cuida de copiar o doc-set e do `.gitignore` — não precisa fazer à mão.)

## Ordem sugerida (do 00-MAPA)
`1 → 2 → 13 → 6 → 7 → 12 → 11 → 8 → 4 → 5 → 10·14 → 3 → 15`
(#9 é só auditoria — já feito no Alya; ver o mini-item no 00-MAPA.)
