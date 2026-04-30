/**
 * seed-documentation-part2.js  —  Parte 2: Seções 7–11
 * Acompanhamentos, Transações, Metas, DRE, Relatórios
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'impgeo',
  user: process.env.DB_USER || 'fernandocarvalho',
  password: process.env.DB_PASSWORD || '',
});

function newId() { return crypto.randomUUID(); }

async function createSection(title, ordem) {
  const id = newId();
  await pool.query(
    'INSERT INTO doc_sections (id, title, ordem) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
    [id, title, ordem]
  );
  return id;
}

async function createPage(sectionId, title, content, ordem) {
  const id = newId();
  await pool.query(
    'INSERT INTO doc_pages (id, section_id, title, content, ordem) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING',
    [id, sectionId, title, content, ordem]
  );
  return id;
}

// ============================================================
// SEÇÃO 7 — ACOMPANHAMENTOS
// ============================================================
async function seedAcompanhamentos() {
  const sid = await createSection('Acompanhamentos', 7);

  await createPage(sid, 'O que são Acompanhamentos', `# O que são Acompanhamentos 🗺️

## Para que serve este módulo?

**Acompanhamentos** é o módulo onde você registra e monitora os **imóveis rurais** atendidos pela empresa. Para cada propriedade, o sistema guarda a situação do CAR, do ITR, do Georreferenciamento e os dados ambientais — tudo em um único cadastro.

---

## Quando criar um acompanhamento?

Crie um registro de acompanhamento toda vez que sua empresa começar a trabalhar com um imóvel rural — seja para fazer o CAR, regularizar o georreferenciamento, declarar o ITR ou qualquer serviço relacionado à propriedade.

---

## O que você monitora

\`\`\`mermaid
graph TD
    I[Imóvel Rural] --> A[CAR\nCadastro Ambiental Rural]
    I --> B[ITR\nImposto Territorial Rural]
    I --> C[Georreferenciamento]
    I --> D[Dados Ambientais\nAPP e Reserva Legal]
    I --> E[Culturas e Uso do Solo]
\`\`\`

---

## Acompanhamento vs. Projeto vs. Serviço

- Um **imóvel** pode ter vários processos (CAR, geo, ITR) — isso fica no Acompanhamento
- Um **projeto** é o contrato maior com o cliente — pode envolver vários imóveis
- Um **serviço** é a atividade específica executada (ex: "Georreferenciamento da Fazenda X")

Os três podem ser vinculados entre si para manter tudo rastreável.
`, 1);

  await createPage(sid, 'Registrando um imóvel rural', `# Registrando um imóvel rural 📝

## Como cadastrar

1. Acesse **Acompanhamentos** no menu lateral
2. Clique em **"+ Novo Acompanhamento"**
3. Preencha os dados do imóvel nas abas do formulário
4. Salve

---

## Aba: Dados do Imóvel

| Campo | O que é |
|-------|---------|
| **Nome do imóvel** | Ex: "Fazenda Santa Ana" |
| **Código do imóvel** | Código interno ou número do SNCR |
| **Município** | Cidade onde o imóvel está localizado |
| **Nº INCRA / CCIR** | Número do certificado de cadastro rural |
| **Área total** | Tamanho total da propriedade em hectares |
| **Matrícula(s)** | Número(s) de matrícula em cartório |
| **Mapa** | Link para o arquivo de mapa (Google Drive, etc.) |
| **Cliente** | Proprietário / cliente responsável |
| **Projeto** | Projeto ao qual este imóvel está vinculado |

---

## Aba: CAR

| Campo | O que preencher |
|-------|----------------|
| **Número do CAR** | Código de inscrição no SICAR |
| **Link do CAR** | URL do comprovante no portal do SICAR |
| **Status do CAR** | Pendente / Em análise / Ativo / Cancelado |

---

## Aba: Georreferenciamento

| Campo | O que preencher |
|-------|----------------|
| **Certificação** | Número ou data da certificação pelo INCRA |
| **Registro** | Data do registro em cartório |

---

## Aba: ITR

Informe a situação atual do ITR: Pendente, Em dia, Atrasado ou Isento.

---

## Abas: Dados Ambientais e Culturas

Áreas de Reserva Legal, APP (vegetada e não vegetada), remanescente florestal e culturas praticadas na propriedade (com respectivas áreas em hectares).
`, 2);

  await createPage(sid, 'Acompanhando o CAR e o ITR', `# Acompanhando o CAR e o ITR 🌿

## CAR — Cadastro Ambiental Rural

O CAR é obrigatório para imóveis rurais e necessário para acessar crédito rural e programas governamentais. O IMPGeo te ajuda a controlar a situação de cada imóvel.

### Status do CAR

| Status | Significa |
|--------|-----------|
| **Pendente** | Imóvel ainda não inscrito no SICAR |
| **Em análise** | Inscrição enviada, aguardando aprovação do órgão |
| **Ativo** | CAR aprovado e regularizado |
| **Cancelado** | CAR cancelado, precisa de nova inscrição |

### Como atualizar

Sempre que o status do CAR mudar (ex: saiu da análise e foi aprovado), abra o acompanhamento, atualize o campo **Status do CAR** e salve. Se receber o número de inscrição, preencha também o campo **Número do CAR** e o link do comprovante.

---

## ITR — Imposto Territorial Rural

O ITR tem prazos anuais e multas por atraso. Use o campo **ITR** para manter o controle:

| Status | Quando usar |
|--------|-------------|
| **Pendente** | Declaração ainda não feita para o exercício atual |
| **Em dia** | ITR declarado e pago corretamente |
| **Atrasado** | Prazo passou e o ITR não foi resolvido |
| **Isento** | Imóvel com isenção legal do ITR |

---

## Alertas automáticos

O Dashboard exibe alertas para imóveis com **CAR pendente** e **ITR em atraso** — assim você não precisa verificar um por um. Basta olhar o painel de alertas na tela inicial.
`, 3);

  await createPage(sid, 'Georreferenciamento', `# Georreferenciamento 📍

## O que registrar no sistema

Quando você executa o georreferenciamento de um imóvel, há dois marcos importantes a registrar:

1. **Certificação pelo INCRA** — quando o INCRA aprova o levantamento e emite o certificado
2. **Registro em cartório** — quando o georreferenciamento é averbado na matrícula do imóvel

---

## Como atualizar após a certificação

1. Abra o acompanhamento do imóvel
2. Vá na aba **"Georreferenciamento"**
3. Preencha o campo **"Certificação"** com o número ou a data do certificado emitido pelo INCRA
4. Salve

---

## Como atualizar após o registro em cartório

1. Abra o acompanhamento
2. Na aba **"Georreferenciamento"**, preencha o campo **"Registro"** com a data da averbação
3. Salve

---

## O link do mapa

Preencha o campo **"Mapa"** com o link onde o arquivo do mapa georreferenciado está armazenado (Google Drive, OneDrive, servidor próprio). Isso permite acessar o arquivo de qualquer lugar com um clique.

---

## Por que manter atualizado?

Com os campos de certificação e registro preenchidos, o sistema sabe que o georreferenciamento desse imóvel está concluído e ele **não aparece mais** nos alertas de pendência. Isso mantém o painel de alertas limpo e confiável.
`, 4);

  await createPage(sid, 'Dados ambientais e culturas', `# Dados ambientais e culturas 🌱

## Para que servem esses dados?

Os dados ambientais documentam a situação do imóvel em relação ao **Código Florestal** — reserva legal, APP e vegetação nativa. As culturas registram o uso produtivo do solo.

Esses dados são úteis para:
- Identificar imóveis com **passivo ambiental** (APP ou reserva legal deficiente)
- Gerar relatórios para clientes sobre a situação ambiental da propriedade
- Apoiar a elaboração de laudos e planos de regularização

---

## Campos de área ambiental

| Campo | O que registrar |
|-------|----------------|
| **Reserva Legal** | Área de reserva legal da propriedade (hectares) |
| **APP — Código Florestal** | Total de APP exigida pela lei (hectares) |
| **APP Vegetada** | Porção da APP com vegetação nativa preservada |
| **APP Não Vegetada** | Porção da APP sem vegetação (possível passivo) |
| **Remanescente Florestal** | Total de vegetação nativa no imóvel |

---

## Campos de cultura / uso do solo

| Campo | Exemplo |
|-------|---------|
| **Cultura 1 + Área** | Soja — 150 ha |
| **Cultura 2 + Área** | Milho — 80 ha |
| **Outros usos + Área** | Pastagem — 40 ha |

---

## Passivo ambiental

Se a área de APP não vegetada for significativa ou a reserva legal for menor do que o exigido por lei, o imóvel pode ter **passivo ambiental**. Isso pode exigir um Programa de Regularização Ambiental (PRA) ou compensação de reserva legal — serviços que você pode registrar e acompanhar no sistema.
`, 5);

  await createPage(sid, 'Filtrando e exportando acompanhamentos', `# Filtrando e exportando acompanhamentos 🔍

## Encontrando imóveis específicos

Use os filtros da listagem de Acompanhamentos para encontrar rapidamente o que você procura:

| Filtro | Opções |
|--------|--------|
| **Município** | Filtra imóveis de uma cidade específica |
| **Status do CAR** | Pendente, Em análise, Ativo, Cancelado |
| **Geo certificado** | Sim / Não |
| **Geo registrado** | Sim / Não |
| **ITR** | Pendente, Em dia, Atrasado, Isento |
| **Cliente** | Filtra por proprietário |
| **Projeto** | Filtra pelo projeto vinculado |

---

## Exportando os dados

Com os filtros aplicados, clique em **"Exportar"** para baixar a lista no formato desejado:

- **CSV** — para análise em planilha
- **Excel** — com formatação e colunas organizadas
- **PDF** — relatório formatado para apresentação ou envio ao cliente

---

## Relatórios de acompanhamento

No módulo **Relatórios** você encontra relatórios prontos específicos para acompanhamentos:

- **Situação geral do CAR** — todos os imóveis com seu status de CAR
- **Pendências de geo** — imóveis sem certificação ou sem registro
- **ITR por município** — situação do ITR agrupada por cidade
- **Áreas ambientais** — totais de reserva legal, APP e remanescente florestal

---

> 💡 Exporte a lista de pendências de CAR e geo mensalmente e compartilhe com a equipe técnica para que todos saibam o que precisa de atenção.
`, 6);

  console.log('✅ Seção 7 (Acompanhamentos) criada.');
}

// ============================================================
// SEÇÃO 8 — TRANSAÇÕES
// ============================================================
async function seedTransacoes() {
  const sid = await createSection('Transações', 8);

  await createPage(sid, 'Lançando receitas e despesas', `# Lançando receitas e despesas 💰

## O que são Transações?

**Transações** são todos os registros de movimentação financeira da empresa — dinheiro que entrou (receitas) e dinheiro que saiu (despesas). Manter as transações atualizadas é o que torna possível acompanhar a DRE, as metas e as projeções financeiras com precisão.

---

## Como lançar uma transação

1. Acesse **Transações** no menu lateral
2. Clique em **"+ Nova Transação"**
3. Escolha o tipo: **Receita** ou **Despesa**
4. Preencha:

| Campo | O que colocar |
|-------|--------------|
| **Valor** | Valor da movimentação |
| **Data** | Data em que ocorreu (pode ser retroativa) |
| **Categoria** | Tipo de receita ou despesa |
| **Descrição** | O que é essa movimentação (opcional mas recomendado) |
| **Status** | Pago/Recebido ou Pendente |
| **Cliente** | Vincular ao cliente (em receitas) |
| **Projeto** | Vincular ao projeto correspondente |
| **Forma de pagamento** | PIX, boleto, transferência, dinheiro... |

5. Clique em **"Salvar"**

---

## Status da transação

| Status | Quando usar |
|--------|-------------|
| **Pago / Recebido** | A movimentação já aconteceu de fato |
| **Pendente** | Prevista mas ainda não efetivada |
| **Atrasado** | Venceu e não foi pago/recebido |
| **Cancelado** | Não será mais realizada |

---

## Comprovante

Você pode anexar o comprovante de pagamento diretamente na transação. Clique em **"Anexar Comprovante"** e selecione o arquivo (PDF, PNG ou JPG, máx. 10 MB).
`, 1);

  await createPage(sid, 'Categorias de receitas e despesas', `# Categorias de receitas e despesas 🗂️

## Por que categorizar?

A categoria define como a transação aparece nos relatórios e na DRE. Uma categorização consistente é o que torna possível saber, por exemplo, quanto a empresa gasta com deslocamento de campo ou quanto fatura com serviços de CAR.

---

## Categorias de Receita

| Categoria | Exemplos |
|-----------|---------|
| **Georreferenciamento** | Pagamentos de serviços de geo |
| **CAR** | Honorários de inscrição/regularização de CAR |
| **ITR** | Pagamentos de declaração de ITR |
| **Consultoria** | Assessoria técnica e ambiental |
| **Projetos** | Recebimentos de contratos de projeto |
| **Outras Receitas** | Receitas que não se enquadram nas categorias acima |

---

## Categorias de Despesa

| Categoria | Exemplos |
|-----------|---------|
| **Pessoal** | Salários, pró-labore, benefícios |
| **Equipamentos** | GPS, drones, computadores, acessórios |
| **Software** | Assinaturas e licenças de programas |
| **Deslocamento** | Combustível, pedágio, hospedagem em campo |
| **Impostos e Taxas** | ISS, tributos sobre serviços |
| **Cartório e Registros** | ART, certidões, taxas de registro |
| **Escritório** | Aluguel, internet, materiais de escritório |
| **Outras Despesas** | Despesas diversas não categorizadas |

---

> 💡 Se uma transação não se encaixa em nenhuma categoria, use **"Outras Receitas"** ou **"Outras Despesas"** — mas evite usar demais, pois isso dificulta a análise por categoria nos relatórios.
`, 2);

  await createPage(sid, 'Pesquisando e filtrando transações', `# Pesquisando e filtrando transações 🔍

## Encontrando uma transação

Use a **barra de busca** para localizar transações pela descrição. Para uma pesquisa mais precisa, use os filtros disponíveis:

| Filtro | Opções |
|--------|--------|
| **Tipo** | Receita ou Despesa |
| **Período** | Data inicial e final |
| **Status** | Pago, Pendente, Atrasado, Cancelado |
| **Categoria** | Filtro por tipo de receita/despesa |
| **Cliente** | Transações vinculadas a um cliente específico |
| **Projeto** | Transações de um projeto específico |

---

## O painel de resumo

No topo da listagem, um resumo mostra automaticamente (com os filtros aplicados):
- **Total de receitas** no período
- **Total de despesas** no período
- **Saldo** (receitas - despesas)

Isso é útil para calcular rapidamente o resultado de um mês, projeto ou cliente específico.

---

## Editando uma transação

1. Clique na transação na lista
2. Altere os campos necessários
3. Clique em **"Salvar"**

---

## Excluindo uma transação

Clique no ícone 🗑️ na linha da transação e confirme. A exclusão não pode ser desfeita — se foi um erro de lançamento, prefira cancelar (mude o status para Cancelado) em vez de excluir, para manter o histórico.
`, 3);

  await createPage(sid, 'Exportando o extrato financeiro', `# Exportando o extrato financeiro 📤

## Para que exportar?

Exporte o extrato para:
- Enviar ao contador mensalmente
- Fazer a conciliação com o extrato bancário
- Apresentar em reunião de resultados
- Ter um backup externo dos lançamentos

---

## Como exportar

1. Aplique os filtros de **período** e outros que desejar
2. Clique em **"Exportar"**
3. Escolha o formato:
   - **CSV** — para planilhas e importação em outros sistemas
   - **Excel** — com colunas formatadas e totais por categoria
   - **PDF** — extrato formatado, ideal para envio ao contador ou ao cliente

---

## Importando transações em massa

Se você tiver muitas transações para lançar de uma vez (ex: ao começar a usar o sistema com histórico anterior), use a importação por CSV:

1. Acesse **Transações** → **"Importar"**
2. Baixe o **modelo CSV** fornecido
3. Preencha as transações no modelo
4. Faça o upload e confirme

---

## Conciliação com o banco

Use o extrato exportado para conferir se os valores no IMPGeo batem com o extrato bancário real. Se encontrar diferença:
- **Transação faltando no sistema**: lance a transação com a data correta
- **Valor errado**: edite a transação e corrija
- **Transação a mais**: verifique se foi um lançamento duplicado e exclua

---

> 💡 Faça a conciliação mensalmente, logo após o fechamento do mês. Fica muito mais fácil do que tentar resolver vários meses de diferença de uma vez.
`, 4);

  console.log('✅ Seção 8 (Transações) criada.');
}

// ============================================================
// SEÇÃO 9 — METAS
// ============================================================
async function seedMetas() {
  const sid = await createSection('Metas', 9);

  await createPage(sid, 'Definindo suas metas', `# Definindo suas metas 🎯

## Para que servem as Metas?

As **Metas** permitem que você defina objetivos financeiros e operacionais para um período e acompanhe se a empresa está no caminho certo para atingi-los. É como ter um placar ao vivo do desempenho da empresa.

---

## Tipos de meta que você pode criar

| Tipo | Exemplo |
|------|---------|
| **Meta de receita** | Faturar R$ 50.000 no mês de março |
| **Meta de projetos** | Concluir 5 projetos no trimestre |
| **Meta de clientes** | Captar 3 novos clientes no semestre |
| **Meta de margem** | Manter margem líquida acima de 20% |

---

## Como criar uma meta

1. Acesse **Metas** no menu lateral
2. Clique em **"+ Nova Meta"**
3. Defina:
   - **Tipo** de meta
   - **Valor alvo** (o número ou valor que quer atingir)
   - **Período** — mensal, trimestral ou anual
   - **Descrição** (opcional, para lembrar o contexto)
4. Salve

---

## Quando definir as metas?

O ideal é definir as metas **antes do início do período** — no começo do mês, trimestre ou ano. Metas criadas depois já começam atrasadas.

---

## Dica para metas realistas

Antes de definir a meta, consulte o histórico dos meses anteriores no módulo **Relatórios** ou **DRE**. Uma meta bem calibrada está um pouco acima da média histórica — desafiadora, mas alcançável.
`, 1);

  await createPage(sid, 'Acompanhando o progresso das metas', `# Acompanhando o progresso das metas 📊

## O painel de metas

O módulo Metas exibe um painel visual com todas as metas ativas e o progresso de cada uma:

| Indicador | O que mostra |
|-----------|-------------|
| **Valor alvo** | A meta que você definiu |
| **Realizado** | Quanto foi atingido até agora |
| **Progresso %** | Percentual concluído da meta |
| **Projeção** | Se vai atingir a meta ao final do período |
| **Dias restantes** | Quanto tempo ainda tem no período |

---

## Como o progresso é calculado

O sistema calcula o progresso automaticamente com base nos registros do sistema:

- **Meta de receita** → soma as transações de receita do período
- **Meta de projetos** → conta projetos com status "Concluído" no período
- **Meta de clientes** → conta novos clientes cadastrados no período

Você não precisa atualizar manualmente — basta manter as transações e status em dia.

---

## Os semáforos de progresso

| Cor | Significado |
|-----|-------------|
| 🟢 Verde | Progresso está dentro ou acima do esperado |
| 🟡 Amarelo | Um pouco abaixo do ritmo, mas ainda possível |
| 🔴 Vermelho | Bem abaixo do esperado — ação necessária |

---

## Metas no Dashboard

As metas ativas também aparecem no **Dashboard**, na seção de indicadores. Você pode ver rapidamente, sem abrir o módulo de Metas, se o mês está indo bem ou não.

---

## Histórico de metas

Metas de períodos anteriores ficam registradas como histórico. Acesse a aba **"Histórico"** para ver o percentual de atingimento de cada meta passada — útil para calibrar as próximas.
`, 2);

  console.log('✅ Seção 9 (Metas) criada.');
}

// ============================================================
// SEÇÃO 10 — DRE
// ============================================================
async function seedDRE() {
  const sid = await createSection('DRE', 10);

  await createPage(sid, 'O que é a DRE e como ler', `# O que é a DRE? 📈

## Definição simples

A **DRE (Demonstração do Resultado do Exercício)** é um relatório que mostra, de forma organizada, quanto a empresa faturou, quanto gastou e qual foi o resultado final (lucro ou prejuízo) em um período.

No IMPGeo, a DRE é gerada automaticamente a partir das **transações lançadas** no sistema.

---

## Como ler a DRE

A DRE é lida de cima para baixo, como uma cascata:

| Linha | O que significa |
|-------|----------------|
| **Receita Bruta** | Tudo que entrou — soma de todas as receitas |
| **Custos dos Serviços** | O que foi gasto diretamente para executar os serviços (campo, equipamentos, subcontratados) |
| **Lucro Bruto** | Receita menos os custos diretos |
| **Despesas Operacionais** | Os gastos fixos para manter a empresa funcionando (salários, aluguel, software, etc.) |
| **Resultado Operacional** | Lucro bruto menos as despesas operacionais |
| **Resultado Líquido** | O que sobrou depois de tudo, incluindo impostos |

---

## Resultado positivo ou negativo?

- **Resultado positivo** 🟢 → a empresa lucrou no período
- **Resultado negativo** 🔴 → as despesas superaram as receitas

---

## Para que serve no dia a dia?

Use a DRE para responder perguntas como:
- "O mês foi bom financeiramente?"
- "Estamos gastando mais do que faturando?"
- "Qual categoria de despesa está pesando mais?"
- "A margem está melhorando ou piorando ao longo dos meses?"
`, 1);

  await createPage(sid, 'Gerando e usando a DRE', `# Gerando e usando a DRE 📊

## Como gerar a DRE

1. Acesse **DRE** no menu lateral
2. Selecione o **período** desejado (mês, trimestre ou ano)
3. A DRE é calculada e exibida automaticamente
4. Para exportar, clique em **"Exportar"** → escolha PDF ou Excel

---

## DRE mensal vs. DRE anual

- **Mensal**: veja o resultado de um único mês — ideal para reuniões mensais de gestão
- **Trimestral**: visão do trimestre — boa para acompanhar tendências
- **Anual**: resultado do exercício completo — base para planejamento do próximo ano

---

## Comparando períodos

Selecione dois períodos para comparar lado a lado:
- Janeiro vs. Fevereiro
- Q1 vs. Q2
- Este ano vs. ano anterior

Isso ajuda a identificar sazonalidade e tendências de crescimento ou queda.

---

## Sinais de atenção na DRE

| Situação | O que pode significar |
|----------|----------------------|
| Lucro bruto caindo | Custos de serviço aumentando ou preços baixos |
| Despesas operacionais > 50% da receita | Estrutura pesada em relação ao faturamento |
| Resultado negativo por 2+ meses | Situação crítica, requer revisão urgente |
| Margem melhorando mês a mês | 🟢 Empresa crescendo de forma saudável |

---

## A DRE precisa de transações corretas

A qualidade da DRE depende diretamente de:
- Todas as receitas e despesas estarem **lançadas** no sistema
- As transações estarem **categorizadas corretamente**
- O status estar como **"Pago/Recebido"** (transações pendentes não entram na DRE realizada)

---

> 💡 Compartilhe a DRE em PDF com seu contador todo mês. Facilita a contabilidade e mantém todos na mesma página.
`, 2);

  console.log('✅ Seção 10 (DRE) criada.');
}

// ============================================================
// SEÇÃO 11 — RELATÓRIOS
// ============================================================
async function seedRelatorios() {
  const sid = await createSection('Relatórios', 11);

  await createPage(sid, 'Gerando relatórios', `# Gerando relatórios 📋

## O que são os Relatórios?

O módulo **Relatórios** reúne relatórios prontos que combinam dados de diferentes módulos do sistema. É diferente de simplesmente exportar uma lista — os relatórios cruzam informações e apresentam análises consolidadas.

---

## Como gerar um relatório

1. Acesse **Relatórios** no menu lateral
2. Escolha a **categoria** do relatório
3. Selecione o **relatório específico**
4. Configure os **filtros** (período, cliente, projeto, etc.)
5. Clique em **"Gerar"**
6. Visualize na tela e, se desejar, clique em **"Exportar"**

---

## Relatórios Financeiros

| Relatório | O que mostra |
|-----------|-------------|
| **Fluxo de Caixa** | Entradas e saídas semana a semana ou mês a mês |
| **Receitas por Categoria** | Quanto cada tipo de serviço gerou de receita |
| **Despesas por Categoria** | Onde o dinheiro está sendo gasto |
| **Extrato do Período** | Lista detalhada de todas as transações |
| **Comparativo Mensal** | Mês a mês do exercício atual |

---

## Relatórios Operacionais

| Relatório | O que mostra |
|-----------|-------------|
| **Projetos por Status** | Quantos projetos em cada status e seus valores |
| **Serviços por Categoria** | Volume de serviços executados por tipo |
| **Produtividade** | Comparativo de produção entre períodos |

---

## Relatórios de Acompanhamentos

| Relatório | O que mostra |
|-----------|-------------|
| **Situação do CAR** | Todos os imóveis com seu status de CAR |
| **Pendências de Geo** | Imóveis sem certificação ou sem registro de geo |
| **ITR por Município** | Situação do ITR agrupada por cidade |
| **Áreas Ambientais** | Totais de RL, APP e remanescente florestal |

---

> 💡 Gere o relatório **"Pendências de Geo"** e **"Situação do CAR"** mensalmente para priorizar o trabalho da equipe técnica.
`, 1);

  await createPage(sid, 'Exportando e compartilhando relatórios', `# Exportando e compartilhando relatórios 📤

## Formatos disponíveis

| Formato | Melhor para |
|---------|-------------|
| **PDF** | Apresentações, reuniões, envio ao cliente |
| **Excel** | Análises personalizadas com fórmulas adicionais |
| **CSV** | Integração com planilhas ou outros sistemas |

---

## Como exportar

Após gerar o relatório, clique em **"Exportar"** e escolha o formato. O download começa automaticamente.

---

## Enviando para o cliente

Para enviar um relatório de acompanhamento ao cliente:

1. Gere o relatório com o filtro de **cliente** aplicado
2. Exporte em **PDF**
3. Envie o arquivo por e-mail ou pelo canal de comunicação que usar com o cliente

---

## Relatórios para o contador

Envie mensalmente ao contador:
- **DRE do mês** (em PDF ou Excel)
- **Extrato do período** (todas as transações do mês)

Com esses dois relatórios, o contador tem tudo que precisa para a contabilidade.

---

## Dicas de uso

- Salve os relatórios com nomes descritivos: ex. \`DRE_Marco_2026.pdf\`
- Crie uma pasta por mês para organizar os arquivos exportados
- Compare relatórios de períodos diferentes para identificar tendências
`, 2);

  console.log('✅ Seção 11 (Relatórios) criada.');
}

async function main() {
  try {
    console.log('🚀 Seed Parte 2 — Seções 7 a 11...');
    await seedAcompanhamentos();
    await seedTransacoes();
    await seedMetas();
    await seedDRE();
    await seedRelatorios();
    console.log('\n✅ Parte 2 concluída.');
  } catch (err) {
    console.error('❌ Erro:', err);
  } finally {
    await pool.end();
  }
}

main();
