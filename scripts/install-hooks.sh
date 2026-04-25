#!/bin/bash
# ============================================================
# install-hooks.sh
# Instala o git hook post-commit que detecta novos commits
# e os salva como "pendentes" para o superadmin confirmar.
# Uso: bash scripts/install-hooks.sh
# ============================================================

HOOK_PATH=".git/hooks/post-commit"

cat > "$HOOK_PATH" << 'EOF'
#!/bin/bash
# Post-commit hook: salva commit como pendente no banco
bash "$(git rev-parse --show-toplevel)/scripts/update-release-notes.sh"
EOF

chmod +x "$HOOK_PATH"
echo "✅ Hook post-commit instalado em $HOOK_PATH"
echo "   Agora cada commit será automaticamente detectado."
