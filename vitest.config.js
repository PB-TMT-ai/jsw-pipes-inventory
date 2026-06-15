import { defineConfig } from 'vitest/config'

// Unit tests target the pure logic in src/lib/ (no React/DOM/Supabase needed),
// so the default Node environment is sufficient. Playwright specs in e2e/ are
// excluded so vitest doesn't try to run them.
export default defineConfig({
  test: {
    include: ['src/**/*.test.{js,jsx}'],
    exclude: ['e2e/**', 'node_modules/**'],
    environment: 'node',
  },
})
