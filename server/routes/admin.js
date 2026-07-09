// ═══════════════════════════════════════════════════════════════════════════
// server/routes/admin.js
// Gestão administrativa: catálogo de módulos (reorder/CRUD), log de atividade,
// estatísticas de uso, defaults de papéis, papéis (roles), permissões granulares
// por usuário e CRUD de usuários. Extraídas de server.js (#3) — comportamento
// idêntico (rotas verbatim, paths completos preservados). Tudo guard-based
// (requireAdmin/requireSuperAdmin); sem lógica de cookie/JWT/sessão.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

module.exports = function createAdminRoutes({
  db, authenticateToken, requireAdmin, requireSuperAdmin, logActivity,
  normalizeModuleKey, parseAddress,
}) {
  const router = express.Router();

// APIs de Módulos (apenas para admins)
// POST /api/admin/modules/reorder — Fase 3.0: contrato novo
// Body: { subsystemKey, keys: [...] }. Reorder é POR subsistema agora —
// sort_order é local ao subsystem desde a migration 016.
router.post('/api/admin/modules/reorder', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { subsystemKey, keys } = req.body || {};
    if (!subsystemKey || typeof subsystemKey !== 'string') {
      return res.status(400).json({ error: 'subsystemKey é obrigatório' });
    }
    if (!Array.isArray(keys) || keys.length === 0) {
      return res.status(400).json({ error: 'Array de keys é obrigatório' });
    }
    await db.reorderModules(subsystemKey, keys);
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Erro ao reordenar módulos' });
  }
});

// GET /api/admin/subsystems — lista (read-only) usada pelos dropdowns da UI
router.get('/api/admin/subsystems', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const subsystems = await db.listSubsystems();
    return res.json({ success: true, data: subsystems });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao buscar subsistemas' });
  }
});

router.get('/api/admin/modules', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const modules = await db.getModulesCatalog();
    return res.json({ success: true, data: modules });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao buscar módulos' });
  }
});

router.post('/api/admin/modules', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      moduleKey,
      moduleName,
      iconName,
      description,
      routePath,
      isActive,
      subsystemKey,
    } = req.body || {};

    const normalizedKey = normalizeModuleKey(moduleKey);
    if (!normalizedKey || normalizedKey.length < 2) {
      return res.status(400).json({ error: 'moduleKey inválido. Use letras, números, "_" ou "-"' });
    }
    if (!moduleName || String(moduleName).trim().length < 2) {
      return res.status(400).json({ error: 'moduleName é obrigatório' });
    }
    if (!subsystemKey) {
      return res.status(400).json({ error: 'subsystemKey é obrigatório' });
    }
    const sub = await db.getSubsystemByKey(subsystemKey);
    if (!sub) {
      return res.status(400).json({ error: `Subsistema inválido: "${subsystemKey}"` });
    }

    const existing = await db.getModuleByKey(normalizedKey);
    if (existing) {
      return res.status(400).json({ error: 'Já existe um módulo com esta chave' });
    }

    const created = await db.createModule({
      moduleKey: normalizedKey,
      moduleName: String(moduleName).trim(),
      iconName: iconName ? String(iconName).trim() : null,
      description: description ? String(description).trim() : null,
      routePath: routePath ? String(routePath).trim() : null,
      isActive: isActive !== false,
      isSystem: false,
      subsystemKey,
    });

    await logActivity(req, {
      action: 'create',
      moduleKey: 'admin',
      entityType: 'module',
      entityId: created.moduleKey,
      details: { targetModuleKey: created.moduleKey, subsystemKey },
    });

    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao criar módulo' });
  }
});

router.put('/api/admin/modules/:moduleKey', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { moduleKey } = req.params;
    const existing = await db.getModuleByKey(moduleKey);
    if (!existing) {
      return res.status(404).json({ error: 'Módulo não encontrado' });
    }

    const updatePayload = {};
    if (req.body.moduleName !== undefined) {
      if (!String(req.body.moduleName).trim()) {
        return res.status(400).json({ error: 'moduleName inválido' });
      }
      updatePayload.moduleName = String(req.body.moduleName).trim();
    }
    // moduleKey é imutável (regra antiga). Não aceitamos mais rename via PUT.
    if (req.body.iconName !== undefined) updatePayload.iconName = req.body.iconName ? String(req.body.iconName).trim() : null;
    if (req.body.description !== undefined) updatePayload.description = req.body.description ? String(req.body.description).trim() : null;
    if (req.body.routePath !== undefined) updatePayload.routePath = req.body.routePath ? String(req.body.routePath).trim() : null;
    if (req.body.isActive !== undefined) updatePayload.isActive = req.body.isActive === true;
    if (req.body.subsystemKey !== undefined) {
      const sub = await db.getSubsystemByKey(req.body.subsystemKey);
      if (!sub) {
        return res.status(400).json({ error: `Subsistema inválido: "${req.body.subsystemKey}"` });
      }
      updatePayload.subsystemKey = req.body.subsystemKey;
    }

    const updated = await db.updateModule(moduleKey, updatePayload);

    await logActivity(req, {
      action: 'edit',
      moduleKey: 'admin',
      entityType: 'module',
      entityId: updated.moduleKey,
      details: {
        targetModuleKey: updated.moduleKey,
        ...(updatePayload.subsystemKey ? { movedTo: updatePayload.subsystemKey, movedFrom: existing.subsystemKey } : {}),
      },
    });

    return res.json({ success: true, data: updated });
  } catch (error) {
    const status = /não encontrado/i.test(error.message) ? 404 : 400;
    return res.status(status).json({ error: error.message || 'Erro ao atualizar módulo' });
  }
});

router.delete('/api/admin/modules/:moduleKey', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { moduleKey } = req.params;
    await db.deleteModule(moduleKey);
    await logActivity(req, {
      action: 'delete',
      moduleKey: 'admin',
      entityType: 'module',
      entityId: moduleKey
    });
    return res.json({ success: true, message: 'Módulo removido com sucesso' });
  } catch (error) {
    const status = /sistema|não encontrado/i.test(error.message) ? 400 : 500;
    return res.status(status).json({ error: error.message || 'Erro ao remover módulo' });
  }
});

router.get('/api/admin/activity-log', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await db.getActivityLogs({
      page: req.query.page,
      pageSize: req.query.pageSize,
      userId: req.query.userId,
      moduleKey: req.query.moduleKey,
      action: req.query.action,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      search: req.query.search
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao carregar logs de atividade' });
  }
});

router.get('/api/admin/statistics', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const stats = await db.getAdminStatisticsForPanel();
    return res.json({ success: true, data: stats });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao carregar estatísticas' });
  }
});

router.get('/api/admin/statistics/users/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const logs = await db.getActivityLogs({
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 20,
      userId: req.params.userId
    });
    return res.json({ success: true, ...logs });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao carregar estatísticas do usuário' });
  }
});

router.get('/api/admin/statistics/modules/:moduleKey', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const logs = await db.getActivityLogs({
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 20,
      moduleKey: req.params.moduleKey
    });
    return res.json({ success: true, ...logs });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao carregar estatísticas do módulo' });
  }
});

router.get('/api/admin/statistics/usage-timeline', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const startDateParam = req.query.startDate ? String(req.query.startDate) : null;
    const endDateParam = req.query.endDate ? String(req.query.endDate) : null;
    const groupBy = req.query.groupBy ? String(req.query.groupBy) : 'day';

    if (startDateParam) {
      const endDate = endDateParam || new Date().toISOString().split('T')[0];
      const timeline = await db.getUsageTimelineByDateRange(startDateParam, endDate, groupBy);
      return res.json({ success: true, data: timeline });
    }

    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 180);
    const timeline = await db.getUsageTimeline(days);
    return res.json({
      success: true,
      data: timeline.map((item) => ({
        date: item.day,
        count: item.total
      }))
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao carregar timeline de uso' });
  }
});

// APIs de Gerenciamento de Usuários (apenas para admins)
// GET /api/users - Listar todos os usuários
router.get('/api/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await db.getAllUsers();
    // Remover senha e mapear campos snake_case -> camelCase
    const usersWithoutPasswords = users.map(user => ({
      id: user.id,
      username: user.username,
      role: user.role,
      firstName: user.first_name ?? null,
      lastName: user.last_name ?? null,
      email: user.email ?? null,
      phone: user.phone ?? null,
      cpf: user.cpf ?? null,
      birthDate: user.birth_date ?? null,
      gender: user.gender ?? null,
      address: parseAddress(user.address),
      position: user.position ?? null,
      isActive: user.is_active !== false,
      canManageTcUsers: user.can_manage_tc_users === true,
      createdAt: user.created_at || user.createdAt || null,
      updatedAt: user.updated_at || user.updatedAt || null
    }));
    res.json({ success: true, data: usersWithoutPasswords });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar usuários' });
  }
});

// POST /api/users - Criar novo usuário
router.post('/api/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { username, role, permissions } = req.body;

    if (!username || !role) {
      return res.status(400).json({ error: 'Username e role são obrigatórios' });
    }

    // Validar role contra a tabela roles (dinâmica desde fase 2.x — migration 044)
    const roleRow = await db.getRoleByKey(role);
    if (!roleRow) {
      return res.status(400).json({ error: `Role inválida: "${role}" não existe` });
    }

    // Validar permissions (opcional). Se fornecido, deve ser array de pares
    // {moduleKey, accessLevel}. Vai sobrescrever os defaults após a criação.
    if (permissions !== undefined && !Array.isArray(permissions)) {
      return res.status(400).json({ error: 'permissions deve ser um array de {moduleKey, accessLevel}' });
    }

    // Verificar se o usuário já existe — nas DUAS tabelas (users + tc_users).
    // Username é global no login unificado do terracontrol.com.br.
    if (await db.findUsernameOwnerTable(username)) {
      return res.status(400).json({ error: 'Usuário já existe' });
    }

    // Placeholder de primeiro login (igual ao alya)
    const placeholderPassword = await bcrypt.hash('FIRST_LOGIN_PLACEHOLDER', 10);

    // Criar usuário (saveUser já aplica seedUserModulePermissionsFromRole
    // com defaults da role; em seguida, se vier permissions custom no body,
    // sobrescrevemos com a matriz informada pelo admin).
    const newUser = await db.saveUser({
      username,
      password: placeholderPassword,
      role,
      lastLogin: null
    });

    if (Array.isArray(permissions)) {
      await db.setUserPermissionsMatrix(newUser.id, permissions);
    }

    // Remover senha antes de enviar
    const { password: _, ...userWithoutPassword } = newUser;
    res.status(201).json({ success: true, data: userWithoutPassword });
    await logActivity(req, {
      action: 'create',
      moduleKey: 'admin',
      entityType: 'user',
      entityId: newUser.id,
      details: { role, customPermissions: Array.isArray(permissions) ? permissions.length : 0 },
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar usuário: ' + error.message });
  }
});

// PUT /api/users/:id - Atualizar usuário
router.put('/api/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      username,
      password,
      role,
      isActive,
      firstName,
      lastName,
      email,
      phone,
      position,
      cpf,
      birthDate,
      gender,
      address,
      canManageTcUsers,  // F2.4 — só superadmin pode alterar
    } = req.body;

    // Validar role se fornecido (Fase 2.x: dinâmico contra tabela roles)
    if (role) {
      const roleRow = await db.getRoleByKey(role);
      if (!roleRow) {
        return res.status(400).json({ error: `Role inválida: "${role}" não existe` });
      }
    }

    // Preparar dados para atualização
    const updateData = {};
    if (username) updateData.username = username;
    if (role) updateData.role = role;
    if (typeof isActive === 'boolean') {
      if (req.user.id === id && isActive === false) {
        return res.status(400).json({ error: 'Você não pode desativar seu próprio usuário' });
      }
      updateData.isActive = isActive;
    }
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (position !== undefined) updateData.position = position;
    if (cpf !== undefined) updateData.cpf = cpf;
    if (birthDate !== undefined) updateData.birthDate = birthDate;
    if (gender !== undefined) updateData.gender = gender;
    if (address !== undefined) updateData.address = address;
    if (canManageTcUsers !== undefined) {
      // Só superadmin pode ligar/desligar a flag de gestão delegada
      if (req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Apenas superadmin pode alterar a permissão de gerenciamento de TerraControl' });
      }
      updateData.canManageTcUsers = !!canManageTcUsers;
    }
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    // Verificar se está tentando mudar o username para um que já existe
    if (username) {
      const existingUser = await db.getUserByUsername(username);
      if (existingUser && existingUser.id !== id) {
        return res.status(400).json({ error: 'Username já está em uso' });
      }
    }

    // Atualizar usuário
    const updatedUser = await db.updateUser(id, updateData);

    // Fase 2.1: quando role muda, por padrão recalculamos a matriz inteira
    // de permissões a partir dos defaults da role nova. O cliente pode passar
    // keepPermissions=true para preservar a matriz atual (usado na UI quando
    // o admin escolhe explicitamente "manter permissões customizadas").
    const keepPermissions = req.body.keepPermissions === true;
    if (role && !keepPermissions) {
      await db.resetUserPermissionsToDefaults(id, role);
    }

    // Remover senha antes de enviar
    const { password: _, ...safeUser } = updatedUser;
    res.json({
      success: true,
      data: {
        id: safeUser.id,
        username: safeUser.username,
        role: safeUser.role,
        firstName: safeUser.first_name ?? null,
        lastName: safeUser.last_name ?? null,
        email: safeUser.email ?? null,
        phone: safeUser.phone ?? null,
        cpf: safeUser.cpf ?? null,
        birthDate: safeUser.birth_date ?? null,
        gender: safeUser.gender ?? null,
        address: parseAddress(safeUser.address),
        position: safeUser.position ?? null,
        isActive: safeUser.is_active !== false,
        canManageTcUsers: safeUser.can_manage_tc_users === true,
        createdAt: safeUser.created_at || null,
        updatedAt: safeUser.updated_at || null
      }
    });
    await logActivity(req, {
      action: 'edit',
      moduleKey: 'admin',
      entityType: 'user',
      entityId: id,
      details: { fields: Object.keys(updateData) }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/users/:id/modules - Listar módulos e permissões do usuário
// DEPRECATED (Fase 2.5): retorna apenas a presença/ausência, sem nível.
// Use GET /api/admin/users/:id/permissions para a matriz com view/edit.
router.get('/api/users/:id/modules', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const targetUser = await db.getUserById(id);
    if (!targetUser) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const catalog = await db.getModulesCatalog();
    const userModules = await db.getUserModulePermissions(id);
    const enabledSet = new Set(userModules.map((item) => item.moduleKey));

    const data = catalog.map((module) => ({
      moduleKey: module.moduleKey,
      moduleName: module.moduleName,
      enabled: enabledSet.has(module.moduleKey)
    }));

    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao carregar módulos do usuário' });
  }
});

// PUT /api/users/:id/modules - Atualizar módulos de acesso do usuário
// DEPRECATED (Fase 2.5): salva sempre com access_level='view'. Use
// PUT /api/admin/users/:id/permissions para a matriz com view/edit.
router.put('/api/users/:id/modules', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { moduleKeys } = req.body;

    if (!Array.isArray(moduleKeys)) {
      return res.status(400).json({ error: 'moduleKeys deve ser um array' });
    }

    const targetUser = await db.getUserById(id);
    if (!targetUser) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const catalog = await db.getModulesCatalog();
    const validKeys = new Set(catalog.map((item) => item.moduleKey));
    const filteredKeys = [...new Set(moduleKeys)].filter((key) => validKeys.has(key));

    await db.setUserModulePermissions(id, filteredKeys, 'view');
    await logActivity(req, {
      action: 'permission_change',
      moduleKey: 'admin',
      entityType: 'user_modules',
      entityId: id,
      details: { moduleCount: filteredKeys.length }
    });

    return res.json({ success: true, message: 'Módulos atualizados com sucesso' });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao atualizar módulos do usuário' });
  }
});

// ─── Permissões granulares (Fase 2.1) ────────────────────────────────────────
// Endpoints novos com semântica view/edit explícita. O legado
// /api/users/:id/modules continua funcionando para compat enquanto a UI
// antiga não migrar (será substituído na sub-fase 2.3).

// GET /api/admin/permissions/defaults?role=manager
// Matriz de permissões padrão para uma role — usada pelo modal "Novo Usuário"
// para pré-popular a UI de permissões granulares antes da criação efetiva.
router.get('/api/admin/permissions/defaults', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const role = String(req.query.role || '').trim();
    const roleRow = await db.getRoleByKey(role);
    if (!roleRow) {
      return res.status(400).json({ error: `Role inválida: "${role}" não existe` });
    }
    const matrix = await db.getDefaultPermissionsMatrix(role);
    return res.json({ success: true, data: { role, permissions: matrix } });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao carregar defaults' });
  }
});

// ─── Defaults editáveis (Fase 2.x) ───────────────────────────────────────────
// Gerenciamento das tabelas role_default_permissions. Só superadmin edita;
// admins comuns só leem (via /api/admin/permissions/defaults acima).

// GET /api/admin/role-defaults
// Retorna a matriz completa { roles: { [role]: [{moduleKey, ...}] } } com 5
// roles × 21 módulos. Usado pelo painel "Padrões de Função" pra renderizar
// a matriz inicial.
router.get('/api/admin/role-defaults', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    // Lista dinâmica desde a 044 — inclui system + roles custom criadas pelo admin
    const allRoles = await db.listRoles();
    const matrices = {};
    for (const r of allRoles) {
      matrices[r.key] = await db.getDefaultPermissionsMatrix(r.key);
    }
    return res.json({ success: true, data: { roles: matrices } });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao carregar defaults' });
  }
});

// PUT /api/admin/role-defaults/:role
// Body: { permissions: [{ moduleKey, accessLevel: 'view'|'edit' }] }
// Substitui os defaults de uma role. Módulos ausentes do array = sem acesso.
// Invalida cache automaticamente.
router.put('/api/admin/role-defaults/:role', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { role } = req.params;
    const { permissions } = req.body;
    const roleRow = await db.getRoleByKey(role);
    if (!roleRow) {
      return res.status(400).json({ error: `Role inválida: "${role}" não existe` });
    }
    if (!Array.isArray(permissions)) {
      return res.status(400).json({ error: 'permissions deve ser um array' });
    }
    const applied = await db.setRoleDefaultPermissions(role, permissions);
    await logActivity(req, {
      action: 'role_defaults_update',
      moduleKey: 'admin',
      entityType: 'role_defaults',
      entityId: role,
      details: { count: applied.length },
    });
    return res.json({ success: true, data: { role, count: applied.length } });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao salvar defaults' });
  }
});

// POST /api/admin/role-defaults/:role/reset
// Restaura os defaults da role para os valores hardcoded originais
// (FALLBACK_DEFAULTS em defaults.js).
router.post('/api/admin/role-defaults/:role/reset', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { role } = req.params;
    const roleRow = await db.getRoleByKey(role);
    if (!roleRow) {
      return res.status(400).json({ error: `Role inválida: "${role}" não existe` });
    }
    const applied = await db.resetRoleDefaultsToFallback(role);
    await logActivity(req, {
      action: 'role_defaults_reset',
      moduleKey: 'admin',
      entityType: 'role_defaults',
      entityId: role,
      details: { count: applied.length },
    });
    return res.json({ success: true, data: { role, count: applied.length } });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao resetar defaults' });
  }
});

// ─── CRUD de roles (migration 044) ───────────────────────────────────────────
// Superadmin gerencia o catálogo de funções. As 5 roles do sistema têm key
// imutável e não podem ser deletadas — apenas label/description editáveis.

// GET /api/admin/roles — lista todas (system + custom)
router.get('/api/admin/roles', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const roles = await db.listRoles();
    return res.json({ success: true, data: { roles } });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao listar roles' });
  }
});

// POST /api/admin/roles — cria role custom
// Body: { key, label, description?, sortOrder?, cloneFromRole? }
router.post('/api/admin/roles', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { key, label, description, sortOrder, cloneFromRole } = req.body;
    if (cloneFromRole) {
      const src = await db.getRoleByKey(cloneFromRole);
      if (!src) return res.status(400).json({ error: `cloneFromRole inválido: "${cloneFromRole}"` });
    }
    const created = await db.createRole({ key, label, description, sortOrder, cloneFromRole });
    await logActivity(req, {
      action: 'role_create',
      moduleKey: 'admin',
      entityType: 'role',
      entityId: created.key,
      details: { label: created.label, cloneFromRole: cloneFromRole || null },
    });
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Erro ao criar role' });
  }
});

// PUT /api/admin/roles/:key — edita label/description/sortOrder
// key e is_system permanecem imutáveis (inclusive para roles do sistema).
router.put('/api/admin/roles/:key', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { key } = req.params;
    const { label, description, sortOrder } = req.body;
    const role = await db.getRoleByKey(key);
    if (!role) return res.status(404).json({ error: 'Role não encontrada' });
    const updated = await db.updateRoleMeta(key, { label, description, sortOrder });
    await logActivity(req, {
      action: 'role_update',
      moduleKey: 'admin',
      entityType: 'role',
      entityId: key,
    });
    return res.json({ success: true, data: updated });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Erro ao atualizar role' });
  }
});

// DELETE /api/admin/roles/:key — exclui role custom
// Falha 400 com code='ROLE_HAS_USERS' se houver usuários — a UI pode então
// usar /usage pra listar e /migrate-users pra esvaziar antes de tentar de novo.
router.delete('/api/admin/roles/:key', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { key } = req.params;
    await db.deleteRole(key);
    await logActivity(req, {
      action: 'role_delete',
      moduleKey: 'admin',
      entityType: 'role',
      entityId: key,
    });
    return res.json({ success: true });
  } catch (error) {
    const payload = { error: error.message || 'Erro ao excluir role' };
    if (error.code === 'ROLE_HAS_USERS') {
      payload.code = 'ROLE_HAS_USERS';
      payload.userCount = error.userCount;
      return res.status(409).json(payload);
    }
    return res.status(400).json(payload);
  }
});

// GET /api/admin/roles/:key/usage — lista users que usam esta role
router.get('/api/admin/roles/:key/usage', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { key } = req.params;
    const role = await db.getRoleByKey(key);
    if (!role) return res.status(404).json({ error: 'Role não encontrada' });
    const users = await db.listUsersByRole(key);
    return res.json({ success: true, data: { role: role.key, label: role.label, users } });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao buscar uso da role' });
  }
});

// POST /api/admin/roles/:fromKey/migrate-users
// Body: { toKey, resetPermissions?: boolean }
// Migra todos os usuários de fromKey para toKey, opcionalmente resetando
// permissões para os defaults da role de destino.
router.post('/api/admin/roles/:fromKey/migrate-users', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { fromKey } = req.params;
    const { toKey, resetPermissions = true } = req.body;
    if (!toKey) return res.status(400).json({ error: 'toKey obrigatório' });
    const result = await db.migrateUsersBetweenRoles(fromKey, toKey, !!resetPermissions);
    await logActivity(req, {
      action: 'role_migrate_users',
      moduleKey: 'admin',
      entityType: 'role',
      entityId: fromKey,
      details: { toKey, migrated: result.migrated, resetCount: result.resetCount },
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Erro ao migrar usuários' });
  }
});

// GET /api/admin/users/:id/permissions
// Retorna a matriz [{ moduleKey, moduleName, subsystemKey, accessLevel|null }]
router.get('/api/admin/users/:id/permissions', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const targetUser = await db.getUserById(id);
    if (!targetUser) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    const matrix = await db.getUserPermissionsMatrix(id);
    return res.json({
      success: true,
      data: {
        userId: id,
        role: targetUser.role,
        permissions: matrix,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao carregar permissões' });
  }
});

// PUT /api/admin/users/:id/permissions
// Body: { permissions: [{ moduleKey, accessLevel: 'view'|'edit' }] }
// Substitui a matriz inteira (módulos ausentes = sem acesso).
router.put('/api/admin/users/:id/permissions', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { permissions } = req.body;
    if (!Array.isArray(permissions)) {
      return res.status(400).json({ error: 'permissions deve ser um array' });
    }
    const targetUser = await db.getUserById(id);
    if (!targetUser) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    const applied = await db.setUserPermissionsMatrix(id, permissions);
    await logActivity(req, {
      action: 'permission_change',
      moduleKey: 'admin',
      entityType: 'user_permissions',
      entityId: id,
      details: { count: applied.length },
    });
    return res.json({ success: true, data: { count: applied.length } });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao atualizar permissões' });
  }
});

// POST /api/admin/users/:id/permissions/reset
// Reseta a matriz para os defaults da role atual do usuário.
router.post('/api/admin/users/:id/permissions/reset', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const targetUser = await db.getUserById(id);
    if (!targetUser) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    const applied = await db.resetUserPermissionsToDefaults(id);
    await logActivity(req, {
      action: 'permission_reset',
      moduleKey: 'admin',
      entityType: 'user_permissions',
      entityId: id,
      details: { role: targetUser.role, count: applied.length },
    });
    return res.json({ success: true, data: { count: applied.length, role: targetUser.role } });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao resetar permissões' });
  }
});

// POST /api/admin/users/:id/permissions/bulk-subsystem
// Body: { subsystemKey: 'gestao', accessLevel: 'view'|'edit'|null }
// Aplica um único nível a todos os módulos do subsistema (null = remove).
router.post('/api/admin/users/:id/permissions/bulk-subsystem', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { subsystemKey, accessLevel } = req.body;
    if (!subsystemKey || typeof subsystemKey !== 'string') {
      return res.status(400).json({ error: 'subsystemKey é obrigatório' });
    }
    const normalizedLevel = (accessLevel === null || accessLevel === 'none') ? null : accessLevel;
    if (normalizedLevel !== null && !['view', 'edit'].includes(normalizedLevel)) {
      return res.status(400).json({ error: "accessLevel deve ser 'view', 'edit' ou null" });
    }
    const targetUser = await db.getUserById(id);
    if (!targetUser) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    const applied = await db.setSubsystemPermissionsForUser(id, subsystemKey, normalizedLevel);
    await logActivity(req, {
      action: 'permission_bulk_subsystem',
      moduleKey: 'admin',
      entityType: 'user_permissions',
      entityId: id,
      details: { subsystemKey, accessLevel: normalizedLevel, moduleCount: applied.length },
    });
    return res.json({ success: true, data: { subsystemKey, accessLevel: normalizedLevel, count: applied.length } });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao aplicar bulk' });
  }
});

// POST /api/users/:id/reset-password - Resetar senha de usuário
router.post('/api/users/:id/reset-password', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const targetUser = await db.getUserById(id);

    if (!targetUser) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const temporaryPassword = crypto.randomBytes(6).toString('base64url').slice(0, 10);
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);
    await db.updateUser(id, { password: hashedPassword });
    await logActivity(req, {
      action: 'reset_password',
      moduleKey: 'admin',
      entityType: 'user',
      entityId: id
    });

    return res.json({
      success: true,
      message: 'Senha resetada com sucesso',
      temporaryPassword
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao resetar senha' });
  }
});

// DELETE /api/users/:id - Excluir usuário
router.delete('/api/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Não permitir que o admin exclua a si mesmo
    if (req.user.id === id) {
      return res.status(400).json({ error: 'Você não pode excluir seu próprio usuário' });
    }

    await db.deleteUser(id);
    res.json({ success: true, message: 'Usuário excluído com sucesso' });
    await logActivity(req, {
      action: 'delete',
      moduleKey: 'admin',
      entityType: 'user',
      entityId: id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

  return router;
};
