import { defineConfig } from 'tsup';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  entry: ['src/dynamic-worker.ts', 'src/cli.ts', 'src/ai/judge.ts', 'src/scripts/sync-plugin.ts', 'src/scripts/postinstall.ts'],  // judge is a dynamic import of dist/ai/judge.js; sync-plugin is a maintainer script
  format: ['esm'],
  target: 'node20',
  bundle: true,
  // Keep shipped bundles compact and omit third-party prose comments.
  minifyWhitespace: true,
  splitting: false,
  clean: true,
  dts: false,
  // Gemini extensions run from a checkout without node_modules. Bundle the deterministic CLI,
  // but keep the opt-in AI judge as a lazy module so its SDK is only needed under --ai.
  noExternal: Object.keys(pkg.dependencies).filter(name => name !== '@anthropic-ai/sdk'),
  external: ['@anthropic-ai/sdk', './ai/judge.js'],
  // Bundled CommonJS dependencies still require Node built-ins in the ESM output.
  banner: { js: "import { createRequire as __proctorCreateRequire } from 'node:module'; const require = __proctorCreateRequire(import.meta.url);" },
  // shebang from src/cli.ts first line is preserved automatically by tsup
});
