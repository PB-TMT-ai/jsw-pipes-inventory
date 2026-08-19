import { defineConfig } from 'vitest/config'

// Unit tests target the pure logic in src/lib/ (no React/DOM/Supabase needed),
// so the default Node environment is sufficient. Playwright specs in e2e/ are
// excluded so vitest doesn't try to run them.
//
// scripts/ is included for one file: the daily messages are rendered from what those
// scripts print, so `computed through the same helper` is only true if something runs
// them. They spawn plain Node and read fixtures — no network, no DOM.
export default defineConfig({
  test: {
    include: ['src/**/*.test.{js,jsx}', 'scripts/**/*.test.mjs'],
    exclude: ['e2e/**', 'node_modules/**'],
    environment: 'node',
  },
})
