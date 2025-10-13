# IMPGEO - Sistema de Gestão Financeira

Sistema de gestão financeira desenvolvido especificamente para a IMPGEO. Uma aplicação web moderna, responsiva e completa para gerenciamento financeiro empresarial.

## 🚀 Funcionalidades

### Dashboard
- Visão geral das métricas principais
- Receitas, despesas e saldo em tempo real
- Gráficos interativos e expansíveis
- Transações recentes
- Análise mensal, trimestral e anual

### Gestão de Projetos
- Controle completo de projetos
- Status de execução
- Valores e cronogramas
- Clientes associados

### Gestão de Serviços
- Catálogo de serviços
- Preços e categorias
- Controle de disponibilidade

### Transações
- Gestão completa de receitas e despesas
- Categorização automática
- Histórico detalhado de movimentações
- Resumo financeiro por período

### Metas
- Definição de metas mensais e anuais
- Acompanhamento de performance
- Comparação meta vs realizado
- Análise de crescimento

### Relatórios
- Relatórios por período (semanal, mensal, trimestral, anual)
- Análise de projetos por categoria
- Análise de serviços por categoria
- Gráficos interativos

### Projeção Anual
- Planejamento financeiro anual
- Cenários: Mínimo, Médio e Máximo
- Projeção por categorias
- Cálculos automáticos de trimestres e totais

### DRE (Demonstração do Resultado do Exercício)
- Relatório financeiro completo
- Receitas, despesas e resultado líquido
- Análise de margem de lucro

## 🛠️ Tecnologias

- **Frontend**: React 18 + TypeScript
- **Build**: Vite (super rápido e leve)
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Charts**: Recharts
- **Backend**: Node.js + Express
- **Database**: JSON (local)

## 📦 Instalação

1. Clone o repositório
2. Instale as dependências do frontend:
   ```bash
   npm install
   ```
3. Instale as dependências do backend:
   ```bash
   cd server
   npm install
   ```

## 🎯 Como Usar

### Desenvolvimento
```bash
# Frontend (porta 9000)
npm run dev

# Backend (porta 9001)
cd server && npm start
```

Acesse:
- Frontend: http://localhost:9000
- Backend API: http://localhost:9001
- Teste da API: http://localhost:9001/api/test

### Build para Produção
```bash
npm run build
```

### Preview da Build
```bash
npm run preview
```

## 📊 Estrutura do Projeto

```
impgeo/
├── src/
│   ├── App.tsx              # Componente principal
│   ├── main.tsx             # Entry point
│   └── index.css            # Estilos globais
├── server/
│   ├── server.js            # Servidor Express
│   ├── database.js          # Gerenciamento de dados
│   └── database/            # Arquivos JSON de dados
├── public/                  # Arquivos estáticos
└── package.json             # Dependências do frontend
```

## 🎨 Design

- Interface moderna e profissional
- Totalmente responsiva (mobile-first)
- Paleta de cores azul/índigo
- UX otimizada para gestão financeira
- Gráficos interativos e intuitivos

## 📈 Funcionalidades Principais

- ✅ Dashboard interativo com métricas em tempo real
- ✅ Gestão completa de transações
- ✅ Sistema de metas e acompanhamento
- ✅ Relatórios detalhados por período
- ✅ Projeção anual com cenários
- ✅ DRE automático
- ✅ API REST para integração
- ✅ Interface responsiva

## 🔧 Configuração

### Portas
- Frontend: 9000
- Backend: 9001

### API Endpoints
- `GET /api/transactions` - Listar transações
- `POST /api/transactions` - Criar transação
- `GET /api/products` - Listar produtos
- `POST /api/products` - Criar produto
- `GET /api/clients` - Listar clientes
- `POST /api/clients` - Criar cliente

## 💡 Sobre o Projeto

Este sistema foi desenvolvido especificamente para a IMPGEO, focando em:
- Performance e velocidade
- Facilidade de uso
- Controle financeiro preciso
- Gestão eficiente de projetos e serviços
- Relatórios detalhados e projeções

---

Desenvolvido com ❤️ para a IMPGEO