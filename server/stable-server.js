const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3001;

console.log('🔧 Inicializando servidor...');

// Middleware
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));

app.use(express.json());

// Servir arquivos estáticos da pasta public
app.use('/public', express.static(path.join(__dirname, 'public')));

// Configurar uploads
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('📁 Pasta uploads criada');
}

const upload = multer({ 
  dest: uploadsDir,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Rota de teste
app.get('/api/test', (req, res) => {
  console.log('📡 Teste da API chamado');
  res.json({ 
    message: 'API funcionando!', 
    timestamp: new Date().toISOString(),
    server: 'Alya Backend v2'
  });
});

// Rota para download dos arquivos modelo
app.get('/api/modelo/:tipo', (req, res) => {
  try {
    const { tipo } = req.params;
    
    if (!['transactions', 'products'].includes(tipo)) {
      return res.status(400).json({ error: 'Tipo deve ser "transactions" ou "products"' });
    }
    
    const nomeArquivo = tipo === 'transactions' ? 'modelo-transacoes.xlsx' : 'modelo-produtos.xlsx';
    const filePath = path.join(__dirname, 'public', nomeArquivo);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Arquivo modelo não encontrado' });
    }
    
    console.log('📥 Download do modelo:', nomeArquivo);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
    res.sendFile(filePath);
    
  } catch (error) {
    console.error('❌ Erro no download do modelo:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rota principal de import
app.post('/api/import', upload.single('file'), async (req, res) => {
  try {
    console.log('📤 Upload recebido:', {
      file: req.file?.originalname,
      size: req.file?.size,
      type: req.body?.type
    });

    if (!req.file) {
      console.log('❌ Nenhum arquivo recebido');
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    const { type } = req.body;
    
    if (!type || !['transactions', 'products'].includes(type)) {
      console.log('❌ Tipo inválido:', type);
      return res.status(400).json({ error: 'Tipo deve ser "transactions" ou "products"' });
    }

    console.log('✅ Processando arquivo...');

    // Simular processamento e retornar dados mock
    const mockData = {
      transactions: [
        {
          id: Date.now() + 1,
          date: new Date().toISOString().split('T')[0],
          description: `Importado de ${req.file.originalname}`,
          value: 150.50,
          type: 'Entrada',
          category: 'Importação'
        },
        {
          id: Date.now() + 2,
          date: new Date().toISOString().split('T')[0],
          description: `Transação 2 de ${req.file.originalname}`,
          value: 75.25,
          type: 'Saída',
          category: 'Processamento'
        }
      ],
      products: [
        {
          id: Date.now() + 1,
          name: `Produto de ${req.file.originalname}`,
          category: 'Importados',
          price: 99.90,
          cost: 50.00,
          stock: 10,
          sold: 2
        },
        {
          id: Date.now() + 2,
          name: `Item processado de ${req.file.originalname}`,
          category: 'Processados',
          price: 149.90,
          cost: 75.00,
          stock: 5,
          sold: 1
        }
      ]
    };

    const result = mockData[type];
    
    // Limpar arquivo temporário
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    console.log('✅ Dados processados:', result.length, 'itens');

    res.json({
      success: true,
      message: `${result.length} ${type} importados com sucesso!`,
      data: result,
      count: result.length,
      type: type,
      filename: req.file.originalname
    });

  } catch (error) {
    console.error('❌ Erro no processamento:', error);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      message: error.message 
    });
  }
});

// Middleware de erro
app.use((error, req, res, next) => {
  console.error('❌ Erro middleware:', error.message);
  res.status(400).json({ error: error.message });
});

// Iniciar servidor
const server = app.listen(port, '127.0.0.1', () => {
  console.log('🚀 Servidor iniciado com sucesso!');
  console.log(`📡 Porta: ${port}`);
  console.log(`🌐 URL: http://localhost:${port}`);
  console.log(`🧪 Teste: http://localhost:${port}/api/test`);
  console.log('📁 Pasta uploads:', uploadsDir);
});

// Tratamento de erros do servidor
server.on('error', (error) => {
  console.error('❌ Erro do servidor:', error.message);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Parando servidor...');
  server.close(() => {
    console.log('✅ Servidor parado com sucesso');
    process.exit(0);
  });
});
