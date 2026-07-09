// ═══════════════════════════════════════════════════════════════════════════
// server/routes/user-profile.js
// Autoatendimento do usuário autenticado do impgeo: catálogo de módulos visível,
// perfil (get/put), preferências, foto (upload), alteração de username e senha.
// Extraídas de server.js (#3) — comportamento idêntico (rotas verbatim, paths
// completos preservados). Auth vem do middleware global app.use('/api', ...).
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

module.exports = function createUserProfileRoutes({
  db, authenticateToken, JWT_SECRET, upload, uploadAvatar,
  deleteAvatarFile, mapUserToClient, validateEmailFormat,
}) {
  const router = express.Router();

router.get('/api/modules-catalog', authenticateToken, async (req, res) => {
  try {
    const catalog = await db.getModulesCatalog();
    const activeModules = catalog.filter((module) => module.isActive !== false);
    return res.json({ success: true, data: activeModules });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Erro ao carregar catálogo de módulos' });
  }
});

// API do próprio usuário autenticado
router.get('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const profile = await db.getUserProfileById(req.user.id);
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }

    return res.json({
      success: true,
      data: profile
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Toggle leve de preferências do usuário — sem exigir senha atual (em
// contraste com PUT /api/user/profile, que altera campos sensíveis).
// Hoje só atende tcEmailNotifications; ampliar conforme novas prefs.
router.patch('/api/user/preferences', authenticateToken, async (req, res) => {
  try {
    const allowed = ['tcEmailNotifications'];
    const prefs = {};
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
        prefs[key] = req.body[key];
      }
    }
    const profile = await db.updateUserPreferences(req.user.id, prefs);
    return res.json({ success: true, data: profile });
  } catch (error) {
    console.error('PATCH /api/user/preferences:', error);
    return res.status(500).json({ success: false, error: 'Erro ao atualizar preferências' });
  }
});

router.post('/api/user/upload-photo', authenticateToken, uploadAvatar.single('photo'), (req, res) => {
  fs.appendFileSync('multer_debug.log', JSON.stringify({
    file: req.file,
    body: req.body
  }) + '\n');
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });
    }

    if (req.file.mimetype !== 'image/webp' || !req.file.filename.endsWith('.webp')) {
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ success: false, error: 'Apenas arquivos WebP são permitidos' });
    }

    const photoUrl = `/api/avatars/${req.file.filename}`;
    return res.json({
      success: true,
      data: { photoUrl }
    });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (deleteError) {
        console.log('Erro ao remover arquivo após falha de upload:', deleteError.message);
      }
    }
    return res.status(500).json({ success: false, error: 'Erro ao fazer upload da foto' });
  }
});

router.put('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      photoUrl,
      password,
      cpf,
      birthDate,
      gender,
      position,
      address
    } = req.body;

    const currentUser = await db.getUserById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }

    if (!password) {
      return res.status(400).json({ success: false, error: 'Senha atual é obrigatória para atualizar o perfil' });
    }

    const isValidPassword = await bcrypt.compare(password, currentUser.password);
    if (!isValidPassword) {
      return res.status(401).json({ success: false, error: 'Senha atual incorreta' });
    }

    if (!firstName || String(firstName).trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Nome é obrigatório e deve ter pelo menos 2 caracteres' });
    }
    if (!lastName || String(lastName).trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Sobrenome é obrigatório e deve ter pelo menos 2 caracteres' });
    }
    if (!email || !String(email).trim()) {
      return res.status(400).json({ success: false, error: 'Email é obrigatório' });
    }
    if (!validateEmailFormat(String(email))) {
      return res.status(400).json({ success: false, error: 'Formato de email inválido' });
    }

    const phoneDigits = String(phone || '').replace(/\D/g, '');
    if (phoneDigits.length !== 10 && phoneDigits.length !== 11) {
      return res.status(400).json({ success: false, error: 'Telefone deve ter 10 ou 11 dígitos' });
    }

    const cpfDigits = String(cpf || '').replace(/\D/g, '');
    if (cpfDigits.length !== 11) {
      return res.status(400).json({ success: false, error: 'CPF deve ter 11 dígitos' });
    }

    if (!birthDate) {
      return res.status(400).json({ success: false, error: 'Data de nascimento é obrigatória' });
    }
    if (!gender) {
      return res.status(400).json({ success: false, error: 'Gênero é obrigatório' });
    }
    if (!position || !String(position).trim()) {
      return res.status(400).json({ success: false, error: 'Cargo é obrigatório' });
    }

    if (!address || !address.cep) {
      return res.status(400).json({ success: false, error: 'CEP é obrigatório' });
    }
    const cepDigits = String(address.cep).replace(/\D/g, '');
    if (cepDigits.length !== 8) {
      return res.status(400).json({ success: false, error: 'CEP deve ter 8 dígitos' });
    }
    if (!address.street || !String(address.street).trim()) {
      return res.status(400).json({ success: false, error: 'Rua/Logradouro é obrigatório' });
    }
    if (!address.number || !String(address.number).trim()) {
      return res.status(400).json({ success: false, error: 'Número do endereço é obrigatório' });
    }
    if (!address.neighborhood || !String(address.neighborhood).trim()) {
      return res.status(400).json({ success: false, error: 'Bairro é obrigatório' });
    }
    if (!address.city || !String(address.city).trim()) {
      return res.status(400).json({ success: false, error: 'Cidade é obrigatória' });
    }
    if (!address.state || String(address.state).trim().length !== 2) {
      return res.status(400).json({ success: false, error: 'Estado (UF) é obrigatório e deve ter 2 caracteres' });
    }

    const updateData = {
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      email: String(email).trim(),
      phone: phoneDigits,
      cpf: cpfDigits,
      birthDate,
      gender: String(gender),
      position: String(position).trim(),
      address: {
        cep: cepDigits,
        street: String(address.street).trim(),
        number: String(address.number).trim(),
        complement: address.complement ? String(address.complement).trim() : '',
        neighborhood: String(address.neighborhood).trim(),
        city: String(address.city).trim(),
        state: String(address.state).trim().toUpperCase()
      }
    };

    if (photoUrl !== undefined) {
      if (currentUser.photo_url && currentUser.photo_url !== photoUrl) {
        deleteAvatarFile(currentUser.photo_url);
      }
      updateData.photoUrl = photoUrl || null;
    }

    const updatedUser = await db.updateUser(req.user.id, updateData);
    const token = jwt.sign(
      { id: updatedUser.id, username: updatedUser.username, role: updatedUser.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.json({
      success: true,
      data: mapUserToClient(updatedUser),
      token
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// APIs do próprio usuário autenticado
router.put('/api/user/username', authenticateToken, async (req, res) => {
  try {
    const { newUsername, currentPassword } = req.body;

    if (!newUsername || !String(newUsername).trim()) {
      return res.status(400).json({ success: false, error: 'Novo username é obrigatório' });
    }

    if (!currentPassword) {
      return res.status(400).json({ success: false, error: 'Senha atual é obrigatória' });
    }

    const normalizedUsername = String(newUsername).trim();
    if (normalizedUsername.length < 3) {
      return res.status(400).json({ success: false, error: 'Username deve ter pelo menos 3 caracteres' });
    }

    const usernameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!usernameRegex.test(normalizedUsername)) {
      return res.status(400).json({ success: false, error: 'Username inválido. Use apenas letras, números, underscore (_) ou hífen (-)' });
    }

    const currentUser = await db.getUserById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }

    const isValidPassword = await bcrypt.compare(currentPassword, currentUser.password);
    if (!isValidPassword) {
      return res.status(401).json({ success: false, error: 'Senha atual incorreta' });
    }

    if (currentUser.username === normalizedUsername) {
      return res.status(400).json({ success: false, error: 'O novo username deve ser diferente do atual' });
    }

    // Unicidade global (users + tc_users), excluindo o próprio user.
    if (await db.findUsernameOwnerTable(normalizedUsername, { excludeUserId: currentUser.id })) {
      return res.status(400).json({ success: false, error: 'Username já está em uso' });
    }

    const updatedUser = await db.updateUser(currentUser.id, { username: normalizedUsername });
    const newToken = jwt.sign(
      { id: updatedUser.id, username: updatedUser.username, role: updatedUser.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.json({
      success: true,
      message: 'Username alterado com sucesso',
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        role: updatedUser.role
      },
      token: newToken
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

router.put('/api/user/password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Senha atual e nova senha são obrigatórias' });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({ success: false, error: 'A nova senha deve ter pelo menos 6 caracteres' });
    }

    const currentUser = await db.getUserById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }

    const isValidPassword = await bcrypt.compare(currentPassword, currentUser.password);
    if (!isValidPassword) {
      return res.status(401).json({ success: false, error: 'Senha atual incorreta' });
    }

    const isSamePassword = await bcrypt.compare(newPassword, currentUser.password);
    if (isSamePassword) {
      return res.status(400).json({ success: false, error: 'A nova senha deve ser diferente da senha atual' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.updateUser(currentUser.id, { password: hashedPassword });

    return res.json({
      success: true,
      message: 'Senha alterada com sucesso'
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

  return router;
};
