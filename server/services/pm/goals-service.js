// ═══════════════════════════════════════════════════════════════════════════
// server/services/pm/goals-service.js
//
// Metas operacionais do Gerenciamento (tabela pm_goals). Progresso calculado AO
// VIVO sobre dados reais. Indicadores: tasks_completed, on_time_pct,
// projects_completed, focus_minutes. Escopos: self | user | team | global.
//
// Regras de criação:
//   - usuário comum: só scope 'self' (alvo = ele mesmo).
//   - manager: 'self', 'team' (alvo = ele, sua equipe) ou 'user' (alvo ∈ equipe dele).
//   - admin/superadmin: qualquer escopo/alvo.
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const METRICS = ['tasks_completed', 'on_time_pct', 'projects_completed', 'focus_minutes'];
const PERIODS = ['week', 'month', 'quarter'];
const SCOPES = ['self', 'user', 'team', 'global'];

const _isAdmin = (role) => role === 'admin' || role === 'superadmin';
const _isGestor = (role) => role === 'manager' || _isAdmin(role);
function err(message, code, status) { const e = new Error(message); e.code = code; e.status = status || 400; return e; }

// Valor atual do indicador para a meta (sobre a janela e o escopo).
async function _metricValue(db, { metric, scope, target_user_id, period_start, period_end }) {
  const f = period_start, t = period_end;

  if (metric === 'tasks_completed' || metric === 'on_time_pct') {
    let where, params;
    if (scope === 'self' || scope === 'user') { where = 'tk.assignee_user_id = $3'; params = [f, t, target_user_id]; }
    else if (scope === 'team') { where = 'p.manager_user_id = $3'; params = [f, t, target_user_id]; }
    else { where = '1=1'; params = [f, t]; }
    const row = (await db.pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE tk.status='completed' AND tk.completed_at::date BETWEEN $1 AND $2) AS completed,
         COUNT(*) FILTER (WHERE tk.status='completed' AND tk.completed_at::date BETWEEN $1 AND $2
                              AND (tk.due_date IS NULL OR tk.completed_at::date <= tk.due_date)) AS on_time
         FROM project_tasks tk JOIN projects p ON p.id = tk.project_id WHERE ${where}`,
      params
    )).rows[0];
    const completed = Number(row.completed), onTime = Number(row.on_time);
    if (metric === 'tasks_completed') return completed;
    return completed ? Math.round((onTime / completed) * 100) : 0;
  }

  if (metric === 'projects_completed') {
    let where, params;
    if (scope === 'global') { where = '1=1'; params = [f, t]; }
    else { where = 'p.manager_user_id = $3'; params = [f, t, target_user_id]; }
    return Number((await db.pool.query(
      `SELECT COUNT(*) AS n FROM projects p WHERE p.status='concluido' AND p.completed_at::date BETWEEN $1 AND $2 AND ${where}`,
      params
    )).rows[0].n);
  }

  if (metric === 'focus_minutes') {
    if (scope === 'self' || scope === 'user') {
      return Number((await db.pool.query(
        `SELECT COALESCE(SUM(total_minutes_worked),0) AS m FROM pomodoro_daily_stats WHERE user_id=$3 AND day BETWEEN $1 AND $2`,
        [f, t, target_user_id]
      )).rows[0].m);
    }
    if (scope === 'team') {
      return Number((await db.pool.query(
        `SELECT COALESCE(SUM(s.total_minutes_worked),0) AS m FROM pomodoro_daily_stats s
          WHERE s.day BETWEEN $1 AND $2 AND s.user_id IN (
            SELECT DISTINCT tk.assignee_user_id FROM project_tasks tk JOIN projects p ON p.id=tk.project_id
             WHERE p.manager_user_id=$3 AND tk.assignee_user_id IS NOT NULL)`,
        [f, t, target_user_id]
      )).rows[0].m);
    }
    return Number((await db.pool.query(
      `SELECT COALESCE(SUM(total_minutes_worked),0) AS m FROM pomodoro_daily_stats WHERE day BETWEEN $1 AND $2`,
      [f, t]
    )).rows[0].m);
  }
  return 0;
}

function _status(current, target, period_start, period_end) {
  const tgt = Number(target) || 0;
  const pct = tgt > 0 ? Math.round((current / tgt) * 100) : 0;
  const today = new Date().toISOString().slice(0, 10);
  if (current >= tgt && tgt > 0) return { pct, status: 'hit' };
  if (today > String(period_end).slice(0, 10)) return { pct, status: 'missed' };
  // Ritmo esperado vs realizado.
  const start = new Date(`${String(period_start).slice(0, 10)}T00:00:00Z`).getTime();
  const end = new Date(`${String(period_end).slice(0, 10)}T00:00:00Z`).getTime();
  const now = new Date(`${today}T00:00:00Z`).getTime();
  const elapsedPct = end > start ? Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100)) : 0;
  if (elapsedPct - pct > 20) return { pct, status: 'at_risk' };
  return { pct, status: 'on_track' };
}

// ─── Batch (#5) ─────────────────────────────────────────────────────────────
// As 4 métricas caem em 3 FORMAS de query (tasks / projects / focus). Em vez de
// 1 query por meta (N sequenciais — pesado p/ admin, que vê todas), agrupamos as
// metas por forma e computamos cada grupo numa query só, via `unnest` de arrays
// tipados + `LATERAL` correlacionado por meta. Cada bloco SQL ESPELHA 1:1 o
// `_metricValue` acima (mesma condição de escopo, mesmo FILTER de período/status).
// unnest com arrays tipados evita a inferência frágil de tipos do VALUES.

const _SHAPE = (metric) =>
  (metric === 'tasks_completed' || metric === 'on_time_pct') ? 'tasks'
  : metric === 'projects_completed' ? 'projects'
  : 'focus';

// Colunas comuns do unnest: goal_id, scope, target_user_id, period_start, period_end.
const _UNNEST = `unnest($1::text[], $2::text[], $3::text[], $4::date[], $5::date[])
                   AS gv(goal_id, scope, target_user_id, period_start, period_end)`;

const _SQL = {
  tasks: `
    SELECT gv.goal_id, COALESCE(agg.completed, 0) AS completed, COALESCE(agg.on_time, 0) AS on_time
      FROM ${_UNNEST}
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE tk.status='completed'
                             AND tk.completed_at::date BETWEEN gv.period_start AND gv.period_end) AS completed,
          COUNT(*) FILTER (WHERE tk.status='completed'
                             AND tk.completed_at::date BETWEEN gv.period_start AND gv.period_end
                             AND (tk.due_date IS NULL OR tk.completed_at::date <= tk.due_date))   AS on_time
          FROM project_tasks tk JOIN projects p ON p.id = tk.project_id
         WHERE ((gv.scope='self' OR gv.scope='user') AND tk.assignee_user_id = gv.target_user_id)
            OR (gv.scope='team'   AND p.manager_user_id = gv.target_user_id)
            OR (gv.scope='global')
      ) agg ON true`,
  projects: `
    SELECT gv.goal_id, COALESCE(agg.n, 0) AS n
      FROM ${_UNNEST}
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS n FROM projects p
         WHERE p.status='concluido'
           AND p.completed_at::date BETWEEN gv.period_start AND gv.period_end
           AND (gv.scope='global' OR p.manager_user_id = gv.target_user_id)
      ) agg ON true`,
  focus: `
    SELECT gv.goal_id, COALESCE(agg.m, 0) AS m
      FROM ${_UNNEST}
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(s.total_minutes_worked),0) AS m FROM pomodoro_daily_stats s
         WHERE s.day BETWEEN gv.period_start AND gv.period_end
           AND ( ((gv.scope='self' OR gv.scope='user') AND s.user_id = gv.target_user_id)
              OR (gv.scope='team' AND s.user_id IN (
                    SELECT DISTINCT tk.assignee_user_id FROM project_tasks tk JOIN projects p ON p.id=tk.project_id
                     WHERE p.manager_user_id = gv.target_user_id AND tk.assignee_user_id IS NOT NULL))
              OR (gv.scope='global') )
      ) agg ON true`,
};

// Arrays paralelos p/ o unnest, a partir de um grupo de metas.
function _unnestParams(goals) {
  return [
    goals.map(g => g.id),
    goals.map(g => g.scope),
    goals.map(g => g.target_user_id ?? null),
    goals.map(g => String(g.period_start).slice(0, 10)),
    goals.map(g => String(g.period_end).slice(0, 10)),
  ];
}

// Calcula o valor atual de TODAS as metas em ≤3 queries (uma por forma presente).
// Retorna Map goalId → current.
async function _metricValuesBatch(db, rows) {
  const byShape = { tasks: [], projects: [], focus: [] };
  for (const g of rows) byShape[_SHAPE(g.metric)].push(g);

  const values = new Map();

  await Promise.all(Object.entries(byShape).map(async ([shape, goals]) => {
    if (!goals.length) return;
    const r = await db.pool.query(_SQL[shape], _unnestParams(goals));
    const byId = new Map(r.rows.map(x => [x.goal_id, x]));
    for (const g of goals) {
      const row = byId.get(g.id);
      if (shape === 'tasks') {
        const completed = Number(row?.completed || 0), onTime = Number(row?.on_time || 0);
        values.set(g.id, g.metric === 'tasks_completed'
          ? completed
          : (completed ? Math.round((onTime / completed) * 100) : 0));
      } else if (shape === 'projects') {
        values.set(g.id, Number(row?.n || 0));
      } else {
        values.set(g.id, Number(row?.m || 0));
      }
    }
  }));

  return values;
}

async function _withProgress(db, rows) {
  if (!rows.length) return [];
  const values = await _metricValuesBatch(db, rows);
  return rows.map(g => {
    const current = values.get(g.id) ?? 0;
    const { pct, status } = _status(current, g.target, g.period_start, g.period_end);
    return { ...g, target: Number(g.target), current, pct, status };
  });
}

// Metas que o usuário pode VER: admin/superadmin veem todas; demais veem as que
// miram nele OU que ele criou.
async function listGoals(db, user) {
  const NAME = `COALESCE(NULLIF(TRIM(COALESCE(u.first_name,'')||' '||COALESCE(u.last_name,'')),''), u.username)`;
  let where, params;
  if (_isAdmin(user.role)) { where = '1=1'; params = []; }
  else { where = '(g.target_user_id = $1 OR g.created_by_user_id = $1)'; params = [user.id]; }
  const r = await db.pool.query(
    `SELECT g.*, ${NAME} AS target_user_name
       FROM pm_goals g LEFT JOIN users u ON u.id = g.target_user_id
      WHERE ${where}
      ORDER BY g.period_end DESC, g.created_at DESC`,
    params
  );
  return _withProgress(db, r.rows);
}

// Valida e normaliza o escopo conforme o papel do criador.
async function _validateScope(db, actor, { scope, target_user_id }) {
  if (!SCOPES.includes(scope)) throw err('Escopo inválido', 'bad_scope');
  if (scope === 'self') return { scope, target_user_id: actor.id };
  if (scope === 'global') {
    if (!_isAdmin(actor.role)) throw err('Apenas admin define metas globais', 'forbidden', 403);
    return { scope, target_user_id: null };
  }
  // user | team
  if (!_isGestor(actor.role)) throw err('Apenas gestores definem metas de equipe/usuário', 'forbidden', 403);
  if (!target_user_id) throw err('Selecione o usuário/equipe da meta', 'target_required');
  if (_isAdmin(actor.role)) return { scope, target_user_id };
  // manager: 'team' só a própria equipe; 'user' só alguém da equipe dele
  if (scope === 'team') {
    if (target_user_id !== actor.id) throw err('Gerente só define meta da própria equipe', 'forbidden', 403);
    return { scope, target_user_id };
  }
  const inTeam = await db.pool.query(
    `SELECT 1 FROM project_tasks tk JOIN projects p ON p.id=tk.project_id
      WHERE p.manager_user_id=$1 AND tk.assignee_user_id=$2 LIMIT 1`,
    [actor.id, target_user_id]
  );
  if (!inTeam.rows.length) throw err('Esse usuário não está na sua equipe', 'forbidden', 403);
  return { scope, target_user_id };
}

async function createGoal(db, actor, input) {
  const metric = input.metric;
  if (!METRICS.includes(metric)) throw err('Indicador inválido', 'bad_metric');
  if (!PERIODS.includes(input.period)) throw err('Período inválido', 'bad_period');
  const target = Number(input.target);
  if (!(target > 0)) throw err('Defina um alvo maior que zero', 'bad_target');
  if (!input.period_start || !input.period_end) throw err('Janela do período obrigatória', 'bad_window');
  const sc = await _validateScope(db, actor, { scope: input.scope, target_user_id: input.target_user_id });

  const id = db.generateId();
  await db.pool.query(
    `INSERT INTO pm_goals (id, title, metric, target, scope, target_user_id, period, period_start, period_end, created_by_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [id, input.title || null, metric, target, sc.scope, sc.target_user_id, input.period,
     String(input.period_start).slice(0, 10), String(input.period_end).slice(0, 10), actor.id]
  );
  const r = await db.pool.query(
    `SELECT g.*, COALESCE(NULLIF(TRIM(COALESCE(u.first_name,'')||' '||COALESCE(u.last_name,'')),''), u.username) AS target_user_name
       FROM pm_goals g LEFT JOIN users u ON u.id=g.target_user_id WHERE g.id=$1`, [id]
  );
  return (await _withProgress(db, r.rows))[0];
}

async function _ownedGoal(db, actor, goalId) {
  const r = await db.pool.query('SELECT * FROM pm_goals WHERE id=$1', [goalId]);
  const g = r.rows[0];
  if (!g) throw err('Meta não encontrada', 'not_found', 404);
  const mine = g.created_by_user_id === actor.id || (g.scope === 'self' && g.target_user_id === actor.id);
  if (!_isAdmin(actor.role) && !mine) throw err('Sem permissão sobre esta meta', 'forbidden', 403);
  return g;
}

async function updateGoal(db, actor, goalId, input) {
  await _ownedGoal(db, actor, goalId);
  const fields = [], params = [];
  let i = 1;
  if (input.title !== undefined) { fields.push(`title=$${i++}`); params.push(input.title || null); }
  if (input.target !== undefined) {
    const tgt = Number(input.target); if (!(tgt > 0)) throw err('Alvo inválido', 'bad_target');
    fields.push(`target=$${i++}`); params.push(tgt);
  }
  if (input.period_start) { fields.push(`period_start=$${i++}`); params.push(String(input.period_start).slice(0, 10)); }
  if (input.period_end) { fields.push(`period_end=$${i++}`); params.push(String(input.period_end).slice(0, 10)); }
  if (!fields.length) throw err('Nada para atualizar', 'noop');
  fields.push('updated_at=NOW()');
  params.push(goalId);
  await db.pool.query(`UPDATE pm_goals SET ${fields.join(', ')} WHERE id=$${i}`, params);
  const r = await db.pool.query(
    `SELECT g.*, COALESCE(NULLIF(TRIM(COALESCE(u.first_name,'')||' '||COALESCE(u.last_name,'')),''), u.username) AS target_user_name
       FROM pm_goals g LEFT JOIN users u ON u.id=g.target_user_id WHERE g.id=$1`, [goalId]
  );
  return (await _withProgress(db, r.rows))[0];
}

async function deleteGoal(db, actor, goalId) {
  await _ownedGoal(db, actor, goalId);
  await db.pool.query('DELETE FROM pm_goals WHERE id=$1', [goalId]);
  return true;
}

module.exports = {
  listGoals, createGoal, updateGoal, deleteGoal, METRICS, PERIODS, SCOPES,
  // exportados p/ teste + prova de equivalência (#5): _metricValue é a referência
  // per-meta; _metricValuesBatch é o cálculo em lote que deve produzir o mesmo valor.
  _metricValue, _metricValuesBatch, _SHAPE,
};
