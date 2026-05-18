import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    exclude: ['node_modules', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['lib/**', 'components/**'],
      exclude: [
        'lib/supabase/**',
        '**/*.d.ts',
        // KanbanBoard and KanbanColumn require DnD context; covered by E2E tests
        'components/board/KanbanBoard.tsx',
        'components/board/KanbanColumn.tsx',
        'components/board/KanbanOverlayCard.tsx',
      ],
      thresholds: {
        lines: 80,
        functions: 65,
        branches: 75,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
