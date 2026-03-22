# Dívida Técnica — IMPGEO

Registro de problemas conhecidos, vulnerabilidades pendentes e melhorias planejadas que não foram implementadas ainda.

---

## 🔴 Alta Prioridade

### #1 — Vulnerabilidade no pacote `xlsx`

**Severidade:** HIGH
**Descoberta:** 2026-03-22
**Status:** Documentado, mitigações em vigor

**Problema:**
O pacote `xlsx` utilizado para importação de planilhas possui vulnerabilidades conhecidas de Prototype Pollution e ReDoS (sem fix disponível pelo mantenedor).

**Mitigações ativas:**
- Limite de tamanho de arquivo: 5MB
- Rate limiting em uploads: 20/hora
- Sanitização de nomes de arquivo
- Uploads isolados do código da aplicação
- Validação de extensão e MIME type

**Solução planejada:**
Migrar para `exceljs` — API similar, mantida ativamente, sem vulnerabilidades conhecidas.

```bash
# Comandos para migração futura
cd server
npm install exceljs
npm uninstall xlsx
```

**Impacto da migração:** Médio — requer reescrita das funções de importação de Excel em `server.js`

---

## 🟡 Média Prioridade

### #2 — console.log em produção (frontend)

**Severidade:** BAIXA-MÉDIA
**Status:** Pendente

**Problema:**
O código frontend pode conter `console.log` que ficam ativos em produção, expondo informações no console do browser.

**Solução:**
Configurar Terser no `vite.config.ts` para remover automaticamente em build de produção:

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    }
  }
})
```

---

### #3 — Crescimento da tabela `audit_logs`

**Severidade:** MÉDIA
**Status:** Pendente

**Problema:**
A tabela `audit_logs` cresce indefinidamente. Em uso intenso, pode causar degradação de performance nas queries.

**Solução planejada:**
Criar job de limpeza automática ou particionamento por data:

```sql
-- Opção 1: Limpeza periódica (mais simples)
-- Executar mensalmente via cron no VPS
DELETE FROM audit_logs WHERE timestamp < NOW() - INTERVAL '90 days';
VACUUM ANALYZE audit_logs;

-- Opção 2: Particionamento por mês (mais robusto)
-- Implementar em migration futura
```

---

### #4 — CSP com `unsafe-inline`

**Severidade:** BAIXA
**Status:** Aceito como limitação do React/Vite

**Problema:**
A Content Security Policy permite `'unsafe-inline'` para scripts e estilos, o que reduz a proteção contra XSS.

**Justificativa:**
Necessário para React/Vite (estilos inline, HMR em desenvolvimento). Aceitável para SPAs modernas que já têm outras proteções (xss-clean, validação de entrada).

**Solução futura (opcional):**
Implementar nonces para scripts inline — requer integração server-side com o Vite.

---

## 🟢 Baixa Prioridade / Melhorias

### #5 — Autenticação de Dois Fatores (2FA)

**Status:** Planejado para versão futura

**O que falta:**
- Backend: TOTP com `speakeasy` e QR code com `qrcode`
- Frontend: Tela de setup com QR code
- Frontend: Input de 6 dígitos no login
- Frontend: Tela de backup codes

**Estimativa:** 1-2 dias de desenvolvimento

---

### #6 — Indicador visual de força de senha

**Status:** Planejado

**O que falta:**
- Componente React com barra de progresso
- Integração com função `getPasswordStrength` já existente no backend

**Estimativa:** 1-2 horas

---

### #7 — Gráficos de auditoria

**Status:** Planejado (baixa prioridade)

**Sugestões:**
- Heatmap de logins por hora do dia
- Timeline de eventos críticos
- Distribuição geográfica de acessos

**Dependência:** Biblioteca de gráficos (Chart.js ou Recharts — já disponível)

---

## ✅ Resolvidos Recentemente

| Item | Data | Solução |
|------|------|---------|
| Sem refresh tokens | 2026-03-22 | Implementado com rotação automática |
| Sessões não gerenciadas | 2026-03-22 | active_sessions com geolocalização |
| Sem detecção de anomalias | 2026-03-22 | ML com Z-score + baseline |
| Sem alertas de segurança | 2026-03-22 | Email via SendGrid |
| Role superadmin ausente | 2026-03-22 | Implementado com módulos protegidos |
| Sem impersonation | 2026-03-22 | Superadmin pode representar usuários |
| CORS hardcoded | 2026-03-22 | Movido para CORS_ORIGINS no .env |
| Sem criptografia em repouso | 2026-03-22 | AES-256-GCM implementado |

---

*Última atualização: 2026-03-22*
