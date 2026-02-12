require('dotenv').config();
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database');

const filesToRemove = [
  'transactions.json',
  'products.json',
  'clients.json',
  'projects.json',
  'services.json',
  'users.json',
  'acompanhamentos.json',
  'shareLinks.json',
  'subcategories.json',
  'projection.json',
  'fixedExpenses.json',
  'variableExpenses.json',
  'mkt.json',
  'budget.json',
  'investments.json',
  'faturamentoReurb.json',
  'faturamentoGeo.json',
  'faturamentoPlan.json',
  'faturamentoReg.json',
  'faturamentoNn.json',
  'faturamentoTotal.json',
  'resultado.json'
];

function cleanupJsonFiles(dryRun = false) {
  console.log(dryRun ? '🔍 Modo DRY-RUN: Nenhum arquivo será removido\n' : '🗑️  Removendo arquivos JSON migrados...\n');
  
  const backupDir = path.join(dbPath, 'backup-json');
  const backupDirs = fs.existsSync(backupDir) 
    ? fs.readdirSync(backupDir).filter(dir => fs.statSync(path.join(backupDir, dir)).isDirectory())
    : [];
  
  if (backupDirs.length === 0) {
    console.log('⚠️  Nenhum backup encontrado! Certifique-se de que a migração foi executada.');
    console.log('   Arquivos não serão removidos por segurança.\n');
    process.exit(1);
  }
  
  console.log(`📁 Backups encontrados: ${backupDirs.length}`);
  console.log(`   Mais recente: ${backupDirs.sort().reverse()[0]}\n`);
  
  let removed = 0;
  let notFound = 0;
  let errors = 0;
  
  for (const file of filesToRemove) {
    const filePath = path.join(dbPath, file);
    
    if (!fs.existsSync(filePath)) {
      console.log(`⏭️  ${file}: não encontrado (já removido?)`);
      notFound++;
      continue;
    }
    
    try {
      if (dryRun) {
        console.log(`🔍 [DRY-RUN] Removeria: ${file}`);
        removed++;
      } else {
        fs.unlinkSync(filePath);
        console.log(`✅ Removido: ${file}`);
        removed++;
      }
    } catch (error) {
      console.error(`❌ Erro ao remover ${file}:`, error.message);
      errors++;
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log(dryRun ? '🔍 DRY-RUN concluído!' : '🗑️  Limpeza concluída!');
  console.log(`   Removidos: ${removed}`);
  console.log(`   Não encontrados: ${notFound}`);
  console.log(`   Erros: ${errors}`);
  
  if (!dryRun && removed > 0) {
    console.log('\n✅ Arquivos JSON migrados foram removidos.');
    console.log('   Backups estão disponíveis em: database/backup-json/');
  }
}

// Verificar argumentos da linha de comando
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || args.includes('-d');

if (dryRun) {
  console.log('⚠️  MODO DRY-RUN ATIVADO\n');
}

cleanupJsonFiles(dryRun);
