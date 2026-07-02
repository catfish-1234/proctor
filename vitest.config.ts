import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globals: false,
    environment: 'node',
    // pool: 'forks', // ponytail: uncomment if worker thread errors appear on Windows
  },
});
