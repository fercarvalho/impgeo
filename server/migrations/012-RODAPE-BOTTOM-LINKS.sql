-- Migration 012: Bottom links do rodapé

CREATE TABLE IF NOT EXISTS rodape_bottom_links (
    id VARCHAR(255) PRIMARY KEY,
    texto VARCHAR(255) NOT NULL,
    link TEXT DEFAULT '',
    ativo BOOLEAN DEFAULT true,
    ordem INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Links de base padrão
INSERT INTO rodape_bottom_links (id, texto, link, ativo, ordem) VALUES
  ('btm-politica',  'Política de Privacidade', '/politica-privacidade', true, 0),
  ('btm-termos',    'Termos de Uso',           '/termos-uso',           true, 1)
ON CONFLICT (id) DO NOTHING;
