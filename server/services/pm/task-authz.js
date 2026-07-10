// ═══════════════════════════════════════════════════════════════════════════
// server/services/pm/task-authz.js
// Autorização de gestão de tarefas do PM (#4). Antes, um único `_canManageTask`
// (em routes/pm.js) respondia DUAS perguntas diferentes conforme o valor de
// `targetUserId` — ora o assignee atual ("posso agir nesta tarefa?"), ora o novo
// responsável ("posso atribuir a este alvo?"). Aqui a lógica de escopo é UMA só
// (`scopeCheck`, comportamento idêntico ao anterior), exposta por dois nomes que
// deixam a intenção explícita no call-site.
//
// Escopo de gestão (atribuir / definir prazo):
//  - superadmin: tudo.
//  - admin: tudo, MENOS tarefa de outro admin ou de superadmin.
//  - manager: só na equipe dele — projeto que gerencia, quem ele já atribuiu, ou ele mesmo.
//  - demais: não.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

// Check genérico de escopo: `targetUserId` é o usuário relevante (dono/alvo).
// Corpo idêntico ao antigo _canManageTask (behavior-preserving).
async function scopeCheck(db, actor, task, targetUserId) {
  if (!actor) return false;
  if (targetUserId === undefined) targetUserId = task && task.assignee_user_id;
  if (actor.role === 'superadmin') return true;

  let targetRole = null;
  if (targetUserId) {
    const r = await db.pool.query('SELECT role FROM users WHERE id = $1', [targetUserId]);
    targetRole = r.rows[0]?.role || null;
  }

  if (actor.role === 'admin') {
    if (targetUserId && targetUserId !== actor.id && (targetRole === 'admin' || targetRole === 'superadmin')) return false;
    return true;
  }

  if (actor.role === 'manager') {
    if (!targetUserId) return true;                 // tarefa sem responsável (disponível)
    if (targetUserId === actor.id) return true;
    if (targetRole === 'user') return true;         // delega p/ usuário comum / age sobre tarefa dele
    if (task && task.project_id) {
      const p = await db.pool.query('SELECT manager_user_id FROM projects WHERE id = $1', [task.project_id]);
      if (p.rows[0]?.manager_user_id === actor.id) return true;
    }
    const h = await db.pool.query(
      `SELECT 1 FROM task_assignments_history WHERE assigned_by_user_id = $1 AND to_user_id = $2 LIMIT 1`,
      [actor.id, targetUserId]
    );
    if (h.rows[0]) return true;
    return false;                                   // tarefa de outro gestor (admin/superadmin/manager)
  }
  return false;
}

// "O ator pode AGIR nesta tarefa?" — escopo avaliado sobre o dono ATUAL da tarefa.
function canActOnTask(db, actor, task) {
  return scopeCheck(db, actor, task, task && task.assignee_user_id);
}

// "O ator pode ATRIBUIR esta tarefa a `targetUserId`?" — escopo sobre o ALVO.
function canAssignTo(db, actor, task, targetUserId) {
  return scopeCheck(db, actor, task, targetUserId);
}

module.exports = { scopeCheck, canActOnTask, canAssignTo };
