// Middleware Express: garante que req.user (já populado por authenticateToken)
// tem acesso ao módulo TerraControl.
//
// Regras de acesso (mesma hierarquia do resto do sistema):
//   - role 'superadmin' ou 'admin' → bypass (sempre permitido)
//   - outros roles                 → precisam ter 'terracontrol' em modulesAccess,
//                                    populado pelo authenticateToken via
//                                    db.getUserModulePermissions
//
// Quando bloqueia: 403 com body `{ success: false, error: '...' }`, mesmo
// padrão de erro de todo o resto do TerraControl admin (UI já trata).
//
// IMPORTANTE: este middleware assume que `authenticateToken` rodou antes.
// Sem `req.user`, devolve 401 — caller esqueceu de encadear o auth.

module.exports = function requireTerraControlAccess(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Autenticação requerida' });
  }
  const role = req.user.role;
  if (role === 'superadmin' || role === 'admin') {
    return next();
  }
  const modules = Array.isArray(req.user.modulesAccess) ? req.user.modulesAccess : [];
  const hasModule = modules.some(m => (m.moduleKey || m.module_key) === 'terracontrol');
  if (!hasModule) {
    return res.status(403).json({ success: false, error: 'Sem acesso ao módulo TerraControl' });
  }
  next();
};
