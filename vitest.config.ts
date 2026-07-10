import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // bench/tasks/** are self-contained synthetic mini-repos: each ships its own
    // *.test.js / *.test.ts files (visible and held-out) that must never be collected by
    // proctor's own suite. They're fixture data consumed by src/bench/, not real tests.
    exclude: ['node_modules/**', 'dist/**', 'bench/tasks/**'],
    globals: false,
    environment: 'node',
    // pool: 'forks', // uncomment if worker thread errors appear on Windows
  },
});
