import React, { useState, useEffect } from 'react';
import { Phone, Mail, Globe, Map, X } from 'lucide-react';
import DOMPurify from 'dompurify';
import TermosUsoModal from './TermosUsoModal';
import PoliticaPrivacidadeModal from './PoliticaPrivacidadeModal';
import Modal from './Modal';

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
  empresa_nome: '',
  empresa_tagline: '',
  empresa_descricao: '',
  empresa_autor: '',
  empresa_logo: '',
  info_texto: '',
  info_alinhamento: 'left',
  copyright: '',
  versao_sistema: '',
  notas_versao: '',
};

const COLUNAS_DEFAULTS: RodapeColuna[] = [];

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

// Identifica URLs que apontam para serviços de mapa (endereço físico)
function isMapLink(link: string): boolean {
  return /(?:maps\.google|google\.[^/]+\/maps|goo\.gl\/maps|maps\.app\.goo\.gl|maps\.apple\.com|apple\.com\/maps|waze\.com|openstreetmap\.org|bing\.com\/maps)/i.test(link);
}

function ContatoIcon({ link, texto }: { link: string; texto: string }) {
  // Mapa tem prioridade — endereços costumam ter parênteses (ex.: "São Paulo (SP)")
  // e cairiam erroneamente na heurística de telefone abaixo.
  if (isMapLink(link)) return <Map className="h-4 w-4 mr-2 flex-shrink-0" aria-hidden="true" />;
  if (link.startsWith('mailto:') || texto.includes('@')) return <Mail className="h-4 w-4 mr-2 flex-shrink-0" aria-hidden="true" />;
  if (link.startsWith('https://wa.me') || texto.includes('(')) return <Phone className="h-4 w-4 mr-2 flex-shrink-0" aria-hidden="true" />;
  if (link.startsWith('https://') || link.startsWith('http://')) return <Globe className="h-4 w-4 mr-2 flex-shrink-0" aria-hidden="true" />;
  return null;
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

  // ESC handling is provided by <Modal />.

  useEffect(() => {
    let cancelled = false;

    const carregarRodape = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/rodape`);
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (!json.success || !json.data || cancelled) return;
        const { configuracoes, colunas: colsDados, bottomLinks: bottomDados } = json.data;

        if (configuracoes && Object.keys(configuracoes).length > 0) {
          const alinhamentoValido: RodapeConfig['info_alinhamento'][] = ['left', 'center', 'right'];
          const alinhamento: RodapeConfig['info_alinhamento'] =
            alinhamentoValido.includes(configuracoes.info_alinhamento)
              ? configuracoes.info_alinhamento
              : 'left';
          setConfig({
            empresa_nome:       configuracoes.empresa_nome       || RODAPE_DEFAULTS.empresa_nome,
            empresa_tagline:    configuracoes.empresa_tagline    || RODAPE_DEFAULTS.empresa_tagline,
            empresa_descricao:  configuracoes.empresa_descricao  || RODAPE_DEFAULTS.empresa_descricao,
            empresa_autor:      configuracoes.empresa_autor      || RODAPE_DEFAULTS.empresa_autor,
            empresa_logo:       configuracoes.empresa_logo       || RODAPE_DEFAULTS.empresa_logo,
            info_texto:         configuracoes.info_texto         || '',
            info_alinhamento:   alinhamento,
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

    carregarRodape();
    window.addEventListener('rodape-updated', carregarRodape);
    return () => {
      cancelled = true;
      window.removeEventListener('rodape-updated', carregarRodape);
    };
  }, []);

  const totalColunas = 1 + colunas.length;
  const gridClass =
    totalColunas <= 1 ? 'grid grid-cols-1 gap-8' :
    totalColunas === 2 ? 'grid grid-cols-1 md:grid-cols-2 gap-8' :
    totalColunas === 3 ? 'grid grid-cols-1 md:grid-cols-3 gap-8' :
                        'grid grid-cols-1 md:grid-cols-4 gap-8';

  return (
    <>
    <footer aria-label="Rodapé do site" className="bg-gray-800 text-white py-8 mt-12 w-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={gridClass}>
          {/* Coluna da empresa */}
          <div>
            <div className="flex items-center mb-3">
              {config.empresa_logo && (
                <img
                  src={config.empresa_logo}
                  alt={config.empresa_nome + ' Logo'}
                  className="h-12 w-12 mr-2 object-contain"
                  onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.style.marginRight = '0'; }}
                />
              )}
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
                    <span className="text-gray-600 select-none" aria-hidden="true">|</span>
                  )}
                </span>
              ))}
            </div>
            <div className="flex-1 flex justify-end">
              {config.versao_sistema && (
                config.notas_versao ? (
                  <button
                    type="button"
                    onClick={() => setShowNotas(true)}
                    aria-label={`Abrir notas da versão ${config.versao_sistema}`}
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
    <Modal
      isOpen={showNotas}
      onClose={() => setShowNotas(false)}
      ariaLabelledBy="notas-versao-title"
      noBackdrop
      backdropClassName="bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm pt-[120px]"
    >
        <div
          className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-2xl max-h-[68vh] flex flex-col"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
            <div>
              <h3 id="notas-versao-title" className="font-bold text-gray-900 text-base">Notas da Versão</h3>
              <p className="text-xs text-blue-600 font-mono mt-0.5">v{config.versao_sistema}</p>
            </div>
            <button
              onClick={() => setShowNotas(false)}
              aria-label="Fechar notas da versão"
              className="text-gray-400 hover:text-gray-600 transition-colors rounded-lg p-1 hover:bg-gray-100"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div
            className="overflow-y-auto flex-1 px-6 py-5 prose-legal text-sm text-gray-700 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(config.notas_versao) }}
          />
        </div>
    </Modal>
    </>
  );
};

export default Footer;
