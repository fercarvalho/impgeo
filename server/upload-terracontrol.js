const fs = require('fs');
const path = require('path');

// Configuração - AJUSTE A URL DA SUA VPS AQUI
const VPS_API_URL = process.env.VPS_API_URL || 'http://localhost:9001/api';
const AUTH_TOKEN = process.env.AUTH_TOKEN || ''; // Token de autenticação se necessário

const terracontrolFile = path.join(__dirname, 'database', 'terracontrol.json');

async function uploadTerraControl() {
  try {
    // Ler os records do arquivo local
    if (!fs.existsSync(terracontrolFile)) {
      console.error('Arquivo terracontrol.json não encontrado!');
      process.exit(1);
    }

    const records = JSON.parse(fs.readFileSync(terracontrolFile, 'utf8'));
    console.log(`Encontrados ${records.length} records para upload...\n`);

    let successCount = 0;
    let errorCount = 0;

    // Upload de cada record
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      
      // Remover id, createdAt e updatedAt para evitar conflitos
      const { id, createdAt, updatedAt, ...recordData } = record;

      try {
        const response = await fetch(`${VPS_API_URL}/terracontrol`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(AUTH_TOKEN && { 'Authorization': `Bearer ${AUTH_TOKEN}` })
          },
          body: JSON.stringify(recordData)
        });

        if (response.ok) {
          const result = await response.json();
          console.log(`✓ [${i + 1}/${records.length}] ${record.imovel || record.codImovel} - Upload realizado`);
          successCount++;
        } else {
          const error = await response.json().catch(() => ({ error: response.statusText }));
          console.error(`✗ [${i + 1}/${records.length}] ${record.imovel || record.codImovel} - Erro: ${error.error || response.statusText}`);
          errorCount++;
        }
      } catch (error) {
        console.error(`✗ [${i + 1}/${records.length}] ${record.imovel || record.codImovel} - Erro de conexão: ${error.message}`);
        errorCount++;
      }

      // Pequeno delay para não sobrecarregar o servidor
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`\n=== Resumo ===`);
    console.log(`Total: ${records.length}`);
    console.log(`Sucesso: ${successCount}`);
    console.log(`Erros: ${errorCount}`);
  } catch (error) {
    console.error('Erro ao fazer upload:', error);
    process.exit(1);
  }
}

// Executar
uploadTerraControl();
