import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts', 'src/ai/judge.ts', 'src/scripts/sync-plugin.ts', 'src/scripts/postinstall.ts'],  // judge is a dynamic import of dist/ai/judge.js; sync-plugin is a maintainer script
  format: ['esm'],
  target: 'node20',
  bundle: true,
  splitting: false,
  clean: true,
  dts: false,
  external: ['@anthropic-ai/sdk'],  // prevents bundling a CJS package; loaded from node_modules at runtime
  // shebang from src/cli.ts first line is preserved automatically by tsup
});
