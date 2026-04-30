/**
 * seed-documentation.js  —  Parte 1: Seções 1–6
 * Guia de uso do IMPGeo para o usuário final.
 * Execute: node server/seed-documentation-run.js
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

async function clearExisting() {
  await pool.query('DELETE FROM doc_pages');
  await pool.query('DELETE FROM doc_sections');
  console.log('✅ Documentação anterior removida.');
}

// ============================================================
// SEÇÃO 1 — BEM-VINDO AO IMPGEO
// ============================================================
async function seedBemVindo() {
  const sid = await createSection('Bem-vindo ao IMPGeo', 1);

  await createPage(sid, 'O que é o IMPGeo', `# Bem-vindo ao IMPGeo 👋

O **IMPGeo** é o sistema de gestão da sua empresa de geoprocessamento. Aqui você controla tudo em um só lugar: clientes, projetos, serviços, imóveis rurais em acompanhamento, finanças e muito mais.

---

## O que você pode fazer no sistema

- 📋 **Cadastrar e acompanhar clientes, projetos e serviços**
- 🗺️ **Monitorar imóveis rurais** — CAR, ITR, Georreferenciamento e dados ambientais
- 💰 **Registrar receitas e despesas** e acompanhar o fluxo de caixa
- 🎯 **Definir metas** e acompanhar se estão sendo atingidas
- 📊 **Gerar relatórios** e ver a DRE da empresa
- 🔮 **Fazer projeções financeiras** para planejar o futuro
- 📚 **Consultar o FAQ** e esta documentação quando tiver dúvidas

---

## Como o sistema é organizado

Tudo fica no **menu lateral**, à esquerda da tela. Cada item do menu é um módulo diferente. Clique no módulo que você quer usar e o conteúdo aparece na área principal.

No canto superior direito você encontra:
- Seu nome e ícone de usuário — para acessar o perfil e sair
- O botão de tema ☀️ / 🌙 — para alternar entre claro e escuro

---

## Quem pode ver o quê

O que aparece no seu menu depende do seu **perfil de acesso**, configurado pelo administrador. Se você não encontrar um módulo que precisa, fale com o admin da empresa.

---

> 💡 Está começando agora? Comece pelo **Dashboard** para ter uma visão geral do sistema e depois explore os módulos conforme a sua rotina de trabalho.
`, 1);

  await createPage(sid, 'Fazendo login e saindo do sistema', `# Fazendo login e saindo do sistema 🔑

## Entrando no sistema

1. Abra o endereço do sistema no seu navegador
2. Digite seu **usuário** e **senha**
3. Clique em **Entrar**

Pronto! Você será direcionado automaticamente para o Dashboard.

---

## Esqueci minha senha

Na tela de login, clique em **"Esqueci minha senha"**, informe seu e-mail cadastrado e você receberá um link para criar uma nova senha. O link é válido por 1 hora.

Se não receber o e-mail, verifique a caixa de spam ou fale com o administrador do sistema.

---

## Segurança do login

- Após **5 tentativas erradas**, o acesso fica bloqueado por 15 minutos
- Sua sessão expira automaticamente após um período de inatividade
- O sistema nunca envia e-mails pedindo sua senha — desconfie de qualquer mensagem assim

---

## Saindo do sistema

Sempre que terminar de usar, saia pelo menu do usuário no canto superior direito:

1. Clique no seu nome ou ícone de usuário
2. Clique em **"Sair"**

> ⚠️ **Em computadores compartilhados**, sempre faça logout antes de sair. Não salve sua senha no navegador nesses dispositivos.
`, 2);

  await createPage(sid, 'Navegando pelo sistema', `# Navegando pelo sistema 🧭

## O menu lateral

Toda a navegação acontece pelo **menu lateral** à esquerda. Clique em qualquer item para acessar aquele módulo.

Em telas menores (celular ou tablet), o menu pode estar recolhido — procure o ícone ☰ para abri-lo.

---

## A barra superior

Na parte de cima da tela você encontra:

| Elemento | O que faz |
|----------|-----------|
| **Logo / Nome do sistema** | Clique para voltar ao Dashboard |
| **Ícone ☀️ / 🌙** | Alterna entre tema claro e escuro |
| **Seu nome / avatar** | Abre o menu do usuário (perfil, sair) |

---

## Listas e tabelas

A maioria dos módulos exibe uma **lista de registros** em formato de tabela. Você pode:

- Usar a **barra de busca** no topo para filtrar em tempo real
- Clicar em uma linha para ver os detalhes ou editar
- Usar os botões de ação (editar ✏️, excluir 🗑️) em cada linha
- Navegar entre páginas pelos controles na parte inferior

---

## Modais e formulários

Quando você clica em **"+ Novo"** ou em editar um registro, um formulário aparece. Campos com **\*** são obrigatórios. Clique em **"Salvar"** para confirmar ou **"Cancelar"** para descartar.

---

## Atalhos úteis

- **ESC** — fecha modais abertos
- **Enter** em campos de busca — confirma a pesquisa
- Clicar fora de um modal — fecha sem salvar (em alguns casos)
`, 3);

  await createPage(sid, 'Tema claro e escuro', `# Tema claro e escuro 🌙

## Alternando o tema

Clique no ícone **☀️** (para escuro) ou **🌙** (para claro) na barra superior direita a qualquer momento.

A preferência é salva automaticamente — na próxima vez que você entrar no sistema, o tema escolhido estará ativo.

---

## Tema claro

Fundo branco com texto escuro. Ideal para ambientes iluminados e uso prolongado em monitor.

## Tema escuro

Fundo azul-escuro com texto claro. Reduz o cansaço visual em ambientes com pouca luz ou uso noturno.

---

## Os gráficos e diagramas também se adaptam

Todos os gráficos do Dashboard, DRE, Projeção e os diagramas da Documentação se ajustam automaticamente ao tema selecionado — você não precisa fazer nada.
`, 4);

  await createPage(sid, 'Rodapé e informações do sistema', `# Rodapé e informações do sistema 📋

## O que você encontra no rodapé

O rodapé do sistema, visível na parte inferior de todas as telas, exibe informações sobre o IMPGeo:

---

## Versão do sistema

No rodapé você verá a **versão atual** do sistema (ex: v1.0.0). Use essa informação quando precisar reportar um problema ou consultar o que mudou em uma atualização.

---

## Informações da empresa

O rodapé também exibe o nome da empresa e dados de contato configurados pelo administrador.

---

## Feedback e sugestões

Encontrou um problema ou tem uma sugestão de melhoria? Você pode:

1. Acessar o módulo **FAQ** para ver se a dúvida já foi respondida
2. Consultar o **Roadmap** para ver o que está planejado (se o módulo estiver disponível para você)
3. Falar diretamente com o administrador do sistema

---

## Sobre o sistema

O IMPGeo é desenvolvido e mantido pela equipe técnica da empresa. Atualizações são lançadas periodicamente com melhorias e novas funcionalidades. Fique de olho no **Roadmap** para acompanhar o que está por vir.
`, 5);

  console.log('✅ Seção 1 (Bem-vindo) criada.');
}

// ============================================================
// SEÇÃO 2 — SEU PERFIL
// ============================================================
async function seedPerfil() {
  const sid = await createSection('Seu Perfil', 2);

  await createPage(sid, 'Acessando e editando seu perfil', `# Seu perfil de usuário 👤

## Como acessar

Clique no seu nome ou ícone de usuário no **canto superior direito** e selecione **"Meu Perfil"** ou **"Configurações"**.

---

## O que você pode editar

| Campo | Descrição |
|-------|-----------|
| **Nome de exibição** | Como seu nome aparece no sistema |
| **E-mail** | Seu e-mail de contato (usado para recuperação de senha) |
| **Foto de perfil** | Imagem exibida no menu e nos registros |

---

## Preferências

Nas configurações de perfil você também pode:

- Definir o **tema padrão** ao abrir o sistema (claro ou escuro)
- Ver quais **módulos estão habilitados** para você

---

## Informações de acesso

Na sua página de perfil você consegue ver:

- Seu **papel no sistema** (guest, user ou admin)
- **Data do último acesso**
- **Sessões recentes** (dispositivos onde você está logado)

---

> 💡 Mantenha seu e-mail sempre atualizado. Ele é necessário para recuperar o acesso caso você esqueça a senha.
`, 1);

  await createPage(sid, 'Alterando sua senha', `# Alterando sua senha 🔒

## Passo a passo

1. Acesse **Meu Perfil** no menu do usuário (canto superior direito)
2. Clique em **"Alterar Senha"**
3. Digite sua **senha atual** para confirmar que é você
4. Digite a **nova senha** duas vezes
5. Clique em **"Salvar"**

---

## Requisitos da nova senha

- Mínimo de **8 caracteres**
- Pelo menos **uma letra maiúscula**
- Pelo menos **um número**
- Evite usar datas de nascimento, nomes próprios ou sequências óbvias (123456, abc123)

---

## Quando trocar a senha?

Troque sua senha se:
- Você suspeitar que alguém teve acesso a ela
- O administrador solicitou uma troca por segurança
- Você usa a mesma senha em outros sistemas (boa prática: senhas únicas por sistema)

---

## Esqueci minha senha atual

Se você não lembra a senha atual, saia do sistema e use a opção **"Esqueci minha senha"** na tela de login para receber um link de redefinição por e-mail.
`, 2);

  await createPage(sid, 'Módulos disponíveis para você', `# Módulos disponíveis para você 🗂️

## Por que não vejo todos os módulos?

O que aparece no seu menu é definido pelo seu **perfil de acesso**, configurado pelo administrador. Cada usuário pode ter uma combinação personalizada de módulos habilitados.

---

## Verificando seus módulos

Na página **Meu Perfil**, a seção **"Meus Módulos"** lista todos os módulos que você tem acesso e os que estão desabilitados.

---

## Módulos disponíveis no sistema

| Módulo | Para que serve |
|--------|---------------|
| **Dashboard** | Visão geral com indicadores e gráficos |
| **Clientes** | Cadastro e gestão de clientes |
| **Projetos** | Controle de projetos da empresa |
| **Serviços** | Registro e acompanhamento de serviços |
| **Acompanhamentos** | Monitoramento de imóveis rurais |
| **Transações** | Lançamento de receitas e despesas |
| **Metas** | Definição e acompanhamento de objetivos |
| **Relatórios** | Geração de relatórios operacionais e financeiros |
| **DRE** | Demonstração do Resultado do Exercício |
| **Projeção** | Projeções e simulações financeiras |
| **FAQ** | Perguntas e respostas frequentes |
| **Documentação** | Este guia de uso do sistema |
| **Roadmap** | Novidades e próximas atualizações (admin) |
| **Administração** | Gestão de usuários e configurações (admin) |

---

## Preciso de acesso a um módulo

Se você precisa usar um módulo que não aparece no seu menu, solicite ao **administrador do sistema** que ele habilite o acesso para você.
`, 3);

  console.log('✅ Seção 2 (Perfil) criada.');
}

// ============================================================
// SEÇÃO 3 — DASHBOARD
// ============================================================
async function seedDashboard() {
  const sid = await createSection('Dashboard', 3);

  await createPage(sid, 'Entendendo o Dashboard', `# Entendendo o Dashboard 🏠

## O que é o Dashboard?

O Dashboard é a **primeira tela** que você vê ao entrar no sistema. Ele reúne os indicadores mais importantes da empresa em um único lugar, para que você tenha uma visão rápida de tudo sem precisar entrar em cada módulo.

---

## Os cartões de indicadores (KPIs)

Na parte superior do Dashboard há cartões com os principais números:

| Cartão | O que mostra |
|--------|-------------|
| **Receita Total** | Soma de todas as receitas no período selecionado |
| **Despesas** | Soma de todas as despesas no período |
| **Saldo** | Receita menos Despesas |
| **Projetos Ativos** | Quantidade de projetos em andamento |
| **Clientes** | Total de clientes cadastrados e ativos |

Clique em qualquer cartão para ir direto ao módulo correspondente.

---

## Escolhendo o período

Use o **seletor de período** no topo do Dashboard para escolher qual intervalo de tempo quer visualizar:

- Hoje
- Esta semana
- Este mês
- Este trimestre
- Este ano
- Período personalizado (você define as datas)

Todos os indicadores e gráficos se atualizam automaticamente ao mudar o período.

---

## Os gráficos

Abaixo dos cartões você encontra gráficos visuais. Passe o cursor sobre qualquer ponto ou barra para ver os valores exatos em destaque.
`, 1);

  await createPage(sid, 'Gráficos e o que eles significam', `# Gráficos do Dashboard 📊

## Receitas vs. Despesas

Gráfico de **barras lado a lado** mostrando, mês a mês, quanto entrou e quanto saiu. É a forma mais rápida de ver se a empresa está com saldo positivo ou negativo em cada mês.

- Barra **azul/verde** = Receitas
- Barra **vermelha** = Despesas
- Quando a azul é maior que a vermelha: 🟢 saldo positivo naquele mês

---

## Evolução do Saldo

Gráfico de **linha** mostrando como o saldo acumulado evoluiu ao longo do período. Se a linha está subindo, a empresa está acumulando resultado positivo. Se está caindo, as despesas estão superando as receitas.

---

## Metas do período

Um indicador visual (barra de progresso ou percentual) mostrando o quanto das metas do período atual já foi atingido.

- 🟢 **Verde**: meta atingida ou no caminho certo
- 🟡 **Amarelo**: atenção, abaixo do esperado para esta data
- 🔴 **Vermelho**: bem abaixo da meta, requer ação

---

## Painel de Acompanhamentos

Um resumo rápido dos imóveis rurais em acompanhamento, destacando os que têm pendências como CAR não registrado, Georreferenciamento em andamento ou ITR a resolver. Clique em qualquer alerta para ir direto ao registro correspondente.

---

> 💡 O Dashboard não atualiza automaticamente em tempo real — recarregue a página para ver os dados mais recentes.
`, 2);

  await createPage(sid, 'Dicas de uso do Dashboard', `# Dicas de uso do Dashboard 💡

## Comece o dia pelo Dashboard

Abra o Dashboard toda manhã para ter uma visão rápida de como está o mês. Verifique:

1. O saldo do mês — está positivo?
2. As metas — estamos no ritmo certo?
3. Os alertas de acompanhamento — há alguma pendência crítica?

---

## Use os filtros de período

O filtro de período padrão é o **mês atual**. Você pode mudar para ver um trimestre completo ou fazer comparações. Experimente selecionar "Este ano" para ter uma visão ampla da evolução financeira.

---

## Os cartões são atalhos

Cada cartão do Dashboard é clicável. Em vez de ir no menu e depois filtrar, clique direto no cartão que te interessa e o sistema já abre o módulo correspondente com o contexto certo.

---

## Gráficos interativos

Clique nas **legendas** dos gráficos para mostrar ou ocultar séries específicas. Por exemplo, num gráfico de receitas por categoria, você pode ocultar as categorias que não te interessam no momento para focar nas que importam.

---

## Seu ponto de partida

Sempre que você se perder no sistema ou quiser "zerar" a navegação, clique no **logo do IMPGeo** no topo da página para voltar ao Dashboard.
`, 3);

  console.log('✅ Seção 3 (Dashboard) criada.');
}

// ============================================================
// SEÇÃO 4 — CLIENTES
// ============================================================
async function seedClientes() {
  const sid = await createSection('Clientes', 4);

  await createPage(sid, 'Cadastrando um cliente', `# Cadastrando um cliente 👥

## Por que cadastrar corretamente?

Um cadastro completo facilita vincular projetos, acompanhamentos de imóveis e transações ao cliente certo. Também permite gerar relatórios por cliente e manter um histórico fiel do relacionamento.

---

## Como cadastrar

1. Acesse **Clientes** no menu lateral
2. Clique em **"+ Novo Cliente"**
3. Preencha o formulário:

| Campo | O que colocar | Obrigatório? |
|-------|--------------|:---:|
| **Nome / Razão Social** | Nome completo ou nome da empresa | ✅ |
| **CPF / CNPJ** | Documento de identificação | ✅ |
| **Tipo** | Pessoa Física ou Pessoa Jurídica | ✅ |
| **Telefone** | Número de contato principal | — |
| **E-mail** | E-mail de contato | — |
| **Município** | Cidade onde o cliente está | — |
| **Estado** | UF | — |
| **Observações** | Notas internas sobre o cliente | — |

4. Clique em **"Salvar"**

---

## Evite duplicatas

Antes de criar um novo cliente, **pesquise pelo CPF/CNPJ** para ter certeza de que ele não está cadastrado. O sistema avisa sobre possíveis duplicatas, mas a conferência prévia evita problemas.

---

## Cliente inativo vs. excluído

Se um cliente não tem mais relação ativa com a empresa, prefira **inativá-lo** (mude o status para Inativo) em vez de excluir. Isso preserva todo o histórico de projetos e transações vinculados a ele.
`, 1);

  await createPage(sid, 'Pesquisando e editando clientes', `# Pesquisando e editando clientes 🔍

## Encontrando um cliente

Na listagem de Clientes, use a **barra de pesquisa** no topo para filtrar pelo nome, CPF/CNPJ ou município. A lista se atualiza enquanto você digita.

Você também pode usar os **filtros** para mostrar apenas:
- Clientes **ativos** ou **inativos**
- Clientes de uma **cidade específica**

---

## Editando os dados

1. Localize o cliente na lista
2. Clique na linha do cliente ou no ícone de edição ✏️
3. Altere os campos necessários
4. Clique em **"Salvar"**

---

## Inativando um cliente

1. Abra o cliente
2. Mude o campo **Status** para **Inativo**
3. Salve

Clientes inativos ficam ocultos da lista padrão mas podem ser encontrados ativando o filtro **"Mostrar inativos"**.

---

## Excluindo um cliente

A exclusão só é possível para clientes **sem nenhum registro vinculado** (projetos, acompanhamentos, transações). Se o cliente tiver histórico, o sistema não permitirá a exclusão — use a inativação.

---

> ⚠️ A exclusão de um cliente é permanente e registrada no sistema.
`, 2);

  await createPage(sid, 'Histórico e visão geral do cliente', `# Histórico e visão geral do cliente 📋

## A ficha do cliente

Ao clicar em um cliente, você abre a ficha completa dele, com todas as informações e histórico consolidados:

---

## O que você encontra na ficha

### Dados Cadastrais
Nome, documento, contato, endereço e status.

### Projetos Vinculados
Lista de todos os projetos criados para este cliente, com status e valor de cada um.

### Acompanhamentos
Imóveis rurais cadastrados para este cliente — com situação do CAR, ITR e Georreferenciamento.

### Transações
Histórico financeiro: todas as receitas recebidas e valores em aberto.

### Resumo Financeiro
- Total faturado para o cliente
- Total já recebido
- Valor ainda em aberto

---

## Exportando a ficha do cliente

Na ficha do cliente, clique em **"Exportar"** para baixar um relatório em PDF com todos os dados e histórico. Útil para reuniões ou para enviar ao cliente.

---

> 💡 Use a ficha do cliente como ponto de partida quando um cliente ligar com dúvidas. Em segundos você tem todo o histórico de projetos e pendências na tela.
`, 3);

  console.log('✅ Seção 4 (Clientes) criada.');
}

// ============================================================
// SEÇÃO 5 — PROJETOS
// ============================================================
async function seedProjetos() {
  const sid = await createSection('Projetos', 5);

  await createPage(sid, 'Criando e gerenciando projetos', `# Criando e gerenciando projetos 📁

## O que é um Projeto no IMPGeo?

Um **projeto** representa um trabalho contratado por um cliente — pode ser a regularização de uma fazenda, um contrato de georreferenciamento de várias propriedades, ou qualquer conjunto de serviços prestados para um mesmo contratante.

---

## Criando um projeto

1. Acesse **Projetos** no menu lateral
2. Clique em **"+ Novo Projeto"**
3. Preencha:

| Campo | Descrição |
|-------|-----------|
| **Nome do projeto** | Ex: "Regularização Fazenda São João" |
| **Cliente** | Selecione o cliente na lista |
| **Data de início** | Quando o projeto começou |
| **Prazo previsto** | Data esperada de conclusão (opcional) |
| **Valor total** | Valor contratado (opcional) |
| **Descrição** | Detalhes do escopo (opcional) |

4. Clique em **"Salvar"**

---

## Status do projeto

Ao longo da vida do projeto, atualize o status conforme o andamento:

| Status | Quando usar |
|--------|-------------|
| **Ativo** | Projeto em andamento normal |
| **Pausado** | Trabalho temporariamente suspenso |
| **Concluído** | Entregue e finalizado |
| **Cancelado** | Encerrado sem conclusão |

Para alterar, abra o projeto, mude o campo **Status** e salve.

---

## Prazos e alertas

O Dashboard e a listagem de projetos destacam automaticamente projetos com:
- 🔴 **Prazo vencido**: a data prevista passou e o projeto ainda está ativo
- 🟡 **Prazo próximo**: menos de 7 dias para o prazo estimado
`, 1);

  await createPage(sid, 'Vinculando serviços e acompanhamentos', `# Vinculando serviços e acompanhamentos 🔗

## Por que vincular?

Ao vincular serviços e acompanhamentos a um projeto, você mantém tudo organizado e consegue ver o andamento completo em um único lugar — sem precisar cruzar informações entre módulos.

---

## Adicionando serviços ao projeto

1. Abra o projeto
2. Vá na aba **"Serviços"**
3. Clique em **"+ Adicionar Serviço"**
4. Selecione o serviço ou crie um novo
5. Informe o valor e o status daquele serviço
6. Salve

---

## Vinculando imóveis (Acompanhamentos)

1. Abra o projeto
2. Vá na aba **"Acompanhamentos"**
3. Clique em **"+ Vincular Imóvel"**
4. Selecione um acompanhamento já cadastrado ou crie um novo
5. Salve

---

## Acompanhando o financeiro do projeto

Na aba **"Financeiro"** do projeto você vê:
- Receitas recebidas vinculadas a este projeto
- Despesas associadas
- Saldo do projeto (valor contratado vs. recebido)

---

## Visão consolidada

A página principal do projeto mostra tudo junto: quantos serviços estão concluídos, quais imóveis estão regularizados e o resumo financeiro — tudo em uma tela só.
`, 2);

  await createPage(sid, 'Acompanhando o andamento dos projetos', `# Acompanhando o andamento dos projetos 📊

## A listagem de projetos

A tela principal do módulo Projetos exibe todos os projetos com:
- Nome e cliente
- Status atual
- Data de início e prazo
- Valor total

Use os **filtros** no topo para ver apenas projetos de um determinado status, cliente ou período.

---

## Pesquisando projetos

Digite no campo de busca para filtrar projetos pelo nome ou pela descrição. A lista atualiza em tempo real.

---

## Atualizando o progresso

Abra qualquer projeto e você pode:
- Mudar o **status** (ativo, pausado, concluído, cancelado)
- Atualizar o **prazo previsto**
- Marcar serviços vinculados como concluídos
- Registrar notas e observações

---

## Exportando a lista de projetos

Clique em **"Exportar"** na listagem para baixar a lista em formato CSV ou Excel — útil para reuniões de gestão ou para acompanhar o pipeline em uma planilha externa.

---

> 💡 Crie o hábito de atualizar o status dos projetos semanalmente. Um dashboard com projetos desatualizados não reflete a realidade do negócio.
`, 3);

  console.log('✅ Seção 5 (Projetos) criada.');
}

// ============================================================
// SEÇÃO 6 — SERVIÇOS
// ============================================================
async function seedServicos() {
  const sid = await createSection('Serviços', 6);

  await createPage(sid, 'Cadastrando e acompanhando serviços', `# Cadastrando e acompanhando serviços 🔧

## O que é um Serviço?

**Serviços** são as atividades prestadas pela empresa para os clientes — georreferenciamento, CAR, ITR, consultoria ambiental, levantamentos topográficos, e assim por diante.

Cada serviço pode ser vinculado a um projeto e a um cliente, permitindo rastrear o que foi feito, para quem e quanto foi cobrado.

---

## Cadastrando um novo serviço

1. Acesse **Serviços** no menu lateral
2. Clique em **"+ Novo Serviço"**
3. Preencha:

| Campo | Descrição |
|-------|-----------|
| **Nome** | Ex: "Georreferenciamento Fazenda Bela Vista" |
| **Categoria** | Tipo do serviço (Geo, CAR, ITR, Consultoria...) |
| **Valor** | Valor cobrado pelo serviço |
| **Cliente** | Cliente que solicitou |
| **Projeto** | Projeto ao qual pertence (se houver) |
| **Status** | Situação atual |
| **Descrição** | Detalhes do escopo (opcional) |

4. Salve

---

## Status do serviço

| Status | Quando usar |
|--------|-------------|
| **Orçamento** | Proposta enviada, aguardando aprovação |
| **Em execução** | Aprovado e em andamento |
| **Concluído** | Entregue ao cliente |
| **Suspenso** | Temporariamente parado |
| **Cancelado** | Não será mais executado |

---

## Filtrando serviços

Use a busca e os filtros para encontrar serviços por **status**, **categoria**, **cliente** ou **período**.
`, 1);

  await createPage(sid, 'Categorias e controle de serviços', `# Categorias e controle de serviços 📂

## Por que categorizar os serviços?

As categorias permitem:
- Ver quais tipos de serviço geram mais receita
- Filtrar a lista por tipo de trabalho
- Gerar relatórios segmentados por categoria

---

## Categorias comuns de serviço

| Categoria | Exemplos de serviços |
|-----------|---------------------|
| **Georreferenciamento** | Levantamento GPS, certificação INCRA |
| **CAR** | Inscrição, atualização, regularização |
| **ITR** | Declaração, assessoria fiscal rural |
| **Consultoria Ambiental** | PRA, laudos, pareceres técnicos |
| **Documentação** | ART, certidões, registros em cartório |
| **Topografia** | Levantamento planialtimétrico, locações |

---

## Marcando um serviço como concluído

Quando o trabalho for entregue:

1. Abra o serviço
2. Mude o status para **"Concluído"**
3. Se desejar, registre a data de entrega e observações
4. Salve

Isso é especialmente útil para acompanhar a produtividade da equipe e calcular o percentual de serviços concluídos no mês.

---

## Serviço concluído gera receita?

Ao concluir um serviço, você pode criar uma **transação de receita** correspondente no módulo Transações. Não é automático — você lança manualmente para ter controle sobre quando o pagamento foi recebido.

---

> 💡 Mantenha os status dos serviços sempre atualizados. Eles aparecem nos relatórios e ajudam a calcular a produtividade real da equipe.
`, 2);

  console.log('✅ Seção 6 (Serviços) criada.');
}

async function main() {
  try {
    console.log('🚀 Seed Parte 1 — Seções 1 a 6...');
    await clearExisting();
    await seedBemVindo();
    await seedPerfil();
    await seedDashboard();
    await seedClientes();
    await seedProjetos();
    await seedServicos();
    console.log('\n✅ Parte 1 concluída.');
  } catch (err) {
    console.error('❌ Erro:', err);
  } finally {
    await pool.end();
  }
}

main();
