require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'impgeo',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

function newId() {
  return crypto.randomUUID();
}

// Limpa o FAQ existente antes de recriar
async function clearExisting() {
  await pool.query('DELETE FROM faq');
  console.log('FAQ existente removido.');
}

// Garante que as colunas visibility e admin_only existem
async function ensureColumns() {
  await pool.query(`ALTER TABLE faq ADD COLUMN IF NOT EXISTS admin_only BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE faq ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) DEFAULT 'todos'`);
  console.log('Colunas de visibilidade garantidas.');
}

// visibility: 'todos' | 'usuarios' | 'admins'
async function insert(pergunta, resposta, ordem, visibility = 'todos') {
  const id = newId();
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO faq (id, pergunta, resposta, ativo, ordem, visibility, created_at, updated_at)
     VALUES ($1, $2, $3, true, $4, $5, $6, $6)`,
    [id, pergunta, resposta, ordem, visibility, now]
  );
}

async function seedFAQ() {
  console.log('Iniciando seed do FAQ...');
  await clearExisting();

  await ensureColumns();
  let ordem = 0;

  // ─── BLOCO 1: Primeiros Passos ─────────────────────────────────────────────

  await insert(
    'Como faço login no ImpGeo?',
    'Na tela inicial, informe seu e-mail e senha cadastrados e clique em "Entrar". Se for seu primeiro acesso, use as credenciais fornecidas pelo administrador.\n\nCaso esqueça a senha, clique em "Esqueci minha senha" e siga as instruções enviadas para o seu e-mail.',
    ordem++
  );

  await insert(
    'Esqueci minha senha. O que faço?',
    'Na tela de login, clique no link "Esqueci minha senha". Informe o e-mail cadastrado e você receberá um link para criar uma nova senha. O link expira em 60 minutos.\n\nSe não receber o e-mail, verifique a pasta de spam ou entre em contato com o administrador do sistema.',
    ordem++
  );

  await insert(
    'Como altero minha senha depois de fazer login?',
    'Acesse seu perfil clicando no seu avatar ou nome no menu lateral. Na aba "Segurança", você pode definir uma nova senha. Informe a senha atual e depois a nova senha duas vezes para confirmar.',
    ordem++
  );

  await insert(
    'Como atualizo minha foto e informações de perfil?',
    'Clique no seu avatar ou nome no menu lateral para abrir o seu perfil. Lá você pode:\n\n• Alterar nome de exibição e e-mail\n• Fazer upload de uma foto de perfil (formatos JPG ou PNG, até 2 MB)\n• Atualizar seu cargo e telefone\n\nNão esqueça de clicar em "Salvar" ao terminar.',
    ordem++
  );

  await insert(
    'O sistema funciona no celular?',
    'Sim! O ImpGeo é totalmente responsivo e pode ser acessado pelo navegador do celular ou tablet. Para melhor experiência, recomendamos usar Chrome, Safari ou Firefox em versões atualizadas.',
    ordem++
  );

  // ─── BLOCO 2: Navegação e Interface ────────────────────────────────────────

  await insert(
    'Como funciona o menu lateral?',
    'O menu lateral exibe os módulos que você tem acesso. Clique no ícone de cada módulo para navegar. Em telas menores, o menu pode ficar recolhido — clique no ícone de hambúrguer (☰) para abri-lo.\n\nOs módulos disponíveis dependem das permissões definidas pelo administrador.',
    ordem++
  );

  await insert(
    'Como altero o tema entre claro e escuro?',
    'No canto superior da barra lateral ou no seu perfil, há um botão para alternar entre o tema Claro e o tema Escuro. A preferência fica salva no seu navegador.',
    ordem++
  );

  await insert(
    'O que é o Dashboard e o que ele exibe?',
    'O Dashboard é a página inicial do sistema. Ele apresenta um resumo visual do seu negócio:\n\n• Cartões com totais de clientes, projetos e receitas\n• Gráficos de desempenho financeiro\n• Lista dos projetos e acompanhamentos mais recentes\n• Alertas de metas próximas do vencimento\n\nAs informações são atualizadas em tempo real.',
    ordem++
  );

  // ─── BLOCO 3: Clientes ─────────────────────────────────────────────────────

  await insert(
    'Como cadastro um novo cliente?',
    'Vá até o módulo Clientes e clique no botão "Novo Cliente" (ícone +). Preencha os dados obrigatórios (nome e CPF/CNPJ) e opcionalmente telefone, e-mail e endereço.\n\nApós salvar, o cliente fica disponível para ser vinculado a projetos e acompanhamentos.',
    ordem++
  );

  await insert(
    'Como busco um cliente já cadastrado?',
    'No módulo Clientes, use a barra de pesquisa no topo da lista. Você pode buscar por nome, CPF/CNPJ ou e-mail. Os resultados aparecem conforme você digita.',
    ordem++
  );

  await insert(
    'Posso editar ou excluir um cliente?',
    'Sim. Na lista de clientes, clique no cliente para abrir seus detalhes. Use o botão de edição (lápis) para alterar os dados ou o botão de exclusão (lixeira) para remover.\n\n⚠️ Atenção: excluir um cliente remove também todos os projetos, acompanhamentos e transações vinculadas a ele. Essa ação não pode ser desfeita.',
    ordem++
  );

  // ─── BLOCO 4: Projetos ─────────────────────────────────────────────────────

  await insert(
    'Como crio um novo projeto?',
    'Acesse o módulo Projetos e clique em "Novo Projeto". Informe o nome do projeto, selecione o cliente vinculado, defina o status inicial e, se desejar, o valor contratado e as datas de início e término.\n\nDepois de criar o projeto, você pode adicionar acompanhamentos e transações a ele.',
    ordem++
  );

  await insert(
    'Quais são os status possíveis de um projeto?',
    'Um projeto pode estar em um dos seguintes status:\n\n• **Orçamento** — proposta em análise\n• **Em andamento** — projeto ativo\n• **Concluído** — projeto finalizado\n• **Cancelado** — projeto encerrado sem conclusão\n• **Pausado** — projeto temporariamente suspenso\n\nVocê pode alterar o status a qualquer momento editando o projeto.',
    ordem++
  );

  await insert(
    'Como filtro projetos por status ou cliente?',
    'Na listagem de Projetos, use os filtros disponíveis no topo da página. É possível filtrar por status, cliente, período e valor. Você também pode ordenar os resultados por nome, data ou valor.',
    ordem++
  );

  // ─── BLOCO 5: Serviços ─────────────────────────────────────────────────────

  await insert(
    'O que são Serviços no sistema?',
    'Serviços são os tipos de trabalho ou entregas que você oferece (ex.: Levantamento Topográfico, Georeferenciamento, Laudo Técnico). Eles servem para categorizar projetos e facilitar relatórios de faturamento por tipo de serviço.\n\nCadastre seus serviços no módulo Serviços e depois vincule-os aos projetos.',
    ordem++
  );

  // ─── BLOCO 6: Acompanhamentos ──────────────────────────────────────────────

  await insert(
    'O que é um Acompanhamento?',
    'Acompanhamentos são registros de imóveis ou processos em andamento dentro de um projeto. Cada acompanhamento possui etapas de progresso, documentos e um status que reflete a situação atual do processo.',
    ordem++
  );

  await insert(
    'Como avanço a etapa de um acompanhamento?',
    'Abra o acompanhamento desejado e localize a seção de Etapas. Clique no botão de avançar ou marque a etapa como concluída. O progresso é atualizado automaticamente na barra de status.\n\nVocê pode adicionar observações em cada etapa antes de avançar.',
    ordem++
  );

  await insert(
    'Como anexo documentos a um acompanhamento?',
    'Dentro do acompanhamento, acesse a aba de Documentos. Clique em "Anexar Arquivo" e selecione o arquivo do seu computador. São aceitos PDF, JPG, PNG e outros formatos comuns (tamanho máximo: 10 MB por arquivo).\n\nOs documentos ficam armazenados e podem ser baixados a qualquer momento.',
    ordem++
  );

  await insert(
    'Como compartilho o status de um acompanhamento com o cliente?',
    'No módulo Acompanhamentos, localize o registro e clique em "Gerar Link de Compartilhamento". Um link único é criado e pode ser enviado por e-mail ou WhatsApp para o cliente.\n\nO cliente consegue visualizar o progresso sem precisar de login no sistema.',
    ordem++
  );

  // ─── BLOCO 7: Transações Financeiras ───────────────────────────────────────

  await insert(
    'Como registro uma receita ou despesa?',
    'Acesse o módulo Transações e clique em "Nova Transação". Selecione o tipo (Receita ou Despesa), informe a descrição, valor, data e categoria. Você também pode vincular a transação a um projeto.\n\nAs transações aparecem automaticamente nos relatórios e no DRE.',
    ordem++
  );

  await insert(
    'Posso importar um extrato bancário?',
    'Sim! No módulo Transações, use a opção "Importar Extrato". Faça upload do arquivo OFX ou CSV gerado pelo seu banco. O sistema lê as transações e permite que você as revise antes de confirmar a importação.',
    ordem++
  );

  await insert(
    'Como categorizo minhas transações?',
    'Ao criar ou editar uma transação, selecione uma categoria no campo correspondente. As categorias ajudam a organizar o DRE e os relatórios financeiros. Você pode criar categorias personalizadas no módulo de configurações.',
    ordem++
  );

  // ─── BLOCO 8: Metas ────────────────────────────────────────────────────────

  await insert(
    'Como crio uma meta financeira?',
    'No módulo Metas, clique em "Nova Meta". Defina o título, o valor alvo, o período (mês/ano) e o tipo (receita ou redução de despesa).\n\nO sistema acompanha automaticamente o progresso com base nas transações registradas no período.',
    ordem++
  );

  await insert(
    'O que acontece quando uma meta é atingida?',
    'Quando o valor acumulado no período alcança o valor alvo, a meta é marcada como "Atingida" e aparece com destaque verde no Dashboard. Você recebe um indicador visual de conquista na tela de Metas.',
    ordem++
  );

  // ─── BLOCO 9: DRE e Relatórios ─────────────────────────────────────────────

  await insert(
    'O que é o DRE?',
    'O DRE (Demonstrativo de Resultado do Exercício) é um relatório financeiro que consolida todas as receitas e despesas em um período, mostrando o resultado líquido (lucro ou prejuízo).\n\nAcesse o módulo DRE para visualizar o desempenho financeiro por mês, trimestre ou ano.',
    ordem++
  );

  await insert(
    'Como gero um relatório do sistema?',
    'No módulo Relatórios, escolha o tipo de relatório desejado (clientes, projetos, financeiro, etc.), aplique os filtros de período e clique em "Gerar". O resultado pode ser exportado em PDF ou Excel para envio ou arquivamento.',
    ordem++
  );

  // ─── BLOCO 10: Projeção Financeira ─────────────────────────────────────────

  await insert(
    'Como funciona a Projeção Financeira?',
    'O módulo de Projeção Financeira usa as transações históricas do sistema para estimar receitas e despesas futuras. Você pode ajustar os valores projetados manualmente e visualizar o cenário esperado para os próximos meses.\n\nÉ uma ferramenta de planejamento — não substitui a contabilidade oficial.',
    ordem++
  );

  // ─── BLOCO 11: Documentação e Ajuda ────────────────────────────────────────

  await insert(
    'Onde encontro o manual do sistema?',
    'Clique em "Documentação" no menu lateral. Lá você encontra guias completos sobre cada módulo, com passo a passo, dicas e exemplos de uso. Use a barra de pesquisa para localizar um tópico rapidamente.',
    ordem++
  );

  await insert(
    'Não encontrei resposta para minha dúvida. O que faço?',
    'Se sua dúvida não está no FAQ nem na Documentação, entre em contato com o administrador do sistema ou com o suporte técnico. Descreva o problema com o máximo de detalhes possível (o que tentou fazer, qual erro apareceu, em qual tela estava).',
    ordem++
  );

  // ─── BLOCO 12: Perguntas Exclusivas para Admins ────────────────────────────

  await insert(
    'Como cadastro e gerencio usuários do sistema?',
    'Acesse o módulo Administração > Usuários. Lá você pode:\n\n• Criar novos usuários informando nome, e-mail e perfil (user ou admin)\n• Editar dados e alterar a senha de qualquer usuário\n• Ativar ou desativar contas\n• Redefinir permissões de módulo por usuário\n\nNovos usuários recebem um e-mail com as credenciais de acesso.',
    ordem++,
    'admins'
  );

  await insert(
    'Como controlo quais módulos cada usuário pode acessar?',
    'Em Administração > Usuários, selecione o usuário e acesse a aba "Permissões". Para cada módulo do sistema, você pode ativar ou desativar o acesso individualmente.\n\nAs alterações têm efeito imediato — o usuário verá o menu atualizado no próximo acesso ou após recarregar a página.',
    ordem++,
    'admins'
  );

  await insert(
    'Como adiciono ou edito perguntas no FAQ?',
    'Acesse o módulo Administração > FAQ. Lá você pode criar novas perguntas e respostas, editar as existentes, reordenar via arrastar e soltar, ativar ou desativar itens e marcar uma pergunta como "somente admins".\n\nItens desativados ficam ocultos para todos os usuários.',
    ordem++,
    'admins'
  );

  await insert(
    'Como edito o conteúdo da Documentação?',
    'Em Administração > Documentação, você pode gerenciar seções e páginas:\n\n• Criar novas seções e definir a ordem de exibição\n• Adicionar ou editar páginas com conteúdo em Markdown\n• Marcar seções como "somente admins" para que usuários comuns não as vejam\n• Reorganizar a estrutura arrastando os itens\n\nAs alterações ficam visíveis para os usuários imediatamente.',
    ordem++,
    'admins'
  );

  await insert(
    'Como visualizo o histórico de ações dos usuários?',
    'Em Administração > Logs de Auditoria, você encontra o registro completo de ações realizadas no sistema: login, criação, edição e exclusão de registros, com data, hora, usuário e IP de origem.\n\nUse os filtros de período, usuário e tipo de ação para localizar um evento específico.',
    ordem++,
    'admins'
  );

  await insert(
    'Como configuro o rodapé e as informações institucionais do sistema?',
    'Acesse Administração > Configurações. Lá você pode:\n\n• Editar o logotipo e nome da empresa exibidos no sistema\n• Configurar o rodapé com links e informações de contato\n• Gerenciar os textos de Termos de Uso e Política de Privacidade\n• Ajustar o banner de consentimento de cookies\n\nSalve as alterações para que elas sejam aplicadas imediatamente.',
    ordem++,
    'admins'
  );

  await insert(
    'O que são os Logs de Anomalia e quando devo me preocupar?',
    'O sistema monitora automaticamente padrões suspeitos, como muitas tentativas de login com falha, acesso a horas incomuns ou volume elevado de requisições de um mesmo IP.\n\nEm Administração > Anomalias, você vê os alertas gerados. Avalie cada caso: se for legítimo (ex.: usuário esqueceu a senha várias vezes), pode ignorar. Se suspeitar de acesso indevido, considere bloquear o usuário ou IP.',
    ordem++,
    'admins'
  );

  await insert(
    'Como acompanho as sessões ativas dos usuários?',
    'Em Administração > Sessões, você visualiza quais usuários estão logados no momento, com informações de dispositivo, navegador e IP. É possível encerrar qualquer sessão individualmente ou revogar todas as sessões de um usuário de uma vez.',
    ordem++,
    'admins'
  );

  console.log(`\n✅ FAQ criado com sucesso! Total: ${ordem} perguntas (${ordem - 8} usuários + 8 admins)`);
}

seedFAQ()
  .catch(err => { console.error('Erro ao criar FAQ:', err); process.exit(1); })
  .finally(() => pool.end());
