# Política de Segurança — IMPGEO

## 🔒 Versões Suportadas

| Versão | Suportada | Status |
|--------|-----------|--------|
| 1.x | ✅ Sim | Versão estável atual |
| < 1.0 | ❌ Não | Legado, sem suporte |

---

## 🐛 Reportando uma Vulnerabilidade

Levamos vulnerabilidades de segurança a sério. Se você descobrir um problema de segurança, siga os passos abaixo:

### ⚠️ NÃO Crie Issues Públicas

**Não** divulgue vulnerabilidades de segurança através de issues, discussões ou pull requests públicos no GitHub.

### ✅ Processo de Divulgação Responsável

1. **E-mail:** [contato@fercarvalho.com](mailto:contato@fercarvalho.com)
2. **Assunto:** `[SECURITY] Breve descrição do problema`
3. **Inclua:**
   - Descrição detalhada da vulnerabilidade
   - Passos para reproduzir
   - Avaliação do impacto potencial
   - Versões afetadas
   - Sugestão de correção (se disponível)

### 🕒 Prazo de Resposta

- **Resposta inicial:** Em até 48 horas (dias úteis)
- **Crítico:** Correção em 24–72 horas
- **Alto:** Correção em 7 dias
- **Médio:** Correção em 14 dias
- **Baixo:** Correção em 30 dias

---

## 🛡️ Recursos de Segurança

### Autenticação e Gerenciamento de Sessões
- ✅ JWT access tokens — expiração em 15 minutos
- ✅ Refresh tokens — expiração em 7 dias com rotação automática
- ✅ Detecção de roubo de token — revoga toda a família de tokens em caso de reuso
- ✅ Sessões ativas por dispositivo com geolocalização (geoip-lite)
- ✅ Limite de sessões por usuário configurável (padrão: 5)
- ✅ Hash de senhas com bcrypt (custo 10)
- ✅ Redefinição segura de senha via tokens com prazo (SendGrid)

### Controle de Acesso Baseado em Roles
- ✅ Quatro roles: `guest`, `user`, `admin`, `superadmin`
- ✅ Módulos protegidos (admin, sessions, anomalies, security_alerts) não podem ser desativados
- ✅ Impersonation de usuários pelo superadmin com trilha de auditoria e banner visual

### Validação e Sanitização de Entradas
- ✅ express-validator em todas as rotas críticas
- ✅ express-mongo-sanitize (prevenção de injeção NoSQL)
- ✅ xss-clean middleware
- ✅ hpp (proteção contra HTTP Parameter Pollution)
- ✅ 100% prepared statements (prevenção de SQL Injection)

### Headers de Segurança (Helmet.js)
- ✅ Content Security Policy (CSP)
- ✅ Strict-Transport-Security (HSTS — 1 ano)
- ✅ X-Frame-Options: DENY (proteção contra clickjacking)
- ✅ X-Content-Type-Options: nosniff
- ✅ Referrer-Policy: strict-origin-when-cross-origin
- ✅ X-Powered-By removido

### Rate Limiting
- ✅ Geral: 1000 req/15min
- ✅ Login: 10 tentativas/15min (proteção contra brute force)
- ✅ Criação de recursos: 100/hora
- ✅ Upload de arquivos: 20/hora

### Detecção de Anomalias e Alertas
- ✅ Detecção comportamental de anomalias baseada em ML (Z-score + baseline)
- ✅ Monitora: novo país, horários incomuns, múltiplos IPs, volume anormal
- ✅ Alertas automáticos por e-mail via SendGrid (brute force, roubo de token, novo país, etc.)
- ✅ Job de monitoramento executa a cada 15 minutos

### Log de Auditoria
- ✅ Todas as operações críticas registradas no PostgreSQL (tabela `audit_logs`)
- ✅ Dados sensíveis mascarados nos logs (senhas, tokens, CPF)
- ✅ IP, User-Agent, timestamp, operação e status registrados

### Proteção de Dados
- ✅ Criptografia de campos sensíveis em repouso (AES-256-GCM)
- ✅ HTTPS obrigatório em produção (redirecionamento automático)
- ✅ Whitelist de CORS (configurada via variável de ambiente)
- ✅ `.env` excluído do controle de versão

---

## 📋 Histórico de Auditoria de Segurança

### 2026-03-22 — Auditoria Pós-Implementação
**Score:** 9,8/10
**Conformidade OWASP Top 10:** 95%+

**Implementado neste ciclo de auditoria:**
- ✅ Refresh tokens com rotação
- ✅ Gerenciamento de sessões ativas
- ✅ Detecção de anomalias (ML)
- ✅ Alertas de segurança (e-mail)
- ✅ Sistema de impersonation
- ✅ Role superadmin
- ✅ Criptografia em repouso (AES-256-GCM)
- ✅ Middlewares mongoSanitize, xss-clean, hpp

**Pendências:** Veja [TECH-DEBT.md](TECH-DEBT.md)

---

## 🚨 Vulnerabilidades Conhecidas

### Ativas

#### Biblioteca xlsx — Prototype Pollution & ReDoS
**Severidade:** ALTA
**Status:** Documentado como dívida técnica
**Mitigações ativas:**
- Limite de tamanho de arquivo: 5MB
- Rate limiting nos endpoints de upload (20/hora)
- Sanitização de nomes de arquivo
- Uploads isolados do código da aplicação

**Correção planejada:** Migração para `exceljs` (veja TECH-DEBT.md)

---

## 🎯 Escopo

**No Escopo:**
- Aplicação web (frontend + API backend)
- Autenticação e autorização
- Gerenciamento de sessões
- Endpoints da API
- Funcionalidade de upload de arquivos
- Interações com banco de dados
- Dependências de terceiros

**Fora do Escopo:**
- Infraestrutura (hospedagem, rede, firewall)
- Segurança física
- DDoS (tratado na camada de infraestrutura)

---

## 🔐 Checklist de Segurança para Contribuidores

Antes de submeter alterações, verifique:

- [ ] Sem segredos ou chaves de API hardcoded
- [ ] Todas as entradas de usuário validadas e sanitizadas
- [ ] Queries SQL usam prepared statements (`$1`, `$2`)
- [ ] Dados sensíveis não registrados em texto simples
- [ ] Novos endpoints possuem middleware `authenticateToken`
- [ ] Rotas de admin/superadmin possuem middleware de role adequado
- [ ] Operações críticas registradas em `audit_logs`
- [ ] Mensagens de erro não expõem detalhes internos

Veja também: [docs/07 - BOAS-PRATICAS-DE-SEGURANCA.md](docs/07%20-%20BOAS-PRATICAS-DE-SEGURANCA.md)

---

## 🔄 Calendário de Manutenção de Segurança

- **Auditorias de dependências:** `npm audit` antes de cada deploy
- **Revisão manual de segurança:** Mensal
- **Rotação de credenciais:** A cada 6 meses
- **Próxima auditoria completa:** 2026-06-22

---

## 📞 Contato

- **E-mail:** [contato@fercarvalho.com](mailto:contato@fercarvalho.com)
- **Tempo de resposta:** Em até 48 horas (dias úteis)

---

**Última atualização:** 2026-03-22
**Próxima revisão:** 2026-06-22
