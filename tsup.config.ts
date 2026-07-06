import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts', 'src/ai/judge.ts'],  // second entry for dynamic import of dist/ai/judge.js
  format: ['esm'],
  target: 'node20',
  bundle: true,
  splitting: false,
  clean: true,
  dts: false,
  external: ['@anthropic-ai/sdk', '@typescript-eslint/typescript-estree'],  // prevents bundling CJS packages; loaded from node_modules at runtime
  // shebang from src/cli.ts first line is preserved automatically by tsup
});
