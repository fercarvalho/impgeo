/**
 * seed-documentation-run.js
 * Executa toda a documentação em sequência (partes 1, 2 e 3).
 * Execute: node server/seed-documentation-run.js
 */

const { execSync } = require('child_process');
const path = require('path');

const scripts = [
  'seed-documentation.js',
  'seed-documentation-part2.js',
  'seed-documentation-part3.js',
];

console.log('🚀 Iniciando seed completo de documentação do IMPGeo...\n');

for (const script of scripts) {
  const fullPath = path.join(__dirname, script);
  console.log(`\n▶️  Executando ${script}...`);
  try {
    execSync(`node "${fullPath}"`, { stdio: 'inherit' });
  } catch (err) {
    console.error(`❌ Erro ao executar ${script}:`, err.message);
    process.exit(1);
  }
}

console.log('\n🎉 Documentação completa inserida com sucesso!');
console.log('📚 17 seções disponíveis no módulo Documentação do IMPGeo.');
