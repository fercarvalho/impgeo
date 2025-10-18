const Database = require('./server/database.js');

const db = new Database();

try {
  console.log('🔄 Iniciando sincronização...');
  const syncedData = db.syncProjectionData();
  console.log('✅ Sincronização concluída!');
  console.log('📊 Faturamento NN atualizado:', syncedData.faturamentoNn);
} catch (error) {
  console.error('❌ Erro na sincronização:', error.message);
}
