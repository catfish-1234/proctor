import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { AGENT_ADAPTERS, skillFrontmatterTransform } from '../src/adapters/registry.js';

const REPO = resolve(process.cwd());
const read = (p: string): string => readFileSync(resolve(REPO, p), 'utf8');
const readJson = <T>(p: string): T => JSON.parse(read(p)) as T;
const pkgVersion = readJson<{ version: string }>('package.json').version;

interface GeminiStyleManifest {
  name: string;
  version: string;
  description?: string;
  contextFileName?: string;
}

/**
 * Gemini CLI and Qwen Code share an extension format: a manifest at the extension root plus a
 * context file named by `contextFileName`. Qwen Code is a Gemini CLI fork, so the two manifests
 * are deliberately near-identical rather than accidentally so.
 */
describe.each([
  ['Gemini CLI', 'gemini-extension.json'],
  ['Qwen Code', 'qwen-extension.json'],
])('%s extension manifest (%s)', (_agent, file) => {
  const manifest = readJson<GeminiStyleManifest>(file);

  it('uses a lowercase dashed name, as the format requires', () => {
    expect(manifest.name).toBe('proctor');
    expect(manifest.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('declares a version matching the package', () => {
    expect(manifest.version).toBe(pkgVersion);
  });

  it('has a description, which is what the extension gallery shows', () => {
    expect(manifest.description).toBeTruthy();
  });

  it('names a context file that exists at the extension root', () => {
    // The format takes a filename in the extension directory, not a path into a subdirectory,
    // which is why the generated context file sits at the repository root.
    expect(manifest.contextFileName).toBe('PROCTOR.md');
    expect(manifest.contextFileName).not.toContain('/');
    expect(existsSync(resolve(REPO, manifest.contextFileName!))).toBe(true);
  });
});

describe('generated extension context file', () => {
  it('is the canonical ruleset verbatim, so it cannot drift', () => {
    const canonical = read('src/skill/SKILL.md').replace(/\r\n/g, '\n');
    const context = read('PROCTOR.md').replace(/\r\n/g, '\n');
    expect(context, 'PROCTOR.md is stale: run `npm run sync-plugin`').toBe(canonical);
  });

  it('carries no frontmatter, since these loaders read the whole file as context', () => {
    expect(read('PROCTOR.md').startsWith('---')).toBe(false);
  });
});

describe('goose recipe', () => {
  const recipe = read('recipes/proctor.yaml');

  it('declares the fields a recipe needs', () => {
    for (const field of ['version:', 'title:', 'description:', 'instructions:', 'prompt:']) {
      expect(recipe, `recipe needs ${field}`).toContain(field);
    }
  });

  it('calls the published package rather than a local build path', () => {
    expect(recipe).toContain('@kavishdua/proctor');
    expect(recipe).not.toContain('dist/cli.js');
  });

  it('tells the agent not to approve a finding on the user behalf', () => {
    // The whole approval design rests on a human making that call, so the recipe has to say so
    // rather than leaving the agent to infer it.
    expect(recipe).toMatch(/[Dd]o not run that\s+command yourself|do not record an approval yourself/);
  });

  it('points at the fix guidance rather than only reporting the block', () => {
    expect(recipe).toContain('--fix');
  });
});

describe('Agent Skills paths carry required frontmatter', () => {
  it('every adapter writing a SKILL.md applies the frontmatter transform', () => {
    // Claude Code and Codex both read the Agent Skills format, and Codex rejects a skill with no
    // `name`/`description` outright. An adapter writing SKILL.md without the transform ships a
    // skill that silently never loads.
    const skillAdapters = AGENT_ADAPTERS.filter(a => a.relativePath.endsWith('SKILL.md'));
    expect(skillAdapters.length).toBeGreaterThan(0);
    for (const adapter of skillAdapters) {
      expect(adapter.transform, `${adapter.id} writes SKILL.md and needs skill frontmatter`).toBe(
        skillFrontmatterTransform
      );
    }
  });

  it('the frontmatter includes both required fields', () => {
    const out = skillFrontmatterTransform('body');
    expect(out).toMatch(/^---\nname: .+/m);
    expect(out).toMatch(/^description: .+/m);
    expect(out).toContain('body');
  });
});

describe('distribution manifests agree on version', () => {
  it('every manifest tracks package.json, so a release cannot ship mixed versions', () => {
    const versions = [
      readJson<{ version?: string }>('plugin/.claude-plugin/plugin.json').version,
      readJson<{ version?: string }>('plugin/.cursor-plugin/plugin.json').version,
      readJson<{ version: string }>('gemini-extension.json').version,
      readJson<{ version: string }>('qwen-extension.json').version,
      readJson<{ plugins: Array<{ version?: string }> }>('.claude-plugin/marketplace.json').plugins[0]?.version,
    ];
    for (const version of versions) expect(version).toBe(pkgVersion);
  });
});
