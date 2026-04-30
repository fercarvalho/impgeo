/**
 * seed-documentation-part3.js  —  Parte 3: Seções 12–15
 * Projeção, FAQ, Roadmap e Versão, Administração (admin only)
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

async function createSection(title, ordem, adminOnly = false) {
  const id = newId();
  await pool.query(
    'INSERT INTO doc_sections (id, title, ordem, admin_only) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING',
    [id, title, ordem, adminOnly]
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
// SEÇÃO 12 — PROJEÇÃO FINANCEIRA
// ============================================================
async function seedProjecao() {
  const sid = await createSection('Projeção Financeira', 12);

  await createPage(sid, 'O que é a Projeção e para que serve', `# O que é a Projeção Financeira? 🔮

## Definição simples

A **Projeção Financeira** estima como serão as receitas, despesas e o saldo da empresa nos próximos meses. Em vez de ficar na dúvida sobre o futuro, você tem uma estimativa baseada no que aconteceu até agora.

---

## Para que você vai usar

| Situação | Como a projeção ajuda |
|----------|-----------------------|
| Planejamento do próximo ano | Estima receitas e despesas mês a mês |
| Decidir se vale contratar alguém | Simula o impacto da nova despesa no saldo futuro |
| Antecipar problemas de caixa | Mostra se o saldo vai ficar negativo em algum mês |
| Reunião de planejamento | Apresenta um plano financeiro visual e fundamentado |

---

## De onde vêm os números?

A projeção usa dois tipos de informação:

1. **Histórico de transações** lançadas no sistema — quanto a empresa costuma faturar e gastar
2. **Metas definidas** — se você tem metas de receita, elas entram como referência

Quanto mais transações você tiver registradas no sistema, mais precisa será a projeção.

---

## Curto, médio e longo prazo

- **1 a 3 meses à frente** → alta precisão, baseado no que já está previsto (transações pendentes, recorrências)
- **3 a 6 meses** → boa estimativa, com margem de variação natural
- **6 a 12 meses** → indicativo, útil para planejamento estratégico

---

> 💡 A projeção é uma **estimativa**, não uma certeza. Use como bússola, não como fato consumado. Atualize regularmente conforme o negócio evolui.
`, 1);

  await createPage(sid, 'Configurando e lendo a projeção', `# Configurando e lendo a projeção ⚙️

## Como gerar uma projeção

1. Acesse **Projeção** no menu lateral
2. Defina o **período de projeção** — quantos meses à frente você quer ver
3. Escolha a **base histórica** — quantos meses passados serão usados como referência (6 ou 12 meses é o ideal)
4. Clique em **"Calcular"**

---

## Entendendo o resultado

A projeção exibe uma tabela e/ou gráfico com:

| Coluna | O que significa |
|--------|----------------|
| **Mês** | O mês projetado |
| **Receita Projetada** | Estimativa de receita para aquele mês |
| **Despesa Projetada** | Estimativa de gastos |
| **Saldo Projetado** | Receita menos Despesa estimada |
| **Saldo Acumulado** | Resultado acumulado desde o início da projeção |

---

## O gráfico de saldo

O gráfico de linha mostra como o saldo deve evoluir. Se a linha está:
- **Subindo** → empresa acumulando resultado positivo 🟢
- **Caindo** → despesas superando receitas, atenção necessária 🔴
- **Cruzando o zero** → há risco de saldo negativo em determinado mês — hora de agir

---

## Ajuste manual

Se você sabe que algo diferente vai acontecer no futuro — um contrato grande que está prestes a ser fechado, ou uma despesa extra planejada — você pode adicionar esses valores manualmente na projeção para torná-la mais precisa.

1. Na projeção, clique no mês que quer ajustar
2. Adicione a receita ou despesa extra
3. A projeção recalcula automaticamente
`, 2);

  await createPage(sid, 'Cenários e planejamento anual', `# Cenários e planejamento anual 📅

## Trabalhando com cenários

Cenários permitem simular situações diferentes e comparar seus impactos:

- **Cenário base**: projeção com a tendência atual
- **Cenário otimista**: e se fecharmos aquele contrato grande?
- **Cenário conservador**: e se o volume cair 20%?

---

## Como criar um cenário

1. Na Projeção, clique em **"+ Novo Cenário"**
2. Dê um nome (ex: "Otimista — novo contrato")
3. Ajuste os valores de receita ou despesa que seriam diferentes
4. Compare os cenários no gráfico lado a lado

---

## Planejamento anual com a projeção

No início de cada ano, use a projeção para montar o orçamento anual:

\`\`\`mermaid
flowchart LR
    A[Analisar DRE\ndo ano anterior] --> B[Definir Metas\ndo novo ano]
    B --> C[Configurar Projeção\npara 12 meses]
    C --> D[Criar cenários\notimista e conservador]
    D --> E[Usar como referência\nao longo do ano]
\`\`\`

---

## Fluxo de caixa futuro

A aba **"Fluxo de Caixa Projetado"** mostra semana a semana as entradas e saídas previstas, incluindo transações pendentes já lançadas no sistema. Isso te avisa com antecedência se alguma semana vai ficar apertada financeiramente.

---

## Exportando a projeção

Clique em **"Exportar"** para baixar a projeção em PDF (ideal para reuniões) ou em Excel (para análises mais detalhadas). O arquivo inclui a tabela mensal e os gráficos.
`, 3);

  console.log('✅ Seção 12 (Projeção) criada.');
}

// ============================================================
// SEÇÃO 13 — FAQ
// ============================================================
async function seedFAQ() {
  const sid = await createSection('FAQ', 13);

  await createPage(sid, 'Como usar o FAQ', `# FAQ — Perguntas e Respostas ❓

## O que é o FAQ?

O **FAQ (Frequently Asked Questions)** é o espaço de perguntas e respostas frequentes do sistema. Se você tiver uma dúvida sobre como usar o IMPGeo, comece aqui antes de buscar ajuda.

---

## Como navegar no FAQ

1. Acesse **FAQ** no menu lateral
2. As perguntas são organizadas por categorias
3. Clique em uma pergunta para ver a resposta
4. Use a **busca** para encontrar respostas sobre um assunto específico

---

## Não encontrei o que preciso

Se sua dúvida não está no FAQ:
1. Consulte esta **Documentação** — pode ter a resposta detalhada aqui
2. Fale com o **administrador** do sistema na sua empresa
3. Se for um problema no sistema, informe ao admin para que ele possa registrar no Roadmap

---

## Sugerindo uma pergunta para o FAQ

Se você está com uma dúvida e acredita que outros usuários também podem ter, mencione ao administrador para que ele adicione a resposta ao FAQ. O FAQ é gerenciado pelo admin e pode ser expandido conforme novas dúvidas surgem.
`, 1);

  await createPage(sid, 'Dúvidas frequentes de uso', `# Dúvidas frequentes de uso 🔧

---

### Como vincular um imóvel a um projeto?

Na ficha do projeto, vá na aba **"Acompanhamentos"** → clique em **"+ Vincular Imóvel"** → selecione o acompanhamento desejado → salve.

Ou, pela ficha do acompanhamento, selecione o projeto no campo **"Projeto"**.

---

### Como registrar que o CAR de um imóvel foi aprovado?

Abra o acompanhamento → aba **"CAR"** → mude o **Status do CAR** para **"Ativo"** → preencha o número de inscrição e o link do comprovante → salve.

---

### Posso lançar uma transação com data retroativa?

Sim. No campo **Data** da transação, você pode digitar qualquer data, inclusive do passado.

---

### Como excluir um cliente que tem projetos vinculados?

Não é possível excluir — o sistema preserva o histórico. Em vez de excluir, **inative** o cliente: abra a ficha → mude o **Status** para **Inativo** → salve.

---

### A DRE não está mostrando todos os meses. Por quê?

A DRE só mostra meses que têm transações lançadas. Se um mês aparece em branco, verifique se as transações daquele período foram cadastradas.

---

### Posso alterar o valor de uma transação já lançada?

Sim. Clique na transação, edite o valor e salve. A alteração fica registrada no histórico do sistema.

---

### Como sei qual versão do sistema estou usando?

Veja no **rodapé** da tela ou acesse o módulo **Roadmap** (se disponível para você), que sempre exibe a versão atual no topo.

---

### Posso usar o sistema no celular?

Sim, a interface funciona em dispositivos móveis. Para melhor experiência em celular, use no modo paisagem (horizontal). Em tablets a experiência é completa.
`, 2);

  console.log('✅ Seção 13 (FAQ) criada.');
}

// ============================================================
// SEÇÃO 14 — ROADMAP E VERSÃO
// ============================================================
async function seedRoadmap() {
  const sid = await createSection('Roadmap e Versão', 14);

  await createPage(sid, 'Versão atual e novidades', `# Versão atual e novidades 📦

## Onde ver a versão do sistema

A versão atual do IMPGeo está visível no **rodapé** de todas as telas. Você também encontra no módulo **Roadmap** (se habilitado para você).

---

## O que é o Roadmap?

O **Roadmap** é o painel de planejamento do sistema — mostra o que está sendo desenvolvido, o que está planejado e o que já foi entregue.

Você pode usar o Roadmap para:
- Saber quais **novas funcionalidades** estão chegando
- Ver os **bugs conhecidos** que estão sendo corrigidos
- Acompanhar o **histórico de atualizações** do sistema

---

## Versão atual — v1.0.0

O IMPGeo foi lançado com os módulos completos:

✅ Dashboard com indicadores e gráficos
✅ Gestão de Clientes, Projetos e Serviços
✅ Módulo de Acompanhamentos (CAR, ITR, Geo, dados ambientais)
✅ Controle Financeiro (Transações, Metas, DRE, Projeção)
✅ Relatórios operacionais e financeiros
✅ FAQ e Documentação integrados
✅ Tema claro e escuro
✅ Administração de usuários e permissões

---

## Próximas atualizações planejadas

Consulte o módulo **Roadmap** para ver a lista completa e atualizada. As próximas funcionalidades em planejamento incluem notificações por e-mail, integração com sistemas externos e melhorias de desempenho.
`, 1);

  await createPage(sid, 'Enviando feedback e sugestões', `# Enviando feedback e sugestões 💬

## Sua opinião importa

O IMPGeo é um sistema que cresce com o uso. Se você encontrar algo que poderia funcionar melhor, ou tiver uma ideia de nova funcionalidade, há formas de contribuir:

---

## Como enviar feedback

### 1. Falar com o administrador
A forma mais direta. Descreva o que aconteceu (ou o que você gostaria que existisse) e peça ao admin que registre no Roadmap.

### 2. Pelo módulo Roadmap (se disponível)
Se você tem acesso ao Roadmap, pode visualizar itens já registrados. Comente com o admin se quiser adicionar algo novo.

---

## Como reportar um problema (bug)

Ao reportar um problema, inclua:

1. **O que você estava tentando fazer** — ex: "Estava tentando salvar uma transação"
2. **O que aconteceu** — ex: "A página ficou carregando e não salvou"
3. **Em que tela estava** — ex: "Módulo Transações, formulário de nova transação"
4. **Quando aconteceu** — data e hora aproximada

Quanto mais detalhes, mais rápido o problema pode ser resolvido.

---

## Sugestões de melhoria

Se você tem uma ideia de funcionalidade nova ou de melhoria em algo existente, relate ao admin com:

- **O que você quer fazer** que atualmente não é possível
- **Como isso ajudaria** no seu trabalho
- **Com que frequência** você usaria essa funcionalidade

---

> 💡 Boas sugestões que ajudam vários usuários têm mais chance de entrar no próximo ciclo de desenvolvimento. Seja específico!
`, 2);

  console.log('✅ Seção 14 (Roadmap e Versão) criada.');
}

// ============================================================
// SEÇÃO 15 — ADMINISTRAÇÃO  (visível apenas para admins)
// ============================================================
async function seedAdministracao() {
  const sid = await createSection('Administração', 15, true); // admin_only

  await createPage(sid, 'Visão geral para administradores', `# Administração do IMPGeo ⚙️

> 🔐 **Esta seção é destinada aos administradores do sistema.** Se você não é admin, pode não ter acesso ao módulo Administração.

---

## O que o administrador pode fazer

O módulo **Administração** centraliza tudo que envolve a gestão do sistema em si:

- **Criar e gerenciar usuários** — quem pode acessar o sistema
- **Definir permissões** — quais módulos cada usuário pode ver e usar
- **Configurar o sistema** — nome da empresa, e-mail, comportamentos gerais
- **Editar a documentação** — atualizar este guia que os usuários leem
- **Gerenciar o FAQ** — adicionar e editar perguntas e respostas
- **Acompanhar o Roadmap** — planejar e comunicar atualizações

---

## Acesse pelo menu lateral

O módulo **Administração** aparece no menu lateral apenas para usuários com perfil **admin**. Se você não vê o item, verifique seu perfil com o responsável técnico.

---

## Responsabilidade do administrador

O administrador é o ponto de contato interno para:
- Dúvidas dos usuários sobre acesso e permissões
- Problemas com o sistema (primeiro nível de suporte)
- Atualizações na documentação e no FAQ
- Comunicação sobre novas versões e mudanças no sistema
`, 1);

  await createPage(sid, 'Gerenciando usuários', `# Gerenciando usuários 👥

## Criando um novo usuário

1. Acesse **Administração** → **Usuários**
2. Clique em **"+ Novo Usuário"**
3. Preencha:
   - **Nome completo**
   - **Username** (usado para fazer login)
   - **E-mail** (para recuperação de senha)
   - **Senha temporária** — o usuário deve alterar no primeiro acesso
   - **Papel**: guest, user ou admin
4. Configure quais **módulos** ficam habilitados para ele
5. Salve — o usuário já pode fazer login

---

## Papéis de usuário

| Papel | O que pode fazer |
|-------|-----------------|
| **Guest** | Visualizar dados, sem criar ou editar |
| **User** | Usar todos os módulos operacionais habilitados |
| **Admin** | Tudo do User + acesso à Administração e Roadmap |

---

## Editando um usuário

1. Localize o usuário na lista
2. Clique em editar ✏️
3. Altere o que precisar (nome, e-mail, papel, módulos)
4. Salve

---

## Inativando um usuário

Quando alguém sair da empresa ou não precisar mais de acesso:

1. Abra o usuário
2. Mude o **Status** para **Inativo**
3. Salve

O usuário perde o acesso imediatamente, mas o histórico de ações dele é preservado.

---

## Redefinindo a senha de um usuário

1. Abra o usuário
2. Clique em **"Redefinir Senha"**
3. Defina uma senha temporária
4. Informe o usuário — ele poderá alterar ao fazer login

---

> ⚠️ Inative os usuários de ex-funcionários **imediatamente** após o desligamento. Não aguarde — acesso ativo é risco desnecessário.
`, 2);

  await createPage(sid, 'Configurando módulos por usuário', `# Configurando módulos por usuário 🛡️

## Por que controlar módulos?

Além do papel (guest/user/admin), você pode habilitar ou desabilitar módulos individualmente por usuário. Isso permite criar perfis customizados:

- Um estagiário que só precisa ver Acompanhamentos e Clientes
- Um técnico de campo que não precisa ver o módulo financeiro
- Um sócio que só precisa visualizar (guest) mas com acesso a DRE e Projeção

---

## Como configurar

1. Abra o usuário em **Administração** → **Usuários**
2. Role até a seção **"Módulos"**
3. Ative ✅ ou desative os módulos conforme necessário
4. Salve — as mudanças entram em vigor imediatamente

O menu do usuário se atualiza na próxima vez que ele navegar pelo sistema.

---

## Módulos e seus acessos mínimos

| Módulo | Quem pode ter acesso |
|--------|---------------------|
| Dashboard, Clientes, Projetos, Serviços, Acompanhamentos, Transações, Metas, Relatórios, DRE, Projeção, FAQ, Documentação | Qualquer papel (guest, user, admin) |
| **Roadmap** | Apenas admin |
| **Administração** | Apenas admin |

---

## Boas práticas

- Dê acesso ao **mínimo necessário** para cada função
- Revise as permissões a cada 3 meses ou sempre que houver mudança de função
- Nunca compartilhe logins — cada pessoa deve ter seu próprio usuário
`, 3);

  await createPage(sid, 'Editando a documentação e o FAQ', `# Editando a documentação e o FAQ 📝

## Você é o guardião do conteúdo

Como administrador, você mantém a documentação e o FAQ atualizados. Sempre que o sistema ganhar uma nova funcionalidade ou um usuário tiver uma dúvida recorrente, atualize o conteúdo aqui.

---

## Editando a Documentação

1. Acesse **Administração** → **Documentação**
2. No painel da esquerda, navegue até a seção e página que quer editar
3. Clique na página — ela abre no editor
4. Edite usando **Markdown** (formatação simples de texto)
5. Veja o resultado em tempo real no **Preview** ao lado
6. Clique em **"Salvar"** quando terminar

---

## Criando novas páginas e seções

Para adicionar uma nova página:
1. No painel esquerdo, clique no ícone **+** ao lado da seção desejada
2. Informe o título da página
3. Clique em **"Criar"**
4. A página abre vazia no editor — escreva o conteúdo e salve

Para criar uma nova seção:
1. Clique no botão **"+ Nova Seção"** no topo do painel esquerdo
2. Dê um nome à seção
3. Crie páginas dentro dela

---

## Editando o FAQ

O FAQ é gerenciado pelo admin da mesma forma — acesse a área de gestão do FAQ e adicione, edite ou reorganize as perguntas e respostas conforme necessário.

---

## Formatação com Markdown

O editor usa **Markdown**, uma linguagem simples de formatação:

| O que digitar | Como aparece |
|--------------|--------------|
| \`# Título\` | Título grande |
| \`## Subtítulo\` | Subtítulo |
| \`**negrito**\` | **negrito** |
| \`- item\` | • item de lista |
| \`1. item\` | 1. lista numerada |

---

> 💡 Mantenha a documentação sempre em dia. Um guia desatualizado confunde mais do que ajuda — quando algo no sistema mudar, lembre-se de atualizar a página correspondente aqui.
`, 4);

  await createPage(sid, 'Configurações gerais do sistema', `# Configurações gerais do sistema ⚙️

## Acessando as configurações

Em **Administração** → **Configurações** você encontra os ajustes gerais que afetam o comportamento do sistema para todos os usuários.

---

## O que você pode configurar

### Identidade da empresa
- **Nome da empresa** — exibido no cabeçalho dos relatórios
- **Logo** — logotipo que aparece no sistema
- **Fuso horário** — padrão para datas e horários

### E-mail do sistema
Para que o sistema envie e-mails (redefinição de senha, notificações), configure as informações do servidor de e-mail. Se não estiver configurado, a recuperação de senha por e-mail não funcionará.

Entre em contato com o responsável técnico para configurar o servidor de e-mail corretamente.

### Segurança
- **Tentativas de login** antes do bloqueio (padrão: 5)
- **Duração do bloqueio** após erros excessivos (padrão: 15 minutos)
- **Tempo de expiração de sessão** por inatividade

---

## Alterações que afetam todos

Cuidado ao alterar configurações de segurança — elas impactam **todos os usuários** imediatamente. Se for testar uma configuração, avise a equipe antes.

---

## Dúvidas sobre configurações avançadas

Para configurações que não aparecem nesta tela (servidor, banco de dados, integrações), fale com o **responsável técnico** da empresa. Essas configurações são feitas fora do sistema e não estão no painel de administração.
`, 5);

  console.log('✅ Seção 15 (Administração) criada.');
}

async function main() {
  try {
    console.log('🚀 Seed Parte 3 — Seções 12 a 15...');
    await seedProjecao();
    await seedFAQ();
    await seedRoadmap();
    await seedAdministracao();
    console.log('\n🎉 Parte 3 concluída! Documentação completa inserida.');
    console.log('📚 15 seções focadas no uso do sistema.');
  } catch (err) {
    console.error('❌ Erro:', err);
  } finally {
    await pool.end();
  }
}

main();
