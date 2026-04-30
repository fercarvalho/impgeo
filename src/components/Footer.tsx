import React, { useState, useEffect } from 'react';
import { Phone, Mail, Globe, Map, X } from 'lucide-react';
import DOMPurify from 'dompurify';
import TermosUsoModal from './TermosUsoModal';
import PoliticaPrivacidadeModal from './PoliticaPrivacidadeModal';

const API_BASE_URL =
  typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:9001/api'
    : ((import.meta as any).env?.VITE_API_URL || '/api');

interface RodapeLink {
  id: string;
  colunaId: string;
  texto: string;
  link: string;
  ehLink: boolean;
  ordem: number;
}

interface BottomLink {
  id: string;
  texto: string;
  link: string;
  ativo: boolean;
  ordem: number;
}

interface RodapeColuna {
  id: string;
  titulo: string;
  ordem: number;
  links: RodapeLink[];
}

interface RodapeConfig {
  empresa_nome: string;
  empresa_tagline: string;
  empresa_descricao: string;
  empresa_autor: string;
  empresa_logo: string;
  info_texto: string;
  info_alinhamento: 'left' | 'center' | 'right';
  copyright: string;
  versao_sistema: string;
  notas_versao: string;
}

const RODAPE_DEFAULTS: RodapeConfig = {
  empresa_nome: 'Viver de PJ',
  empresa_tagline: 'Ecosistema de Empreendedorismo',
  empresa_descricao:
    'Sistema de Gestão Inteligente por Viver de PJ. A Viver de PJ é um ecosistema completo de gestão e educação para Empreendedores.',
  empresa_autor: 'Autor: Fernando Carvalho Gomes dos Santos.',
  empresa_logo: '/logo_rodape.PNG',
  info_texto: '',
  info_alinhamento: 'left',
  copyright: 'Viver de PJ. TODOS OS DIREITOS RESERVADOS',
  versao_sistema: '',
  notas_versao: '',
};

const COLUNAS_DEFAULTS: RodapeColuna[] = [
  {
    id: 'col-contato',
    titulo: 'Contato',
    ordem: 0,
    links: [
      { id: 'lnk-tel',   colunaId: 'col-contato', texto: '(11) 97103-9181',    link: 'https://wa.me/5511971039181?text=Oi%20Sofia%2C%20tudo%20bem%3F%20Vim%20pelo%20site%20da%20IMPGEO', ehLink: true,  ordem: 0 },
      { id: 'lnk-email', colunaId: 'col-contato', texto: 'vem@viverdepj.com.br', link: 'mailto:vem@viverdepj.com.br', ehLink: true,  ordem: 1 },
      { id: 'lnk-site',  colunaId: 'col-contato', texto: 'viverdepj.com.br',    link: 'https://viverdepj.com.br',    ehLink: true,  ordem: 2 },
      { id: 'lnk-loc',   colunaId: 'col-contato', texto: 'Brasil',              link: '',                             ehLink: false, ordem: 3 },
    ],
  },
  {
    id: 'col-servicos',
    titulo: 'Serviços',
    ordem: 1,
    links: [
      { id: 'lnk-s1',  colunaId: 'col-servicos', texto: 'Consultoria Estratégica de Negócios', link: '', ehLink: false, ordem: 0 },
      { id: 'lnk-s2',  colunaId: 'col-servicos', texto: 'Sistema de Gestão',                   link: '', ehLink: false, ordem: 1 },
      { id: 'lnk-s3',  colunaId: 'col-servicos', texto: 'Sistema Financeiro',                  link: '', ehLink: false, ordem: 2 },
      { id: 'lnk-s4',  colunaId: 'col-servicos', texto: 'CRM',                                 link: '', ehLink: false, ordem: 3 },
      { id: 'lnk-s5',  colunaId: 'col-servicos', texto: 'IA Financeira',                       link: '', ehLink: false, ordem: 4 },
      { id: 'lnk-s6',  colunaId: 'col-servicos', texto: 'IA de Atendimento',                   link: '', ehLink: false, ordem: 5 },
      { id: 'lnk-s7',  colunaId: 'col-servicos', texto: 'IA para Negócios',                    link: '', ehLink: false, ordem: 6 },
      { id: 'lnk-s8',  colunaId: 'col-servicos', texto: 'Benefícios Corporativos',             link: '', ehLink: false, ordem: 7 },
      { id: 'lnk-s9',  colunaId: 'col-servicos', texto: 'Contabilidade para Empresas',         link: '', ehLink: false, ordem: 8 },
      { id: 'lnk-s10', colunaId: 'col-servicos', texto: 'BPO Financeiro',                      link: '', ehLink: false, ordem: 9 },
    ],
  },
];

function renderInfoTexto(texto: string) {
  return texto.split('\n').map((linha, i) => {
    const partes = linha.split(/(\*\*[^*]+\*\*)/g);
    return (
      <p key={i} className={linha.trim() === '' ? 'h-2' : ''}>
        {partes.map((parte, j) => {
          if (parte.startsWith('**') && parte.endsWith('**')) {
            return <strong key={j}>{parte.slice(2, -2)}</strong>;
          }
          return <span key={j}>{parte}</span>;
        })}
      </p>
    );
  });
}

function ContatoIcon({ link, texto }: { link: string; texto: string }) {
  if (link.startsWith('https://wa.me') || texto.includes('(')) return <Phone className="h-4 w-4 mr-2 flex-shrink-0" />;
  if (link.startsWith('mailto:') || texto.includes('@')) return <Mail className="h-4 w-4 mr-2 flex-shrink-0" />;
  if (link.startsWith('https://') || link.startsWith('http://')) return <Globe className="h-4 w-4 mr-2 flex-shrink-0" />;
  return <Map className="h-4 w-4 mr-2 flex-shrink-0" />;
}

const Footer: React.FC = () => {
  const [config, setConfig] = useState<RodapeConfig>(RODAPE_DEFAULTS);
  const [colunas, setColunas] = useState<RodapeColuna[]>(COLUNAS_DEFAULTS);
  const [bottomLinks, setBottomLinks] = useState<BottomLink[]>([]);
  const [showTermos, setShowTermos] = useState(false);
  const [showPolitica, setShowPolitica] = useState(false);
  const [showNotas, setShowNotas] = useState(false);

  const handleBottomLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, link: string) => {
    if (link === '#gerenciar-cookies') {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('cookie:open-manager'));
      return;
    }
    if (link.includes('politica-privacidade') || link.includes('privacy-policy')) {
      e.preventDefault();
      setShowPolitica(true);
      return;
    }
    if (link.includes('termos-uso')) {
      e.preventDefault();
      setShowTermos(true);
      return;
    }
  };

  const isSpecialLink = (link: string) =>
    link === '#gerenciar-cookies' ||
    link.includes('politica-privacidade') ||
    link.includes('privacy-policy') ||
    link.includes('termos-uso');

  useEffect(() => {
    if (!showNotas) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowNotas(false); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [showNotas]);

  const carregarRodape = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/rodape`);
      if (!res.ok) return;
      const json = await res.json();
      if (!json.success || !json.data) return;
      const { configuracoes, colunas: colsDados, bottomLinks: bottomDados } = json.data;

      if (configuracoes && Object.keys(configuracoes).length > 0) {
        setConfig({
          empresa_nome:       configuracoes.empresa_nome       || RODAPE_DEFAULTS.empresa_nome,
          empresa_tagline:    configuracoes.empresa_tagline    || RODAPE_DEFAULTS.empresa_tagline,
          empresa_descricao:  configuracoes.empresa_descricao  || RODAPE_DEFAULTS.empresa_descricao,
          empresa_autor:      configuracoes.empresa_autor      || RODAPE_DEFAULTS.empresa_autor,
          empresa_logo:       configuracoes.empresa_logo       || RODAPE_DEFAULTS.empresa_logo,
          info_texto:         configuracoes.info_texto         || '',
          info_alinhamento:   (configuracoes.info_alinhamento as RodapeConfig['info_alinhamento']) || 'left',
          copyright:          configuracoes.copyright          || RODAPE_DEFAULTS.copyright,
          versao_sistema:     configuracoes.versao_sistema     || '',
          notas_versao:       configuracoes.notas_versao       || '',
        });
      }
      if (colsDados && colsDados.length > 0) setColunas(colsDados);
      if (bottomDados) setBottomLinks(bottomDados.filter((l: BottomLink) => l.ativo));
    } catch {
      // fallback silencioso
    }
  };

  useEffect(() => {
    carregarRodape();
    const handleUpdate = () => carregarRodape();
    window.addEventListener('rodape-updated', handleUpdate);
    return () => window.removeEventListener('rodape-updated', handleUpdate);
  }, []);

  const totalColunas = 1 + colunas.length;
  const gridClass =
    totalColunas === 2 ? 'grid grid-cols-1 md:grid-cols-2 gap-8' :
    totalColunas === 3 ? 'grid grid-cols-1 md:grid-cols-3 gap-8' :
                        'grid grid-cols-1 md:grid-cols-4 gap-8';

  return (
    <>
    <footer className="bg-gray-800 text-white py-8 mt-12 w-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={gridClass}>
          {/* Coluna da empresa */}
          <div>
            <div className="flex items-center mb-3">
              <img
                src={config.empresa_logo}
                alt={config.empresa_nome + ' Logo'}
                className="h-12 w-12 mr-2 object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <div>
                <span className="text-base font-bold">{config.empresa_nome}</span>
                <p className="text-gray-400 text-sm">{config.empresa_tagline}</p>
              </div>
            </div>
            <p className="text-gray-400 text-sm">
              {config.empresa_descricao}
              {config.empresa_autor && (<><br /><br />{config.empresa_autor}</>)}
            </p>
          </div>

          {/* Colunas dinâmicas */}
          {colunas.map((coluna) => (
            <div key={coluna.id}>
              <h3 className="text-lg font-semibold mb-3">{coluna.titulo}</h3>
              <div className="space-y-2 text-gray-400">
                {coluna.links.map((item) =>
                  item.ehLink ? (
                    <div key={item.id} className="flex items-center">
                      <ContatoIcon link={item.link} texto={item.texto} />
                      <a
                        href={item.link}
                        target={item.link.startsWith('mailto:') ? undefined : '_blank'}
                        rel="noopener noreferrer"
                        className="hover:text-white transition-colors text-sm"
                      >
                        {item.texto}
                      </a>
                    </div>
                  ) : (
                    <div key={item.id} className="flex items-center">
                      <ContatoIcon link={item.link} texto={item.texto} />
                      <p className="text-sm">{item.texto}</p>
                    </div>
                  )
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Seção de informações */}
        {config.info_texto && config.info_texto.trim() && (
          <div className="border-t border-b border-gray-700 mt-8 py-6 text-gray-400 text-sm leading-relaxed">
            <div className={
              config.info_alinhamento === 'center' ? 'text-center' :
              config.info_alinhamento === 'right'  ? 'text-right' : 'text-left'
            }>
              {renderInfoTexto(config.info_texto)}
            </div>
          </div>
        )}

        <div className={`${config.info_texto && config.info_texto.trim() ? 'mt-6' : 'border-t border-gray-700 mt-8 pt-8'} text-center text-gray-400`}>
          <p>&copy; {new Date().getFullYear()} {config.copyright}</p>
        </div>

        {/* Barra inferior — links + versão */}
        {(bottomLinks.length > 0 || config.versao_sistema) && (
          <div className="mt-4 flex items-center text-gray-500 text-xs">
            <div className="flex-1" />
            <div className="flex flex-wrap items-center justify-center gap-x-0">
              {bottomLinks.map((item, idx) => (
                <span key={item.id} className="flex items-center">
                  {item.link ? (
                    <a
                      href={item.link}
                      onClick={(e) => handleBottomLinkClick(e, item.link)}
                      target={isSpecialLink(item.link) || item.link.startsWith('mailto:') ? undefined : '_blank'}
                      rel="noopener noreferrer"
                      className="hover:text-white transition-colors px-2 py-0.5 cursor-pointer"
                    >
                      {item.texto}
                    </a>
                  ) : (
                    <span className="px-2 py-0.5">{item.texto}</span>
                  )}
                  {idx < bottomLinks.length - 1 && (
                    <span className="text-gray-600 select-none">|</span>
                  )}
                </span>
              ))}
            </div>
            <div className="flex-1 flex justify-end">
              {config.versao_sistema && (
                config.notas_versao ? (
                  <button
                    onClick={() => setShowNotas(true)}
                    className="text-gray-600 tabular-nums hover:text-gray-400 transition-colors cursor-pointer"
                  >
                    v{config.versao_sistema}
                  </button>
                ) : (
                  <span className="text-gray-600 tabular-nums">v{config.versao_sistema}</span>
                )
              )}
            </div>
          </div>
        )}
      </div>
    </footer>

    <TermosUsoModal isOpen={showTermos} onClose={() => setShowTermos(false)} />
    <PoliticaPrivacidadeModal isOpen={showPolitica} onClose={() => setShowPolitica(false)} />

    {/* Modal de Notas da Versão */}
    {showNotas && (
      <div
        className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center z-50 px-4 pb-4 pt-[120px]"
        onClick={() => setShowNotas(false)}
      >
        <div
          className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-2xl max-h-[68vh] flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
            <div>
              <h3 className="font-bold text-gray-900 text-base">Notas da Versão</h3>
              <p className="text-xs text-blue-600 font-mono mt-0.5">v{config.versao_sistema}</p>
            </div>
            <button
              onClick={() => setShowNotas(false)}
              className="text-gray-400 hover:text-gray-600 transition-colors rounded-lg p-1 hover:bg-gray-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div
            className="overflow-y-auto flex-1 px-6 py-5 prose-legal text-sm text-gray-700 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(config.notas_versao) }}
          />
        </div>
      </div>
    )}
    </>
  );
};

export default Footer;
