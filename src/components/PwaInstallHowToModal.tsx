// Modal de instruções pra instalar o PWA quando o browser NÃO oferece
// beforeinstallprompt. Conteúdo muda conforme a estratégia detectada:
//   - 'ios-safari'         : Compartilhar → Adicionar à Tela de Início
//   - 'macos-safari'       : Arquivo → Adicionar ao Dock (ou Compartilhar)
//   - 'ios-other-browser'  : Abra esta página no Safari
//   - 'android-firefox'    : Menu (⋮) → Instalar / Adicionar à Tela de Início
//   - 'unsupported'        : Use Chrome, Edge ou Safari

import React from 'react'
import { X, Share, Plus, Menu, Globe } from 'lucide-react'
import type { InstallStrategy } from '@/pwa/installCapabilities'

interface Step {
  icon: React.ReactNode
  text: React.ReactNode
}

interface InstructionConfig {
  title: string
  steps: Step[]
  /** Mensagem de fallback / observação no rodapé do modal. */
  footer?: React.ReactNode
}

function getInstructions(strategy: InstallStrategy, appName: string): InstructionConfig | null {
  switch (strategy) {
    case 'ios-safari':
      return {
        title: `Instalar ${appName} no iPhone / iPad`,
        steps: [
          {
            icon: <Share className="w-5 h-5" />,
            text: <>Toque no botão <strong>Compartilhar</strong> na barra inferior do Safari.</>,
          },
          {
            icon: <Plus className="w-5 h-5" />,
            text: <>Role e escolha <strong>"Adicionar à Tela de Início"</strong>.</>,
          },
          {
            icon: <span className="text-base font-semibold">✓</span>,
            text: <>Confirme em <strong>"Adicionar"</strong>. O ícone do {appName} aparece na sua tela.</>,
          },
        ],
        footer: 'Depois disso, abra o app sempre pelo ícone — você fica logado mesmo após fechar.',
      }
    case 'macos-safari':
      return {
        title: `Instalar ${appName} no Mac (Safari)`,
        steps: [
          {
            icon: <span className="text-base font-semibold">📂</span>,
            text: <>No menu superior, abra <strong>Arquivo → Adicionar ao Dock…</strong></>,
          },
          {
            icon: <span className="text-base font-semibold">✓</span>,
            text: <>Confirme em <strong>"Adicionar"</strong>. O ícone vai pro Dock.</>,
          },
        ],
        footer: 'Disponível no Safari 17+. Em versões mais antigas, use Chrome ou Edge pra instalar.',
      }
    case 'ios-other-browser':
      return {
        title: 'Pra instalar, abra no Safari',
        steps: [
          {
            icon: <Globe className="w-5 h-5" />,
            text: <>No iPhone e iPad, só o <strong>Safari</strong> pode instalar apps web.</>,
          },
          {
            icon: <Share className="w-5 h-5" />,
            text: <>Copie o endereço desta página e cole no Safari, depois toque em <strong>Compartilhar → Adicionar à Tela de Início</strong>.</>,
          },
        ],
      }
    case 'android-firefox':
      return {
        title: `Instalar ${appName} no Android (Firefox)`,
        steps: [
          {
            icon: <Menu className="w-5 h-5" />,
            text: <>Toque no menu <strong>⋮</strong> (3 pontos) no canto superior direito.</>,
          },
          {
            icon: <Plus className="w-5 h-5" />,
            text: <>Escolha <strong>"Instalar"</strong> ou <strong>"Adicionar à Tela de Início"</strong>.</>,
          },
        ],
      }
    case 'unsupported':
      return {
        title: 'Seu navegador não suporta instalação',
        steps: [
          {
            icon: <Globe className="w-5 h-5" />,
            text: <>O Firefox no desktop ainda não permite instalar PWAs.</>,
          },
          {
            icon: <span className="text-base font-semibold">✓</span>,
            text: <>Abra o {appName} no <strong>Chrome</strong>, <strong>Edge</strong> ou <strong>Safari</strong> pra ver o botão de instalar.</>,
          },
        ],
      }
    default:
      return null
  }
}

interface Props {
  isOpen: boolean
  strategy: InstallStrategy
  appName: string
  onClose: () => void
}

const PwaInstallHowToModal: React.FC<Props> = ({ isOpen, strategy, appName, onClose }) => {
  if (!isOpen) return null
  const config = getInstructions(strategy, appName)
  if (!config) return null

  return (
    <div
      className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-howto-title"
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 relative animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
          aria-label="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 id="pwa-howto-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 pr-8">
          {config.title}
        </h2>

        <ol className="space-y-3">
          {config.steps.map((step, idx) => (
            <li key={idx} className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 flex items-center justify-center text-sm font-semibold">
                {idx + 1}
              </span>
              <div className="flex-1 pt-1.5 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                <span className="inline-flex items-center gap-2">
                  <span className="text-blue-600 dark:text-blue-400">{step.icon}</span>
                  <span>{step.text}</span>
                </span>
              </div>
            </li>
          ))}
        </ol>

        {config.footer && (
          <p className="mt-4 text-xs text-gray-500 dark:text-gray-400 leading-relaxed border-t border-gray-200 dark:border-gray-700 pt-3">
            {config.footer}
          </p>
        )}

        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
          >
            Entendi
          </button>
        </div>
      </div>
    </div>
  )
}

export default PwaInstallHowToModal
