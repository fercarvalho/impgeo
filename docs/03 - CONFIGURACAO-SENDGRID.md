# 📧 Configuração do SendGrid — IMPGEO

O SendGrid é usado para duas finalidades no projeto:
1. **Recuperação de senha** — envia o link de reset para o usuário
2. **Alertas de segurança** — notifica sobre eventos suspeitos (brute force, novo país, etc.)

---

## Passo 1 — Criar conta no SendGrid

1. Acesse [sendgrid.com](https://sendgrid.com) e crie uma conta gratuita (100 emails/dia)
2. Confirme o email de cadastro

---

## Passo 2 — Autenticar o domínio remetente

Para garantir entrega e evitar spam, você precisa verificar o domínio remetente.

1. No painel do SendGrid, vá em **Settings → Sender Authentication**
2. Clique em **Authenticate Your Domain**
3. Selecione seu provedor de DNS (Cloudflare, Registro.br, etc.)
4. Informe o domínio: `impgeo.sistemas.viverdepj.com.br`
5. O SendGrid vai gerar 3–4 **registros CNAME**
6. Adicione esses registros no painel de DNS do seu provedor
7. Volte ao SendGrid, clique em **Verify**
8. Quando aparecer "Verified" (verde), o domínio está autenticado

Após isso, qualquer endereço `@impgeo.sistemas.viverdepj.com.br` pode ser usado como remetente.

---

## Passo 3 — Criar API Key

1. Vá em **Settings → API Keys**
2. Clique em **Create API Key**
3. Nome sugerido: `impgeo-producao`
4. Permissão: **Restricted Access → Mail Send → Full Access** (mais seguro)
5. Clique em **Create & View**
6. **Copie a chave imediatamente** — ela começa com `SG.` e só é exibida uma vez

---

## Passo 4 — (Opcional) Criar template visual para recuperação de senha

Se quiser um email mais bonito com botão e layout:

1. Vá em **Email API → Dynamic Templates**
2. Clique em **Create a Dynamic Template**
3. Nome: `Recuperação de Senha - IMPGEO`
4. Clique no template criado → **Add Version** → escolha **Design Editor**
5. Monte o layout (logotipo, texto, assinatura)
6. No botão "Redefinir Senha", use como URL: `{{resetLink}}`
   - Isso é a variável que o backend vai substituir pelo link real
7. Salve e copie o **Template ID** (começa com `d-`)

---

## Passo 5 — Configurar no projeto

Edite `server/.env`:

```env
SENDGRID_API_KEY=SG.sua-chave-aqui
ALERT_EMAIL_FROM=naoresponder@impgeo.sistemas.viverdepj.com.br
ALERT_EMAIL_TO=admin@seudominio.com

# Recuperação de senha
SENDGRID_FROM_EMAIL=naoresponder@impgeo.sistemas.viverdepj.com.br
SENDGRID_FROM_NAME=IMPGEO
# Opcional — só se criou o template no Passo 4:
# SENDGRID_TEMPLATE_ID_RESET=d-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

PASSWORD_RESET_TOKEN_TTL_MINUTES=60
PASSWORD_RESET_CLEANUP_INTERVAL_MINUTES=60
```

Após editar, reinicie o backend:

```bash
pm2 restart impgeo-api
```

---

## Testar recuperação de senha

```bash
# Solicitar recuperação
curl -X POST http://localhost:9001/api/auth/recuperar-senha \
  -H "Content-Type: application/json" \
  -d '{"email":"seu-email@dominio.com"}'

# Validar token recebido
curl http://localhost:9001/api/auth/validar-token/SEU_TOKEN

# Resetar senha
curl -X POST http://localhost:9001/api/auth/resetar-senha \
  -H "Content-Type: application/json" \
  -d '{"token":"SEU_TOKEN","novaSenha":"NovaSenha@123"}'
```

---

## Tipos de emails enviados

| Remetente configurado | Finalidade |
|-----------------------|-----------|
| `SENDGRID_FROM_EMAIL` | Recuperação de senha |
| `ALERT_EMAIL_FROM` | Alertas de segurança automáticos |

**Alertas de segurança disparados automaticamente:**

| Evento | Gatilho |
|--------|---------|
| Brute force | 5+ logins falhos |
| Login de novo país | IP de país diferente do histórico |
| Múltiplos IPs | Muitos IPs em pouco tempo |
| Roubo de token | Refresh token já rotacionado sendo reutilizado |
| SQL Injection detectado | Padrão na entrada |
| XSS detectado | Padrão na entrada |

---

## Desabilitar emails em desenvolvimento

Em `server/.env` local, deixe as chaves em branco:

```env
SENDGRID_API_KEY=
```

O sistema pula o envio de email automaticamente quando `SENDGRID_API_KEY` não está definido.

---

## Troubleshooting

**Email não chega:**
- Verifique se `SENDGRID_API_KEY` está correto (começa com `SG.`)
- Verifique se o domínio remetente está verificado (Status = Verified)
- Confira a pasta de spam
- Verifique os logs do backend: `pm2 logs impgeo-api --lines 50`
- No SendGrid, confira o **Activity Feed** para ver se o email foi enviado

**Token de reset inválido:**
- Verifique se a migration `add-password-reset-tokens.sql` foi aplicada
- Verifique se o token já foi usado (uso único)
- Verifique se não expirou (`PASSWORD_RESET_TOKEN_TTL_MINUTES=60`)

**Erro de permissão no PostgreSQL:**
- Garanta que o `DB_USER` tem permissão nas tabelas de reset de senha

---

## Limites do plano gratuito

- 100 emails/dia — mais que suficiente para o volume esperado do IMPGEO

---

*Última atualização: 2026-03-22*
