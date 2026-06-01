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

### #8 — Orçamentos TerraControl: limitações do MVP (migration 040)

**Status:** Planejado (baixa/média prioridade)

Itens deixados conscientemente fora do MVP de orçamentos e pagamentos AbacatePay. Schema e arquitetura já estão preparados — só falta UI / lógica.

- **Múltiplos templates ativos.** Hoje 1 template por vez (índice único parcial `idx_tc_budget_templates_only_one_active`). Pra suportar N templates (por tipo de serviço, ex.: "CAR pendente" vs "Imóvel completo"), basta dropar o índice e adicionar UI de seleção no `TcBudgetEditorModal`.
- **Itens com quantidade × unidade × preço unitário.** Schema (`tc_budget_revisions.items` JSONB) e `normalizeItems` em [server/services/budget-service.js](server/services/budget-service.js) já aceitam os campos opcionais `quantity`, `unit_label`, `unit_amount_cents`. Falta UI no editor + render no PDF.
- **Cancelamento via tc_user.** Hoje só admin cancela orçamento. Endpoint dedicado pra tc_user seria simétrico ao `request-revision`.
- **Rollback de approval em refund.** O webhook `transparent.refunded` hoje só grava evento `payment_refunded` em `tc_budget_events`. Admin lida manualmente (UPDATE no terracontrol). Pra automatizar: estender `markPaidFromWebhook` com `markRefundedFromWebhook` que reverte `approved=FALSE` e move budget pra status novo (`refunded`).
- **Cobrança recorrente.** AbacatePay tem `/subscriptions` mas escopo do MVP é one-shot. Quando entrar, criar `tc_user_subscriptions` separado de `tc_budgets`.
- **Cartão de crédito.** MVP só PIX Transparent. Arquitetura já prevê fallback pra Checkout hospedado (`POST /v2/checkouts/create` aceita PIX + CARD com parcelamento) — adicionar como segunda opção no `acceptAndStartPayment` com flag tipo `paymentMethod: 'pix' | 'card'`.
- **Notificação de PIX expirado pro tc_user.** Hoje o front detecta via countdown e mostra "Gerar novo QR Code", mas o backend não envia push/e-mail dizendo "seu PIX expirou". Webhook `transparent.expired` (se existir) ou job cron horário poderia disparar.
- **Roteamento de notif `tc_record_*`.** No `TcNotificationBell.handleClickNotification`, o ramo `tc_record_*` ainda cai pra lista padrão. Quando criarmos uma tela de visualização de registro, plugar aqui (mesmo padrão do `tc_budget_*`).

---

## 🟡 Módulo PM (Gerenciamento de Projetos) — dívidas conscientes

Itens deixados como follow-up ao fim da implementação (fases 1→9, migrations 045-053):

- **`projects.client` (VARCHAR legado) não foi dropado.** `Projects.tsx` ainda lê/filtra por esse campo (nome do cliente em string). Migração futura: trocar a UI para `client_id` + JOIN em `clients`, então dropar a coluna. Hoje `client` e `client_id` coexistem (dual-write no `saveProject`).
- **`terracontrol.client_id` permanece nullable.** Terrenos podem existir sem cliente (não pagos). A cardinalidade "1 cliente por terreno" já é garantida pela coluna FK única — NOT NULL seria incorreto.
- ~~Vínculo transação→projeto sem UI / atribuição de tarefa sem UI~~ → **resolvido**: aba Custos do projeto tem "Vincular transação" (picker de despesas não-vinculadas) + desvincular; aba Etapas tem botão de atribuir/reatribuir responsável (ícone UserPlus) por tarefa. (Vincular também pelo módulo Financeiro continua follow-up opcional.)
- **Export de relatório só em XLSX.** PDF (client-side jsPDF) ficou de fora.
- **Cards consolidados no `DashboardGerenciamento`** (lucro/atrasadas/top performers) não adicionados — o módulo `relatorios_tarefas_gerenciamento` cobre a visão admin.
- **`task_idle_tracking` acumula linhas** (1 por abertura da área de tarefas) sem limpeza/agregação — adicionar cron de cleanup futuramente.
- **Notificação de inatividade é client-side** (timer 5min no front); não há push proativo via cron.
- **Storage de anexos é local** (`server/uploads/pm/`) — não escala multi-instância; migrar p/ storage externo se necessário.
- **Testes do PM são local-only** (gitignored, decisão do dono) — 61 testes Vitest cobrem as regras críticas (state machine, dependências, pomodoro, revisão, custos, período de relatório), rodáveis via `npm test --prefix server`.

---

## ✅ Resolvidos Recentemente

| Item | Data | Solução |
|------|------|---------|
| Módulo de Gerenciamento de Projetos | 2026-06-01 | Projetos/etapas/tarefas a partir de templates, triggers/dependências, revisão admin/manager, ajuda, Pomodoro server-side, métricas e relatórios (migrations 045-053) |
| Sem refresh tokens | 2026-03-22 | Implementado com rotação automática |
| Sessões não gerenciadas | 2026-03-22 | active_sessions com geolocalização |
| Sem detecção de anomalias | 2026-03-22 | ML com Z-score + baseline |
| Sem alertas de segurança | 2026-03-22 | Email via SendGrid |
| Role superadmin ausente | 2026-03-22 | Implementado com módulos protegidos |
| Sem impersonation | 2026-03-22 | Superadmin pode representar usuários |
| CORS hardcoded | 2026-03-22 | Movido para CORS_ORIGINS no .env |
| Sem criptografia em repouso | 2026-03-22 | AES-256-GCM implementado |
| Sem monetização no TerraControl | 2026-05-23 | Orçamentos + pagamento PIX via AbacatePay (migration 040) |

---

*Última atualização: 2026-06-01*
