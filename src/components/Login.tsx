import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  Lock, User, Eye, EyeOff, Copy, Check,
  HelpCircle, ChevronDown, ChevronUp, BookOpen, X, Search
} from 'lucide-react';
import EsqueciSenhaModal from './EsqueciSenhaModal';
import CookieBanner from './CookieBanner';
import TermosUsoModal from './TermosUsoModal';
import PoliticaPrivacidadeModal from './PoliticaPrivacidadeModal';
import Footer from './Footer';
import Documentation from './Documentation';

const LOGIN_API_URL = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:9001/api'
  : ((import.meta as any).env?.VITE_API_URL || '/api');

interface FaqItem { id: string; pergunta: string; resposta: string; }

const Login: React.FC = () => {
  const [username, setUsername]             = useState('');
  const [password, setPassword]             = useState('');
  const [showPassword, setShowPassword]     = useState(false);
  const [isLoading, setIsLoading]           = useState(false);
  const [error, setError]                   = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showEsqueciSenhaModal, setShowEsqueciSenhaModal] = useState(false);
  const [newPassword, setNewPassword]       = useState('');
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [showTermos, setShowTermos]         = useState(false);
  const [showPolitica, setShowPolitica]     = useState(false);

  // FAQ modal
  const [faqItems, setFaqItems]     = useState<FaqItem[]>([]);
  const [showFaqModal, setShowFaqModal] = useState(false);
  const [faqOpenId, setFaqOpenId]   = useState<string | null>(null);
  const [faqSearch, setFaqSearch]   = useState('');

  // Docs modal
  const [showDocsModal, setShowDocsModal] = useState(false);

  const { login, completeFirstLogin } = useAuth();

  // ── Pontos do fundo ──
  const bgDots = useMemo(() => {
    const step = 52, cols = Math.ceil(1440 / step) + 1, rows = Math.ceil(920 / step) + 1;
    return Array.from({ length: cols * rows }, (_, i) => ({ x: (i % cols) * step, y: Math.floor(i / cols) * step }));
  }, []);

  const spotlightRef  = useRef<HTMLDivElement>(null);
  const dotsLayerRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const el = spotlightRef.current;
      if (el) { el.style.background = `radial-gradient(650px circle at ${e.clientX}px ${e.clientY}px, rgba(99,102,241,0.18), transparent 65%)`; el.style.opacity = '1'; }
      const dl = dotsLayerRef.current;
      if (dl) { const m = `radial-gradient(200px circle at ${e.clientX}px ${e.clientY}px, black 20%, transparent 100%)`; dl.style.webkitMaskImage = m; (dl.style as any).maskImage = m; }
    };
    const onLeave = () => {
      if (spotlightRef.current) spotlightRef.current.style.opacity = '0';
      if (dotsLayerRef.current) { const e2 = 'radial-gradient(0px circle at 50% 50%, black, transparent)'; dotsLayerRef.current.style.webkitMaskImage = e2; (dotsLayerRef.current.style as any).maskImage = e2; }
    };
    window.addEventListener('mousemove', onMove);
    document.documentElement.addEventListener('mouseleave', onLeave);
    return () => { window.removeEventListener('mousemove', onMove); document.documentElement.removeEventListener('mouseleave', onLeave); };
  }, []);

  const closeFaqModal  = () => { setShowFaqModal(false);  setFaqSearch('');  setFaqOpenId(null); };
  const closeDocsModal = () => { setShowDocsModal(false); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showFaqModal)       { closeFaqModal();  return; }
      if (showDocsModal)      { closeDocsModal(); return; }
      if (showPasswordModal)  setShowPasswordModal(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showFaqModal, showDocsModal, showPasswordModal]);

  useEffect(() => {
    fetch(`${LOGIN_API_URL}/faq`)
      .then(r => r.json())
      .then(result => { if (result.success) setFaqItems(result.data); })
      .catch(() => {});
  }, []);

  const filteredFaq = faqSearch
    ? faqItems.filter(f => f.pergunta.toLowerCase().includes(faqSearch.toLowerCase()) || f.resposta.toLowerCase().includes(faqSearch.toLowerCase()))
    : faqItems;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setIsLoading(true); setError('');
    const result = await login(username, password);
    if (!result.success) { setError('Usuário ou senha incorretos'); setIsLoading(false); }
    else {
      if (result.firstLogin && result.newPassword) { setNewPassword(result.newPassword); setShowPasswordModal(true); setIsLoading(false); return; }
      setIsLoading(false);
    }
  };

  const handleCopyPassword = () => { navigator.clipboard.writeText(newPassword); setPasswordCopied(true); setTimeout(() => setPasswordCopied(false), 2000); };
  const handleCloseModal   = async () => { setShowPasswordModal(false); setPasswordCopied(false); await completeFirstLogin(); };

  return (
    <div className="relative min-h-screen flex flex-col imp-login-page-bg">

      {/* ─── Camada decorativa de fundo ─── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none select-none" aria-hidden="true">
        <div ref={spotlightRef} className="absolute inset-0" style={{ opacity: 0, transition: 'opacity 0.4s ease' }} />
        <div ref={dotsLayerRef} className="absolute inset-0" style={{ WebkitMaskImage: 'radial-gradient(0px circle at 50% 50%, black, transparent)', maskImage: 'radial-gradient(0px circle at 50% 50%, black, transparent)' }}>
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1440 900" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
            {bgDots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r="1.8" fill="#6366f1" opacity="0.85" />)}
          </svg>
        </div>
        <svg className="absolute inset-0 w-full h-full imp-login-svg-bg" viewBox="0 0 1440 900" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
          <path d="M-200,160 C100,60 350,260 680,140 C980,30 1180,230 1500,120" fill="none" stroke="#3b82f6" strokeWidth="1.5" className="imp-svg-wave-1" />
          <path d="M-200,340 C150,240 400,440 750,300 C1060,175 1270,380 1600,260" fill="none" stroke="#6366f1" strokeWidth="1" className="imp-svg-wave-2" />
          <path d="M-200,520 C200,420 460,620 820,480 C1130,355 1340,550 1640,440" fill="none" stroke="#3b82f6" strokeWidth="1.5" className="imp-svg-wave-3" />
          <path d="M-200,700 C250,600 520,800 890,650 C1160,520 1360,710 1640,610" fill="none" stroke="#6366f1" strokeWidth="1" className="imp-svg-wave-4" />
          <circle cx="1380" cy="90"  r="130" fill="none" stroke="#3b82f6" strokeWidth="1" className="imp-svg-ring-1" />
          <circle cx="1380" cy="90"  r="85"  fill="none" stroke="#3b82f6" strokeWidth="1" className="imp-svg-ring-2" />
          <circle cx="1380" cy="90"  r="45"  fill="#3b82f6" className="imp-svg-fill-1" />
          <circle cx="80"   cy="830" r="100" fill="none" stroke="#6366f1" strokeWidth="1" className="imp-svg-ring-3" />
          <circle cx="80"   cy="830" r="58"  fill="#6366f1" className="imp-svg-fill-2" />
        </svg>
      </div>

      {/* ─── Conteúdo principal ─── */}
      <div className="relative z-10 flex flex-col items-center flex-1 py-10 px-4">

        {/* Card glassmorphism */}
        <div className="imp-login-card-enter imp-login-card w-full max-w-md rounded-3xl p-6 sm:p-8">
          <div className="text-center mb-8">
            <div className="relative flex flex-col items-center mb-1">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-16 bg-blue-400/20 rounded-full blur-2xl pointer-events-none" />
              <img src="/imp_logo.png" alt="IMPGEO" className="relative h-16 w-auto object-contain" />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-3 font-medium tracking-wide">Sistema de Gestão Inteligente</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="relative">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none z-10"><User className="h-4 w-4 text-gray-400" /></div>
              <input id="login-username" name="username" type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder=" " className="imp-float-input" autoComplete="username" required />
              <label htmlFor="login-username" className="imp-float-label">Usuário</label>
            </div>
            <div className="relative">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none z-10"><Lock className="h-4 w-4 text-gray-400" /></div>
              <input id="login-password" name="password" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder=" " className="imp-float-input pr-11" autoComplete="current-password" required />
              <label htmlFor="login-password" className="imp-float-label">Senha</label>
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors z-10">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div className="flex justify-end -mt-1">
              <button type="button" onClick={() => setShowEsqueciSenhaModal(true)} className="text-xs font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors hover:underline underline-offset-2" disabled={isLoading}>
                Esqueci minha senha
              </button>
            </div>
            {error && <div className="imp-error-block rounded-xl p-3.5"><p className="text-sm font-medium">{error}</p></div>}
            <button type="submit" disabled={isLoading} className="w-full py-3.5 px-4 mt-1 rounded-xl font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/35 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-lg">
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Entrando...
                </span>
              ) : 'Entrar'}
            </button>
          </form>
        </div>

        {/* ─── Botões de ajuda ─── */}
        <div className="w-full max-w-md mt-4 grid grid-cols-2 gap-3 imp-login-helpers-enter">
          <button
            type="button"
            onClick={() => setShowDocsModal(true)}
            className="flex items-center justify-center gap-2 px-4 py-3 imp-help-btn rounded-xl text-sm font-medium text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-200 transition-all duration-200"
          >
            <BookOpen className="h-4 w-4 text-blue-500 dark:text-blue-400" />
            Documentação
          </button>
          <button
            type="button"
            onClick={() => setShowFaqModal(true)}
            className="flex items-center justify-center gap-2 px-4 py-3 imp-help-btn rounded-xl text-sm font-medium text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-200 transition-all duration-200"
          >
            <HelpCircle className="h-4 w-4 text-blue-500 dark:text-blue-400" />
            Dúvidas Frequentes
          </button>
        </div>

        {/* ─── Links legais ─── */}
        <div className="w-full max-w-md grid grid-cols-2 gap-3 mt-3 mb-6 imp-login-legal-enter">
          <div className="flex justify-center">
            <button onClick={() => setShowTermos(true)} className="text-xs text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors hover:underline underline-offset-2">Termos de Uso</button>
          </div>
          <div className="flex justify-center">
            <button onClick={() => setShowPolitica(true)} className="text-xs text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors hover:underline underline-offset-2">Política de Privacidade</button>
          </div>
        </div>
      </div>

      {/* ─── Modal FAQ ─── */}
      {showFaqModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-[9999] p-4" onClick={closeFaqModal}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center">
                  <HelpCircle className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-white font-bold text-lg">Perguntas Frequentes</h2>
                  <p className="text-blue-100 text-xs">{faqItems.length} pergunta{faqItems.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <button onClick={closeFaqModal} className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-colors">
                <X className="h-4 w-4 text-white" />
              </button>
            </div>
            <div className="px-4 pt-4 pb-2 flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input type="text" placeholder="Buscar pergunta..." value={faqSearch} onChange={e => setFaqSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white dark:!bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400" />
              </div>
            </div>
            <div className="overflow-y-auto flex-1 px-4 pb-4 space-y-2">
              {filteredFaq.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">Nenhuma pergunta encontrada.</div>
              ) : filteredFaq.map(item => (
                <div key={item.id} className="rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden shadow-sm">
                  <button type="button" onClick={() => setFaqOpenId(prev => prev === item.id ? null : item.id)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-blue-50/60 dark:hover:bg-blue-900/20 transition-colors">
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-100 leading-snug">{item.pergunta}</span>
                    {faqOpenId === item.id
                      ? <ChevronUp className="h-4 w-4 text-blue-500 flex-shrink-0" />
                      : <ChevronDown className="h-4 w-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />}
                  </button>
                  {faqOpenId === item.id && (
                    <div className="px-4 pb-4 pt-1 border-t border-blue-50 dark:border-gray-700 bg-blue-50/30 dark:bg-gray-900/40">
                      <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{item.resposta}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal Documentação ─── */}
      {showDocsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4" onClick={closeDocsModal}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto relative" onClick={e => e.stopPropagation()}>
            <button
              onClick={closeDocsModal}
              className="absolute top-4 right-4 z-10 w-9 h-9 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-full flex items-center justify-center shadow transition-colors"
              aria-label="Fechar documentação"
            >
              <X className="h-4 w-4" />
            </button>
            <Documentation inModal />
          </div>
        </div>
      )}

      {/* ─── Modal Primeiro Acesso ─── */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10001] p-4" onClick={() => setShowPasswordModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-6">
              <div className="mx-auto w-16 h-16 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full flex items-center justify-center mb-4"><Lock className="w-8 h-8 text-white" /></div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Primeiro Acesso</h2>
              <p className="text-gray-600 dark:text-gray-400">Uma nova senha foi gerada para você</p>
            </div>
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Sua Nova Senha</label>
              <div className="relative">
                <input type="text" value={newPassword} readOnly className="w-full px-4 py-3 border-2 border-blue-500 rounded-lg bg-blue-50 dark:!bg-blue-900/30 font-mono text-lg font-bold text-gray-900 dark:text-gray-100 pr-12" autoComplete="off" />
                <button type="button" onClick={handleCopyPassword} className="absolute inset-y-0 right-0 pr-3 flex items-center" title="Copiar senha">
                  {passwordCopied ? <Check className="h-5 w-5 text-green-600" /> : <Copy className="h-5 w-5 text-gray-400 hover:text-gray-600" />}
                </button>
              </div>
              {passwordCopied && <p className="text-green-600 text-sm mt-2">Senha copiada!</p>}
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
              <p className="text-blue-800 dark:text-blue-300 text-sm"><strong>⚠️ Importante:</strong> Anote esta senha em local seguro. Você precisará dela para fazer login novamente.</p>
            </div>
            <button onClick={handleCloseModal} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold py-3 px-4 rounded-lg hover:from-blue-700 hover:to-indigo-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200">
              Entendi, continuar
            </button>
          </div>
        </div>
      )}

      <EsqueciSenhaModal isOpen={showEsqueciSenhaModal} onClose={() => setShowEsqueciSenhaModal(false)} />
      <CookieBanner onOpenTermos={() => setShowTermos(true)} onOpenPolitica={() => setShowPolitica(true)} />
      <TermosUsoModal isOpen={showTermos} onClose={() => setShowTermos(false)} />
      <PoliticaPrivacidadeModal isOpen={showPolitica} onClose={() => setShowPolitica(false)} />

      <style>{`
        .imp-login-page-bg { background: linear-gradient(135deg, #eff6ff 0%, #eef2ff 40%, #e0e7ff 100%); }
        html.dark .imp-login-page-bg { background: linear-gradient(135deg, #0f172a 0%, #111827 40%, #1e1b4b 100%); }
        .imp-login-svg-bg .imp-svg-wave-1 { opacity: 0.20; }
        .imp-login-svg-bg .imp-svg-wave-2 { opacity: 0.13; }
        .imp-login-svg-bg .imp-svg-wave-3 { opacity: 0.13; }
        .imp-login-svg-bg .imp-svg-wave-4 { opacity: 0.09; }
        .imp-login-svg-bg .imp-svg-ring-1 { opacity: 0.12; }
        .imp-login-svg-bg .imp-svg-ring-2 { opacity: 0.09; }
        .imp-login-svg-bg .imp-svg-fill-1 { opacity: 0.06; }
        .imp-login-svg-bg .imp-svg-ring-3 { opacity: 0.09; }
        .imp-login-svg-bg .imp-svg-fill-2 { opacity: 0.05; }
        .imp-login-card {
          background: rgba(255,255,255,0.82);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(99,102,241,0.20);
          box-shadow: 0 25px 50px -12px rgba(99,102,241,0.08), 0 10px 24px -6px rgba(0,0,0,0.06);
        }
        html.dark .imp-login-card {
          background: rgba(30,41,59,0.85);
          border-color: rgba(99,102,241,0.30);
          box-shadow: 0 25px 50px -12px rgba(0,0,0,0.4), 0 10px 24px -6px rgba(0,0,0,0.3);
        }
        .imp-float-input {
          width: 100%; height: 3.5rem;
          padding: 1.375rem 1rem 0.375rem 2.75rem;
          border: 1px solid rgba(209,213,219,0.70);
          border-radius: 0.75rem;
          background: rgba(255,255,255,0.65);
          color: #111827; font-size: 0.9375rem;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        html.dark .imp-float-input {
          background: rgba(15,23,42,0.70);
          border-color: rgba(99,102,241,0.25);
          color: #f1f5f9;
        }
        .imp-float-input::placeholder { color: transparent; }
        .imp-float-input:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.18); }
        html.dark .imp-float-input:focus { box-shadow: 0 0 0 3px rgba(99,102,241,0.30); }
        .imp-float-label {
          position: absolute; left: 2.75rem; top: 50%; transform: translateY(-50%);
          font-size: 0.9375rem; color: #9ca3af; pointer-events: none;
          transition: top 0.18s ease, transform 0.18s ease, font-size 0.18s ease, color 0.18s ease, font-weight 0.18s ease, letter-spacing 0.18s ease;
          white-space: nowrap;
        }
        .imp-float-input:focus ~ .imp-float-label,
        .imp-float-input:not(:placeholder-shown) ~ .imp-float-label {
          top: 0.55rem; transform: translateY(0);
          font-size: 0.625rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #4338ca;
        }
        html.dark .imp-float-input:focus ~ .imp-float-label,
        html.dark .imp-float-input:not(:placeholder-shown) ~ .imp-float-label { color: #818cf8; }
        .imp-error-block { background: rgba(254,226,226,0.80); border: 1px solid rgba(252,165,165,0.60); color: #dc2626; }
        html.dark .imp-error-block { background: rgba(127,29,29,0.50); border-color: rgba(239,68,68,0.40); color: #fca5a5; }
        .imp-help-btn {
          background: rgba(255,255,255,0.65);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border: 1px solid rgba(99,102,241,0.18);
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        html.dark .imp-help-btn {
          background: rgba(30,41,59,0.65);
          border-color: rgba(99,102,241,0.25);
        }
        .imp-help-btn:hover { background: rgba(238,242,255,0.85); border-color: rgba(99,102,241,0.35); box-shadow: 0 2px 8px rgba(99,102,241,0.12); }
        html.dark .imp-help-btn:hover { background: rgba(49,46,129,0.40); border-color: rgba(99,102,241,0.45); }
        .mermaid { display: flex; justify-content: center; margin: 1rem 0; }
        @keyframes impWave1 { 0%,100%{transform:translateX(0) translateY(0)} 50%{transform:translateX(-55px) translateY(10px)} }
        @keyframes impWave2 { 0%,100%{transform:translateX(0) translateY(0)} 50%{transform:translateX(65px) translateY(-12px)} }
        @keyframes impWave3 { 0%,100%{transform:translateX(0) translateY(0)} 50%{transform:translateX(-45px) translateY(14px)} }
        @keyframes impWave4 { 0%,100%{transform:translateX(0) translateY(0)} 50%{transform:translateX(50px) translateY(-9px)} }
        .imp-login-svg-bg .imp-svg-wave-1 { animation: impWave1 18s ease-in-out infinite; }
        .imp-login-svg-bg .imp-svg-wave-2 { animation: impWave2 23s ease-in-out infinite; animation-delay: -6s; }
        .imp-login-svg-bg .imp-svg-wave-3 { animation: impWave3 20s ease-in-out infinite; animation-delay: -11s; }
        .imp-login-svg-bg .imp-svg-wave-4 { animation: impWave4 26s ease-in-out infinite; animation-delay: -4s; }
        @keyframes impFadeInUp { from{opacity:0;transform:translateY(22px)} to{opacity:1;transform:translateY(0)} }
        .imp-login-card-enter    { animation: impFadeInUp 0.55s cubic-bezier(0.16,1,0.3,1) both; }
        .imp-login-helpers-enter { animation: impFadeInUp 0.55s cubic-bezier(0.16,1,0.3,1) 0.08s both; }
        .imp-login-legal-enter   { animation: impFadeInUp 0.55s cubic-bezier(0.16,1,0.3,1) 0.14s both; }
      `}</style>
      <Footer />
    </div>
  );
};

export default Login;
