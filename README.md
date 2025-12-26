# 💼 IMPGEO — Sistema de Gestão Financeira

Sistema completo de gestão financeira empresarial que transforma dados em decisões — do dia a dia operacional ao planejamento anual. Plataforma moderna para controle de transações, metas, projeções e relatórios com interface intuitiva e exportação para PDF.

## 📖 Sobre o Projeto

O **IMPGEO** é uma plataforma desenvolvida para facilitar a gestão financeira empresarial, oferecendo uma visão completa e em tempo real das finanças da empresa. Foi criado para resolver o problema de gestão financeira fragmentada, centralizando transações, projetos, metas e projeções em um único painel executivo.

**Feito com ❤️ por Fernando Carvalho**

- 📧 Email: contato@fercarvalho.com
- 📱 Instagram: [@cadeofer](https://instagram.com/cadeofer)

## ✨ Funcionalidades Principais

### 📊 Dashboard Executivo
- Métricas ao vivo com indicadores financeiros em tempo real
- Gráficos interativos com Recharts
- Visão consolidada mensal, trimestral e anual
- Painéis responsivos e mobile-first

### 🎯 Sistema de Metas
- Definição de metas mensais e anuais
- Acompanhamento meta vs. realizado
- Progressão visual de objetivos
- Comparação de desempenho por período

### 📈 Projeções Financeiras
- Planejamento anual com cenários (Mínimo / Médio / Máximo)
- Projeções de receitas e despesas
- Análise de diferentes cenários de negócio
- Visualização gráfica de tendências

### 📄 Relatórios e DRE
- Demonstração do Resultado do Exercício (DRE)
- Relatórios por período personalizado
- Cálculo automático de margens e resultados
- Exportação para PDF com jsPDF e html2canvas

### 💰 Gestão de Transações
- Controle de receitas e despesas
- Categorização e subcategorização
- Centros de custo personalizados
- Histórico completo de movimentações

### 🏗️ Gestão de Projetos e Serviços
- Cadastro e acompanhamento de projetos
- Gestão de serviços e produtos
- Controle de clientes
- Status e cronograma de projetos
- Valores e faturamento por projeto

### 📥 Importação e Exportação
- Importação via Excel/CSV para onboarding ágil
- Exportação de relatórios em PDF
- Templates personalizáveis
- Backup e restore por tabela

### 👤 Autenticação e Segurança
- Sistema de login com JWT
- Níveis de acesso (admin, financeiro, gestor, leitura)
- Middleware de autenticação
- Hash de senhas com bcryptjs

### 🔄 Backup e Restauração
- Backup automático por tabela
- Restauração seletiva de dados
- Histórico de backups
- Proteção contra perda de dados

## 🛠️ Stack Tecnológica

### Frontend
- **React 18** com TypeScript
- **Vite** para build e desenvolvimento
- **Tailwind CSS** para estilização
- **Lucide React** e **React Icons** para ícones
- **Recharts** para gráficos interativos
- **html2canvas** e **jsPDF** para exportação em PDF
- **date-fns** para manipulação de datas

### Backend
- **Node.js** com Express
- **JSON local** como banco de dados (MVP)
- **JWT** para autenticação
- **bcryptjs** para hash de senhas
- **Multer** para upload de arquivos
- **XLSX** para processamento de planilhas Excel
- **CORS** para comunicação frontend/backend

### Infraestrutura
- Preparado para migração para **PostgreSQL** ou **MongoDB**
- Suporte a deploy em VPS
- Arquitetura modular e escalável

## 📋 Pré-requisitos

- Node.js 18+
- npm ou yarn
- Git (para clonar o repositório)

## 🚀 Instalação

### 1. Clone o repositório

```bash
git clone https://github.com/seu-usuario/impgeo.git
cd impgeo
```

### 2. Instale as dependências

```bash
# Dependências do frontend
npm install

# Dependências do backend
cd server
npm install
cd ..
```

### 3. Configure as variáveis de ambiente

Crie um arquivo `.env` na pasta `server/`:

```env
# JWT
JWT_SECRET=sua_chave_secreta_super_segura_aqui

# Portas
PORT=9001
FRONTEND_PORT=9000
```

### 4. Inicie o servidor

**Desenvolvimento:**

```bash
# Terminal 1 - Backend
cd server
npm start      # ou npm run dev (com nodemon)
# Servidor rodando em http://localhost:9001

# Terminal 2 - Frontend
npm run dev
# Aplicação rodando em http://localhost:9000
```

**Produção:**

```bash
# Build do frontend
npm run build

# Iniciar servidor backend
cd server
npm start
```

### 5. Acesse a aplicação

- **Frontend:** http://localhost:9000
- **API Backend:** http://localhost:9001
- **Teste rápido:** http://localhost:9001/api/test

## 📚 Documentação Adicional

O projeto está em constante evolução. Documentação adicional será adicionada conforme necessário.

## 🏗️ Estrutura do Projeto

```
impgeo/
├── src/                      # Aplicação React (Frontend)
│   ├── components/           # Componentes React
│   │   ├── modals/          # Modais (Chart, Product, Transaction)
│   │   ├── Acompanhamentos.tsx
│   │   ├── Clients.tsx
│   │   ├── Dashboard.tsx
│   │   ├── DRE.tsx
│   │   ├── Login.tsx
│   │   ├── Products.tsx
│   │   ├── Projection.tsx
│   │   ├── Projects.tsx
│   │   ├── Reports.tsx
│   │   ├── Services.tsx
│   │   └── Transactions.tsx
│   ├── contexts/            # Contextos React
│   │   ├── AuthContext.tsx
│   │   ├── ProductContext.tsx
│   │   └── TransactionContext.tsx
│   ├── hooks/               # Custom hooks
│   │   └── usePermissions.ts
│   ├── lib/                 # Bibliotecas e utilitários
│   │   └── database.ts
│   ├── types/               # Tipos TypeScript
│   │   └── index.ts
│   ├── App.tsx              # Componente principal
│   ├── main.tsx             # Entry point
│   └── index.css            # Estilos globais
├── server/                  # Backend (Express)
│   ├── database/            # Banco de dados JSON
│   │   ├── transactions.json
│   │   ├── projects.json
│   │   ├── clients.json
│   │   ├── products.json
│   │   ├── budget.json
│   │   └── ... (outros arquivos JSON)
│   ├── uploads/             # Arquivos enviados
│   ├── database.js          # Classe Database para gerenciamento
│   ├── server.js            # Servidor Express principal
│   └── package.json
├── public/                  # Arquivos estáticos
├── dist/                    # Build de produção
├── docs/                    # Documentação e deploy
├── package.json             # Dependências do frontend
├── vite.config.ts           # Configuração do Vite
├── tailwind.config.js       # Configuração do Tailwind
└── tsconfig.json            # Configuração TypeScript
```

## 🔌 API Endpoints Principais

### Autenticação
- `POST /api/auth/login` - Fazer login
- `POST /api/auth/verify` - Verificar token JWT

### Transações
- `GET /api/transactions` - Obter todas as transações
- `POST /api/transactions` - Criar nova transação
- `PUT /api/transactions/:id` - Atualizar transação
- `DELETE /api/transactions/:id` - Deletar transação

### Projetos
- `GET /api/projects` - Obter todos os projetos
- `POST /api/projects` - Criar novo projeto
- `PUT /api/projects/:id` - Atualizar projeto
- `DELETE /api/projects/:id` - Deletar projeto

### Clientes
- `GET /api/clients` - Obter todos os clientes
- `POST /api/clients` - Criar novo cliente
- `PUT /api/clients/:id` - Atualizar cliente
- `DELETE /api/clients/:id` - Deletar cliente

### Produtos e Serviços
- `GET /api/products` - Obter todos os produtos
- `POST /api/products` - Criar novo produto
- `DELETE /api/products/:id` - Deletar produto
- `GET /api/services` - Obter todos os serviços
- `POST /api/services` - Criar novo serviço

### Metas e Orçamento
- `GET /api/budget` - Obter orçamento/metas
- `PUT /api/budget` - Atualizar orçamento/metas

### Projeções
- `GET /api/projection` - Obter projeções
- `POST /api/projection` - Criar/atualizar projeções
- `DELETE /api/clear-all-projection-data` - Limpar dados de projeção

### Relatórios e Análises
- `GET /api/faturamentoGeo` - Faturamento Geo
- `GET /api/faturamentoNn` - Faturamento NN
- `GET /api/faturamentoPlan` - Faturamento Plan
- `GET /api/faturamentoReg` - Faturamento Reg
- `GET /api/faturamentoReurb` - Faturamento Reurb
- `GET /api/faturamentoTotal` - Faturamento Total
- `GET /api/resultado` - Resultado financeiro
- `GET /api/investments` - Investimentos
- `GET /api/fixedExpenses` - Despesas fixas
- `GET /api/variableExpenses` - Despesas variáveis

### Importação e Exportação
- `POST /api/import` - Importar dados via Excel/CSV
- `POST /api/export` - Exportar dados

### Backup e Restore
- `POST /api/backup/restore/:tableName` - Restaurar backup de uma tabela

### Utilitários
- `GET /api/test` - Teste de conexão
- `GET /api/subcategories` - Obter subcategorias
- `POST /api/subcategories` - Criar subcategoria

## 🔒 Segurança

- Senhas hasheadas com bcryptjs
- Tokens JWT para autenticação
- Middleware de autenticação em rotas protegidas
- Validação de inputs
- CORS configurado para comunicação segura
- Headers de segurança configurados

## 📄 Licença

Este projeto está licenciado sob a **Licença MIT - Uso Educacional e Não Comercial**.

### ✅ O que você PODE fazer:
- ✅ Usar para fins educacionais e de aprendizado
- ✅ Estudar o código e arquitetura
- ✅ Usar como referência ou inspiração para criar projetos **novos e originais**
- ✅ Aplicar conceitos e padrões aprendidos em seus próprios projetos comerciais (desde que sejam criações originais)

### ❌ O que você NÃO PODE fazer:
- ❌ Reproduzir, copiar ou distribuir este software para fins comerciais
- ❌ Fazer modificações mínimas e usar comercialmente
- ❌ Vender ou licenciar este software ou partes dele
- ❌ Criar produtos comerciais que sejam substancialmente similares

**Para uso comercial deste código, entre em contato para licenciamento:**
📧 Email: contato@fercarvalho.com

## 🤝 Contribuindo

Este é um projeto pessoal, mas sugestões e feedback são sempre bem-vindos!

## 📝 Changelog

### Versão Atual
- ✅ Sistema completo de autenticação com JWT
- ✅ Dashboard executivo com métricas em tempo real
- ✅ Sistema de metas mensais e anuais
- ✅ Projeções financeiras com múltiplos cenários
- ✅ Gestão completa de transações, projetos e clientes
- ✅ Exportação de relatórios em PDF
- ✅ Importação de dados via Excel/CSV
- ✅ Sistema de backup e restore
- ✅ Interface responsiva e moderna
- ✅ Gráficos interativos com Recharts
- ✅ DRE (Demonstração do Resultado do Exercício)
- ✅ E muito mais...

### Roadmap de Evolução
- 🔄 Migração de dados de JSON para **PostgreSQL** (produção)
- 🔄 **RBAC avançado** (permissões por recurso/ação) e logs de auditoria
- 🔄 Exportação **em lote** (PDF/Excel) + templates customizáveis
- 🔄 **Agendamentos** (e.g., e-mail automático com DRE/previstos)
- 🔄 **CI/CD** com Docker, testes e deploy orquestrado
- 🔄 Integração com sistemas de pagamento
- 🔄 Notificações em tempo real
- 🔄 API pública para integrações

---

**IMPGEO** — feito com ❤️ para transformar dados em decisões financeiras inteligentes.
