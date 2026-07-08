import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // bench/tasks/** are self-contained synthetic mini-repos (D-08): each ships its own
    // *.test.js / *.test.ts files (visible + held-out) that must NEVER be collected by
    // proctor's own suite — they are fixture data consumed by src/bench/, not real tests.
    exclude: ['node_modules/**', 'dist/**', 'bench/tasks/**'],
    globals: false,
    environment: 'node',
    // pool: 'forks', // ponytail: uncomment if worker thread errors appear on Windows
  },
});
