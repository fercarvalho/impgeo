import { defineConfig } from 'vitest/config'

// Config isolada do backend — NÃO herda o vite.config.ts do root (que tem
// plugins React e aponta pra /src). Testa apenas os services CJS do servidor.
export default defineConfig({
  test: {
    root: __dirname,
    environment: 'node',
    include: ['**/__tests__/**/*.test.js', '**/*.test.js'],
    globals: false,
  },
})
