import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    sourcemap: 'inline'
  },
  test: {
    include: ['**/*.test.ts'],
    globals: true, // so you can use `describe`, `it`, `expect` without importing
    environment: 'node', // or 'jsdom' if you’re testing browser-like code
    exclude: [
      'node_modules',
      'dist',
      '**/node_modules/**',
      '**/dist/**',
      'archive/**',
      '**/archive/**'
    ],
    globalSetup: ['./test/vitest.globalSetup.ts'],
    coverage: {
      all: true, // collect coverage from all files, even those without tests
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['server.ts', 'services/**/*.ts', 'utils/**/*.ts'],
      exclude: [
        '**/archive/**',
        '**.config.js',
        '**/scriptable/**',
        '**/vitest.*.ts',
        '**/test/scripts/**',
        '**/test-scripts/**',
        'public/**',
        '**/types/*.d.ts',
        'utils/liveTest.ts'
      ] // exclude test files or any other files
    },
    onConsoleLog(log) {
      if (log.includes('TT: undefined function')) return false;
      return true;
    }
  }
});
