// Dispatcher de Web Push — orquestra envio pros dispositivos do usuário.
//
// Não confundir com services/push.js: aquele é o RUNTIME VAPID (init,
// publicKey, raw sendNotification). Este é a LÓGICA DE NEGÓCIO:
//   1. Lê preferência do user pro tipo de notificação no canal 'push'.
//   2. Lista subscriptions ativas.
//   3. Monta payload (title + message truncados, ids, app_id, ts).
//   4. Envia em paralelo (Promise.allSettled) — uma falha não afeta as outras.
//   5. Trata erros:
//      - 404/410 → subscription expirada/cancelada → prune.
//      - Outros  → markFailed; se atingir maxFails, remove a sub.
//
// CONTRATO IMPORTANTE: send() NUNCA propaga erro pro caller. Falha em push
// não pode quebrar criação de notificação in-app. O caller usa fire-and-forget
// com .catch defensivo (idealmente nem precisa, mas o .catch protege contra
// bugs futuros que façam o método quebrar antes do try/catch interno).
//
// Log estruturado (JSON-ish em uma linha) pra observabilidade no PM2.
// Sem PII no log — só ids, type, app_id, contagens, codes.

const push = require('./push');

// Payload máximo do Web Push é ~4KB (alguns push services menos). Truncamos
// pra ficar dentro de qualquer limite com folga e poupar banda mobile.
const MAX_TITLE_LEN = 100;
const MAX_MESSAGE_LEN = 200;
const MAX_FAILS_BEFORE_PRUNE = 5;

// Push services retornam 404 (Mozilla legacy) ou 410 Gone (padrão) quando a
// subscription foi cancelada pelo cliente (desinstalou PWA, limpou dados,
// trocou de browser). Nesses casos a sub NUNCA mais vai funcionar — remover
// imediatamente em vez de incrementar failed_count.
const TERMINAL_STATUS_CODES = new Set([404, 410]);

function truncate(s, max) {
  if (!s) return '';
  const str = String(s);
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function buildPayload(notif, scope, foregroundShow) {
  return {
    id: notif.id,
    title: truncate(notif.title, MAX_TITLE_LEN),
    message: truncate(notif.message, MAX_MESSAGE_LEN),
    type: notif.notification_type,
    related_entity_type: notif.related_entity_type || null,
    related_entity_id: notif.related_entity_id || null,
    scope,
    // SW respeita essa flag: se true, mostra OS-level mesmo com app visível;
    // se false (default), suprime OS-notif quando há cliente visible e só
    // dispara postMessage pro sino atualizar imediato.
    foreground_show: !!foregroundShow,
    ts: Date.now(),
  };
}

function logLine(obj) {
  // Linha única estruturada, fácil de grep + jq. Ex:
  //   grep '\[push\]' impgeo-api.log | jq 'select(.success == false)'
  try {
    console.log('[push]', JSON.stringify(obj));
  } catch {
    console.log('[push] (log fail)', obj);
  }
}

// Envia uma notificação pros dispositivos ATIVOS do usuário.
//
// `scope` = 'impgeo' | 'tc' (qual família de tabelas usar).
// `recipientId` = users.id (scope='impgeo') ou tc_users.id (scope='tc').
// `notif` = objeto retornado por db.createNotification / createTcNotification
//           — deve ter pelo menos { id, title, message, notification_type,
//           related_entity_type, related_entity_id }.
//
// Retorna { sent, pruned, failed } pra inspeção do caller (opcional).
// NÃO lança — todos os erros são engolidos e logados.
async function send(db, scope, recipientId, notif) {
  const result = { sent: 0, pruned: 0, failed: 0 };

  try {
    if (!push.isConfigured()) {
      // Web Push desabilitado (sem VAPID) — sai silencioso. Não logar por
      // disparo pra não inundar log; o warning de init já apareceu no boot.
      return result;
    }

    if (!notif || !notif.notification_type) {
      logLine({ event: 'skip', reason: 'no_type', recipient: recipientId, scope });
      return result;
    }

    const enabled = await db.getNotificationPreference(
      scope, recipientId, notif.notification_type, 'push'
    );
    if (!enabled) {
      logLine({
        event: 'skip', reason: 'pref_disabled',
        type: notif.notification_type, recipient: recipientId, scope,
      });
      return result;
    }

    const subs = await db.listActivePushSubscriptions(scope, recipientId);
    if (subs.length === 0) {
      logLine({
        event: 'skip', reason: 'no_subs',
        type: notif.notification_type, recipient: recipientId, scope,
      });
      return result;
    }

    // Lê preferência meta de foreground (default = não mostrar OS quando app visível).
    // Lida silenciosamente com erro — se falhar, vai com default (foregroundShow=false).
    const foregroundShow = await db.getNotificationPreference(
      scope, recipientId, '_meta:foreground', 'push'
    ).catch(() => false);

    const payload = buildPayload(notif, scope, foregroundShow);

    const settled = await Promise.allSettled(subs.map(async (s) => {
      try {
        await push.send(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          {
            // Coalesce notifs do mesmo registro — push service descarta a
            // anterior se nova chega com mesmo topic e cliente offline.
            topic: notif.related_entity_id
              ? `${notif.notification_type}-${notif.related_entity_id}`.slice(0, 32)
              : undefined,
          },
        );
        // Sucesso → atualiza last_seen_at e zera failed_count.
        await db.touchPushSubscriptionLastSeen(scope, s.endpoint).catch(() => {});
        return { ok: true, endpoint: s.endpoint, app_id: s.app_id };
      } catch (err) {
        return {
          ok: false,
          endpoint: s.endpoint,
          app_id: s.app_id,
          statusCode: err.statusCode,
          body: typeof err.body === 'string' ? err.body.slice(0, 200) : null,
          message: err.message,
        };
      }
    }));

    for (const r of settled) {
      // allSettled sempre resolve, mas defensivo:
      const v = r.status === 'fulfilled' ? r.value : { ok: false, message: String(r.reason) };
      if (v.ok) {
        result.sent++;
        logLine({
          event: 'sent', type: notif.notification_type, recipient: recipientId,
          scope, app_id: v.app_id,
        });
      } else if (v.statusCode && TERMINAL_STATUS_CODES.has(v.statusCode)) {
        await db.pruneInvalidPushSubscription(scope, v.endpoint).catch(() => {});
        result.pruned++;
        logLine({
          event: 'pruned', type: notif.notification_type, recipient: recipientId,
          scope, app_id: v.app_id, statusCode: v.statusCode,
        });
      } else {
        const { removed, failed_count } = await db.markPushSubscriptionFailed(
          scope, v.endpoint, MAX_FAILS_BEFORE_PRUNE
        ).catch(() => ({ removed: false, failed_count: -1 }));
        result.failed++;
        if (removed) result.pruned++;
        logLine({
          event: removed ? 'pruned_max_fails' : 'failed',
          type: notif.notification_type, recipient: recipientId,
          scope, app_id: v.app_id,
          statusCode: v.statusCode || null,
          failed_count, message: v.message,
        });
      }
    }
  } catch (err) {
    // Defesa em profundidade — se algo escapar dos try/catch internos.
    logLine({ event: 'dispatcher_error', message: err.message, stack: err.stack });
  }

  return result;
}

// Helper pra disparar em lote (ex: fanout pra todos admins). Cada destinatário
// é um envio independente — falha de um não afeta os outros.
async function sendMany(db, scope, recipientIds, notifBuilder) {
  await Promise.allSettled(recipientIds.map(async (rid) => {
    const notif = typeof notifBuilder === 'function' ? notifBuilder(rid) : notifBuilder;
    return send(db, scope, rid, notif);
  }));
}

module.exports = { send, sendMany };
