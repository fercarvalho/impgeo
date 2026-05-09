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
      clientPort: 9000,
      overlay: true
    },
    proxy: {
      '/api': {
        target: 'http://localhost:9001',
        changeOrigin: true,
        rewrite: (apiPath) => apiPath
      },
      '/v': {
        target: 'http://localhost:9001',
        changeOrigin: true,
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
          if (id.includes('/src/components/')) {
            // Projection é muito grande, separar
            if (id.includes('Projection')) {
              return 'component-projection'
            }

            // Reports com gráficos
            if (id.includes('Reports') || id.includes('DRE')) {
              return 'component-reports'
            }

            // Acompanhamentos
            if (id.includes('Acompanhamentos')) {
              return 'component-acompanhamentos'
            }

            // Transactions
            if (id.includes('Transactions')) {
              return 'component-transactions'
            }

            // Projects
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
