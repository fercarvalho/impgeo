import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import nodePath from 'node:path'

const __dirname = nodePath.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  base: './',
  plugins: [
    react({
      jsxRuntime: 'automatic'
    })
  ],
  resolve: {
    alias: {
      '@': nodePath.resolve(__dirname, 'src')
    }
  },
  // Pré-bundle agressivo das deps mais pesadas. Em dev mode o Vite normalmente
  // descobre deps em node_modules sob demanda — listar explicitamente reduz o
  // número de re-bundles ao primeiro acesso e o número de requests HTTP em
  // origens novas (cada *.impgeo.local é um cache HTTP separado para o browser).
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'react-is',
      'recharts',
      'lucide-react',
      'react-icons',
      'date-fns',
      'axios',
      'dompurify',
      'marked',
      'browser-image-compression',
      'react-easy-crop',
      'jspdf',
      'html2canvas',
      'jszip',
      'file-saver',
      '@dnd-kit/core',
      '@dnd-kit/sortable',
      '@dnd-kit/utilities',
      '@tiptap/react',
      '@tiptap/starter-kit',
      // @tiptap/pm é peer-dep dos dois acima e não tem export raiz "." —
      // o Vite descobre os sub-paths (@tiptap/pm/state, /view etc.) sob demanda.
    ],
  },
  define: {
    __HMR_CONFIG_NAME__: JSON.stringify('vite')
  },
  server: {
    port: 9000,
    open: true,
    host: '0.0.0.0',
    // Aceita acesso via *.impgeo.local em dev (subdomínios por subsistema).
    // Vite 7 valida o Host header — sem isso, requisições com Host=financeiro.impgeo.local
    // são rejeitadas por proteção contra DNS rebinding.
    allowedHosts: [
      'localhost',
      '.impgeo.local'
    ],
    hmr: {
      // clientPort fixo removido (era 9000) — força o websocket de HMR a usar
      // window.location.host. Sem isso, a página servida em
      // financeiro.impgeo.local:9000 tentava conectar em ws://localhost:9000
      // e o HMR ficava quebrado em qualquer subdomínio.
      overlay: true
    },
    proxy: {
      // changeOrigin: false preserva o Host original (financeiro.impgeo.local
      // etc.) ao chegar no backend, permitindo que resolveCookieDomain decida
      // o Domain certo dinamicamente. Em produção o Nginx envia X-Forwarded-Host
      // e o backend usa esse, então o comportamento é equivalente.
      '/api': {
        target: 'http://localhost:9001',
        changeOrigin: false,
        rewrite: (apiPath) => apiPath
      },
      '/v': {
        target: 'http://localhost:9001',
        changeOrigin: false,
        rewrite: (apiPath) => apiPath
      }
    },
    // Pré-transforma os módulos de cada subsistema no startup do dev server,
    // antes da primeira request. Em dev mode o Vite serve cada arquivo .tsx
    // como módulo ESM separado e os transforma sob demanda — sem warmup, a
    // primeira navegação para um subsistema dispara dezenas de transformações
    // simultâneas, somando latência perceptível. Com warmup, os módulos já
    // estão prontos em memória.
    warmup: {
      clientFiles: [
        './src/App.tsx',
        './src/subsistemas/SubsystemPicker.tsx',
        './src/subsistemas/admin/modulos/**/*.tsx',
        './src/subsistemas/gestao/modulos/**/*.tsx',
        './src/subsistemas/financeiro/modulos/**/*.tsx',
        './src/subsistemas/gerenciamento/modulos/**/*.tsx',
        './src/subsistemas/especial/modulos/**/*.tsx',
      ]
    }
  },
  // Servidor de "preview" — serve o build de produção (dist/) com a mesma
  // configuração de hosts e proxy do dev server, mas em outra porta. Útil
  // para testar o fluxo entre subsistemas sem o overhead de dev (cada origem
  // baixa um único bundle minificado em vez de centenas de módulos ESM
  // individuais → primeira navegação cai de ~10s para <1s).
  //
  // Uso:
  //   npm run build      # gera dist/
  //   npm run preview    # serve dist/ em http://*.impgeo.local:9100
  //
  // Pode rodar em paralelo com `npm run dev` (porta 9000) — você decide qual
  // porta abrir no browser dependendo de querer HMR ou velocidade.
  // Atenção: sem HMR — qualquer mudança de código precisa de novo `npm run build`.
  preview: {
    port: 9100,
    host: '0.0.0.0',
    strictPort: true,
    allowedHosts: [
      'localhost',
      '.impgeo.local',
    ],
    proxy: {
      '/api': {
        target: 'http://localhost:9001',
        changeOrigin: false,
        rewrite: (apiPath) => apiPath
      },
      '/v': {
        target: 'http://localhost:9001',
        changeOrigin: false,
        rewrite: (apiPath) => apiPath
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Separar node_modules em chunks menores
          if (id.includes('node_modules')) {
            // React, React DOM e Recharts juntos (recharts depende de react internamente)
            if (id.includes('react') || id.includes('react-dom') || id.includes('scheduler') || id.includes('recharts') || id.includes('victory-vendor')) {
              return 'vendor-react'
            }

            // Lucide React (ícones - pode ser grande)
            if (id.includes('lucide-react')) {
              return 'vendor-icons'
            }

            // PDF libraries separadas
            if (id.includes('jspdf')) {
              return 'vendor-jspdf'
            }
            if (id.includes('html2canvas')) {
              return 'vendor-html2canvas'
            }

            // Date libraries
            if (id.includes('date-fns')) {
              return 'vendor-date'
            }

            // React Icons
            if (id.includes('react-icons')) {
              return 'vendor-react-icons'
            }

            // HEIC converter (needs larger limit)
            if (id.includes('heic2any')) {
              return 'vendor-heic2any'
            }
          }

          // Separar componentes grandes em chunks próprios
          // (cobre tanto src/components/ quanto src/subsistemas/<sub>/modulos/)
          if (id.includes('/src/components/') || id.includes('/src/subsistemas/')) {
            // Projeção (financeiro) — muito grande
            if (id.includes('Projecao') || id.includes('Projection')) {
              return 'component-projection'
            }

            // Relatórios + DRE (financeiro)
            if (id.includes('RelatoriosFinanceiro') || id.includes('Reports') || id.includes('DRE')) {
              return 'component-reports'
            }

            // Acompanhamentos (especial)
            if (id.includes('Acompanhamentos')) {
              return 'component-acompanhamentos'
            }

            // Transações (financeiro)
            if (id.includes('Transactions')) {
              return 'component-transactions'
            }

            // Projetos (gerenciamento)
            if (id.includes('Projects')) {
              return 'component-projects'
            }
          }
        }
      }
    },
    // Otimizações adicionais
    chunkSizeWarningLimit: 1600, // increased to comfortably fit heic2any (1300kb)
    target: 'es2015'
  }
})
