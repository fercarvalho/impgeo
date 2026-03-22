# 📚 Documentação do Sistema IMPGEO

**Bem-vindo à documentação do IMPGEO!**

Este índice lista todos os guias disponíveis. Comece por aqui para navegar.

---

## 🚀 Primeiros Passos

| # | Documento | Descrição |
|---|-----------|-----------|
| 01 | [Guia de Deploy em Produção](./01%20-%20GUIA-DE-DEPLOY-PRODUCAO.md) | Como fazer deploy no VPS após `git pull` |
| 02 | [Configuração do Ambiente Dev](./02%20-%20CONFIGURACAO-AMBIENTE-DEV.md) | Como rodar o projeto localmente |

---

## 🔧 Configurações de Terceiros

| # | Documento | Descrição |
|---|-----------|-----------|
| 03 | [Configuração do SendGrid](./03%20-%20CONFIGURACAO-SENDGRID.md) | Configurar emails de alertas de segurança |
| 04 | [Conexão DBeaver com VPS](./04%20-%20CONEXAO-DBEAVER-VPS.md) | Acessar o banco PostgreSQL do VPS via GUI |

---

## 🔒 Segurança

| # | Documento | Descrição |
|---|-----------|-----------|
| 05 | [Índice de Segurança](./05%20-%20INDICE-DE-SEGURANCA.md) | Visão geral de todas as implementações de segurança |
| 06 | [Status e Roadmap de Segurança](./06%20-%20STATUS-E-ROADMAP-SEGURANCA.md) | Status atual, score e próximas fases |
| 07 | [Boas Práticas de Segurança](./07%20-%20BOAS-PRATICAS-DE-SEGURANCA.md) | Guia de desenvolvimento seguro |
| 08 | [Relatório de Auditoria](./08%20-%20RELATORIO-AUDITORIA-SEGURANCA.md) | Auditoria completa do sistema |
| 09 | [Guia de Refresh Tokens](./09%20-%20GUIA-REFRESH-TOKENS.md) | Como funciona o sistema de tokens |
| 10 | [Guia do Sistema de Auditoria](./10%20-%20GUIA-SISTEMA-AUDITORIA.md) | Como funciona o log de auditoria |

---

## 🛠️ Manutenção

| # | Documento | Descrição |
|---|-----------|-----------|
| 11 | [Resolução de Problemas](./11%20-%20RESOLUCAO-DE-PROBLEMAS.md) | Soluções para problemas comuns |
| 12 | [Melhorias de Frontend](./12%20-%20MELHORIAS-FRONTEND.md) | Lista de melhorias implementadas e planejadas |

---

## 📁 Arquivos na Raiz do Projeto

| Arquivo | Descrição |
|---------|-----------|
| [README.md](../README.md) | Visão geral do projeto, stack e funcionalidades |
| [SECURITY.md](../SECURITY.md) | Política de segurança e como reportar vulnerabilidades |
| [TECH-DEBT.md](../TECH-DEBT.md) | Dívida técnica conhecida e vulnerabilidades pendentes |
| [DEPLOY.md](../DEPLOY.md) | Versão resumida do guia de deploy |

---

## 🗂️ Estrutura do Projeto

```
impgeo/
├── src/                    # Frontend React + TypeScript
│   ├── components/         # Componentes React
│   │   ├── admin/          # Painéis administrativos
│   │   └── ...
│   ├── contexts/           # React Contexts (Auth, etc.)
│   └── utils/              # Utilitários frontend (axios interceptor, etc.)
├── server/                 # Backend Node.js + Express
│   ├── server.js           # Servidor principal + endpoints
│   ├── database-pg.js      # Camada de acesso ao PostgreSQL
│   ├── utils/              # Utilitários de segurança
│   │   ├── security-utils.js
│   │   ├── encryption.js
│   │   ├── audit.js
│   │   ├── refresh-tokens.js
│   │   ├── session-manager.js
│   │   ├── anomaly-detection.js
│   │   └── security-alerts.js
│   └── migrations/         # Migrações SQL do banco de dados
├── docs/                   # Esta pasta (documentação)
└── DEPLOY.md               # Guia rápido de deploy
```

---

## 📞 Suporte

- **Domínio:** impgeo.sistemas.viverdepj.com.br
- **VPS Path:** `/var/www/impgeo`
- **PM2 App:** `impgeo-api`
- **Porta Backend:** 9001
- **Porta Frontend (dev):** 9000

---

*Última atualização: 2026-03-22*
