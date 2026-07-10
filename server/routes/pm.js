// ═══════════════════════════════════════════════════════════════════════════
// server/routes/pm.js
// Rotas do subsistema PM/Gerenciamento (clientes, projetos, tarefas, pomodoro,
// serviços/templates, aprovações, relatórios). Extraídas de server.js (#3) —
// comportamento idêntico (rotas movidas verbatim, paths completos preservados).
//
// Factory: recebe as deps server-local por injeção; services PM e utils são
// importados direto. Montar com app.use(createPmRoutes({...})) na posição
// original para preservar a ordem de registro.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const pmTemplateService = require('../services/pm/template-service');
const pmProjectService = require('../services/pm/project-service');
const pmTaskService = require('../services/pm/task-service');
const pmPomodoroService = require('../services/pm/pomodoro-service');
const pmHelpService = require('../services/pm/help-service');
const pmReportService = require('../services/pm/report-service');
const pmCostService = require('../services/pm/cost-service');
const pmDashboardService = require('../services/pm/dashboard-service');
const pmGoalsService = require('../services/pm/goals-service');
const pmReconcileService = require('../services/pm/reconcile-service');
const pmApprovalsService = require('../services/pm/approvals-service');
const pmAuditService = require('../services/pm/audit-service');
const { parsePagination } = require('../services/pm/pagination');

module.exports = function createPmRoutes({ db, requireModulePermission, pageEnvelope, uploadPmAttachment, pmAttachmentsDir }) {
  const router = express.Router();

router.get('/api/clients', async (req, res) => {
  try {
    const clients = await db.getAllClients();
    res.json({ success: true, data: clients });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/clients', async (req, res) => {
  try {
    const client = await db.saveClient(req.body);
    res.json({ success: true, data: client });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/api/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const client = await db.updateClient(id, req.body);
    res.json({ success: true, data: client });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/api/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.deleteClient(id);
    res.json({ success: true, message: 'Cliente deletado com sucesso' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/api/clients', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
      return res.status(400).json({ success: false, error: 'IDs devem ser um array' });
    }
    await db.deleteMultipleClients(ids);
    res.json({ success: true, message: `${ids.length} clientes deletados com sucesso` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// APIs para Projetos
router.get('/api/projects', async (req, res) => {
  try {
    const projects = await db.getAllProjects();
    res.json({ success: true, data: projects });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/projects', async (req, res) => {
  try {
    // PM Fase 3: se vier serviceId, materializa o template (cria projeto +
    // etapas + tarefas + deps + triggers atomicamente). Senão, comportamento
    // legado (projeto simples).
    if (req.body && req.body.serviceId) {
      // Serviço inativo não gera novos projetos (mas continua no sistema).
      // Tolerante: se a coluna status ainda não existe (migration 054 não
      // aplicada), não bloqueia — apenas pula o check.
      try {
        const svc = await db.pool.query('SELECT status FROM services WHERE id = $1', [req.body.serviceId]);
        if (svc.rows[0]?.status === 'inativo') {
          return res.status(400).json({ success: false, error: 'Este serviço está inativo e não pode gerar novos projetos.', code: 'service_inactive' });
        }
      } catch (e) {
        if (!/column .*status.* does not exist/i.test(e.message)) throw e;
      }
      const project = await pmProjectService.createProjectFromTemplate(db, {
        name: req.body.name,
        description: req.body.description,
        serviceId: req.body.serviceId,
        clientId: req.body.clientId || null,
        managerUserId: req.body.managerUserId || null,
        startDate: req.body.startDate || null,
        status: req.body.status || null,
        totalCents: req.body.totalCents || 0,
        source: 'manual',
        actorUserId: req.user?.id || null,
      });
      return res.json({ success: true, data: project });
    }
    const project = await db.saveProject(req.body);
    res.json({ success: true, data: project });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PM Fase 3: detalhe aninhado do projeto (etapas/tarefas/eventos).
router.get('/api/projects/:id', async (req, res) => {
  try {
    const include = req.query.include
      ? String(req.query.include).split(',').map(s => s.trim()).filter(Boolean)
      : ['stages', 'tasks', 'events'];
    const project = await pmProjectService.getProjectWithDetails(db, req.params.id, { include });
    if (!project) return res.status(404).json({ success: false, error: 'Projeto não encontrado' });
    await _annotateCanManage(db, req.user, project);
    res.json({ success: true, data: project });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PM Fase 3: pular etapa.
// Reordenar etapas do projeto.
router.post('/api/projects/:id/stages/reorder', requireModulePermission('projects', 'edit'), async (req, res) => {
  try {
    await pmProjectService.reorderStages(db, req.params.id, req.body.orderedIds || []);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/api/projects/:id/stages/:stageId/skip', requireModulePermission('projects', 'edit'), async (req, res) => {
  try {
    await pmProjectService.skipStage(db, req.params.id, req.params.stageId, { actorUserId: req.user?.id || null });
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// PM Fase 3: clonar etapa como nova versão (diligência/retrabalho — "v2/v3").
router.post('/api/projects/:id/stages/:stageId/clone-as-version', requireModulePermission('projects', 'edit'), async (req, res) => {
  try {
    const project = await pmProjectService.cloneStageAsNewVersion(db, req.params.id, req.params.stageId, { actorUserId: req.user?.id || null });
    res.json({ success: true, data: project });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ─── PM Fase 4: workflow de tarefas (state machine) ───────────────────────────
// Auth: módulo 'tarefas_gerenciamento'. Mutações exigem edit; leitura, view.
// Ações sobre a própria tarefa (accept/start/...) também checam ownership.

const _isManagerRole = (u) => u && (u.role === 'admin' || u.role === 'superadmin' || u.role === 'manager');

// Escopo de gestão de tarefa (atribuir / definir prazo):
//  - superadmin: tudo.
//  - admin: tudo, MENOS tarefa de outro admin ou de superadmin.
//  - manager: só na equipe dele — projeto que gerencia, quem ele já atribuiu, ou ele mesmo.
//  - demais: não.
// targetUserId = dono/alvo relevante (assignee da tarefa, ou o novo responsável no assign).
async function _canManageTask(db, actor, task, targetUserId) {
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

// Anota cada tarefa do projeto com:
//  - can_manage: escopo de ATRIBUIR (esconde o botão fora do escopo).
//  - due_action: o que o ator pode fazer com o PRAZO → 'edit' (admin/superadmin
//    direto) | 'request' (manager/usuário pedem aprovação) | null (não pode).
async function _annotateCanManage(db, actor, project) {
  if (!actor || !project) return;
  const tasks = (project.stages || []).flatMap(s => s.tasks || []);
  if (!tasks.length) return;

  if (actor.role === 'superadmin') { tasks.forEach(t => { t.can_manage = true; t.due_action = 'edit'; }); return; }

  if (actor.role === 'admin') {
    const ids = [...new Set(tasks.map(t => t.assignee_user_id).filter(Boolean))];
    const roleById = {};
    if (ids.length) {
      const rr = await db.pool.query('SELECT id, role FROM users WHERE id = ANY($1::varchar[])', [ids]);
      rr.rows.forEach(r => { roleById[r.id] = r.role; });
    }
    tasks.forEach(t => {
      const tid = t.assignee_user_id;
      t.can_manage = !(tid && tid !== actor.id && (roleById[tid] === 'admin' || roleById[tid] === 'superadmin'));
      t.due_action = t.can_manage ? 'edit' : null;  // admin altera direto, menos tarefa de outro admin
    });
    return;
  }

  if (actor.role === 'manager') {
    const ownsProject = project.manager_user_id === actor.id;
    let teamSet = new Set();
    if (!ownsProject) {
      const h = await db.pool.query('SELECT DISTINCT to_user_id FROM task_assignments_history WHERE assigned_by_user_id = $1', [actor.id]);
      teamSet = new Set(h.rows.map(r => r.to_user_id));
    }
    // papel do responsável atual de cada tarefa (p/ permitir delegar tarefa de
    // usuário comum e tarefa sem responsável).
    const ids = [...new Set(tasks.map(t => t.assignee_user_id).filter(Boolean))];
    const roleById = {};
    if (ids.length) {
      const rr = await db.pool.query('SELECT id, role FROM users WHERE id = ANY($1::varchar[])', [ids]);
      rr.rows.forEach(r => { roleById[r.id] = r.role; });
    }
    tasks.forEach(t => {
      const tid = t.assignee_user_id;
      t.can_manage = !tid || tid === actor.id || roleById[tid] === 'user' || ownsProject || teamSet.has(tid);
      t.due_action = 'request';  // manager pede aprovação de admin para alterar prazo
    });
    return;
  }

  // usuário comum: só pode PEDIR alteração do prazo da própria tarefa.
  tasks.forEach(t => {
    t.can_manage = false;
    t.due_action = (t.assignee_user_id === actor.id || t.captured_by_user_id === actor.id) ? 'request' : null;
  });
}

// Guarda: admin/manager OU responsável/capturador da tarefa.
async function _guardTaskActor(req, res, taskId) {
  const task = await pmTaskService.getTask(db.pool, taskId);
  if (!task) { res.status(404).json({ success: false, error: 'Tarefa não encontrada' }); return null; }
  if (_isManagerRole(req.user)) return task;
  if (task.assignee_user_id === req.user?.id || task.captured_by_user_id === req.user?.id) return task;
  res.status(403).json({ success: false, error: 'Você não pode agir sobre esta tarefa.' });
  return null;
}

// Atribuir/reatribuir (admin/manager).
router.post('/api/projects/:id/tasks/:taskId/assign', requireModulePermission('tarefas_gerenciamento', 'edit'), async (req, res) => {
  try {
    if (!_isManagerRole(req.user)) return res.status(403).json({ success: false, error: 'Apenas gestores atribuem tarefas.' });
    const existing = await pmTaskService.getTask(db.pool, req.params.taskId);
    if (!existing) return res.status(404).json({ success: false, error: 'Tarefa não encontrada' });
    if (!req.body.userId) return res.status(400).json({ success: false, error: 'Selecione um responsável.' });

    // okCurrent: o ator pode AGIR sobre a tarefa no estado atual?
    const okCurrent = await _canManageTask(db, req.user, existing, existing.assignee_user_id);
    if (!okCurrent) return res.status(403).json({ success: false, error: 'Fora do seu escopo: gerencie apenas tarefas da sua equipe.' });

    let forceAcceptance = false;
    if (req.user.role === 'manager') {
      const pr = await db.pool.query('SELECT manager_user_id FROM projects WHERE id=$1', [existing.project_id]);
      const ownsProject = pr.rows[0]?.manager_user_id === req.user.id;
      const tr = await db.pool.query('SELECT role FROM users WHERE id=$1', [req.body.userId]);
      const targetRole = tr.rows[0]?.role;
      const targetIsSelf = req.body.userId === req.user.id;
      const targetIsCommon = targetRole === 'user';
      const targetIsGestor = targetRole === 'admin' || targetRole === 'superadmin';

      // Manager delega para: usuário comum, admin/superadmin, ou qualquer um nos
      // projetos dele. Não pode "empurrar" para outro manager fora do escopo.
      if (!targetIsSelf && !targetIsCommon && !targetIsGestor && !ownsProject) {
        return res.status(403).json({ success: false, error: 'Fora do seu escopo de delegação.' });
      }
      // Usuário comum em projeto que ele NÃO gerencia → pré-aprovação de admin.
      if (targetIsCommon && !ownsProject) {
        await pmTaskService.requestDelegation(db, {
          taskId: req.params.taskId, projectId: existing.project_id, managerId: req.user.id,
          toUserId: req.body.userId, dueDate: req.body.dueDate ?? null,
        });
        return res.json({ success: true, data: { requested: true } });
      }
      // Toda delegação de manager passa pelo ACEITE do alvo (aceita/recusa;
      // recusou → volta para o pool de disponíveis). Inclui admin/superadmin.
      if (!targetIsSelf) forceAcceptance = true;
    } else {
      // admin/superadmin: respeita o escopo do alvo (não mexe em tarefa de outro admin).
      const okTarget = await _canManageTask(db, req.user, existing, req.body.userId);
      if (!okTarget) return res.status(403).json({ success: false, error: 'Fora do seu escopo.' });
    }

    const task = await pmTaskService.assignTask(db, req.params.taskId, {
      toUserId: req.body.userId, assignedByUserId: req.user?.id || null, reason: req.body.reason || 'assign',
      forceAcceptance,
      ...(req.body.dueDate !== undefined ? { dueDate: req.body.dueDate } : {}),
    });
    res.json({ success: true, data: task });
  } catch (error) {
    res.status(error.status || 400).json({ success: false, error: error.message, code: error.code });
  }
});

// Definir/ajustar/limpar o prazo da tarefa (gestor), sem reatribuir.
router.post('/api/tasks/:taskId/due-date', requireModulePermission('tarefas_gerenciamento', 'edit'), async (req, res) => {
  try {
    const existing = await pmTaskService.getTask(db.pool, req.params.taskId);
    if (!existing) return res.status(404).json({ success: false, error: 'Tarefa não encontrada' });
    const role = req.user?.role;

    // Admin/superadmin: alteram DIRETO (admin não mexe em tarefa de outro admin).
    if (role === 'admin' || role === 'superadmin') {
      if (!await _canManageTask(db, req.user, existing)) return res.status(403).json({ success: false, error: 'Você não pode alterar o prazo de uma tarefa de outro admin.' });
      const task = await pmTaskService.setTaskDueDate(db, req.params.taskId, { dueDate: req.body.dueDate ?? null, userId: req.user?.id || null });
      return res.json({ success: true, data: { applied: true, task } });
    }

    // Usuário comum só pede na PRÓPRIA tarefa.
    if (role !== 'manager') {
      const mine = existing.assignee_user_id === req.user?.id || existing.captured_by_user_id === req.user?.id;
      if (!mine) return res.status(403).json({ success: false, error: 'Você só pode pedir alteração de prazo da sua própria tarefa.' });
    }

    // Manager / usuário → pedido de aprovação.
    const request = await pmTaskService.requestDueDateChange(db, req.params.taskId, {
      userId: req.user.id, requestedDueDate: req.body.dueDate ?? null, justification: req.body.justification || null,
    });
    res.json({ success: true, data: { requested: true, request } });
  } catch (error) {
    res.status(error.status || 400).json({ success: false, error: error.message, code: error.code });
  }
});

// Fila de pedidos de alteração de prazo (gestor — escopo no service).
router.get('/api/pm/due-date-requests/pending', requireModulePermission('tarefas_gerenciamento', 'view'), async (req, res) => {
  try {
    if (!_isManagerRole(req.user)) return res.status(403).json({ success: false, error: 'Apenas gestores.' });
    const pg = parsePagination(req.query);
    const { items, total } = await pmTaskService.listPendingDueDateRequests(db, req.user, pg);
    res.json({ success: true, data: items, pagination: pageEnvelope(pg, total) });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Decisor age sobre o pedido: approve | reject | force | propose (autoridade no service).
router.post('/api/pm/due-date-requests/:id/decide', requireModulePermission('tarefas_gerenciamento', 'edit'), async (req, res) => {
  try {
    const data = await pmTaskService.decideDueDateChange(db, req.params.id, req.user, {
      action: req.body.action, approved: req.body.approved === true,
      newDueDate: req.body.newDueDate ?? null, note: req.body.note ?? null,
    });
    res.json({ success: true, data });
  } catch (error) { res.status(error.status || 400).json({ success: false, error: error.message, code: error.code }); }
});

// Contrapropostas pendentes de resposta do solicitante.
router.get('/api/pm/due-date-requests/mine', requireModulePermission('tarefas_gerenciamento', 'view'), async (req, res) => {
  try {
    res.json({ success: true, data: await pmTaskService.listMyDueProposals(db, req.user?.id) });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Solicitante responde a uma contraproposta: accept | reject | propose.
router.post('/api/pm/due-date-requests/:id/respond', requireModulePermission('tarefas_gerenciamento', 'edit'), async (req, res) => {
  try {
    const data = await pmTaskService.respondDueDateProposal(db, req.params.id, req.user, {
      action: req.body.action, newDueDate: req.body.newDueDate ?? null, justification: req.body.justification ?? null,
    });
    res.json({ success: true, data });
  } catch (error) { res.status(error.status || 400).json({ success: false, error: error.message, code: error.code }); }
});

// Delegação com aprovação (manager fora do projeto → admin aprova).
router.get('/api/pm/delegation-requests', requireModulePermission('tarefas_gerenciamento', 'view'), async (req, res) => {
  try {
    const pg = parsePagination(req.query);
    const { items, total } = await pmTaskService.listPendingDelegations(db, req.user, pg);
    res.json({ success: true, data: items, pagination: pageEnvelope(pg, total) });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});
router.post('/api/pm/delegation-requests/:id/decide', requireModulePermission('tarefas_gerenciamento', 'edit'), async (req, res) => {
  try {
    const data = await pmTaskService.decideDelegation(db, req.params.id, req.user, { approved: req.body.approved === true });
    res.json({ success: true, data });
  } catch (error) { res.status(error.status || 400).json({ success: false, error: error.message, code: error.code }); }
});

// Ações sobre a tarefa.
const taskActions = {
  accept:  (taskId, req) => pmTaskService.acceptTask(db, taskId, { userId: req.user?.id || null }),
  refuse:  (taskId, req) => pmTaskService.refuseTask(db, taskId, { userId: req.user?.id || null, reason: req.body.reason }),
  start:   (taskId, req) => pmTaskService.startTask(db, taskId, { userId: req.user?.id || null }),
  pause:   (taskId, req) => pmTaskService.pauseTask(db, taskId, { userId: req.user?.id || null }),
  resume:  (taskId, req) => pmTaskService.resumeTask(db, taskId, { userId: req.user?.id || null }),
  complete:(taskId, req) => pmTaskService.completeTask(db, taskId, { userId: req.user?.id || null, actorRole: req.user?.role || null }),
  cancel:  (taskId, req) => pmTaskService.cancelTask(db, taskId, { userId: req.user?.id || null, reason: req.body.reason || null }),
};
for (const action of Object.keys(taskActions)) {
  router.post(`/api/tasks/:taskId/${action}`, requireModulePermission('tarefas_gerenciamento', 'edit'), async (req, res) => {
    try {
      // cancel só gestor; demais ações exigem ownership (ou gestor).
      if (action === 'cancel' && !_isManagerRole(req.user)) {
        return res.status(403).json({ success: false, error: 'Apenas gestores cancelam tarefas.' });
      }
      const task = await _guardTaskActor(req, res, req.params.taskId);
      if (!task) return;
      const result = await taskActions[action](req.params.taskId, req);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(error.status || 400).json({ success: false, error: error.message, code: error.code, blockedBy: error.blockedBy });
    }
  });
}

// "Pegar" uma tarefa disponível e sem responsável (auto-atribuição).
router.post('/api/tasks/:taskId/claim', requireModulePermission('tarefas_gerenciamento', 'edit'), async (req, res) => {
  try {
    const task = await pmTaskService.claimTask(db, req.params.taskId, { userId: req.user.id, actorRole: req.user.role });
    res.json({ success: true, data: task });
  } catch (error) {
    res.status(error.status || 400).json({ success: false, error: error.message, code: error.code });
  }
});

// Pegar várias tarefas de uma vez (principal + pré-requisitos sugeridos no modal).
router.post('/api/tasks/claim-bulk', requireModulePermission('tarefas_gerenciamento', 'edit'), async (req, res) => {
  try {
    const ids = Array.isArray(req.body.taskIds) ? req.body.taskIds.filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ success: false, error: 'taskIds obrigatório' });
    const result = await pmTaskService.claimTasksBulk(db, ids, { userId: req.user.id, actorRole: req.user.role });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(error.status || 400).json({ success: false, error: error.message, code: error.code });
  }
});

// Dashboard pessoal.
router.get('/api/me/tasks', requireModulePermission('tarefas_gerenciamento', 'view'), async (req, res) => {
  try {
    const statuses = req.query.status ? String(req.query.status).split(',').map(s => s.trim()).filter(Boolean) : null;
    const pg = parsePagination(req.query);
    const { items: tasks, total } = await pmTaskService.listMyTasks(db, req.user.id, { statuses }, pg);
    // São tarefas do próprio usuário: admin/superadmin alteram prazo direto; demais pedem.
    const dueAction = (req.user?.role === 'admin' || req.user?.role === 'superadmin') ? 'edit' : 'request';
    tasks.forEach(t => { t.due_action = dueAction; });
    res.json({ success: true, data: tasks, pagination: pageEnvelope(pg, total) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Tarefas disponíveis para "pegar" (sem responsável, status available).
router.get('/api/me/available-tasks', requireModulePermission('tarefas_gerenciamento', 'view'), async (req, res) => {
  try {
    const pg = parsePagination(req.query);
    const { items: tasks, total } = await pmTaskService.listAvailableUnassignedTasks(db, pg);
    // can_assign: pode atribuir a OUTRA pessoa (gestor, no escopo). Usuário comum só "pega".
    const role = req.user?.role;
    if (role === 'superadmin' || role === 'admin') {
      tasks.forEach(t => { t.can_assign = true; });
    } else if (role === 'manager') {
      // Tarefas disponíveis são sem responsável → o manager pode delegar a um
      // usuário comum (escopo validado no assign).
      tasks.forEach(t => { t.can_assign = true; });
    } else {
      tasks.forEach(t => { t.can_assign = false; });
    }
    // completion_prereqs: pré-requisitos de conclusão ainda pendentes (item 4),
    // p/ o modal ao pegar sugerir pegar também. Cache de grafo por projeto.
    for (const t of tasks) {
      try { t.completion_prereqs = await pmTaskService.completionPrereqs(db, t, req.user); }
      catch { t.completion_prereqs = []; }
    }
    res.json({ success: true, data: tasks, pagination: pageEnvelope(pg, total) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Tarefas de um projeto (gestores).
router.get('/api/projects/:id/tasks', requireModulePermission('tarefas_gerenciamento', 'view'), async (req, res) => {
  try {
    const pg = parsePagination(req.query);
    const { items: tasks, total } = await pmTaskService.listProjectTasks(db, req.params.id, pg);
    res.json({ success: true, data: tasks, pagination: pageEnvelope(pg, total) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Preferências de relatório por e-mail (opt-in).
router.get('/api/me/pm-email-prefs', requireModulePermission('tarefas_gerenciamento', 'view'), async (req, res) => {
  try {
    if (!_isManagerRole(req.user)) return res.status(403).json({ success: false, error: 'Relatórios por e-mail são só para gestores.' });
    const r = await db.pool.query('SELECT pm_email_reports, pm_report_frequencies FROM users WHERE id = $1', [req.user.id]);
    const row = r.rows[0] || {};
    res.json({ success: true, data: { emailReports: row.pm_email_reports === true, frequencies: Array.isArray(row.pm_report_frequencies) ? row.pm_report_frequencies : [] } });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/api/me/pm-email-prefs', requireModulePermission('tarefas_gerenciamento', 'view'), async (req, res) => {
  try {
    if (!_isManagerRole(req.user)) return res.status(403).json({ success: false, error: 'Relatórios por e-mail são só para gestores.' });
    const VALID = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'];
    const freqs = Array.isArray(req.body.frequencies) ? req.body.frequencies.filter(f => VALID.includes(f)) : [];
    const emailReports = req.body.emailReports === true;
    await db.pool.query(
      'UPDATE users SET pm_email_reports = $1, pm_report_frequencies = $2::jsonb WHERE id = $3',
      [emailReports, JSON.stringify(freqs), req.user.id]
    );
    res.json({ success: true, data: { emailReports, frequencies: freqs } });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

// Dashboard do Gerenciamento (adaptável ao papel) — todos os usuários do módulo.
router.get('/api/pm/dashboard', requireModulePermission('dashboard_gerenciamento', 'view'), async (req, res) => {
  try {
    const data = await pmDashboardService.getDashboard(db, req.user, { from: req.query.from, to: req.query.to });
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ─── Metas operacionais (módulo Metas do Gerenciamento) ───────────────────────
const GOALS = 'metas_gerenciamento';
router.get('/api/pm/goals', requireModulePermission(GOALS, 'view'), async (req, res) => {
  try { res.json({ success: true, data: await pmGoalsService.listGoals(db, req.user) }); }
  catch (error) { res.status(error.status || 500).json({ success: false, error: error.message }); }
});
router.post('/api/pm/goals', requireModulePermission(GOALS, 'edit'), async (req, res) => {
  try { res.json({ success: true, data: await pmGoalsService.createGoal(db, req.user, req.body) }); }
  catch (error) { res.status(error.status || 400).json({ success: false, error: error.message, code: error.code }); }
});
router.patch('/api/pm/goals/:id', requireModulePermission(GOALS, 'edit'), async (req, res) => {
  try { res.json({ success: true, data: await pmGoalsService.updateGoal(db, req.user, req.params.id, req.body) }); }
  catch (error) { res.status(error.status || 400).json({ success: false, error: error.message, code: error.code }); }
});
router.delete('/api/pm/goals/:id', requireModulePermission(GOALS, 'edit'), async (req, res) => {
  try { await pmGoalsService.deleteGoal(db, req.user, req.params.id); res.json({ success: true }); }
  catch (error) { res.status(error.status || 400).json({ success: false, error: error.message, code: error.code }); }
});

// ─── PM Fase 8: relatórios administrativos + custos ───────────────────────────
const REL = 'relatorios_tarefas_gerenciamento';

router.get('/api/pm/reports/productivity', requireModulePermission(REL, 'view'), async (req, res) => {
  try {
    const data = await pmReportService.productivityByUser(db, { from: req.query.from, to: req.query.to, user: req.user });
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/api/pm/reports/projects-health', requireModulePermission(REL, 'view'), async (req, res) => {
  try {
    const data = await pmReportService.projectsHealth(db, { user: req.user });
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Equipes agrupadas por gerente (admin/superadmin: todas; manager: a dele).
router.get('/api/pm/reports/teams', requireModulePermission(REL, 'view'), async (req, res) => {
  try {
    const data = await pmReportService.teamsReport(db, { from: req.query.from, to: req.query.to, user: req.user });
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/api/pm/reports/financials', requireModulePermission(REL, 'view'), async (req, res) => {
  try {
    if (!req.query.projectId) return res.status(400).json({ success: false, error: 'projectId obrigatório' });
    const data = await pmCostService.getProjectFinancials(db, req.query.projectId);
    if (!data) return res.status(404).json({ success: false, error: 'Projeto não encontrado' });
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Export XLSX da produtividade (usa a lib XLSX já presente no backend).
router.get('/api/pm/reports/export', requireModulePermission(REL, 'view'), async (req, res) => {
  try {
    const rows = await pmReportService.productivityByUser(db, { from: req.query.from, to: req.query.to, user: req.user });
    const aoa = [['Usuário', 'Concluídas', 'Atrasadas', 'Abertas', 'Min. ativos']]
      .concat(rows.map(r => [r.name, Number(r.completed), Number(r.overdue), Number(r.open_tasks), Number(r.active_minutes)]));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Produtividade');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="produtividade.xlsx"');
    res.send(buf);
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Export PDF da produtividade (pdfkit).
router.get('/api/pm/reports/export-pdf', requireModulePermission(REL, 'view'), async (req, res) => {
  try {
    const PDFDocument = require('pdfkit'); // lazy: não derruba o server se faltar a lib
    const rows = await pmReportService.productivityByUser(db, { from: req.query.from, to: req.query.to, user: req.user });
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="produtividade.pdf"');
    doc.pipe(res);

    doc.fontSize(16).fillColor('#111827').text('Relatório de Produtividade');
    doc.moveDown(0.2).fontSize(10).fillColor('#6b7280')
      .text(`Período: ${req.query.from || '—'} a ${req.query.to || '—'}  ·  gerado em ${new Date().toLocaleString('pt-BR')}`);
    doc.moveDown(0.8);

    const colX = [40, 250, 335, 415, 480];      // x de cada coluna; tabela vai até 555
    const right = 555;
    const headers = ['Usuário', 'Concluídas', 'Atrasadas', 'Abertas', 'Min. ativos'];
    let y = doc.y;
    doc.rect(40, y, right - 40, 18).fill('#6d28d9');
    doc.fillColor('#ffffff').fontSize(9);
    headers.forEach((h, i) => doc.text(h, colX[i] + 3, y + 5, { width: (colX[i + 1] || right) - colX[i] - 6, align: i === 0 ? 'left' : 'right' }));
    y += 22;

    doc.fontSize(9);
    rows.forEach(r => {
      if (y > 790) { doc.addPage(); y = 40; }
      const cells = [r.name, String(r.completed), String(r.overdue), String(r.open_tasks), String(r.active_minutes)];
      doc.fillColor('#111827');
      cells.forEach((c, i) => doc.text(c, colX[i] + 3, y, { width: (colX[i + 1] || right) - colX[i] - 6, align: i === 0 ? 'left' : 'right' }));
      y += 15;
      doc.moveTo(40, y - 3).lineTo(right, y - 3).strokeColor('#eef0f3').lineWidth(0.5).stroke();
    });
    if (!rows.length) doc.fillColor('#6b7280').text('Sem dados no período.', 40, y + 4);

    doc.end();
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Central de Aprovações (#11): contador agregado das filas de gestor, p/ o badge do menu.
router.get('/api/pm/approvals/count', async (req, res) => {
  try {
    if (!_isManagerRole(req.user)) return res.status(403).json({ success: false, error: 'Apenas gestores.' });
    const data = await pmApprovalsService.getApprovalCounts(db, req.user);
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Reconciliação de totais (#10/#14): projetos cujos expenses_cents/progress_pct
// divergem da soma real (view pm_totals_drift_v). Read-only.
router.get('/api/pm/reports/reconciliation', requireModulePermission(REL, 'view'), async (req, res) => {
  try {
    const drifts = await pmReconcileService.checkTotals(db);
    res.json({ success: true, data: { drifts, count: drifts.length } });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// #8: auditoria central do PM — view unificada (task/project/pomodoro events),
// filtrável e paginada. Gestor-only (mesma permissão dos relatórios).
// Filtros: source, entityId, actorId, eventType, from, to (+ limit/offset/page).
router.get('/api/pm/audit', requireModulePermission(REL, 'view'), async (req, res) => {
  try {
    const pg = parsePagination(req.query);
    const { source, entityId, actorId, eventType, from, to } = req.query;
    const { items, total } = await pmAuditService.queryPmAudit(db, {
      source, entityId, actorId, eventType, from, to, limit: pg.limit, offset: pg.offset,
    });
    res.json({ success: true, data: items, pagination: pageEnvelope(pg, total) });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Conserta os totais divergentes recomputando via as funções da 052 (admin).
router.post('/api/pm/reports/reconciliation/heal', requireModulePermission(REL, 'view'), async (req, res) => {
  try {
    if (req.user?.role !== 'admin' && req.user?.role !== 'superadmin') {
      return res.status(403).json({ success: false, error: 'Apenas admin corrige totais.' });
    }
    const result = await pmReconcileService.healTotals(db, { projectId: req.body?.projectId || null });
    res.json({ success: true, data: result });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Vincular/desvincular transação a projeto (custo recalculado por trigger).
router.post('/api/transactions/:id/link-project', requireModulePermission('projects', 'edit'), async (req, res) => {
  try {
    const data = await pmCostService.linkTransactionToProject(db, req.params.id, req.body.projectId || null);
    res.json({ success: true, data });
  } catch (error) { res.status(error.status || 400).json({ success: false, error: error.message }); }
});

// Vincular VÁRIAS transações a um projeto (ação em massa). projectId null = desvincula.
router.post('/api/transactions/link-project-bulk', requireModulePermission('projects', 'edit'), async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const data = await pmCostService.linkTransactionsToProject(db, ids, req.body.projectId || null);
    res.json({ success: true, data });
  } catch (error) { res.status(error.status || 400).json({ success: false, error: error.message }); }
});

// Transações vinculadas a um projeto (aba Custos).
router.get('/api/projects/:id/transactions', requireModulePermission('projects', 'view'), async (req, res) => {
  try {
    const r = await db.pool.query(
      `SELECT id, date, description, value, type, category FROM transactions WHERE project_id = $1 ORDER BY date DESC`,
      [req.params.id]
    );
    res.json({ success: true, data: r.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Despesas ainda não vinculadas (picker de vínculo).
router.get('/api/pm/unlinked-transactions', requireModulePermission('projects', 'edit'), async (req, res) => {
  try {
    const r = await db.pool.query(
      `SELECT id, date, description, value, type FROM transactions
        WHERE project_id IS NULL AND type = 'Despesa' ORDER BY date DESC LIMIT 100`
    );
    res.json({ success: true, data: r.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Lista enxuta de usuários p/ pickers (atribuição, ajuda). Só campos públicos.
router.get('/api/pm/users', requireModulePermission('tarefas_gerenciamento', 'view'), async (req, res) => {
  try {
    const users = await db.getAllUsers();
    const data = (users || [])
      .filter(u => u.is_active !== false)
      .map(u => ({
        id: u.id,
        name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username,
        role: u.role,
      }));
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Elegíveis a "Responsável pelo projeto": manager, admin ou superadmin (ativos).
// Usado no seletor do modal de criar/editar projeto (módulo projects).
router.get('/api/pm/project-leads', requireModulePermission('projects', 'view'), async (req, res) => {
  try {
    const data = (await db.getAllUsers() || [])
      .filter(u => u.is_active !== false && ['manager', 'admin', 'superadmin'].includes(u.role))
      .map(u => ({
        id: u.id,
        name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username,
        role: u.role,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Usuários a quem o ator PODE atribuir a tarefa (escopo) — para o dropdown do assign.
router.get('/api/pm/assignable-users', requireModulePermission('tarefas_gerenciamento', 'view'), async (req, res) => {
  try {
    if (!_isManagerRole(req.user)) return res.status(403).json({ success: false, error: 'Apenas gestores atribuem tarefas.' });
    const actor = req.user;
    const task = req.query.taskId ? await pmTaskService.getTask(db.pool, req.query.taskId) : null;

    // Contexto do manager (1x): gerencia o projeto? quem está na equipe dele?
    let ownsProject = false, teamSet = new Set();
    if (actor.role === 'manager') {
      if (task && task.project_id) {
        const p = await db.pool.query('SELECT manager_user_id FROM projects WHERE id = $1', [task.project_id]);
        ownsProject = p.rows[0]?.manager_user_id === actor.id;
      }
      if (!ownsProject) {
        const h = await db.pool.query('SELECT DISTINCT to_user_id FROM task_assignments_history WHERE assigned_by_user_id = $1', [actor.id]);
        teamSet = new Set(h.rows.map(r => r.to_user_id));
      }
    }

    const users = (await db.getAllUsers() || []).filter(u => u.is_active !== false);
    const data = users.filter(u => {
      if (actor.role === 'superadmin') return true;
      if (actor.role === 'admin') return u.id === actor.id || !(u.role === 'admin' || u.role === 'superadmin');
      if (actor.role === 'manager') return u.id === actor.id || u.role === 'user' || u.role === 'admin' || u.role === 'superadmin' || ownsProject || teamSet.has(u.id);
      return false;
    }).map(u => ({ id: u.id, name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username, role: u.role }));

    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ─── PM Fase 6: revisão, anexos e ajuda ───────────────────────────────────────

// Enviar p/ revisão (responsável/gestor).
router.post('/api/tasks/:taskId/submit-review', requireModulePermission('tarefas_gerenciamento', 'edit'), async (req, res) => {
  try {
    const task = await _guardTaskActor(req, res, req.params.taskId);
    if (!task) return;
    res.json({ success: true, data: await pmTaskService.submitForReview(db, req.params.taskId, { userId: req.user?.id || null }) });
  } catch (error) { res.status(error.status || 400).json({ success: false, error: error.message, code: error.code }); }
});

// Aprovar / reprovar revisão (admin/manager).
router.post('/api/tasks/:taskId/review/approve', requireModulePermission('tarefas_gerenciamento', 'edit'), async (req, res) => {
  try {
    if (!_isManagerRole(req.user)) return res.status(403).json({ success: false, error: 'Apenas admin/gerente revisa.' });
    const result = await pmTaskService.approveReview(db, req.params.taskId, { id: req.user.id, role: req.user.role });
    res.json({ success: true, data: result });
  } catch (error) { res.status(error.status || 400).json({ success: false, error: error.message, code: error.code }); }
});

router.post('/api/tasks/:taskId/review/reject', requireModulePermission('tarefas_gerenciamento', 'edit'), async (req, res) => {
  try {
    if (!_isManagerRole(req.user)) return res.status(403).json({ success: false, error: 'Apenas admin/gerente revisa.' });
    const result = await pmTaskService.rejectReview(db, req.params.taskId, { userId: req.user.id, reviewerRole: req.user.role, adjustmentNotes: req.body.adjustmentNotes });
    res.json({ success: true, data: result });
  } catch (error) { res.status(error.status || 400).json({ success: false, error: error.message, code: error.code }); }
});

// Desconcluir (reabrir) tarefa concluída (item 5). user: a própria; manager:
// nos projetos dele (pede aprovação de admin); admin/superadmin: direto.
router.post('/api/tasks/:taskId/uncomplete', requireModulePermission('tarefas_gerenciamento', 'edit'), async (req, res) => {
  try {
    const result = await pmTaskService.uncompleteTask(db, req.params.taskId, {
      actor: { id: req.user.id, role: req.user.role },
      reason: req.body.reason,
      target: req.body.target,
    });
    res.json({ success: true, data: result });
  } catch (error) { res.status(error.status || 400).json({ success: false, error: error.message, code: error.code }); }
});

// Pedidos de reabertura pendentes (só admin/superadmin decide).
router.get('/api/pm/uncomplete-requests', requireModulePermission('tarefas_gerenciamento', 'view'), async (req, res) => {
  try {
    const pg = parsePagination(req.query);
    const { items, total } = await pmTaskService.listPendingUncompleteRequests(db, req.user, pg);
    res.json({ success: true, data: items, pagination: pageEnvelope(pg, total) });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/api/pm/uncomplete-requests/:id/decide', requireModulePermission('tarefas_gerenciamento', 'edit'), async (req, res) => {
  try {
    const result = await pmTaskService.decideUncomplete(db, req.params.id, { reviewer: { id: req.user.id, role: req.user.role }, approve: req.body.approve === true });
    res.json({ success: true, data: result });
  } catch (error) { res.status(error.status || 400).json({ success: false, error: error.message, code: error.code }); }
});

// Fila de revisões pendentes (admin/manager).
router.get('/api/pm/pending-reviews', requireModulePermission('tarefas_gerenciamento', 'view'), async (req, res) => {
  try {
    if (!_isManagerRole(req.user)) return res.status(403).json({ success: false, error: 'Apenas admin/gerente.' });
    const pg = parsePagination(req.query);
    const { items, total } = await pmTaskService.listPendingReviews(db, req.user, pg);
    res.json({ success: true, data: items, pagination: pageEnvelope(pg, total) });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Anexos.
router.post('/api/tasks/:taskId/attachments', requireModulePermission('tarefas_gerenciamento', 'edit'), uploadPmAttachment.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'Arquivo obrigatório' });
    const task = await pmTaskService.getTask(db.pool, req.params.taskId);
    if (!task) return res.status(404).json({ success: false, error: 'Tarefa não encontrada' });
    const id = db.generateId();
    await db.pool.query(
      `INSERT INTO task_attachments (id, task_id, file_name, stored_name, mime, size_bytes, uploaded_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, req.params.taskId, req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, req.user?.id || null]
    );
    res.json({ success: true, data: { id, fileName: req.file.originalname } });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

router.get('/api/tasks/:taskId/attachments', requireModulePermission('tarefas_gerenciamento', 'view'), async (req, res) => {
  try {
    const r = await db.pool.query(
      `SELECT id, file_name, mime, size_bytes, uploaded_by_user_id, uploaded_at FROM task_attachments WHERE task_id = $1 ORDER BY uploaded_at DESC`,
      [req.params.taskId]
    );
    res.json({ success: true, data: r.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/api/pm/attachments/:id/download', requireModulePermission('tarefas_gerenciamento', 'view'), async (req, res) => {
  try {
    const r = await db.pool.query('SELECT * FROM task_attachments WHERE id = $1', [req.params.id]);
    const att = r.rows[0];
    if (!att) return res.status(404).json({ success: false, error: 'Anexo não encontrado' });
    const filePath = path.join(pmAttachmentsDir, att.stored_name);
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, error: 'Arquivo ausente no servidor' });
    res.download(filePath, att.file_name);
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.delete('/api/pm/attachments/:id', requireModulePermission('tarefas_gerenciamento', 'edit'), async (req, res) => {
  try {
    const r = await db.pool.query('DELETE FROM task_attachments WHERE id = $1 RETURNING stored_name', [req.params.id]);
    if (r.rows[0]) {
      const fp = path.join(pmAttachmentsDir, r.rows[0].stored_name);
      if (fs.existsSync(fp)) { try { fs.unlinkSync(fp); } catch { /* noop */ } }
    }
    res.json({ success: true });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

// Pedidos de ajuda.
router.post('/api/tasks/:taskId/help-request', requireModulePermission('tarefas_gerenciamento', 'edit'), async (req, res) => {
  try {
    const data = await pmHelpService.createHelpRequest(db, req.params.taskId, {
      requesterUserId: req.user.id, targetUserId: req.body.targetUserId, message: req.body.message || null,
    });
    res.json({ success: true, data });
  } catch (error) { res.status(error.status || 400).json({ success: false, error: error.message, code: error.code }); }
});

router.get('/api/me/help-requests', requireModulePermission('tarefas_gerenciamento', 'view'), async (req, res) => {
  try { res.json({ success: true, data: await pmHelpService.listIncomingHelp(db, req.user.id) }); }
  catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

const helpActions = {
  accept:   (id, req) => pmHelpService.acceptHelp(db, id, { userId: req.user.id }),
  refuse:   (id, req) => pmHelpService.refuseHelp(db, id, { userId: req.user.id, reason: req.body.reason }),
  complete: (id, req) => pmHelpService.markCollaborationComplete(db, id, { userId: req.user.id, notes: req.body.notes || null }),
};
for (const action of Object.keys(helpActions)) {
  router.post(`/api/help-requests/:id/${action}`, requireModulePermission('tarefas_gerenciamento', 'edit'), async (req, res) => {
    try { res.json({ success: true, data: await helpActions[action](req.params.id, req) }); }
    catch (error) { res.status(error.status || 400).json({ success: false, error: error.message, code: error.code }); }
  });
}

// ─── PM Fase 5: Pomodoro (controle de tempo) ──────────────────────────────────
// Endpoints pessoais — escopo sempre req.user.id. Só autenticação (já global).

router.get('/api/pomodoro/active', async (req, res) => {
  try {
    const session = await pmPomodoroService.getActiveSession(db, req.user.id);
    res.json({ success: true, data: session });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/api/pomodoro/sessions', async (req, res) => {
  try {
    const result = await pmPomodoroService.startSession(db, {
      userId: req.user.id,
      taskId: req.body.taskId || null,
      category: req.body.category || null,
      plannedMinutes: Number(req.body.plannedMinutes) || 25,
      breakMinutes: req.body.breakMinutes != null ? Number(req.body.breakMinutes) : null,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(error.status || 400).json({ success: false, error: error.message, code: error.code, remainingMinutes: error.remainingMinutes });
  }
});

const pomodoroActions = {
  pause:          (id, req) => pmPomodoroService.pauseSession(db, id, req.user.id),
  resume:         (id, req) => pmPomodoroService.resumeSession(db, id, req.user.id),
  complete:       (id, req) => pmPomodoroService.completeActive(db, id, req.user.id),
  'finish-break': (id, req) => pmPomodoroService.finishBreak(db, id, req.user.id),
  'skip-break':   (id, req) => pmPomodoroService.skipBreak(db, id, req.user.id),
  abort:          (id, req) => pmPomodoroService.abortSession(db, id, req.user.id, { reason: req.body?.reason || 'manual' }),
  heartbeat:      (id, req) => pmPomodoroService.heartbeat(db, id, req.user.id),
};
for (const action of Object.keys(pomodoroActions)) {
  router.post(`/api/pomodoro/sessions/:id/${action}`, async (req, res) => {
    try {
      const data = await pomodoroActions[action](req.params.id, req);
      res.json({ success: true, data });
    } catch (error) {
      res.status(error.status || 400).json({ success: false, error: error.message, code: error.code });
    }
  });
}

router.get('/api/pomodoro/stats', async (req, res) => {
  try {
    const stats = await pmPomodoroService.getStats(db, req.user.id, { range: req.query.range || 'day' });
    res.json({ success: true, data: stats });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ─── Excedente de tempo diário (recomendação + aprovação de gestor) ───────────
// Status do meu pedido de hoje.
router.get('/api/pomodoro/overage', async (req, res) => {
  try { res.json({ success: true, data: await pmPomodoroService.getOverageToday(db, req.user.id) }); }
  catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Solicitar aprovação do excedente (justificativa opcional).
router.post('/api/pomodoro/overage', async (req, res) => {
  try {
    const data = await pmPomodoroService.requestOverage(db, req.user.id, { justification: req.body.justification || null });
    res.json({ success: true, data });
  } catch (error) { res.status(error.status || 400).json({ success: false, error: error.message, code: error.code }); }
});

// Fila de pedidos pendentes (gestor).
router.get('/api/pomodoro/overage/pending', async (req, res) => {
  try {
    if (!_isManagerRole(req.user)) return res.status(403).json({ success: false, error: 'Apenas gestores.' });
    res.json({ success: true, data: await pmPomodoroService.listPendingOverages(db) });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Aprovar/negar um pedido (gestor).
router.post('/api/pomodoro/overage/:id/decide', async (req, res) => {
  try {
    if (!_isManagerRole(req.user)) return res.status(403).json({ success: false, error: 'Apenas gestores.' });
    const data = await pmPomodoroService.decideOverage(db, req.params.id, req.user, { approved: req.body.approved === true });
    res.json({ success: true, data });
  } catch (error) { res.status(error.status || 400).json({ success: false, error: error.message, code: error.code }); }
});

router.get('/api/pomodoro/config', async (req, res) => {
  try { res.json({ success: true, data: await pmPomodoroService.getConfig(db, req.user.id) }); }
  catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/api/pomodoro/config', async (req, res) => {
  try {
    const cfg = await pmPomodoroService.updateConfig(db, req.user.id, {
      dailyLimitMinutes: req.body.dailyLimitMinutes,
      idleAlertMinutes: req.body.idleAlertMinutes,
      soundEnabled: req.body.soundEnabled,
    });
    res.json({ success: true, data: cfg });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

// Idle tracking: registra abertura da área de tarefas (alerta 5min é client-side
// nesta fase; notificação proativa via cron entra na Fase 7).
router.post('/api/me/task-area-opened', async (req, res) => {
  try {
    await db.pool.query(
      `INSERT INTO task_idle_tracking (id, user_id, opened_at) VALUES ($1, $2, NOW())`,
      [db.generateId(), req.user.id]
    );
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/api/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updatedProject = await db.updateProject(id, req.body);
    res.json({ success: true, data: updatedProject });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/api/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.deleteProject(id);
    res.json({ success: true, message: 'Projeto excluído com sucesso' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/api/projects', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
      return res.status(400).json({ success: false, error: 'IDs devem ser um array' });
    }

    await db.deleteMultipleProjects(ids);
    res.json({ success: true, message: `${ids.length} projetos deletados com sucesso` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// APIs para Serviços
router.get('/api/services', async (req, res) => {
  try {
    const services = await db.getAllServices();
    res.json({ success: true, data: services });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/services', async (req, res) => {
  try {
    const service = await db.saveService(req.body);
    res.json({ success: true, data: service });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/api/services/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updatedService = await db.updateService(id, req.body);
    res.json({ success: true, data: updatedService });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/api/services/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Serviços de sistema (ex.: svc_terracontrol_default) não podem ser excluídos.
    const svc = await db.pool.query('SELECT is_system FROM services WHERE id = $1', [id]);
    if (svc.rows[0]?.is_system === true) {
      return res.status(403).json({ success: false, error: 'Serviço de sistema não pode ser excluído.' });
    }
    await db.deleteService(id);
    res.json({ success: true, message: 'Serviço excluído com sucesso' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── PM Fase 2: Template de serviço (etapas/tarefas/deps/triggers) ────────────
// Auth: middleware global já aplica authenticateToken; gate granular por módulo
// 'services' (view p/ ler, edit p/ mutar). superadmin/admin têm bypass.

// Template completo aninhado.
router.get('/api/services/:id/template', requireModulePermission('services', 'view'), async (req, res) => {
  try {
    const tpl = await pmTemplateService.getServiceTemplate(db, req.params.id, {
      version: req.query.version ? Number(req.query.version) : undefined,
    });
    res.json({ success: true, data: tpl });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Stages
router.post('/api/services/:id/template/stages', requireModulePermission('services', 'edit'), async (req, res) => {
  try {
    const stage = await pmTemplateService.createStage(db, req.params.id, req.body);
    res.json({ success: true, data: stage });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Reordenação manual de etapas (setas) — em transação, sem colisão de unique.
router.put('/api/services/:id/template/stages/reorder', requireModulePermission('services', 'edit'), async (req, res) => {
  try {
    await pmTemplateService.reorderStages(db, req.params.id, Number(req.body.version) || 1, req.body.orderedIds || []);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.patch('/api/services/:id/template/stages/:stageId', requireModulePermission('services', 'edit'), async (req, res) => {
  try {
    const stage = await pmTemplateService.updateStage(db, req.params.stageId, req.body);
    res.json({ success: true, data: stage });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.delete('/api/services/:id/template/stages/:stageId', requireModulePermission('services', 'edit'), async (req, res) => {
  try {
    await pmTemplateService.deleteStage(db, req.params.stageId);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Tasks
router.post('/api/services/:id/template/stages/:stageId/tasks', requireModulePermission('services', 'edit'), async (req, res) => {
  try {
    const task = await pmTemplateService.createTask(db, req.params.stageId, req.body);
    res.json({ success: true, data: task });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.patch('/api/services/:id/template/tasks/:taskId', requireModulePermission('services', 'edit'), async (req, res) => {
  try {
    const task = await pmTemplateService.updateTask(db, req.params.taskId, req.body);
    res.json({ success: true, data: task });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.delete('/api/services/:id/template/tasks/:taskId', requireModulePermission('services', 'edit'), async (req, res) => {
  try {
    await pmTemplateService.deleteTask(db, req.params.taskId);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Dependências (start/completion; alvo task|stage). Valida ciclo → 400.
router.post('/api/services/:id/template/tasks/:taskId/dependencies', requireModulePermission('services', 'edit'), async (req, res) => {
  try {
    const dep = await pmTemplateService.createDependency(db, req.params.taskId, req.body);
    res.json({ success: true, data: dep });
  } catch (error) {
    const status = error.code === 'dependency_cycle' ? 400 : 400;
    res.status(status).json({ success: false, error: error.message, code: error.code });
  }
});

router.delete('/api/services/:id/template/dependencies/:depId', requireModulePermission('services', 'edit'), async (req, res) => {
  try {
    await pmTemplateService.deleteDependency(db, req.params.depId);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Triggers (criam tarefa nova quando a source completa).
router.post('/api/services/:id/template/tasks/:taskId/triggers', requireModulePermission('services', 'edit'), async (req, res) => {
  try {
    const trigger = await pmTemplateService.createTrigger(db, req.params.taskId, req.body);
    res.json({ success: true, data: trigger });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message, code: error.code });
  }
});

router.delete('/api/services/:id/template/triggers/:triggerId', requireModulePermission('services', 'edit'), async (req, res) => {
  try {
    await pmTemplateService.deleteTrigger(db, req.params.triggerId);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Version bump: cria v(N+1) preservando a versão atual.
router.post('/api/services/:id/template/version-bump', requireModulePermission('services', 'edit'), async (req, res) => {
  try {
    const newVersion = await pmTemplateService.versionBump(db, req.params.id);
    res.json({ success: true, data: { version: newVersion } });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Importa uma estrutura (copiada de outro serviço e editada na prévia) como
// nova versão deste serviço.
router.post('/api/services/:id/template/import', requireModulePermission('services', 'edit'), async (req, res) => {
  try {
    const newVersion = await pmTemplateService.importTemplateStructure(db, req.params.id, req.body.stages);
    res.json({ success: true, data: { version: newVersion } });
  } catch (error) {
    res.status(error.status || 400).json({ success: false, error: error.message, code: error.code });
  }
});

  return router;
};
