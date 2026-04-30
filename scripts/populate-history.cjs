#!/usr/bin/env node
/**
 * Popula notas_versao em rodape_configuracoes com o histórico completo do git.
 * Rodar na raiz do projeto: node scripts/populate-history.cjs
 */

const { execSync } = require('child_process');
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

// Define os commits que INICIAM cada versão (mensagem exata ou parcial)
// Ordem: da versão mais recente para a mais antiga
const VERSION_MARKERS = [
  { versao: '2.0', marker: 'Início da versão 2.0' },
];
const OLDEST_VERSION = '1.0';

function buildHtml(commits) {
  // Encontra os índices dos marcos de versão
  const markerIndexes = [];
  for (const { versao, marker } of VERSION_MARKERS) {
    const idx = commits.findIndex(c => c.msg.toLowerCase().includes(marker.toLowerCase()));
    if (idx !== -1) markerIndexes.push({ versao, idx });
  }
  // Ordena por índice crescente (mais antigo primeiro)
  markerIndexes.sort((a, b) => a.idx - b.idx);

  // Constrói os grupos: [inicio, fim) de cada versão
  const groups = [];
  let start = 0;
  for (let i = 0; i < markerIndexes.length; i++) {
    const { versao, idx } = markerIndexes[i];
    // Commits do início até antes do próximo marco = versão mais recente
    const nextVersao = i === 0
      ? (markerIndexes.length > 0 ? VERSION_MARKERS[0].versao : OLDEST_VERSION)
      : markerIndexes[i - 1].versao;

    if (i === 0 && idx >= 0) {
      // Commits do início até o marco (inclusive) = versão mais recente
      groups.push({ versao: markerIndexes[0].versao, commits: commits.slice(0, idx + 1) });
    } else if (i > 0) {
      groups.push({ versao: markerIndexes[i - 1].versao, commits: commits.slice(markerIndexes[i - 1].idx + 1, idx + 1) });
    }
  }
  // Commits após o último marco = versão mais antiga
  const lastIdx = markerIndexes.length > 0 ? markerIndexes[markerIndexes.length - 1].idx : -1;
  if (lastIdx < commits.length - 1) {
    groups.push({ versao: OLDEST_VERSION, commits: commits.slice(lastIdx + 1) });
  }

  // Montar HTML
  let html = '';
  for (const { versao, commits: cs } of groups) {
    if (cs.length === 0) continue;
    const items = cs.map(c => `  <li><strong>${c.date}</strong> — ${c.msg}</li>`).join('\n');
    html += `<h2>Versão ${versao}</h2>\n<h3>📋 Atualizações</h3>\n<ul>\n<!--COMMITS-->\n${items}\n</ul>\n<hr>\n`;
  }
  return html;
}

async function main() {
  const raw = execSync('git log --format="%H|%ad|%s" --date=format:"%d/%m/%Y"', { encoding: 'utf8' });
  const commits = raw.trim().split('\n').map(line => {
    const [hash, date, ...rest] = line.split('|');
    return { hash, date, msg: rest.join('|') };
  }).filter(c => c.hash && c.msg);

  console.log(`📋 ${commits.length} commits encontrados.\n`);

  const html = buildHtml(commits);

  // Mostra as primeiras linhas para conferência
  const preview = html.split('\n').slice(0, 12).join('\n');
  console.log('🔧 Prévia do HTML:\n' + preview + '\n...\n');

  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO rodape_configuracoes (chave, valor, updated_at)
       VALUES ('notas_versao', $1, NOW())
       ON CONFLICT (chave) DO UPDATE SET valor = $1, updated_at = NOW()`,
      [html]
    );
    console.log('✅ notas_versao gravado com sucesso.');

    const versaoRes = await client.query(`SELECT valor FROM rodape_configuracoes WHERE chave = 'versao_sistema'`);
    if (!versaoRes.rows.length || !versaoRes.rows[0].valor) {
      await client.query(
        `INSERT INTO rodape_configuracoes (chave, valor, updated_at)
         VALUES ('versao_sistema', '2.0', NOW())
         ON CONFLICT (chave) DO UPDATE SET valor = '2.0', updated_at = NOW()`
      );
      console.log('✅ versao_sistema definido como 2.0.');
    } else {
      console.log(`ℹ️  versao_sistema: ${versaoRes.rows[0].valor}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
