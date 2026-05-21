import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import nodePath from 'node:path'
import fs from 'node:fs'
import { execSync } from 'node:child_process'

const __dirname = nodePath.dirname(fileURLToPath(import.meta.url))

// __BUILD_HASH__: short git hash quando disponível, senão Date.now em base36.
// É usado pelo SW (cache key) e injetado no HTML como window.__BUILD_HASH__
// pra ser concatenado no register('/sw.js?v=<hash>').
function resolveBuildHash(): string {
  if (process.env.BUILD_HASH) return process.env.BUILD_HASH
  try {
    const sha = execSync('git rev-parse --short=10 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
    if (sha) return sha
  } catch { /* fora de git ou git ausente */ }
  return Date.now().toString(36)
}

const BUILD_HASH = resolveBuildHash()

// Plugin: substitui __BUILD_HASH__ no sw.js do dist e injeta
// window.__BUILD_HASH__ no index.html depois do build.
function pwaBuildHashPlugin(): Plugin {
  return {
    name: 'pwa-build-hash',
    apply: 'build',
    closeBundle: {
      sequential: true,
      handler() {
        const swPath = nodePath.join(__dirname, 'dist', 'sw.js')
        try {
          if (fs.existsSync(swPath)) {
            const content = fs.readFileSync(swPath, 'utf8').replace(/__BUILD_HASH__/g, BUILD_HASH)
            fs.writeFileSync(swPath, content)
          }
        } catch (err) {
          console.warn('[pwa-build-hash] não consegui patchear sw.js:', err)
        }
        const htmlPath = nodePath.join(__dirname, 'dist', 'index.html')
        try {
          if (fs.existsSync(htmlPath)) {
            let html = fs.readFileSync(htmlPath, 'utf8')
            const inject = `<script>window.__BUILD_HASH__=${JSON.stringify(BUILD_HASH)};</script>`
            if (!html.includes('__BUILD_HASH__')) {
              html = html.replace('</head>', `  ${inject}\n  </head>`)
              fs.writeFileSync(htmlPath, html)
            }
          }
        } catch (err) {
          console.warn('[pwa-build-hash] não consegui injetar hash no index.html:', err)
        }
      },
    },
  }
}

// Plugin: em dev, aplica os mesmos Cache-Control que a prod (nginx) terá.
// Garante que sw.js e manifests não cachear no browser local, evitando
// "funciona em dev, quebra em prod" relacionado a SW staleness.
function pwaCacheControlDevPlugin(): Plugin {
  return {
    name: 'pwa-cache-control-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || ''
        if (
          url === '/sw.js' || url.startsWith('/sw.js?') ||
          url === '/sw-killswitch.js' || url.startsWith('/sw-killswitch.js?') ||
          url.startsWith('/manifests/') ||
          url === '/index.html' || url === '/'
        ) {
          res.setHeader('Cache-Control', 'no-store, must-revalidate')
        } else if (url.startsWith('/assets/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        } else if (url.startsWith('/icons/')) {
          res.setHeader('Cache-Control', 'public, max-age=86400')
        }
        next()
      })
    },
  }
}

// HTTPS dev opcional via mkcert. Se ./certs/dev-key.pem e ./certs/dev-cert.pem
// existem, ativa. Senão segue HTTP normal (SW só ativa em prod no PR #1).
function resolveDevHttps(): { key: Buffer; cert: Buffer } | undefined {
  try {
    const key = nodePath.join(__dirname, 'certs', 'dev-key.pem')
    const cert = nodePath.join(__dirname, 'certs', 'dev-cert.pem')
    if (fs.existsSync(key) && fs.existsSync(cert)) {
      return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) }
    }
  } catch { /* sem certs — segue HTTP */ }
  return undefined
}

export default defineConfig({
  base: './',
  plugins: [
    react({
      jsxRuntime: 'automatic'
    }),
    pwaBuildHashPlugin(),
    pwaCacheControlDevPlugin(),
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
    https: resolveDevHttps(),
    // Em dev local acessamos apenas via http://localhost:9000.
    // O fluxo de subsistemas funciona via sessionStorage (resolveCurrentSubsystem
    // em manifest.ts faz o fallback quando hostname não é subdomínio real).
    // Subdomínios *.impgeo.sistemas.viverdepj.com.br são usados em produção,
    // onde o Nginx faz o reverse proxy — Vite dev server não precisa lidar com isso.
    hmr: {
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
  build: {
    // Por padrão, o Vite injeta <link rel="modulepreload"> no index.html para
    // TODOS os chunks alcançáveis a partir do entry — inclusive os que só são
    // carregados via lazy()/dynamic import. Isso fazia o browser baixar ~1.2MB
    // de chunks lazy (vendor-jspdf 388KB, component-terracontrol 445KB,
    // component-projection 220KB, component-transactions 113KB) já no primeiro
    // load da página, anulando o lazy loading. Filtramos pra deixar SÓ os deps
    // realmente necessários no caminho crítico (vendor-react etc).
    modulePreload: {
      resolveDependencies: (_filename, deps) => {
        return deps.filter(d =>
          !d.includes('vendor-jspdf') &&
          !d.includes('vendor-html2canvas') &&
          !d.includes('vendor-heic2any') &&
          !d.includes('vendor-recharts') &&
          !d.includes('component-terracontrol') &&
          !d.includes('component-projection') &&
          !d.includes('component-transactions') &&
          !d.includes('component-reports') &&
          !d.includes('component-projects') &&
          !d.includes('jszip') &&
          !d.includes('exportPdf')
        )
      },
    },
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Separar node_modules em chunks menores
          if (id.includes('node_modules')) {
            // React, React DOM e Recharts juntos. Tentamos separar recharts em
            // chunk próprio, mas ele depende do react-is/scheduler que ficam no
            // vendor-react e o split causava erro "Cannot read properties of
            // undefined (reading 'forwardRef')" no boot. O ganho real vem da
            // otimização do modulePreload abaixo.
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

            // TerraControl (especial)
            if (id.includes('TerraControl')) {
              return 'component-terracontrol'
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
