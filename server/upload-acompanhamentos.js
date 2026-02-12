const fs = require('fs');
const path = require('path');

// Configuração - AJUSTE A URL DA SUA VPS AQUI
const VPS_API_URL = process.env.VPS_API_URL || 'http://localhost:9001/api';
const AUTH_TOKEN = process.env.AUTH_TOKEN || ''; // Token de autenticação se necessário

const acompanhamentosFile = path.join(__dirname, 'database', 'acompanhamentos.json');

async function uploadAcompanhamentos() {
  try {
    // Ler os acompanhamentos do arquivo local
    if (!fs.existsSync(acompanhamentosFile)) {
      console.error('Arquivo acompanhamentos.json não encontrado!');
      process.exit(1);
    }

    const acompanhamentos = JSON.parse(fs.readFileSync(acompanhamentosFile, 'utf8'));
    console.log(`Encontrados ${acompanhamentos.length} acompanhamentos para upload...\n`);

    let successCount = 0;
    let errorCount = 0;

    // Upload de cada acompanhamento
    for (let i = 0; i < acompanhamentos.length; i++) {
      const acompanhamento = acompanhamentos[i];
      
      // Remover id, createdAt e updatedAt para evitar conflitos
      const { id, createdAt, updatedAt, ...acompanhamentoData } = acompanhamento;

      try {
        const response = await fetch(`${VPS_API_URL}/acompanhamentos`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(AUTH_TOKEN && { 'Authorization': `Bearer ${AUTH_TOKEN}` })
          },
          body: JSON.stringify(acompanhamentoData)
        });

        if (response.ok) {
          const result = await response.json();
          console.log(`✓ [${i + 1}/${acompanhamentos.length}] ${acompanhamento.imovel || acompanhamento.codImovel} - Upload realizado`);
          successCount++;
        } else {
          const error = await response.json().catch(() => ({ error: response.statusText }));
          console.error(`✗ [${i + 1}/${acompanhamentos.length}] ${acompanhamento.imovel || acompanhamento.codImovel} - Erro: ${error.error || response.statusText}`);
          errorCount++;
        }
      } catch (error) {
        console.error(`✗ [${i + 1}/${acompanhamentos.length}] ${acompanhamento.imovel || acompanhamento.codImovel} - Erro de conexão: ${error.message}`);
        errorCount++;
      }

      // Pequeno delay para não sobrecarregar o servidor
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`\n=== Resumo ===`);
    console.log(`Total: ${acompanhamentos.length}`);
    console.log(`Sucesso: ${successCount}`);
    console.log(`Erros: ${errorCount}`);
  } catch (error) {
    console.error('Erro ao fazer upload:', error);
    process.exit(1);
  }
}

// Executar
uploadAcompanhamentos();
