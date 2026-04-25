-- Migration 011: Rodapé dinâmico
-- Tabelas para o rodapé gerenciável pelo superadmin

-- Configurações gerais (chave/valor)
CREATE TABLE IF NOT EXISTS rodape_configuracoes (
    id SERIAL PRIMARY KEY,
    chave VARCHAR(100) UNIQUE NOT NULL,
    valor TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Colunas do rodapé
CREATE TABLE IF NOT EXISTS rodape_colunas (
    id VARCHAR(255) PRIMARY KEY,
    titulo VARCHAR(100) NOT NULL,
    ordem INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Links dentro das colunas
CREATE TABLE IF NOT EXISTS rodape_links (
    id VARCHAR(255) PRIMARY KEY,
    coluna_id VARCHAR(255) REFERENCES rodape_colunas(id) ON DELETE CASCADE,
    texto VARCHAR(255) NOT NULL,
    link TEXT DEFAULT '',
    eh_link BOOLEAN DEFAULT true,
    ordem INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Dados padrão: configurações globais
INSERT INTO rodape_configuracoes (chave, valor) VALUES
  ('empresa_nome',        'Viver de PJ'),
  ('empresa_tagline',     'Ecosistema de Empreendedorismo'),
  ('empresa_descricao',   'Sistema de Gestão Inteligente por Viver de PJ. A Viver de PJ é um ecosistema completo de gestão e educação para Empreendedores.'),
  ('empresa_autor',       'Autor: Fernando Carvalho Gomes dos Santos.'),
  ('empresa_logo',        '/logo_rodape.PNG'),
  ('info_texto',          ''),
  ('info_alinhamento',    'left'),
  ('copyright',           'Viver de PJ. TODOS OS DIREITOS RESERVADOS'),
  ('versao_sistema',      ''),
  ('notas_versao',        '')
ON CONFLICT (chave) DO NOTHING;

-- Coluna: Contato
INSERT INTO rodape_colunas (id, titulo, ordem) VALUES ('col-contato', 'Contato', 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO rodape_links (id, coluna_id, texto, link, eh_link, ordem) VALUES
  ('lnk-tel',   'col-contato', '(11) 97103-9181',     'https://wa.me/5511971039181?text=Oi%20Sofia%2C%20tudo%20bem%3F%20Vim%20pelo%20site%20da%20IMPGEO', true,  0),
  ('lnk-email', 'col-contato', 'vem@viverdepj.com.br', 'mailto:vem@viverdepj.com.br',  true,  1),
  ('lnk-site',  'col-contato', 'viverdepj.com.br',     'https://viverdepj.com.br',     true,  2),
  ('lnk-loc',   'col-contato', 'Brasil',               '',                             false, 3)
ON CONFLICT (id) DO NOTHING;

-- Coluna: Serviços
INSERT INTO rodape_colunas (id, titulo, ordem) VALUES ('col-servicos', 'Serviços', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO rodape_links (id, coluna_id, texto, link, eh_link, ordem) VALUES
  ('lnk-s1',  'col-servicos', 'Consultoria Estratégica de Negócios', '', false, 0),
  ('lnk-s2',  'col-servicos', 'Sistema de Gestão',                   '', false, 1),
  ('lnk-s3',  'col-servicos', 'Sistema Financeiro',                  '', false, 2),
  ('lnk-s4',  'col-servicos', 'CRM',                                 '', false, 3),
  ('lnk-s5',  'col-servicos', 'IA Financeira',                       '', false, 4),
  ('lnk-s6',  'col-servicos', 'IA de Atendimento',                   '', false, 5),
  ('lnk-s7',  'col-servicos', 'IA para Negócios',                    '', false, 6),
  ('lnk-s8',  'col-servicos', 'Benefícios Corporativos',             '', false, 7),
  ('lnk-s9',  'col-servicos', 'Contabilidade para Empresas',         '', false, 8),
  ('lnk-s10', 'col-servicos', 'BPO Financeiro',                      '', false, 9)
ON CONFLICT (id) DO NOTHING;
