import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  target: 'node20',
  bundle: true,
  splitting: false,
  clean: true,
  dts: false,
  // shebang from src/cli.ts first line is preserved automatically by tsup
});
