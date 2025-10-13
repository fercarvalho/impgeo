const express = require('express');
const multer = require('multer');
const cors = require('cors');

const app = express();
const port = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Configuração simples do Multer
const upload = multer({ dest: 'uploads/' });

// Rota de teste
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'API funcionando!', 
    timestamp: new Date().toISOString()
  });
});

// Rota para importar arquivos
app.post('/api/import', upload.single('file'), (req, res) => {
  try {
    console.log('Arquivo recebido:', req.file?.originalname);
    console.log('Tipo:', req.body.type);
    
    // Por enquanto, retornar dados de exemplo
    const mockData = {
      transactions: [
        { id: 1, date: '2025-09-23', description: 'Exemplo 1', value: 100, type: 'Entrada', category: 'Vendas' },
        { id: 2, date: '2025-09-23', description: 'Exemplo 2', value: 50, type: 'Saída', category: 'Compras' }
      ],
      products: [
        { id: 1, name: 'Produto 1', category: 'Categoria A', price: 100, cost: 50, stock: 10, sold: 5 },
        { id: 2, name: 'Produto 2', category: 'Categoria B', price: 200, cost: 100, stock: 20, sold: 10 }
      ]
    };

    const type = req.body.type;
    const data = mockData[type] || [];
    
    res.json({
      success: true,
      message: `${data.length} ${type} importados com sucesso!`,
      data: data,
      count: data.length,
      type: type
    });

  } catch (error) {
    console.error('Erro:', error);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      message: error.message 
    });
  }
});

// Iniciar servidor
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Servidor rodando na porta ${port}`);
  console.log(`📡 API disponível em http://localhost:${port}`);
});
