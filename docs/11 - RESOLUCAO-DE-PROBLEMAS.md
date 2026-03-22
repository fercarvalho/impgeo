# 🔧 Resolução de Problemas — IMPGEO

---

## Backend

### Servidor não inicia

**Sintoma:** `pm2 start` falha ou o processo cai imediatamente.

```bash
# Ver logs de erro
pm2 logs impgeo-api --err --lines 100

# Testar manualmente para ver o erro no terminal
cd /var/www/impgeo/server
node server.js
```

**Causas comuns:**

| Erro no log | Solução |
|-------------|---------|
| `JWT_SECRET não definido` | Criar/verificar `server/.env` |
| `ECONNREFUSED 5432` | PostgreSQL não está rodando: `systemctl start postgresql` |
| `relation "users" does not exist` | Migrations não executadas |
| `EADDRINUSE 9001` | Porta ocupada: `lsof -i :9001 && kill -9 PID` |
| `Cannot find module 'geoip-lite'` | Dependências não instaladas: `cd server && npm install` |

---

### Erro 502 Bad Gateway

**Sintoma:** Nginx retorna 502 para chamadas `/api/`.

```bash
# Verificar se backend está rodando
pm2 status
pm2 restart impgeo-api

# Verificar se está na porta certa
netstat -tlnp | grep 9001

# Ver logs do Nginx
tail -50 /var/log/nginx/error.log
```

---

### Erro de conexão com PostgreSQL

```bash
# Testar conexão
psql -U seuusuario -d impgeo -h localhost -c "SELECT 1;"

# Verificar se PostgreSQL está rodando
systemctl status postgresql

# Verificar se o usuário tem permissão
psql -U postgres -c "\du"
```

---

### "relation does not exist"

Alguma migration não foi executada.

```bash
# Ver quais tabelas existem
psql -U seuusuario -d impgeo -h localhost -c "\dt"

# Executar migration específica
psql -U seuusuario -d impgeo -h localhost -f server/migrations/NOME.sql

# Executar todas novamente (seguro se as migrations usam IF NOT EXISTS)
for file in server/migrations/*.sql; do
  psql -U seuusuario -d impgeo -h localhost -f "$file"
done
```

---

## Frontend

### Build falhou

```bash
# Ver erros detalhados
npm run build 2>&1 | head -80

# Verificar erros de TypeScript sem buildar
npx tsc --noEmit

# Limpar cache e tentar novamente
rm -rf node_modules/.vite dist
npm install
npm run build
```

**Erros comuns de TypeScript:**

| Erro | Solução |
|------|---------|
| `TS2304: Cannot find name 'X'` | Import faltando |
| `TS2339: Property 'X' does not exist` | Tipo errado, verificar interface |
| `TS6133: 'X' is declared but its value is never read` | Remover variável não usada |

---

### Site em branco após deploy

```bash
# Verificar se dist/ foi gerado
ls -la /var/www/impgeo/dist/

# Verificar configuração do Nginx
nginx -t
cat /etc/nginx/sites-available/impgeo

# O root deve apontar para dist/
# root /var/www/impgeo/dist;
```

---

### Frontend não consegue chamar a API (CORS)

**Sintoma:** Erro no console do browser: `Access-Control-Allow-Origin`.

```bash
# Verificar CORS_ORIGINS no .env
cat server/.env | grep CORS

# Deve conter o domínio do frontend:
# CORS_ORIGINS=https://impgeo.sistemas.viverdepj.com.br
```

Após alterar o `.env`:

```bash
pm2 restart impgeo-api
```

---

## Autenticação

### Usuário sendo deslogado constantemente

**Causa 1:** Access token expira e refresh não está funcionando.

```bash
# Ver erros no console do browser (F12)
# Procurar por: "Token refresh failed" ou "401"
```

Verificar se o interceptor axios está sendo usado em todas as chamadas.

**Causa 2:** `JWT_SECRET` mudou entre deploys.

Todos os tokens existentes ficam inválidos. Usuários precisam logar novamente — isso é esperado.

---

### "Invalid token" em todas as requisições

```bash
# Verificar JWT_SECRET no .env
grep JWT_SECRET server/.env

# Verificar se o .env está sendo carregado
cd server && node -e "require('dotenv').config(); console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'DEFINIDO' : 'VAZIO')"
```

---

### Sessões não aparecem na aba "Sessões Ativas"

```bash
# Verificar se tabela active_sessions existe
psql -U seuusuario -d impgeo -h localhost -c "SELECT COUNT(*) FROM active_sessions;"

# Verificar se migration foi executada
psql -U seuusuario -d impgeo -h localhost -c "\d active_sessions"
```

---

### "Refresh token já utilizado" (usuário deslogado sem motivo)

Este é o comportamento correto de segurança — significa que o refresh token foi rotacionado por outra sessão. O usuário deve logar novamente.

**Se estiver acontecendo sem motivo aparente:**
- Verificar se há múltiplas abas fazendo refresh simultâneo
- Verificar se algum processo está usando o token duplicadamente

---

## Nginx

### Certificado SSL expirado

```bash
# Renovar certificado
certbot renew

# Verificar data de expiração
certbot certificates

# Auto-renovação (verificar cron)
crontab -l | grep certbot
# Deve existir: 0 12 * * * certbot renew --quiet
```

---

### Nginx não recarrega após mudança de config

```bash
# Testar configuração primeiro (SEMPRE)
nginx -t

# Se OK, recarregar
systemctl reload nginx

# Se reload não funcionar, reiniciar (mais drástico)
systemctl restart nginx
```

---

## Banco de Dados

### PostgreSQL sem espaço em disco

```bash
# Ver uso do disco
df -h

# Ver tamanho das tabelas
psql -U seuusuario -d impgeo -h localhost -c "
SELECT schemaname, tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;"
```

**Se `audit_logs` estiver muito grande:**

```sql
-- Arquivar logs com mais de 90 dias
DELETE FROM audit_logs WHERE timestamp < NOW() - INTERVAL '90 days';
VACUUM ANALYZE audit_logs;
```

---

### Backup corrompido ou falhou

```bash
# Verificar se backup é válido
pg_restore --list backups/backup-YYYYMMDD.sql 2>&1 | head -5
# Se não mostrar erros de parse, o arquivo está OK

# Criar backup manual de emergência
pg_dump -U seuusuario -d impgeo -h localhost -F c -f backups/emergency-$(date +%Y%m%d-%H%M%S).dump
```

---

## PM2

### Processo não inicia automaticamente após reboot do servidor

```bash
# Salvar configuração atual do PM2
pm2 save

# Configurar startup (executar o comando que aparece na saída)
pm2 startup

# Verificar se está na lista de startup
pm2 list
```

---

### Logs do PM2 crescendo muito

```bash
# Ver tamanho dos logs
ls -lh ~/.pm2/logs/

# Limpar logs
pm2 flush

# Configurar rotação automática de logs
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

---

## Comandos de Diagnóstico Rápido

```bash
# Status geral do sistema
pm2 status
systemctl status nginx
systemctl status postgresql
netstat -tlnp | grep -E '9001|5432|80|443'

# Últimos logs do backend
pm2 logs impgeo-api --lines 50 --nostream

# Testar endpoints
curl -s http://localhost:9001/api/health
curl -s -o /dev/null -w "%{http_code}" https://impgeo.sistemas.viverdepj.com.br

# Uso de recursos
free -h  # Memória
df -h    # Disco
top      # CPU
```

---

*Última atualização: 2026-03-22*
