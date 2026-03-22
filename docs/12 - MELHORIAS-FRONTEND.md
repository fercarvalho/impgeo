# 🎨 Melhorias de Frontend — IMPGEO

Lista de melhorias implementadas e planejadas para o frontend.

---

## Implementadas

### Segurança e Sessões

| Componente | Arquivo | Status |
|------------|---------|--------|
| Dashboard de Sessões Ativas | `src/components/admin/ActiveSessions.tsx` | ✅ Implementado |
| Dashboard de Anomalias | `src/components/admin/AnomalyDashboard.tsx` | ✅ Implementado |
| Portal de Alertas de Segurança | `src/components/admin/SecurityAlerts.tsx` | ✅ Implementado |
| Banner de Impersonation | `src/components/ImpersonationBanner.tsx` | ✅ Implementado |
| Interceptor Axios (renovação automática de token) | `src/utils/axiosInterceptor.ts` | ✅ Implementado |
| AuthContext com suporte a impersonation | `src/contexts/AuthContext.tsx` | ✅ Implementado |

### Roles e Permissões

| Funcionalidade | Arquivo | Status |
|----------------|---------|--------|
| Role superadmin na UI | `src/components/AdminPanel.tsx` | ✅ Implementado |
| Botão de impersonation na lista de usuários | `src/components/AdminPanel.tsx` | ✅ Implementado |
| Módulos protegidos (admin, sessions, anomalies, security_alerts) | `src/components/admin/ModuleManagement.tsx` | ✅ Implementado |
| AdminTabs visível para superadmin | `src/components/admin/AdminTabs.tsx` | ✅ Implementado |

### Acessibilidade

| Componente | Status |
|------------|--------|
| Login: id/name/autocomplete nos inputs | ✅ |
| Transactions: id/name/aria-label nos filtros | ✅ |
| Clients: id/name/aria-label nos filtros | ✅ |
| DRE: id/name/aria-label nos selects | ✅ |
| Dashboard: id/name/aria-label no seletor de mês | ✅ |
| Metas: id/name/aria-label no seletor de mês | ✅ |
| AnomalyDashboard: id/name/aria-label nos filtros | ✅ |
| SecurityAlerts: id/name/aria-label nos filtros | ✅ |

---

## Planejadas (Roadmap)

### Alta Prioridade

| Melhoria | Estimativa | Motivo |
|----------|-----------|--------|
| Indicador visual de força de senha | 1-2h | Melhora UX de segurança |

### Média Prioridade

| Melhoria | Estimativa | Motivo |
|----------|-----------|--------|
| Gráficos de auditoria (heatmap por hora, timeline) | 6-8h | Visualização de logs |
| Remover console.log em produção (Terser config) | 1h | Performance e segurança |

### Baixa Prioridade / Futuro

| Melhoria | Estimativa | Dependência |
|----------|-----------|-------------|
| Interface de configuração 2FA | 4-6h | Backend 2FA (não implementado) |
| Rotação de audit_logs (UI de configuração) | 2-3h | - |

---

## Como Adicionar Novos Módulos

1. Criar componente em `src/components/` (ou `src/components/admin/`)
2. Adicionar lazy import em `src/App.tsx`
3. Adicionar TabType em `src/App.tsx`
4. Adicionar na lista `orderedTabs` em `src/App.tsx`
5. Adicionar botão de navegação no App.tsx
6. Adicionar render block com Suspense no App.tsx
7. Adicionar módulo no `modules_catalog` via migration SQL
8. Atualizar `getDefaultModuleKeysByRole` em `database-pg.js`

---

## Convenções de Código

### Componentes de Admin

Os componentes em `src/components/admin/` seguem este padrão:

```typescript
// Estilo: Tailwind CSS (sem CSS externo)
// Ícones: Lucide React
// Chamadas API: fetch com headers de autenticação
// Estado: useState/useEffect
// Cores amber: identidade visual dos componentes de admin
```

### Acessibilidade

Todos os campos de formulário e filtro devem ter:

```tsx
<select
  id="nome-do-filtro"
  name="nome-do-filtro"
  aria-label="Descrição do filtro"
  ...
>
```

### Lazy Loading

Componentes pesados devem ser lazy loaded:

```typescript
const MeuComponente = React.lazy(() => import('./components/MeuComponente'));

// No render:
<Suspense fallback={<div>Carregando...</div>}>
  <MeuComponente />
</Suspense>
```

---

*Última atualização: 2026-03-22*
