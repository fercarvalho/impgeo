// ═══════════════════════════════════════════════════════════════════════════
// server/services/pm/pomodoro-service.js
//
// Controle de tempo (Pomodoro) persistente server-side. O frontend é só
// display: o tempo é SEMPRE derivado de timestamps do banco. Estados:
//   running → break → completed   (+ paused, aborted, daily_limit_reached)
//
// Regras-chave:
//  - Limite diário de 400 min ATIVOS (pausa/descanso não contam).
//  - 1 sessão viva por usuário (UNIQUE parcial no banco).
//  - Pular a pausa (planned < 100) força o próximo ciclo a subir (25→50→100).
//  - Ciclo de 100 não pode pular pausa.
//  - Restore só se last_heartbeat > NOW-30min; senão a sessão é abortada.
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const MODE_BY_MINUTES  = { 25: 'POMODORO_25_5', 50: 'POMODORO_50_10', 100: 'POMODORO_100_20' };
const BREAK_BY_MINUTES = { 25: 5, 50: 10, 100: 20 };
const VALID_MINUTES    = [25, 50, 100];
const STALE_AFTER_MIN  = 30;

function err(message, code, status = 400, extra = {}) {
  const e = new Error(message); e.code = code; e.status = status; Object.assign(e, extra); return e;
}

// segundos ativos decorridos "agora" (desconta pausas).
function activeSecondsNow(s, nowMs) {
  let sec = (nowMs - new Date(s.started_at).getTime()) / 1000 - (s.total_paused_seconds || 0);
  if (s.state === 'paused' && s.pause_started_at) {
    sec -= (nowMs - new Date(s.pause_started_at).getTime()) / 1000;
  }
  return Math.max(0, Math.round(sec));
}

async function _event(exec, db, { userId, sessionId, taskId = null, type, fromMode = null, toMode = null, metadata = {} }) {
  await exec.query(
    `INSERT INTO pomodoro_events (id, user_id, work_session_id, task_id, event_type, from_mode, to_mode, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
    [db.generateId(), userId, sessionId, taskId, type, fromMode, toMode, JSON.stringify(metadata)]
  );
}

async function _addDaily(exec, { userId, activeMinutes = 0, breakMinutes = 0, completed = 0, aborted = 0, skipped = 0 }) {
  await exec.query(
    `INSERT INTO pomodoro_daily_stats (user_id, day, total_minutes_worked, break_minutes, sessions_completed, sessions_aborted, skipped_breaks)
     VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, day) DO UPDATE SET
       total_minutes_worked = pomodoro_daily_stats.total_minutes_worked + $2,
       break_minutes        = pomodoro_daily_stats.break_minutes + $3,
       sessions_completed   = pomodoro_daily_stats.sessions_completed + $4,
       sessions_aborted     = pomodoro_daily_stats.sessions_aborted + $5,
       skipped_breaks       = pomodoro_daily_stats.skipped_breaks + $6,
       updated_at = NOW()`,
    [userId, activeMinutes, breakMinutes, completed, aborted, skipped]
  );
}

// Credita o tempo ATIVO trabalhado na tarefa (project_tasks.actual_seconds/minutes).
// Usa credited_seconds da sessão para nunca recontar o mesmo trecho (pausar→retomar→concluir).
async function _creditTaskTime(exec, session, activeSec) {
  if (!session.task_id) return;
  const sec = Math.max(0, Math.round(activeSec));
  const delta = sec - (session.credited_seconds || 0);
  if (delta > 0) {
    await exec.query(
      `UPDATE project_tasks
          SET actual_seconds = COALESCE(actual_seconds,0) + $1,
              actual_minutes = ROUND((COALESCE(actual_seconds,0) + $1) / 60.0),
              updated_at = NOW()
        WHERE id = $2`,
      [delta, session.task_id]
    );
  }
  await exec.query('UPDATE task_work_sessions SET credited_seconds = $1 WHERE id = $2', [sec, session.id]);
}

async function getConfig(db, userId) {
  let r = await db.pool.query('SELECT * FROM user_pomodoro_config WHERE user_id = $1', [userId]);
  if (!r.rows[0]) {
    await db.pool.query('INSERT INTO user_pomodoro_config (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);
    r = await db.pool.query('SELECT * FROM user_pomodoro_config WHERE user_id = $1', [userId]);
  }
  return r.rows[0];
}

async function updateConfig(db, userId, { dailyLimitMinutes, idleAlertMinutes, soundEnabled }) {
  await getConfig(db, userId);
  const fields = []; const values = []; let i = 1;
  if (dailyLimitMinutes !== undefined) { fields.push(`daily_limit_minutes = $${i++}`); values.push(dailyLimitMinutes); }
  if (idleAlertMinutes !== undefined)  { fields.push(`idle_alert_minutes = $${i++}`);  values.push(idleAlertMinutes); }
  if (soundEnabled !== undefined)      { fields.push(`sound_enabled = $${i++}`);       values.push(soundEnabled); }
  if (!fields.length) return getConfig(db, userId);
  fields.push('updated_at = NOW()'); values.push(userId);
  await db.pool.query(`UPDATE user_pomodoro_config SET ${fields.join(', ')} WHERE user_id = $${i}`, values);
  return getConfig(db, userId);
}

// Minutos ativos de hoje DERIVADOS das sessões (fonte da verdade — evita o drift
// do contador incremental pomodoro_daily_stats, que acumulava erro/dupla contagem).
async function _todayMinutes(exec, userId) {
  const r = await exec.query(
    `SELECT COALESCE(ROUND(SUM(total_active_seconds) / 60.0), 0) AS min
       FROM task_work_sessions
      WHERE user_id = $1 AND started_at::date = CURRENT_DATE`, [userId]
  );
  return Number(r.rows[0]?.min || 0);
}

// Reconcilia uma sessão "atrasada" (heartbeat velho e/ou passou do tempo).
// Regra: um ciclo RUNNING tem direito à duração planejada inteira — nunca é
// abortado antes disso (mesmo com a aba congelada/heartbeat parado). Quando passa
// do planejado, é auto-concluído (vai pra pausa). Só paused/break abandonados são
// abortados por timeout (quando abortStale=true).
async function _reconcileSession(db, s, { abortStale = false } = {}) {
  const now = Date.now();
  const stale = (now - new Date(s.last_heartbeat).getTime()) / 60000 > STALE_AFTER_MIN;

  if (s.state === 'running') {
    const elapsed = activeSecondsNow(s, now);
    if (elapsed >= s.planned_minutes * 60) {
      // Ciclo chegou ao fim → pausa, mesmo que a aba esteja congelada/fechada.
      try { await completeActive(db, s.id, s.user_id); } catch { /* já transicionou */ }
      return 'completed_active';
    }
    return 'running'; // dentro do ciclo: protegido, nunca aborta por heartbeat
  }

  if (s.state === 'break') {
    const brkElapsed = s.break_started_at ? (now - new Date(s.break_started_at).getTime()) / 1000 : 0;
    if (brkElapsed >= s.break_planned_minutes * 60) {
      try { await finishBreak(db, s.id, s.user_id); } catch { /* já encerrou */ }
      return 'finished_break';
    }
    if (abortStale && stale) { await _abort(db, s, 'tab_closed_timeout'); return 'aborted'; }
    return 'break';
  }

  if (s.state === 'paused') {
    if (abortStale && stale) { await _abort(db, s, 'tab_closed_timeout'); return 'aborted'; }
    return 'paused';
  }
  return s.state;
}

// Sessão viva (restore). Reconcilia (auto-conclui se passou do tempo) mas NÃO
// aborta no restore — o usuário acabou de voltar; devolve a sessão de onde está.
async function getActiveSession(db, userId) {
  const sql = `SELECT ws.*, t.paused_at AS task_paused_at
                 FROM task_work_sessions ws
                 LEFT JOIN project_tasks t ON t.id = ws.task_id
                WHERE ws.user_id = $1 AND ws.state IN ('running','paused','break')
                ORDER BY ws.started_at DESC LIMIT 1`;
  const r = await db.pool.query(sql, [userId]);
  const s0 = r.rows[0];
  if (!s0) return null;
  await _reconcileSession(db, s0, { abortStale: false });
  // Recarrega: o estado pode ter mudado (running → break, ou break → completed).
  const r2 = await db.pool.query(
    `SELECT ws.*, t.paused_at AS task_paused_at FROM task_work_sessions ws
       LEFT JOIN project_tasks t ON t.id = ws.task_id WHERE ws.id = $1`, [s0.id]
  );
  const s = r2.rows[0];
  if (!s || !['running', 'paused', 'break'].includes(s.state)) return null;
  return _decorate(s);
}

function _decorate(s) {
  const now = Date.now();
  const activeSec = activeSecondsNow(s, now);
  const remainingActiveSec = Math.max(0, s.planned_minutes * 60 - activeSec);
  let breakRemainingSec = null;
  if (s.state === 'break' && s.break_started_at) {
    const elapsed = (now - new Date(s.break_started_at).getTime()) / 1000;
    breakRemainingSec = Math.max(0, Math.round(s.break_planned_minutes * 60 - elapsed));
  }
  return {
    ...s,
    derived: {
      activeSeconds: activeSec,
      remainingActiveSeconds: remainingActiveSec,
      breakRemainingSeconds: breakRemainingSec,
      canSkipBreak: s.planned_minutes < 100,
    },
  };
}

// ─── Start ────────────────────────────────────────────────────────────────────

async function startSession(db, { userId, taskId = null, category = null, plannedMinutes = 25 }) {
  const config = await getConfig(db, userId);

  // Consome "próximo forçado" (penalidade de pausa pulada).
  let planned = plannedMinutes;
  const hadForce = !!config.next_cycle_forced_minutes;
  if (hadForce) planned = config.next_cycle_forced_minutes;
  if (!VALID_MINUTES.includes(planned)) throw err(`plannedMinutes inválido: ${planned}`, 'invalid_minutes');
  if (!taskId && !category) throw err('Informe uma tarefa ou uma categoria', 'target_required');

  // Limite diário: o ciclo precisa caber no que resta. A penalidade (forçado)
  // NUNCA trava o usuário — se o ciclo forçado não couber, reduz pro maior que cabe.
  const limit = config.daily_limit_minutes || 400;
  const today = await _todayMinutes(db.pool, userId);
  const remaining = limit - today;
  if (planned > remaining) {
    const fit = hadForce ? [100, 50, 25].find(m => m <= remaining) : null;
    if (fit) {
      planned = fit;
    } else {
      throw err(
        `Restam só ${Math.max(0, remaining)} min hoje (limite diário de ${limit} min). ` +
        `Um ciclo de ${planned} min não cabe${hadForce ? ' (próximo ciclo forçado por ter pulado a pausa)' : ' — escolha um menor'}.`,
        'daily_limit', 409, { remainingMinutes: Math.max(0, remaining) }
      );
    }
  }
  // "forçado" (p/ o evento) só se o ciclo realmente subiu acima do escolhido.
  const forced = hadForce && planned > plannedMinutes;

  let projectId = null;
  if (taskId) {
    const t = await db.pool.query('SELECT project_id FROM project_tasks WHERE id = $1', [taskId]);
    projectId = t.rows[0]?.project_id || null;
  }

  const id = db.generateId();
  const mode = MODE_BY_MINUTES[planned];
  const breakMin = BREAK_BY_MINUTES[planned];
  try {
    await db.pool.query(
      `INSERT INTO task_work_sessions
         (id, user_id, task_id, project_id, category, pomodoro_mode, planned_minutes, break_planned_minutes, state, started_at, last_heartbeat)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'running',NOW(),NOW())`,
      [id, userId, taskId, projectId, category, mode, planned, breakMin]
    );
  } catch (e) {
    if (e.code === '23505') throw err('Você já tem uma sessão ativa.', 'session_active', 409);
    throw e;
  }

  // Consumiu o forçado → limpa (mesmo que tenha sido reduzido pra caber no dia).
  if (hadForce) {
    await db.pool.query('UPDATE user_pomodoro_config SET next_cycle_forced_minutes = NULL, updated_at = NOW() WHERE user_id = $1', [userId]);
  }
  await _event(db.pool, db, { userId, sessionId: id, taskId, type: 'STARTED', toMode: mode, metadata: { forced } });
  const r = await db.pool.query('SELECT * FROM task_work_sessions WHERE id = $1', [id]);
  return { session: _decorate(r.rows[0]), forced };
}

// ─── Pause / Resume ───────────────────────────────────────────────────────────

async function _loadOwned(db, sessionId, userId) {
  const r = await db.pool.query('SELECT * FROM task_work_sessions WHERE id = $1', [sessionId]);
  const s = r.rows[0];
  if (!s) throw err('Sessão não encontrada', 'not_found', 404);
  if (s.user_id !== userId) throw err('Sessão de outro usuário', 'forbidden', 403);
  return s;
}

async function pauseSession(db, sessionId, userId) {
  const s = await _loadOwned(db, sessionId, userId);
  if (s.state !== 'running') throw err('Só é possível pausar uma sessão em execução', 'invalid_state', 409);
  const activeSec = activeSecondsNow(s, Date.now());
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE task_work_sessions SET state='paused', pause_started_at=NOW(), total_active_seconds=$1, last_heartbeat=NOW(), updated_at=NOW() WHERE id=$2`,
      [activeSec, sessionId]
    );
    // Stop/pausa fecha o trecho ativo → credita o tempo na tarefa (p/ produtividade).
    await _creditTaskTime(client, s, activeSec);
    await _event(client, db, { userId, sessionId, taskId: s.task_id, type: 'PAUSED' });
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
  return getActiveSession(db, userId);
}

async function resumeSession(db, sessionId, userId) {
  const s = await _loadOwned(db, sessionId, userId);
  if (s.state !== 'paused') throw err('Só é possível retomar uma sessão pausada', 'invalid_state', 409);
  const pausedAdd = s.pause_started_at ? Math.round((Date.now() - new Date(s.pause_started_at).getTime()) / 1000) : 0;
  await db.pool.query(
    `UPDATE task_work_sessions SET state='running', total_paused_seconds = total_paused_seconds + $1, pause_started_at=NULL, last_heartbeat=NOW(), updated_at=NOW() WHERE id=$2`,
    [pausedAdd, sessionId]
  );
  await _event(db.pool, db, { userId, sessionId, taskId: s.task_id, type: 'RESUMED' });
  return getActiveSession(db, userId);
}

// Acoplamento tarefa↔sessão (usado por task-service ao pausar/retomar a tarefa).
// Best-effort: se não houver sessão no estado esperado, ignora.
async function pauseSessionForTask(db, taskId, userId) {
  if (!taskId || !userId) return;
  const r = await db.pool.query(
    `SELECT id FROM task_work_sessions WHERE task_id=$1 AND user_id=$2 AND state='running' LIMIT 1`,
    [taskId, userId]
  );
  if (r.rows[0]) { try { await pauseSession(db, r.rows[0].id, userId); } catch { /* já pausada/encerrada */ } }
}
async function resumeSessionForTask(db, taskId, userId) {
  if (!taskId || !userId) return;
  const r = await db.pool.query(
    `SELECT id FROM task_work_sessions WHERE task_id=$1 AND user_id=$2 AND state='paused' LIMIT 1`,
    [taskId, userId]
  );
  if (r.rows[0]) { try { await resumeSession(db, r.rows[0].id, userId); } catch { /* já retomada/encerrada */ } }
}

// ─── Complete active → break ──────────────────────────────────────────────────

async function completeActive(db, sessionId, userId) {
  const s = await _loadOwned(db, sessionId, userId);
  if (s.state !== 'running' && s.state !== 'paused') throw err('Sessão não está em execução', 'invalid_state', 409);

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    // Fecha pausa pendente.
    let pausedAdd = 0;
    if (s.state === 'paused' && s.pause_started_at) {
      pausedAdd = Math.round((Date.now() - new Date(s.pause_started_at).getTime()) / 1000);
    }
    const activeSec = activeSecondsNow({ ...s, total_paused_seconds: (s.total_paused_seconds || 0) + pausedAdd, state: 'running' }, Date.now());
    const activeMin = Math.round(activeSec / 60);

    await client.query(
      `UPDATE task_work_sessions
          SET state='break', break_started_at=NOW(), pause_started_at=NULL,
              total_paused_seconds = total_paused_seconds + $1,
              total_active_seconds = $2, last_heartbeat=NOW(), updated_at=NOW()
        WHERE id=$3`,
      [pausedAdd, activeSec, sessionId]
    );
    await _addDaily(client, { userId, activeMinutes: activeMin });
    await _creditTaskTime(client, s, activeSec);
    await _event(client, db, { userId, sessionId, taskId: s.task_id, type: 'BREAK_STARTED', metadata: { activeMin } });
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
  return getActiveSession(db, userId);
}

// ─── Finish break (natural) → completed ───────────────────────────────────────

async function finishBreak(db, sessionId, userId) {
  const s = await _loadOwned(db, sessionId, userId);
  if (s.state !== 'break') throw err('Sessão não está em descanso', 'invalid_state', 409);
  const breakSec = s.break_started_at ? Math.round((Date.now() - new Date(s.break_started_at).getTime()) / 1000) : 0;
  const breakMin = Math.round(breakSec / 60);
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE task_work_sessions SET state='completed', stopped_at=NOW(), total_break_seconds=$1, updated_at=NOW() WHERE id=$2`,
      [breakSec, sessionId]
    );
    await _addDaily(client, { userId, breakMinutes: breakMin, completed: 1 });
    await _event(client, db, { userId, sessionId, taskId: s.task_id, type: 'BREAK_COMPLETED' });
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
  return { ok: true };
}

// ─── Skip break → completed + upgrade do próximo ciclo ────────────────────────

async function skipBreak(db, sessionId, userId) {
  const s = await _loadOwned(db, sessionId, userId);
  if (s.state !== 'break') throw err('Sessão não está em descanso', 'invalid_state', 409);
  if (s.planned_minutes >= 100) {
    throw err('Você não pode pular a pausa após um ciclo de 100 minutos.', 'cannot_skip_long_break', 409);
  }
  const nextForced = Math.min(s.planned_minutes * 2, 100);
  const breakSec = s.break_started_at ? Math.round((Date.now() - new Date(s.break_started_at).getTime()) / 1000) : 0;
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE task_work_sessions SET state='completed', stopped_at=NOW(), total_break_seconds=$1, skipped_break_count=1, updated_at=NOW() WHERE id=$2`,
      [breakSec, sessionId]
    );
    await client.query(
      `UPDATE user_pomodoro_config SET next_cycle_forced_minutes=$1, updated_at=NOW() WHERE user_id=$2`,
      [nextForced, userId]
    );
    await _addDaily(client, { userId, completed: 1, skipped: 1 });
    await _event(client, db, { userId, sessionId, taskId: s.task_id, type: 'BREAK_SKIPPED' });
    await _event(client, db, { userId, sessionId, taskId: s.task_id, type: 'MODE_UPGRADED', fromMode: s.pomodoro_mode, toMode: MODE_BY_MINUTES[nextForced] });
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
  return { ok: true, nextForcedMinutes: nextForced };
}

// ─── Abort (manual / timeout / task concluída) ────────────────────────────────

async function _abort(db, session, reason) {
  const exec = db.pool;
  const wasActive = session.state === 'running' || session.state === 'paused';
  const activeSec = wasActive ? activeSecondsNow(session, Date.now()) : (session.total_active_seconds || 0);
  const client = await exec.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE task_work_sessions SET state='aborted', stopped_at=NOW(), aborted_reason=$1, total_active_seconds=$2, last_heartbeat=NOW(), updated_at=NOW()
        WHERE id=$3 AND state IN ('running','paused','break')`,
      [reason, activeSec, session.id]
    );
    // Conta o tempo ativo trabalhado até o abort (foi trabalho real).
    if (wasActive) await _addDaily(client, { userId: session.user_id, activeMinutes: Math.round(activeSec / 60), aborted: 1 });
    else await _addDaily(client, { userId: session.user_id, aborted: 1 });
    await _creditTaskTime(client, session, activeSec);
    await _event(client, db, { userId: session.user_id, sessionId: session.id, taskId: session.task_id, type: 'STOPPED', metadata: { reason } });
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}

async function abortSession(db, sessionId, userId, { reason = 'manual' } = {}) {
  const s = await _loadOwned(db, sessionId, userId);
  if (!['running', 'paused', 'break'].includes(s.state)) throw err('Sessão já encerrada', 'invalid_state', 409);
  await _abort(db, s, reason);
  return { ok: true };
}

// Chamado por task-service.completeTask: encerra sessão ativa daquela tarefa.
async function autoCompleteSessionForTask(db, taskId, { userId = null } = {}) {
  const r = await db.pool.query(
    `SELECT * FROM task_work_sessions WHERE task_id = $1 AND state IN ('running','paused','break') LIMIT 1`, [taskId]
  );
  const s = r.rows[0];
  if (!s) return { aborted: false };
  await _abort(db, s, 'task_completed');
  return { aborted: true, sessionId: s.id };
}

async function heartbeat(db, sessionId, userId) {
  const s = await _loadOwned(db, sessionId, userId);
  if (!['running', 'paused', 'break'].includes(s.state)) return { ok: false };
  await db.pool.query('UPDATE task_work_sessions SET last_heartbeat=NOW() WHERE id=$1', [sessionId]);
  return { ok: true };
}

// Cron: reconcilia sessões. Auto-conclui ciclos RUNNING que passaram do tempo
// (mesmo aba fechada/congelada) e aborta apenas paused/break abandonados (sem
// heartbeat há > 30min). Sessões running dentro do ciclo são preservadas.
async function abortStaleSessions(db) {
  const r = await db.pool.query(
    `SELECT * FROM task_work_sessions
      WHERE state IN ('running','paused','break')
        AND ( last_heartbeat < NOW() - INTERVAL '${STALE_AFTER_MIN} minutes'
              OR (state = 'running' AND started_at < NOW() - (planned_minutes * INTERVAL '1 minute')) )`
  );
  let n = 0;
  for (const s of r.rows) {
    try { const r2 = await _reconcileSession(db, s, { abortStale: true }); if (r2 === 'aborted' || r2 === 'completed_active' || r2 === 'finished_break') n++; }
    catch (e) { console.error('[pomodoro] reconcile falhou', s.id, e.message); }
  }
  return n;
}

// ─── Stats ────────────────────────────────────────────────────────────────────

async function getStats(db, userId, { range = 'day' } = {}) {
  const intervalDays = range === 'month' ? 30 : range === 'week' ? 7 : 1;
  const r = await db.pool.query(
    `SELECT
       COALESCE(SUM(total_minutes_worked),0) AS active_minutes,
       COALESCE(SUM(break_minutes),0)        AS break_minutes,
       COALESCE(SUM(sessions_completed),0)   AS completed,
       COALESCE(SUM(sessions_aborted),0)     AS aborted,
       COALESCE(SUM(skipped_breaks),0)       AS skipped_breaks
     FROM pomodoro_daily_stats
     WHERE user_id = $1 AND day > CURRENT_DATE - $2::int`,
    [userId, intervalDays]
  );
  const today = await _todayMinutes(db.pool, userId);
  const config = await getConfig(db, userId);
  return { ...r.rows[0], todayActiveMinutes: today, dailyLimit: config.daily_limit_minutes };
}

module.exports = {
  MODE_BY_MINUTES, BREAK_BY_MINUTES, VALID_MINUTES, STALE_AFTER_MIN,
  activeSecondsNow,
  getConfig, updateConfig,
  getActiveSession,
  startSession,
  pauseSession, resumeSession,
  pauseSessionForTask, resumeSessionForTask,
  completeActive,
  finishBreak, skipBreak,
  abortSession, autoCompleteSessionForTask,
  heartbeat, abortStaleSessions,
  getStats,
};
