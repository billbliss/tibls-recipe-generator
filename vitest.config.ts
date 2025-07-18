import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    sourcemap: 'inline'
  },
  test: {
    globals: true, // so you can use `describe`, `it`, `expect` without importing
    environment: 'node', // or 'jsdom' if you’re testing browser-like code
    exclude: ['node_modules', 'dist', '**/node_modules/**', '**/dist/**'],
    globalSetup: ['./test/vitest.globalSetup.ts'],
    coverage: {
      reporter: ['text', 'html']
    },
    onConsoleLog(log) {
      if (log.includes('TT: undefined function')) return false;
      return true;
    }
  }
});
