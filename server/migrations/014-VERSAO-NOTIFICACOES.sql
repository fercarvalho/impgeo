-- Migration 014: Rastreamento de notificações de versão visualizadas pelos usuários

CREATE TABLE IF NOT EXISTS versao_notificacoes_vistas (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    versao VARCHAR(50) NOT NULL,
    visto_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, versao)
);

CREATE INDEX IF NOT EXISTS idx_versao_notif_user ON versao_notificacoes_vistas (user_id);
