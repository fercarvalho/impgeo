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

### 👥 Gestão de Usuários e Perfis
- Menu de usuário completo com upload e recorte de foto de perfil
- Sistema avançado de segurança de conta (alterar senha e username)
- Recuperação e reset de senha via e-mail (integração SendGrid)
- Painel Administrativo para controle de acessos e permissões

### 📑 Gestão de Acompanhamentos
- Módulo dedicado para registros de acompanhamentos e relatórios
- Sincronização e upload de arquivos associados

### 📥 Importação e Exportação
- Importação via Excel/CSV para onboarding ágil
- Exportação de relatórios em PDF
- Templates personalizáveis
- Backup e restore dos dados

### 👤 Autenticação e Segurança
- Sistema de login com JWT e sessões seguras
- Níveis de acesso e RBAC ativo (admin, financeiro, gestor, leitura)
- Middleware de autenticação
- Hash de senhas com bcryptjs

## 🛠️ Stack Tecnológica

### Frontend
- **React 18** com TypeScript
- **Vite** para build e desenvolvimento
- **Tailwind CSS** para estilização
- **Lucide React** e **React Icons** para ícones
- **Recharts** para gráficos interativos
- **html2canvas** e **jsPDF** para exportação em PDF
- **date-fns** para manipulação de datas
- **react-easy-crop** para tratamento de imagens de avatar

### Backend
- **Node.js** com Express
- **PostgreSQL** como banco de dados relacional principal
- **JWT** para autenticação e sessões
- **bcryptjs** para hash de senhas
- **Multer** para upload de arquivos
- **XLSX** para processamento de planilhas Excel
- **SendGrid** para envio de e-mails transacionais (reset de senha)
- **CORS** para comunicação frontend/backend

### Infraestrutura
- Suporte a deploy em VPS
- Arquitetura modular e escalável
- Sistema estruturado de migrações (`migrations/`) para banco de dados

## 📋 Pré-requisitos

- Node.js 18+
- PostgreSQL 14+
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
# Server
PORT=9001
FRONTEND_PORT=9000

# JWT
JWT_SECRET=sua_chave_secreta_super_segura_aqui

# PostgreSQL Database
DB_USER=seu_usuario_pg
DB_HOST=localhost
DB_NAME=impgeo_db
DB_PASSWORD=sua_senha_pg
DB_PORT=5432

# SendGrid (Recuperação de Senhas)
SENDGRID_API_KEY=sua_chave_api_sendgrid
FROM_EMAIL=seu_email_remetente@dominio.com
```

### 4. Configure o Banco de Dados

Certifique-se de que o **PostgreSQL** está rodando e execute as migrações/scripts localizados em `server/migrations/` ou no arquivo de setup correspondente para construir a estrutura do banco.

### 5. Inicie o servidor

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

### 6. Acesse a aplicação

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
│   │   ├── admin/           # Painel de Controle e Usuários
│   │   ├── modals/          # Modais (Chart, Product, Transaction, Senhas, Perfil)
│   │   ├── Acompanhamentos.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Login.tsx
│   │   ├── MenuUsuario.tsx  # Navegação de Perfil e Conta
│   │   ├── PhotoUpload.tsx  # Gestão de Avatares
│   │   └── ... (outras views)
│   ├── contexts/            # Contextos React (Autenticação, Dados)
│   ├── hooks/               # Custom hooks
│   ├── lib/                 # Bibliotecas e utilitários
│   ├── types/               # Tipos TypeScript
│   ├── App.tsx              # Componente principal
│   ├── main.tsx             # Entry point
│   └── index.css            # Estilos globais
├── server/                  # Backend (Express)
│   ├── migrations/          # Scripts de inicialização do PostgreSQL
│   ├── uploads/             # Avatares, Arquivos e Acompanhamentos enviados
│   ├── database-pg.js       # Configuração e queries do PostgreSQL
│   ├── server.js            # Servidor Express principal
│   └── package.json
├── public/                  # Arquivos estáticos
├── dist/                    # Build de produção
├── docs/                    # Documentação e setup VPS
├── package.json             # Dependências do frontend
├── vite.config.ts           # Configuração do Vite
├── tailwind.config.js       # Configuração do Tailwind
└── tsconfig.json            # Configuração TypeScript
```

## 🔒 Segurança

- Senhas hasheadas com bcryptjs
- Tokens JWT para autenticação e sessões
- Integração de verificação via SendGrid para reset de credenciais
- Middleware de autenticação em rotas protegidas
- Controle rígido de nível de acesso (RBAC) via Painel Administrativo
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
- ✅ **Base de Dados**: Transição bem-sucedida para PostgreSQL estruturado
- ✅ **Controle de Acessos**: Implementado RBAC funcional com Painel Administrativo gerencial
- ✅ **Segurança da Conta**: Fluxo completo de reset e recuperação de senha disparado via SendGrid
- ✅ **Perfil Mobile/Desktop**: Novo menu de usuário com suporte a upload flexível e recorte de avatares
- ✅ **Acompanhamentos**: Nova timeline de acompanhamentos com suporte a anexos (uploads/sync)
- ✅ Sistema completo de autenticação com JWT
- ✅ Dashboard executivo com métricas em tempo real
- ✅ Sistema de metas mensais e anuais
- ✅ Projeções financeiras com múltiplos cenários
- ✅ Gestão completa de transações, projetos e clientes
- ✅ Exportação de relatórios em PDF
- ✅ Importação de dados via Excel/CSV
- ✅ DRE (Demonstração do Resultado do Exercício)

### Roadmap de Evolução
- 🔄 Exportação **em lote** (PDF/Excel) + templates customizáveis
- 🔄 **Agendamentos** (e.g., e-mail automático com DRE/previstos periodicamente)
- 🔄 **CI/CD** com Docker, testes automatizados e workflows
- 🔄 Integração com sistemas de pagamento/PIX
- 🔄 Notificações em tempo real via WebSockets
- 🔄 API pública para integrações

---

**IMPGEO** — feito com ❤️ para transformar dados em decisões inteligentes.
