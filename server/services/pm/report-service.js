// ═══════════════════════════════════════════════════════════════════════════
// server/services/pm/report-service.js
//
// Fase 7: detecção de atraso (overdue) + relatórios administrativos por período
// (diário/semanal/mensal/trimestral/anual) enviados por e-mail (opt-in).
//
// Período de referência = período ANTERIOR já fechado (ex.: relatório diário
// cobre ONTEM). Idempotência via pm_report_jobs UNIQUE(user, frequency,
// period_start). Datas no timezone da app (APP_TIMEZONE, default America/Sao_Paulo — #13).
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const emailService = require('../email');
const notificationService = require('./notification-service');

const { APP_TIMEZONE: TZ } = require('../../utils/timezone'); // #13: configurável por env, default BRT

// ─── Overdue ──────────────────────────────────────────────────────────────────

/**
 * Marca como 'overdue' tarefas ativas (available/in_progress) com prazo vencido.
 * Idempotente: ao virar 'overdue' a query não as pega de novo. Notifica
 * responsável + admins.
 */
async function detectAndMarkOverdue(db) {
  const r = await db.pool.query(
    `UPDATE project_tasks
        SET status = 'overdue', updated_at = NOW()
      WHERE status IN ('available','in_progress')
        AND due_date IS NOT NULL AND due_date < CURRENT_DATE
      RETURNING id, project_id, name, assignee_user_id`
  );
  for (const t of r.rows) {
    try {
      await db.createNotification({
        user_id: t.assignee_user_id, notification_type: 'pm_task_overdue',
        title: 'Tarefa atrasada', message: `"${t.name}" passou do prazo.`,
        related_entity_type: 'project_task', related_entity_id: t.id,
      }).catch(() => {});
      await db.pool.query(
        `INSERT INTO task_events (id, task_id, event_type, actor_type, actor_id, payload)
         VALUES ($1,$2,'became_overdue','cron',NULL,'{}'::jsonb)`,
        [db.generateId(), t.id]
      );
      if (t.assignee_user_id) {
        notificationService.notify(db, { type: 'pm_task_overdue', userId: t.assignee_user_id, payload: { taskName: t.name }, entityType: 'project_task', entityId: t.id, ctaProjectId: t.project_id }).catch(() => {});
      }
      notificationService.notifyAdmins(db, { type: 'pm_task_overdue', payload: { taskName: t.name }, entityType: 'project_task', entityId: t.id, ctaProjectId: t.project_id }).catch(() => {});
    } catch (e) { console.error('[pm-report] overdue notify falhou', t.id, e.message); }
  }
  return r.rows.length;
}

// ─── Datas (BRT) ──────────────────────────────────────────────────────────────

function brtParts(date) {
  // Retorna {y, m, d} no fuso de São Paulo.
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const [{ value: y }, , { value: m }, , { value: d }] = fmt.formatToParts(date);
  return { y: Number(y), m: Number(m), d: Number(d) };
}
function ymd(y, m, d) { return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
function addDaysUTC(dateStr, days) {
  const dt = new Date(dateStr + 'T12:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Período ANTERIOR fechado, para uma frequência. Retorna {start, end} (YYYY-MM-DD). */
function previousPeriod(frequency, now) {
  const { y, m, d } = brtParts(now);
  const today = ymd(y, m, d);
  if (frequency === 'daily') {
    const yest = addDaysUTC(today, -1);
    return { start: yest, end: yest };
  }
  if (frequency === 'weekly') {
    // semana anterior (seg-dom). Calcula segunda desta semana e volta 7 dias.
    const dow = new Date(today + 'T12:00:00Z').getUTCDay(); // 0=dom
    const isoDow = dow === 0 ? 7 : dow;
    const mondayThis = addDaysUTC(today, -(isoDow - 1));
    return { start: addDaysUTC(mondayThis, -7), end: addDaysUTC(mondayThis, -1) };
  }
  if (frequency === 'monthly') {
    const pm = m === 1 ? 12 : m - 1;
    const py = m === 1 ? y - 1 : y;
    const start = ymd(py, pm, 1);
    const end = addDaysUTC(ymd(pm === 12 ? py + 1 : py, pm === 12 ? 1 : pm + 1, 1), -1);
    return { start, end };
  }
  if (frequency === 'quarterly') {
    const q = Math.floor((m - 1) / 3); // 0..3 atual
    const prevQ = q === 0 ? 3 : q - 1;
    const py = q === 0 ? y - 1 : y;
    const startM = prevQ * 3 + 1;
    const start = ymd(py, startM, 1);
    const endM = startM + 2;
    const end = addDaysUTC(ymd(endM === 12 ? py : py, endM === 12 ? 12 : endM + 1, 1), -1);
    return { start, end };
  }
  if (frequency === 'yearly') {
    return { start: ymd(y - 1, 1, 1), end: ymd(y - 1, 12, 31) };
  }
  return null;
}

// ─── Conteúdo do relatório ────────────────────────────────────────────────────

async function buildReportData(db, start, end) {
  // Tempo ativo + sessões no período.
  const time = await db.pool.query(
    `SELECT COALESCE(SUM(total_minutes_worked),0) AS active_minutes,
            COALESCE(SUM(break_minutes),0) AS break_minutes,
            COALESCE(SUM(skipped_breaks),0) AS skipped_breaks
       FROM pomodoro_daily_stats WHERE day BETWEEN $1 AND $2`, [start, end]
  );
  // Top usuários por tempo ativo.
  const topUsers = await db.pool.query(
    `SELECT s.user_id, COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'') AS name, SUM(s.total_minutes_worked) AS minutes
       FROM pomodoro_daily_stats s JOIN users u ON u.id = s.user_id
      WHERE s.day BETWEEN $1 AND $2
      GROUP BY s.user_id, u.first_name, u.last_name
      ORDER BY minutes DESC LIMIT 5`, [start, end]
  );
  // Tarefas concluídas / atrasadas no período.
  const tasks = await db.pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status='completed' AND completed_at::date BETWEEN $1 AND $2) AS completed,
       COUNT(*) FILTER (WHERE status='overdue') AS overdue
     FROM project_tasks`, [start, end]
  );
  return { time: time.rows[0], topUsers: topUsers.rows, tasks: tasks.rows[0] };
}

function renderReportHtml({ frequency, start, end, data }) {
  const freqLabel = { daily: 'Diário', weekly: 'Semanal', monthly: 'Mensal', quarterly: 'Trimestral', yearly: 'Anual' }[frequency] || frequency;
  const rows = (data.topUsers || []).map(u => `<tr><td style="padding:4px 8px">${(u.name || '').trim() || '—'}</td><td style="padding:4px 8px;text-align:right">${u.minutes} min</td></tr>`).join('');
  return `<div style="font-family:Inter,Arial,sans-serif;max-width:640px;margin:0 auto;color:#1f2937">
    <h2 style="color:#4f46e5">Relatório ${freqLabel} · Gerenciamento</h2>
    <p style="color:#6b7280;font-size:13px">Período: ${start} a ${end}</p>
    <ul style="font-size:14px;line-height:1.7">
      <li><strong>Tempo ativo total:</strong> ${data.time.active_minutes} min</li>
      <li><strong>Tempo em pausa:</strong> ${data.time.break_minutes} min</li>
      <li><strong>Pausas puladas:</strong> ${data.time.skipped_breaks}</li>
      <li><strong>Tarefas concluídas:</strong> ${data.tasks.completed}</li>
      <li><strong>Tarefas atrasadas (atual):</strong> ${data.tasks.overdue}</li>
    </ul>
    <h3 style="color:#4f46e5;font-size:15px">Usuários mais ativos</h3>
    <table style="border-collapse:collapse;font-size:13px;width:100%">${rows || '<tr><td style="padding:4px 8px;color:#9ca3af">Sem dados</td></tr>'}</table>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
    <p style="font-size:12px;color:#9ca3af">IMPGEO · enviado automaticamente. Ajuste a frequência nas preferências.</p>
  </div>`;
}

// ─── Envio (cron) ─────────────────────────────────────────────────────────────

/**
 * Para cada admin com pm_email_reports=TRUE, envia os relatórios das frequências
 * configuradas cujo período anterior ainda não foi enviado. Idempotente.
 * @returns {Promise<number>} relatórios enviados
 */
async function sendDueReports(db, now = new Date()) {
  const users = await db.pool.query(
    `SELECT id, email, pm_report_frequencies FROM users
      WHERE pm_email_reports = TRUE AND email IS NOT NULL
        AND role IN ('admin','superadmin','manager') AND COALESCE(is_active,true)=true`
  );
  let sent = 0;
  for (const u of users.rows) {
    const freqs = Array.isArray(u.pm_report_frequencies) ? u.pm_report_frequencies : [];
    for (const freq of freqs) {
      const period = previousPeriod(freq, now);
      if (!period) continue;
      // Já enviado?
      const exists = await db.pool.query(
        'SELECT 1 FROM pm_report_jobs WHERE user_id=$1 AND frequency=$2 AND period_start=$3',
        [u.id, freq, period.start]
      );
      if (exists.rows.length) continue;
      try {
        const data = await buildReportData(db, period.start, period.end);
        const html = renderReportHtml({ frequency: freq, start: period.start, end: period.end, data });
        await emailService.enviarEmailRelatorioPm({ toEmail: u.email, subject: `Relatório ${freq} · IMPGEO`, html });
        await db.pool.query(
          `INSERT INTO pm_report_jobs (id, user_id, frequency, period_start, period_end, status)
           VALUES ($1,$2,$3,$4,$5,'sent') ON CONFLICT (user_id, frequency, period_start) DO NOTHING`,
          [db.generateId(), u.id, freq, period.start, period.end]
        );
        sent++;
      } catch (e) {
        await db.pool.query(
          `INSERT INTO pm_report_jobs (id, user_id, frequency, period_start, period_end, status, error)
           VALUES ($1,$2,$3,$4,$5,'error',$6) ON CONFLICT (user_id, frequency, period_start) DO NOTHING`,
          [db.generateId(), u.id, freq, period.start, period.end, e.message]
        ).catch(() => {});
        console.error('[pm-report] envio falhou', u.id, freq, e.message);
      }
    }
  }
  return sent;
}

// ─── Relatórios administrativos (Fase 8) ─────────────────────────────────────

// Filtro de equipe do manager: usuários que ele atribuiu OU projetos onde é
// manager. Admin/superadmin não filtra (vê tudo). Retorna cláusula + params.
function _teamScope(user, startIdx) {
  if (!user || user.role === 'admin' || user.role === 'superadmin') return { clause: '', params: [] };
  // manager
  return {
    clause: `AND (t.assignee_user_id IN (
                SELECT DISTINCT to_user_id FROM task_assignments_history WHERE assigned_by_user_id = $${startIdx}
              ) OR p.manager_user_id = $${startIdx})`,
    params: [user.id],
  };
}

/** Produtividade por usuário no período. Respeita escopo de equipe do manager. */
async function productivityByUser(db, { from, to, user } = {}) {
  const params = [from || '1970-01-01', to || '2999-12-31'];
  const scope = _teamScope(user, 3);
  const sql = `
    SELECT u.id AS user_id,
           COALESCE(NULLIF(TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')), ''), u.username) AS name,
           COUNT(t.id) FILTER (WHERE t.status='completed' AND t.completed_at::date BETWEEN $1 AND $2) AS completed,
           COUNT(t.id) FILTER (WHERE t.status='overdue') AS overdue,
           COUNT(t.id) FILTER (WHERE t.status IN ('available','in_progress','pending_acceptance','pending_review','pending_adjustment')) AS open_tasks,
           COALESCE((SELECT SUM(s.total_minutes_worked) FROM pomodoro_daily_stats s WHERE s.user_id=u.id AND s.day BETWEEN $1 AND $2),0) AS active_minutes
      FROM users u
      LEFT JOIN project_tasks t ON t.assignee_user_id = u.id
      LEFT JOIN projects p ON p.id = t.project_id
     WHERE COALESCE(u.is_active,true)=true ${scope.clause}
     GROUP BY u.id, u.first_name, u.last_name, u.username
     ORDER BY active_minutes DESC, completed DESC`;
  const r = await db.pool.query(sql, [...params, ...scope.params]);
  return r.rows;
}

/** Saúde dos projetos (do view). Manager vê só os seus. */
async function projectsHealth(db, { user } = {}) {
  if (user && user.role === 'manager') {
    const r = await db.pool.query(
      `SELECT h.* FROM pm_project_health_v h JOIN projects p ON p.id = h.project_id WHERE p.manager_user_id = $1 ORDER BY h.days_to_deadline ASC NULLS LAST`,
      [user.id]
    );
    return r.rows;
  }
  const r = await db.pool.query(`SELECT * FROM pm_project_health_v ORDER BY days_to_deadline ASC NULLS LAST`);
  return r.rows;
}

/**
 * Equipes agrupadas por gerente. Admin/superadmin veem TODAS as equipes;
 * manager vê só a dele. Membro = quem o gerente já atribuiu OU assignee de tarefa
 * em projeto que ele gerencia. Cada membro com stats do período + totais do time.
 */
async function teamsReport(db, { from, to, user } = {}) {
  const f = from || '1970-01-01', t = to || '2999-12-31';
  const NAME = `COALESCE(NULLIF(TRIM(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')), ''), username)`;

  // "Dono de time" = quem lidera pessoas: manager, admin ou superadmin.
  let mgrSql = `SELECT id, ${NAME} AS name, role FROM users WHERE role IN ('manager','admin','superadmin') AND COALESCE(is_active,true)=true`;
  const mgrParams = [];
  // Manager só enxerga o próprio time; admin/superadmin enxergam todos.
  if (user && user.role === 'manager') { mgrSql += ` AND id = $1`; mgrParams.push(user.id); }
  mgrSql += ` ORDER BY name`;
  const managers = (await db.pool.query(mgrSql, mgrParams)).rows;
  if (!managers.length) return [];
  const mgrIds = managers.map(m => m.id);

  const pairs = (await db.pool.query(
    `SELECT DISTINCT mgr, member FROM (
        SELECT assigned_by_user_id AS mgr, to_user_id AS member FROM task_assignments_history
          WHERE to_user_id IS NOT NULL AND assigned_by_user_id = ANY($1::varchar[])
        UNION
        SELECT p.manager_user_id AS mgr, tk.assignee_user_id AS member
          FROM project_tasks tk JOIN projects p ON p.id = tk.project_id
          WHERE tk.assignee_user_id IS NOT NULL AND p.manager_user_id = ANY($1::varchar[])
     ) x WHERE member IS NOT NULL`, [mgrIds]
  )).rows;

  const memberIds = [...new Set(pairs.map(p => p.member))];
  const statsByUser = {};
  if (memberIds.length) {
    const sr = await db.pool.query(
      `SELECT u.id AS user_id, ${NAME} AS name,
              COUNT(tk.id) FILTER (WHERE tk.status='completed' AND tk.completed_at::date BETWEEN $2 AND $3) AS completed,
              COUNT(tk.id) FILTER (WHERE tk.status='overdue') AS overdue,
              COUNT(tk.id) FILTER (WHERE tk.status IN ('available','in_progress','pending_acceptance','pending_review','pending_adjustment')) AS open_tasks,
              COALESCE((SELECT SUM(s.total_minutes_worked) FROM pomodoro_daily_stats s WHERE s.user_id=u.id AND s.day BETWEEN $2 AND $3),0) AS active_minutes
         FROM users u LEFT JOIN project_tasks tk ON tk.assignee_user_id = u.id
        WHERE u.id = ANY($1::varchar[])
        GROUP BY u.id, u.first_name, u.last_name, u.username`,
      [memberIds, f, t]
    );
    sr.rows.forEach(r => { statsByUser[r.user_id] = { ...r, projects: [] }; });

    // Detalhamento por projeto dentro de cada membro. Tempo aqui = segundos
    // creditados às tarefas (actual_seconds), por isso pode não bater 1:1 com o
    // active_minutes do membro (que é o total de foco no Pomodoro no período).
    const pr = await db.pool.query(
      `SELECT tk.assignee_user_id AS user_id, tk.project_id, p.name AS project_name,
              (p.manager_user_id = tk.assignee_user_id) AS is_lead,
              COUNT(tk.id) FILTER (WHERE tk.status='completed' AND tk.completed_at::date BETWEEN $2 AND $3) AS completed,
              COUNT(tk.id) FILTER (WHERE tk.status='overdue') AS overdue,
              COUNT(tk.id) FILTER (WHERE tk.status IN ('available','in_progress','pending_acceptance','pending_review','pending_adjustment')) AS open_tasks,
              COALESCE(SUM(tk.actual_seconds),0) AS active_seconds
         FROM project_tasks tk JOIN projects p ON p.id = tk.project_id
        WHERE tk.assignee_user_id = ANY($1::varchar[])
        GROUP BY tk.assignee_user_id, tk.project_id, p.name, p.manager_user_id`,
      [memberIds, f, t]
    );
    pr.rows.forEach(r => {
      const completed = Number(r.completed), overdue = Number(r.overdue), open_tasks = Number(r.open_tasks);
      const active_minutes = Math.round(Number(r.active_seconds) / 60);
      // Ignora projeto sem nada relevante no período (tudo zero).
      if (!completed && !overdue && !open_tasks && !active_minutes) return;
      const bucket = statsByUser[r.user_id];
      if (bucket) bucket.projects.push({ project_id: r.project_id, project_name: r.project_name, role: r.is_lead ? 'lead' : 'member', completed, overdue, open_tasks, active_minutes });
    });
    Object.values(statsByUser).forEach(u => {
      u.projects.sort((a, b) => b.completed - a.completed || b.active_minutes - a.active_minutes);
    });
  }

  const byMgr = {};
  pairs.forEach(p => { (byMgr[p.mgr] = byMgr[p.mgr] || new Set()).add(p.member); });

  return managers.map(m => {
    const members = [...(byMgr[m.id] || [])].map(id => statsByUser[id]).filter(Boolean)
      .sort((a, b) => Number(b.active_minutes) - Number(a.active_minutes));
    const totals = members.reduce((a, x) => ({
      completed: a.completed + Number(x.completed), overdue: a.overdue + Number(x.overdue),
      open_tasks: a.open_tasks + Number(x.open_tasks), active_minutes: a.active_minutes + Number(x.active_minutes),
    }), { completed: 0, overdue: 0, open_tasks: 0, active_minutes: 0 });
    return { manager_id: m.id, manager_name: m.name, manager_role: m.role, members, totals };
  }).filter(team => team.members.length > 0 || (user && user.role === 'manager' && team.manager_id === user.id));
}

module.exports = {
  detectAndMarkOverdue,
  sendDueReports,
  previousPeriod,    // exposto p/ teste
  buildReportData,
  renderReportHtml,
  productivityByUser,
  projectsHealth,
  teamsReport,
};
