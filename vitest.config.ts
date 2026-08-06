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
    // Most of this suite spawns `node dist/cli.js` or `git` and asserts on the exit code and
    // output. Vitest's 5s default is a bound on process startup, not on anything those tests
    // check, and on a contended Windows runner a cold node spawn alone can exceed it: the badge
    // and score CLI cases both timed out there at 5s while passing everywhere else. 30s is the
    // same assertions with a bound that reflects what spawning a process actually costs.
    testTimeout: 30_000,
    // pool: 'forks', // uncomment if worker thread errors appear on Windows
  },
});
