// ═══════════════════════════════════════════════════════════════════════════
// server/services/pm/dashboard-service.js
//
// Agrega os dados do Dashboard do Gerenciamento. Adaptável ao papel:
//   - personal: SEMPRE (tarefas/tempo/prazos do próprio usuário).
//   - global:   só para gestor (manager/admin/superadmin). Manager é escopado
//     aos projetos que gerencia; admin/superadmin veem tudo.
//
// Reusa report-service (productivityByUser, projectsHealth) na visão global.
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const reportService = require('./report-service');

const _isGestor = (role) => role === 'manager' || role === 'admin' || role === 'superadmin';

// Janela padrão: últimos 30 dias.
function _window(from, to) {
  return { from: from || '1970-01-01', to: to || '2999-12-31' };
}

// Série diária preenchida com zeros entre from..to (até ~120 pontos) a partir
// de linhas { day, value }. Mantém o gráfico contínuo mesmo sem dados no dia.
function _fillDays(rows, from, to, key = 'value') {
  const byDay = new Map(rows.map(r => [String(r.day).slice(0, 10), Number(r[key]) || 0]));
  const out = [];
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (isNaN(start) || isNaN(end) || end < start) {
    return rows.map(r => ({ day: String(r.day).slice(0, 10), [key]: Number(r[key]) || 0 }));
  }
  const days = Math.min(Math.round((end - start) / 86400000), 180);
  for (let i = 0; i <= days; i++) {
    const d = new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10);
    out.push({ day: d, [key]: byDay.get(d) || 0 });
  }
  return out;
}

// ─── Visão pessoal ────────────────────────────────────────────────────────────
async function _personal(db, userId, from, to) {
  const counts = (await db.pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status='in_progress')                                                   AS in_progress,
       COUNT(*) FILTER (WHERE status='available')                                                     AS available,
       COUNT(*) FILTER (WHERE status='overdue')                                                       AS overdue,
       COUNT(*) FILTER (WHERE status IN ('available','in_progress','pending_acceptance','pending_review','pending_adjustment')) AS open_tasks,
       COUNT(*) FILTER (WHERE status='completed' AND completed_at::date BETWEEN $2 AND $3)             AS completed_period,
       COUNT(*) FILTER (WHERE status='completed' AND completed_at::date BETWEEN $2 AND $3
                            AND (due_date IS NULL OR completed_at::date <= due_date))                  AS on_time_period
     FROM project_tasks WHERE assignee_user_id = $1`,
    [userId, from, to]
  )).rows[0];

  const byStatusRows = (await db.pool.query(
    `SELECT status, COUNT(*) AS n FROM project_tasks WHERE assignee_user_id = $1 GROUP BY status`,
    [userId]
  )).rows;
  const by_status = {};
  byStatusRows.forEach(r => { by_status[r.status] = Number(r.n); });

  const focusRow = (await db.pool.query(
    `SELECT COALESCE(SUM(total_minutes_worked),0) AS m FROM pomodoro_daily_stats WHERE user_id=$1 AND day BETWEEN $2 AND $3`,
    [userId, from, to]
  )).rows[0];

  const completionsRows = (await db.pool.query(
    `SELECT completed_at::date AS day, COUNT(*) AS value
       FROM project_tasks
      WHERE assignee_user_id=$1 AND status='completed' AND completed_at::date BETWEEN $2 AND $3
      GROUP BY completed_at::date ORDER BY day`,
    [userId, from, to]
  )).rows;

  const focusRows = (await db.pool.query(
    `SELECT day, total_minutes_worked AS value FROM pomodoro_daily_stats
      WHERE user_id=$1 AND day BETWEEN $2 AND $3 ORDER BY day`,
    [userId, from, to]
  )).rows;

  const upcoming = (await db.pool.query(
    `SELECT t.id, t.name, t.status, t.due_date, p.name AS project_name, s.name AS stage_name
       FROM project_tasks t
       LEFT JOIN projects p ON p.id = t.project_id
       LEFT JOIN project_stages s ON s.id = t.project_stage_id
      WHERE t.assignee_user_id=$1 AND t.due_date IS NOT NULL
        AND t.status IN ('available','in_progress','pending_acceptance','pending_adjustment','overdue')
      ORDER BY t.due_date ASC LIMIT 8`,
    [userId]
  )).rows;

  const completed = Number(counts.completed_period);
  const onTime = Number(counts.on_time_period);
  return {
    kpis: {
      open: Number(counts.open_tasks),
      in_progress: Number(counts.in_progress),
      available: Number(counts.available),
      overdue: Number(counts.overdue),
      completed_period: completed,
      focus_minutes: Number(focusRow.m),
      on_time_pct: completed ? Math.round((onTime / completed) * 100) : null,
    },
    by_status,
    completions_by_day: _fillDays(completionsRows, from, to),
    focus_by_day: _fillDays(focusRows, from, to),
    upcoming,
  };
}

// ─── Visão global (gestor) ──────────────────────────────────────────────────────
// Escopo de tarefas/projetos: manager → projetos que gerencia; admin → tudo.
async function _global(db, user, from, to) {
  const isManager = user.role === 'manager';
  const scopeParam = isManager ? [user.id] : [];
  const scopeClause = isManager ? 'AND p.manager_user_id = $1' : '';

  // KPIs de projetos.
  const projKpis = (await db.pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE p.status='ativo')                                            AS active,
       COUNT(*) FILTER (WHERE p.status='concluido' AND p.completed_at::date BETWEEN $${isManager ? 2 : 1} AND $${isManager ? 3 : 2}) AS completed_period
     FROM projects p WHERE 1=1 ${scopeClause}`,
    isManager ? [user.id, from, to] : [from, to]
  )).rows[0];

  // KPIs de tarefas (no escopo).
  const taskKpis = (await db.pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE t.status='overdue')                                          AS overdue,
       COUNT(*) FILTER (WHERE t.status='completed' AND t.completed_at::date BETWEEN $${isManager ? 2 : 1} AND $${isManager ? 3 : 2}) AS throughput
     FROM project_tasks t JOIN projects p ON p.id = t.project_id WHERE 1=1 ${scopeClause}`,
    isManager ? [user.id, from, to] : [from, to]
  )).rows[0];

  const throughputRows = (await db.pool.query(
    `SELECT t.completed_at::date AS day, COUNT(*) AS value
       FROM project_tasks t JOIN projects p ON p.id = t.project_id
      WHERE t.status='completed' AND t.completed_at::date BETWEEN $${isManager ? 2 : 1} AND $${isManager ? 3 : 2} ${scopeClause}
      GROUP BY t.completed_at::date ORDER BY day`,
    isManager ? [user.id, from, to] : [from, to]
  )).rows;

  const projectsHealth = await reportService.projectsHealth(db, { user });
  const topUsers = await reportService.productivityByUser(db, { from, to, user });

  return {
    kpis: {
      active_projects: Number(projKpis.active),
      completed_projects: Number(projKpis.completed_period),
      overdue_tasks: Number(taskKpis.overdue),
      throughput: Number(taskKpis.throughput),
    },
    throughput_by_day: _fillDays(throughputRows, from, to),
    projects_health: projectsHealth.slice(0, 10),
    top_users: topUsers.slice(0, 8),
  };
}

async function getDashboard(db, user, { from, to } = {}) {
  const w = _window(from, to);
  const personal = await _personal(db, user.id, w.from, w.to);
  const isGestor = _isGestor(user.role);
  const global = isGestor ? await _global(db, user, w.from, w.to) : null;
  return { role: user.role, isGestor, personal, global };
}

module.exports = { getDashboard, _isGestor, _fillDays };
