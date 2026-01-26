import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [
    react({
      jsxRuntime: 'automatic'
    })
  ],
  define: {
    __HMR_CONFIG_NAME__: JSON.stringify('vite')
  },
  server: {
    port: 9000,
    open: true,
    host: '0.0.0.0',
    hmr: {
      clientPort: 9000,
      overlay: true
    },
    proxy: {
      '/api': {
        target: 'http://localhost:9001',
        changeOrigin: true,
        rewrite: (path) => path
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Separar node_modules em chunks menores
          if (id.includes('node_modules')) {
            // React e React DOM juntos
            if (id.includes('react') || id.includes('react-dom') || id.includes('scheduler')) {
              return 'vendor-react'
            }
            
            // Recharts (biblioteca de gráficos - grande)
            if (id.includes('recharts')) {
              return 'vendor-recharts'
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
    chunkSizeWarningLimit: 500,
    target: 'es2015'
  }
})
