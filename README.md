# IMPGEO — Sistema de Gestão Financeira

Plataforma **moderna e completa** para **gestão financeira empresarial**, criada para transformar dados em decisões — do **dia a dia operacional** ao **planejamento anual**.

> **Pitch em 1 linha:** controle transações, metas e projeções em um painel bonito, rápido e pronto para gerar PDF — com importação via Excel e usuários com níveis de acesso.

---

## ✨ Principais Diferenciais
- **Dashboard executivo** com métricas ao vivo e **gráficos interativos** (Recharts)
- **Sistema de metas** (mensal/anual) com acompanhamento **meta vs. realizado**
- **Projeção anual** com cenários **Mínimo / Médio / Máximo**
- **Exportação para PDF** (jsPDF + html2canvas) dos relatórios e DRE
- **Importação via Excel/CSV** (endpoint `/api/import`) para onboarding ágil
- **Usuários com níveis de acesso** (login e verificação via **JWT**)
- **Backup & Restore** por tabela (`/api/backup/restore/:tableName`)
- **Arquitetura clara**: React (Vite) no frontend + Express no backend

---

## 🖥️ Experiência do Usuário
- Interface **responsiva (mobile‑first)**, com paleta profissional em **azul/índigo**
- Fluxos diretos e sem atrito: importar dados → visualizar → exportar PDF
- Painéis com visão **mensal, trimestral e anual**

---

## 📦 Stack
**Frontend:** React + TypeScript, Tailwind CSS, Lucide Icons, Recharts, Vite  
**Backend:** Node.js + Express, **JWT Auth**, Multer (upload), CORS  
**Dados:** JSON local (MVP) — preparado para evoluir a **PostgreSQL/MongoDB**

---

## ⚡ Como rodar (Dev)
```bash
# 1) Frontend
cd impgeo
npm install
npm run dev    # porta 9000

# 2) Backend
cd server
npm install
npm start      # porta 9001
```

Acesse:  
- **Frontend:** http://localhost:9000  
- **API:** http://localhost:9001  
- **Teste rápido:** http://localhost:9001/api/test

> Variáveis sensíveis (ex.: `JWT_SECRET`) devem ficar em `.env` no backend.

---

## 🔐 Autenticação & Acesso
- **Login:** `POST /api/auth/login` → retorna **JWT**
- **Verificação:** `POST /api/auth/verify`
- **Perfis sugeridos:** _admin_, _financeiro_, _gestor_, _leitura_ (RBAC)

---

## 📊 Módulos do Produto
- **Transações:** receitas, despesas, categorias e centros de custo
- **Projetos & Serviços:** status, cronograma, valores, clientes
- **Metas:** definição mensal/anual, progressão e comparação **meta vs. realizado**
- **Projeções:** planejamento anual com cenários (min/médio/máx)
- **Relatórios & DRE:** visão por período, margem e resultado
- **Importação/Exportação:** Excel/CSV → **PDF**

---

## 🔌 Endpoints (amostra)
- POST /api/auth/login
- POST /api/auth/verify
- GET  /api/transactions
- POST /api/transactions
- PUT  /api/budget
- GET  /api/clients
- POST /api/clients
- PUT  /api/clients/:id
- DELETE /api/clients/:id
- GET  /api/products
- POST /api/products
- DELETE /api/products/:id
- GET  /api/projects
- POST /api/projects
- DELETE /api/projects/:id
- GET  /api/services
- POST /api/services
- GET  /api/subcategories
- POST /api/subcategories
- POST /api/import
- POST /api/export
- POST /api/backup/restore/:tableName
- DELETE /api/clear-all-projection-data
- GET  /api/test

> Há outros endpoints especializados (ex.: `faturamento-*`, `investments`, `fixed-expenses`, `resultado` etc.) para análises mais finas.

---

## 🧱 Estrutura (resumo)
```
impgeo/
├─ impgeo/                 # Frontend (Vite + React + TS)
│  ├─ src/                 # App, páginas, componentes, hooks
│  ├─ public/              # Assets
│  └─ package.json
└─ server/                 # Backend (Express)
   ├─ server.js            # Rotas, middlewares, JWT, import/export
   ├─ database.js          # Banco em JSON/local
   └─ database/            # Tabelas .json (dados)
```

---

## 🧭 Roadmap de Evolução
- Migrar dados de JSON para **PostgreSQL** (produção)
- **RBAC avançado** (permissões por recurso/ação) e logs de auditoria
- Exportação **em lote** (PDF/Excel) + templates customizáveis
- **Agendamentos** (e.g., e-mail automático com DRE/previstos)
- **CI/CD** com Docker, testes e deploy orquestrado

---

**IMPGEO** — feito com ❤️ por Fernando Carvalho (Viver de PJ) para quem precisa **decidir rápido, com confiança**.
