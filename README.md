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
- Sistema de roles: guest / user / admin / superadmin
- Representação de usuários (impersonation) para suporte técnico seguro

### 🔒 Segurança Avançada
- Sessões ativas por dispositivo com geolocalização
- Refresh tokens com rotação automática e revogação remota
- Detecção de anomalias comportamentais (ML/Z-score)
- Alertas de segurança automáticos por email (SendGrid)
- Log de auditoria completo no banco de dados
- Criptografia em repouso (AES-256-GCM)

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
- **axios** com interceptor automático para renovação de tokens

### Backend
- **Node.js** com Express
- **PostgreSQL** como banco de dados relacional principal
- **JWT** para autenticação e sessões (access tokens 15min)
- **bcryptjs** para hash de senhas
- **Multer** para upload de arquivos
- **XLSX** para processamento de planilhas Excel
- **SendGrid** para emails transacionais e alertas de segurança
- **Helmet** para headers de segurança
- **hpp**, **xss-clean**, **express-mongo-sanitize** para proteção de inputs
- **geoip-lite** para geolocalização de sessões
- **ua-parser-js** para detecção de dispositivo/browser

### Infraestrutura
- Deploy em VPS com PM2 e Nginx
- Arquitetura modular e escalável
- Sistema estruturado de migrações (`migrations/`) para banco de dados
- Rate limiting diferenciado por tipo de operação
- Monitoramento de anomalias a cada 15 minutos

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

## 📚 Documentação

A documentação completa está em [`docs/`](docs/). Comece pelo índice:

- [00 - Índice da Documentação](docs/00%20-%20COMECE%20POR%20AQUI.md)
- [01 - Guia de Deploy em Produção](docs/01%20-%20GUIA-DE-DEPLOY-PRODUCAO.md)
- [02 - Configuração do Ambiente Dev](docs/02%20-%20CONFIGURACAO-AMBIENTE-DEV.md)
- [05 - Índice de Segurança](docs/05%20-%20INDICE-DE-SEGURANCA.md)
- [11 - Resolução de Problemas](docs/11%20-%20RESOLUCAO-DE-PROBLEMAS.md)

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

**Score de Segurança: 9.8/10**

- Senhas hasheadas com bcryptjs (cost factor 10)
- JWT access tokens (15min) + refresh tokens com rotação automática (7 dias)
- Sessões ativas por dispositivo com geolocalização e gestão remota
- Sistema de roles: `guest` / `user` / `admin` / `superadmin`
- Impersonation seguro: superadmin pode representar usuários sem saber a senha
- Detecção de anomalias comportamentais com ML (Z-score + baseline)
- Alertas automáticos por email para eventos suspeitos (brute force, novo país, etc.)
- Log de auditoria completo (tabela `audit_logs` no PostgreSQL)
- Criptografia em repouso com AES-256-GCM
- Headers de segurança via Helmet.js (CSP, HSTS, X-Frame-Options)
- Rate limiting diferenciado: 10 tentativas de login/15min, 1000 req gerais/15min
- Proteção contra SQL Injection (100% prepared statements)
- Proteção contra XSS, NoSQL Injection, HTTP Parameter Pollution
- CORS configurado por whitelist (variável de ambiente)
- HTTPS obrigatório em produção (redirect automático)

Ver documentação completa: [docs/05 - INDICE-DE-SEGURANCA.md](docs/05%20-%20INDICE-DE-SEGURANCA.md)

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
- ✅ **Segurança Avançada**: Refresh tokens, sessões ativas, detecção de anomalias, alertas de segurança
- ✅ **Sistema de Roles**: guest / user / admin / superadmin com módulos protegidos
- ✅ **Impersonation**: Superadmin pode representar usuários para suporte técnico
- ✅ **Base de Dados**: PostgreSQL estruturado com tabelas de segurança dedicadas
- ✅ **Controle de Acessos**: RBAC com Painel Administrativo gerencial
- ✅ **Segurança da Conta**: Fluxo completo de reset e recuperação de senha via SendGrid
- ✅ **Perfil Mobile/Desktop**: Upload e recorte de avatares
- ✅ **Acompanhamentos**: Timeline com suporte a anexos
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
