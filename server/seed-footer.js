require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'impgeo',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

async function run() {
  const now = new Date().toISOString();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ── Limpa tudo ────────────────────────────────────────────────────────────
    await client.query('DELETE FROM rodape_bottom_links');
    await client.query('DELETE FROM rodape_links');
    await client.query('DELETE FROM rodape_colunas');
    await client.query('DELETE FROM rodape_configuracoes');
    console.log('Tabelas de rodapé limpas.');

    // ── Configurações gerais ─────────────────────────────────────────────────
    const configuracoes = [
      ['empresa_nome',    'Viver de PJ'],
      ['empresa_tagline', 'Ecosistema de Empreendedorismo'],
      ['empresa_descricao',
        'Sistema de Gestão Inteligente por Viver de PJ. A Viver de PJ é um ecosistema completo de gestão e educação para Empreendedores.'],
      ['empresa_autor',   'Autor: 41.748.511 Fernando Carvalho Gomes dos Santos.'],
      ['empresa_logo',    '/logo_rodape.png'],
      ['copyright',       'Viver de PJ. TODOS OS DIREITOS RESERVADOS'],
      ['info_alinhamento','center'],
      ['versao_sistema',  '2.0'],
      ['notas_versao',    ''],
      ['info_texto',
`41.748.511 FERNANDO CARVALHO GOMES DOS SANTOS

Rua das Humaitá, no 635 - Londrina, PR

CEP: 86060-060

CNPJ: 41.748.511/0001-73

Este site e os produtos e serviços oferecidos neste site não são associados, afiliados, endossados ou patrocinados pelo Facebook, nem foram revisados, testados ou certificados pelo Facebook.`],
    ];

    for (const [chave, valor] of configuracoes) {
      await client.query(
        `INSERT INTO rodape_configuracoes (chave, valor, updated_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (chave) DO UPDATE SET valor = $2, updated_at = $3`,
        [chave, valor, now]
      );
    }
    console.log(`${configuracoes.length} configurações inseridas.`);

    // ── Colunas ───────────────────────────────────────────────────────────────
    await client.query(
      `INSERT INTO rodape_colunas (id, titulo, ordem, created_at, updated_at)
       VALUES ('col-contato', 'Contato', 0, $1, $1),
              ('col-servicos', 'Serviços', 1, $1, $1)`,
      [now]
    );
    console.log('2 colunas inseridas.');

    // ── Links das colunas ────────────────────────────────────────────────────
    const links = [
      // Coluna Contato
      ['lnk-tel',   'col-contato', '(11) 97103-9181',
        'https://wa.me/5511971039181?text=Oi%20Sofia%2C%20tudo%20bem%3F%20Vim%20pelo%20sistema%20ImpGeo%20e%20gostaria%20de%20saber%20mais%20sobre%20a%20Viver%20de%20PJ',
        true, 0],
      ['lnk-email', 'col-contato', 'vem@viverdepj.com.br',
        'mailto:vem@viverdepj.com.br',
        true, 1],
      ['lnk-site',  'col-contato', 'viverdepj.com.br',
        'https://viverdepj.com.br',
        true, 2],
      ['lnk-loc',   'col-contato', 'São Paulo, SP',
        '',
        false, 3],
      // Coluna Serviços
      ['lnk-s1',  'col-servicos', 'Consultoria Estratégica de Negócios', '', false, 0],
      ['lnk-s2',  'col-servicos', 'Sistema de Gestão',                   '', false, 1],
      ['lnk-s3',  'col-servicos', 'Sistema Financeiro',                  '', false, 2],
      ['lnk-s4',  'col-servicos', 'CRM',                                 '', false, 3],
      ['lnk-s5',  'col-servicos', 'IA Financeira',                       '', false, 4],
      ['lnk-s6',  'col-servicos', 'IA de Atendimento',                   '', false, 5],
      ['lnk-s7',  'col-servicos', 'IA para Negócios',                    '', false, 6],
      ['lnk-s8',  'col-servicos', 'Benefícios Corporativos',             '', false, 7],
      ['lnk-s9',  'col-servicos', 'Contabilidade para Empresas',         '', false, 8],
      ['lnk-s10', 'col-servicos', 'BPO Financeiro',                      '', false, 9],
    ];

    for (const [id, colunaId, texto, link, ehLink, ordem] of links) {
      await client.query(
        `INSERT INTO rodape_links (id, coluna_id, texto, link, eh_link, ordem, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
        [id, colunaId, texto, link, ehLink, ordem, now]
      );
    }
    console.log(`${links.length} links inseridos.`);

    // ── Links inferiores (barra de base) ─────────────────────────────────────
    const bottomLinks = [
      ['bl-privacidade',  'Política de Privacidade',  '#politica-privacidade', true,  0],
      ['bl-cookies',      'Gerenciar Cookies',         '#gerenciar-cookies',    true,  1],
      ['bl-termos',       'Termos de Uso',             '#termos-uso',           true,  2],
      ['bl-consideracoes','Considerações importantes', '',                      true,  3],
      ['bl-branding',     'Branding Kit',              '',                      true,  4],
      ['bl-contato',      'Contato',
        'https://wa.me/5511971039181?text=Oi%20Sofia%2C%20tudo%20bem%3F%20Vim%20pelo%20sistema%20ImpGeo%20e%20gostaria%20de%20saber%20mais%20sobre%20a%20Viver%20de%20PJ',
        true, 5],
    ];

    for (const [id, texto, link, ativo, ordem] of bottomLinks) {
      await client.query(
        `INSERT INTO rodape_bottom_links (id, texto, link, ativo, ordem, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $6)`,
        [id, texto, link, ativo, ordem, now]
      );
    }
    console.log(`${bottomLinks.length} bottom links inseridos.`);

    await client.query('COMMIT');
    console.log('\n✅ Rodapé populado com sucesso!');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

run()
  .catch(err => { console.error('Erro:', err); process.exit(1); })
  .finally(() => pool.end());
