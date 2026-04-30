#!/usr/bin/env node
/**
 * Grava as notas de versão (copiadas do banco de desenvolvimento) na VPS.
 * Rodar na raiz do projeto: node scripts/populate-history.cjs
 */

const path = require('path');
const { Pool } = require(path.join(__dirname, '../server/node_modules/pg'));

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 5432,
  user:     process.env.DB_USER     || 'fernandocarvalho',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME     || 'impgeo',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const NOTAS_VERSAO = `<h2>Versão 2.0</h2>
<h3>✨ Novas Funcionalidades</h3>
<ul>
  <li><strong>Roadmap</strong> — kanban com timer, colunas dinâmicas e configurações por admin/superadmin</li>
  <li><strong>Importação de Extratos Bancários</strong> — importação de arquivos OFX/CSV com sandbox de revisão antes de confirmar os lançamentos</li>
  <li><strong>FAQ</strong> — perguntas e respostas gerenciáveis pelo painel admin, com controle de visibilidade por nível de usuário</li>
  <li><strong>Documentação do Sistema</strong> — editor rich text com suporte a Markdown, diagramas Mermaid e controle de visibilidade por seção</li>
  <li><strong>Rodapé Dinâmico</strong> — totalmente gerenciável pelo painel admin: colunas, links, dados da empresa, seção de informações, links de base, versão do sistema e notas de lançamento</li>
  <li><strong>Nova Página de Login</strong> — design moderno com gradientes e rodapé integrado</li>
  <li><strong>Gerenciamento de Sessões Ativas</strong> — visualização e revogação de sessões por usuário</li>
  <li><strong>Representação de Usuário</strong> — superadmin pode navegar como qualquer usuário</li>
  <li><strong>Termos de Uso, Política de Privacidade e Cookies</strong> — conformidade com a LGPD, banner de consentimento com categorias por usuário</li>
  <li><strong>Versão do Sistema no Rodapé</strong> — clicável, com notas de lançamento</li>
</ul>

<h3>🔒 Segurança</h3>
<ul>
  <li>Detecção de anomalias e alertas de segurança automáticos</li>
  <li>Registro de auditoria completo (ações, IPs, timestamps)</li>
  <li>Gerenciamento de refresh tokens com rotação automática</li>
  <li>Proteção contra IPs com múltiplas falhas de login</li>
  <li>Sessões com expiração de 8 horas</li>
</ul>

<h3>🎨 Interface</h3>
<ul>
  <li>Dark Mode completo com toggle manual em todo o sistema</li>
  <li>Painel admin reformulado com paleta azul/indigo</li>
  <li>Criação de usuários com fluxo completo em modal (tipo, dados, confirmação)</li>
  <li>Módulos críticos restritos a superadmin no painel de administração</li>
  <li>Navegação responsiva com exibição adaptada do nome de usuário</li>
</ul>

<h3>📋 Correções e Melhorias</h3>
<ul>
  <li>Seleção dinâmica de mês/ano/trimestre no Dashboard</li>
  <li>Gráfico de pizza dinâmico com Recharts no Dashboard</li>
  <li>Links de compartilhamento baseados em slug com URL curta <code>/v/:token</code></li>
  <li>Correção de parsing de valores monetários em ponto flutuante no DRE</li>
  <li>Ano fixo substituído por cálculo dinâmico em todo o sistema</li>
</ul>

<p><em>Lançada em abril de 2026.</em></p>

<hr>

<h2>Versão 1.0</h2>
<p><em>Versão inicial do sistema ImpGeo — gestão de geoprocessamento e topografia.</em></p>

<h3>✨ Funcionalidades</h3>
<ul>
  <li><strong>Dashboard Financeiro</strong> — gráficos de receita, despesas, margem líquida, progresso trimestral e gráfico de rosca por categoria</li>
  <li><strong>Gestão de Clientes (CRM)</strong> — cadastro completo com importação e exportação via Excel</li>
  <li><strong>Gestão de Projetos</strong> — controle de status, clientes vinculados, valores e prazos</li>
  <li><strong>Serviços</strong> — catálogo de serviços oferecidos vinculado a projetos</li>
  <li><strong>Acompanhamentos</strong> — controle por etapas de imóveis e processos em andamento, com upload de documentos e links de compartilhamento com clientes</li>
  <li><strong>Gestão de Transações</strong> — filtros avançados, busca, importação e exportação de planilhas Excel, subcategorias</li>
  <li><strong>DRE</strong> — Demonstrativo de Resultado do Exercício com exportação CSV</li>
  <li><strong>Projeção Financeira</strong> — comparativo de metas vs. realizado por período</li>
  <li><strong>Metas</strong> — acompanhamento de progresso com cards anuais e mensais</li>
  <li><strong>Relatórios</strong> — exportação em PDF por período (semana, mês, trimestre, ano)</li>
  <li><strong>Painel de Administração</strong> — gestão de usuários, permissões por módulo, logs de atividade e anomalias</li>
  <li><strong>Upload de Avatares</strong> — suporte a JPG e PNG até 10 MB</li>
</ul>

<h3>🎨 Interface</h3>
<ul>
  <li>Paleta visual azul/indigo exclusiva do ImpGeo</li>
  <li>Drag-and-drop de módulos com persistência de ordem</li>
  <li>Navegação por períodos com seletor horizontal animado</li>
  <li>Registro de atividades com filtragem e exportação</li>
</ul>`;

async function main() {
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO rodape_configuracoes (chave, valor, updated_at)
       VALUES ('notas_versao', $1, NOW())
       ON CONFLICT (chave) DO UPDATE SET valor = $1, updated_at = NOW()`,
      [NOTAS_VERSAO]
    );
    console.log('✅ notas_versao gravado com sucesso.');

    await client.query(
      `INSERT INTO rodape_configuracoes (chave, valor, updated_at)
       VALUES ('versao_sistema', '2.0', NOW())
       ON CONFLICT (chave) DO UPDATE SET valor = '2.0', updated_at = NOW()`
    );
    console.log('✅ versao_sistema definido como 2.0.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
