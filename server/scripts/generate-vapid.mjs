#!/usr/bin/env node
// Gera um par de chaves VAPID pra Web Push.
//
// Uso: node server/scripts/generate-vapid.mjs
//
// O par é IMPRESSO no stdout — não escreve em arquivo nenhum, pra evitar que
// a chave privada seja commitada acidentalmente. Você copia as 3 linhas e
// cola no server/.env (dev) ou nas envs de produção (PM2/systemd).
//
// IMPORTANTE: a chave privada NUNCA pode ser commitada. A pública pode ser
// exposta ao frontend via endpoint autenticado (/api/push/vapid-public-key).
//
// Rotação: trocar o par invalida TODAS as subscriptions existentes — os
// clientes vão precisar re-subscribe. Só faz isso se a chave privada vazar
// ou em rotação programada (anual+). O endpoint de subscribe é idempotente
// por endpoint, então re-subscribe não duplica linhas.

import webpush from 'web-push';

const keys = webpush.generateVAPIDKeys();

const subject = process.env.VAPID_SUBJECT || 'mailto:suporte@viverdepj.com.br';

console.log('# === Cole as 3 linhas abaixo no seu server/.env (ou nas envs de produção) ===');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log(`VAPID_SUBJECT=${subject}`);
console.log('');
console.log('# Notas:');
console.log('# - VAPID_SUBJECT precisa ser um mailto: ou URL válida. O push service usa pra contato em caso de abuse.');
console.log('# - Em produção, defina via env var do PM2 (ecosystem) ou systemd. Nunca commite o .env.');
console.log('# - Rotacionar essas chaves invalida TODAS as subscriptions existentes.');
