# 📧 Configuração do SendGrid — IMPGEO

O SendGrid é usado para enviar **alertas de segurança por email** quando eventos suspeitos são detectados (tentativas de brute force, logins de novos países, roubo de token, etc.).

---

## Por que o SendGrid?

- Gratuito até 100 emails/dia
- Entrega confiável (evita cair no spam)
- API simples
- Logs de entrega

---

## Passo 1 — Criar conta no SendGrid

1. Acesse [sendgrid.com](https://sendgrid.com)
2. Crie uma conta gratuita
3. Confirme o email

---

## Passo 2 — Criar API Key

1. No painel do SendGrid, vá em **Settings → API Keys**
2. Clique em **Create API Key**
3. Nome sugerido: `impgeo-security-alerts`
4. Permissão: **Restricted Access → Mail Send** (apenas envio)
5. Copie a chave gerada (começa com `SG.`)

> ⚠️ A chave só é exibida uma vez. Guarde em local seguro.

---

## Passo 3 — Verificar o domínio remetente

Para evitar que os emails caiam no spam, você precisa verificar o email remetente.

1. No SendGrid, vá em **Settings → Sender Authentication**
2. Escolha **Single Sender Verification** (mais simples)
3. Preencha os dados do remetente (pode usar um email seu)
4. Confirme pelo email de verificação

---

## Passo 4 — Configurar no projeto

Edite `server/.env`:

```env
SENDGRID_API_KEY=SG.sua-chave-aqui
ALERT_EMAIL_FROM=security@seudominio.com
ALERT_EMAIL_TO=admin@seudominio.com
```

- `ALERT_EMAIL_FROM`: email verificado no SendGrid (remetente)
- `ALERT_EMAIL_TO`: email que vai receber os alertas (pode ser o seu)

---

## Passo 5 — Testar

Após configurar, reinicie o backend e dispare um evento de segurança para testar (ex: fazer várias tentativas de login incorretas).

Verifique:
1. Se o email chegou (cheque o spam também)
2. No SendGrid, em **Activity Feed**, confirme que o email foi enviado

---

## Tipos de alertas enviados

| Evento | Gatilho |
|--------|---------|
| Brute force | 5+ tentativas de login falhas |
| Login de novo país | IP de país diferente do histórico |
| Múltiplos IPs | Login de muitos IPs diferentes em pouco tempo |
| Roubo de token | Tentativa de usar refresh token já rotacionado |
| SQL Injection | Padrão detectado nos inputs |
| XSS | Padrão detectado nos inputs |

---

## Desabilitar emails em desenvolvimento

Em `server/.env` do ambiente local, deixe em branco:

```env
SENDGRID_API_KEY=
```

Quando `SENDGRID_API_KEY` não está definido, o módulo `security-alerts.js` pula o envio de email (apenas loga no console).

---

## Limites do plano gratuito

- 100 emails/dia
- Para o volume esperado do IMPGEO, é mais do que suficiente

---

*Última atualização: 2026-03-22*
