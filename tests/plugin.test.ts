import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { cursorMdcTransform, skillFrontmatterTransform } from '../src/adapters/registry.js';

const REPO = resolve(process.cwd());
const read = (p: string): string => readFileSync(resolve(REPO, p), 'utf8');
const readJson = <T>(p: string): T => JSON.parse(read(p)) as T;

interface PluginManifest {
  name: string;
  version?: string;
  description?: string;
  license?: string;
  repository?: string;
  keywords?: string[];
}

interface MarketplaceManifest {
  name: string;
  owner: { name: string; url?: string; email?: string };
  plugins: Array<{ name: string; source: string; version?: string; description?: string }>;
}

describe('Claude Code plugin manifest', () => {
  const manifest = readJson<PluginManifest>('plugin/.claude-plugin/plugin.json');

  it('uses a kebab-case name, the only required field', () => {
    expect(manifest.name).toBe('proctor');
    expect(manifest.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('declares the same version as package.json, so the two cannot drift', () => {
    const pkg = readJson<{ version: string }>('package.json');
    expect(manifest.version).toBe(pkg.version);
  });

  it('carries the metadata the plugin picker shows', () => {
    expect(manifest.description).toBeTruthy();
    expect(manifest.license).toBe('MIT');
    expect(manifest.repository).toContain('github.com');
  });
});

describe('marketplace manifest', () => {
  const marketplace = readJson<MarketplaceManifest>('.claude-plugin/marketplace.json');

  it('has the three required top-level fields', () => {
    expect(marketplace.name).toBe('proctor-marketplace');
    expect(marketplace.owner.name).toBeTruthy();
    expect(Array.isArray(marketplace.plugins)).toBe(true);
  });

  it('does not use a name reserved for official Anthropic marketplaces', () => {
    const reserved = [
      'claude-code-marketplace', 'claude-code-plugins', 'claude-plugins-official',
      'claude-plugins-community', 'claude-community', 'anthropic-marketplace',
      'anthropic-plugins', 'agent-skills', 'anthropic-agent-skills',
      'knowledge-work-plugins', 'life-sciences', 'claude-for-legal',
      'claude-for-financial-services', 'financial-services-plugins',
      'first-party-plugins', 'healthcare',
    ];
    expect(reserved).not.toContain(marketplace.name);
  });

  it('lists proctor with a source that resolves to the plugin directory', () => {
    const entry = marketplace.plugins.find(p => p.name === 'proctor');
    expect(entry).toBeDefined();
    expect(entry!.source).toBe('./plugin');
    expect(existsSync(resolve(REPO, 'plugin/.claude-plugin/plugin.json'))).toBe(true);
  });

  it('keeps the marketplace entry version in step with the plugin manifest', () => {
    const entry = marketplace.plugins.find(p => p.name === 'proctor');
    const manifest = readJson<PluginManifest>('plugin/.claude-plugin/plugin.json');
    expect(entry!.version).toBe(manifest.version);
  });
});

describe('bundled plugin skill', () => {
  it('is exactly the canonical ruleset with skill frontmatter, so it cannot drift', () => {
    const canonical = read('src/skill/SKILL.md');
    const bundled = read('plugin/skills/proctor/SKILL.md');
    expect(
      bundled.replace(/\r\n/g, '\n'),
      'plugin skill is stale: run `npm run sync-plugin`'
    ).toBe(skillFrontmatterTransform(canonical).replace(/\r\n/g, '\n'));
  });

  it('carries a description, which is what Claude matches against to load it on its own', () => {
    const bundled = read('plugin/skills/proctor/SKILL.md');
    expect(bundled.startsWith('---\n')).toBe(true);
    expect(bundled).toMatch(/^description: .+/m);
  });

  it('contains the ruleset body verbatim, with nothing dropped or duplicated', () => {
    const canonical = read('src/skill/SKILL.md').replace(/\r\n/g, '\n');
    const bundled = read('plugin/skills/proctor/SKILL.md').replace(/\r\n/g, '\n');
    expect(bundled).toContain(canonical);
    expect(bundled.split('# Proctor Skill: Honest Completion Ruleset').length - 1).toBe(1);
  });
});

describe('Cursor plugin manifest', () => {
  const manifest = readJson<PluginManifest & { hooks?: string }>('plugin/.cursor-plugin/plugin.json');

  it('uses the same lowercase kebab-case name as the Claude Code plugin', () => {
    expect(manifest.name).toBe('proctor');
    expect(manifest.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('tracks the package version', () => {
    const pkg = readJson<{ version: string }>('package.json');
    expect(manifest.version).toBe(pkg.version);
  });

  it('points at its own hooks file, since Cursor and Claude Code use different hook schemas', () => {
    expect(manifest.hooks).toBe('./hooks/cursor.json');
    expect(existsSync(resolve(REPO, 'plugin/hooks/cursor.json'))).toBe(true);
  });
});

describe('two plugin manifests in one directory', () => {
  it('neither manifest claims the default hooks/hooks.json, so the two schemas cannot collide', () => {
    const claude = readJson<{ hooks?: string }>('plugin/.claude-plugin/plugin.json');
    const cursor = readJson<{ hooks?: string }>('plugin/.cursor-plugin/plugin.json');
    expect(claude.hooks).toBe('./hooks/claude-code.json');
    expect(cursor.hooks).toBe('./hooks/cursor.json');
    expect(claude.hooks).not.toBe(cursor.hooks);
    expect(existsSync(resolve(REPO, 'plugin/hooks/hooks.json'))).toBe(false);
  });

  it('shares one skills directory between both, which is the point of the Agent Skills format', () => {
    expect(existsSync(resolve(REPO, 'plugin/skills/proctor/SKILL.md'))).toBe(true);
  });
});

describe('bundled Cursor rule', () => {
  it('is the canonical ruleset with Cursor .mdc frontmatter, so it cannot drift', () => {
    const canonical = read('src/skill/SKILL.md');
    const rule = read('plugin/rules/proctor.mdc');
    expect(
      rule.replace(/\r\n/g, '\n'),
      'Cursor rule is stale: run `npm run sync-plugin`'
    ).toBe(cursorMdcTransform(canonical).replace(/\r\n/g, '\n'));
  });

  it('sets alwaysApply so the ruleset attaches without the agent choosing to load it', () => {
    expect(read('plugin/rules/proctor.mdc')).toMatch(/^alwaysApply: true$/m);
  });
});

describe('bundled Cursor stop hook', () => {
  interface CursorHooks {
    hooks: Record<string, Array<{ command: string; matcher?: string }>>;
  }
  const hooks = readJson<CursorHooks>('plugin/hooks/cursor.json');

  it('registers a stop hook that runs proctor', () => {
    expect(hooks.hooks['stop']![0]!.command).toContain('stop-hook');
  });

  it('uses Cursor’s flat command shape, not Claude Code’s nested one', () => {
    const entry = hooks.hooks['stop']![0]! as { command: string; hooks?: unknown };
    expect(typeof entry.command).toBe('string');
    expect(entry.hooks).toBeUndefined();
  });
});

describe('bundled Stop hook', () => {
  interface HooksConfig {
    hooks: { Stop: Array<{ hooks: Array<{ type: string; command: string }> }> };
  }
  const hooks = readJson<HooksConfig>('plugin/hooks/claude-code.json');

  it('registers a Stop hook that runs proctor', () => {
    const entry = hooks.hooks.Stop[0]!.hooks[0]!;
    expect(entry.type).toBe('command');
    expect(entry.command).toContain('stop-hook');
  });

  it('invokes the fully scoped package, which is what resolves on a machine with nothing installed', () => {
    const pkg = readJson<{ name: string }>('package.json');
    expect(hooks.hooks.Stop[0]!.hooks[0]!.command).toContain(pkg.name);
  });
});

describe('plugin commands', () => {
  it('every command file has description frontmatter', () => {
    for (const file of ['plugin/commands/check.md', 'plugin/commands/setup.md']) {
      const content = read(file);
      expect(content.startsWith('---\n'), `${file} needs frontmatter`).toBe(true);
      expect(content, `${file} needs a description`).toMatch(/^description: .+/m);
    }
  });

  it('quotes any description containing a colon, which otherwise fails YAML parsing', () => {
    // An unquoted `key: value: more` is not valid YAML. Claude Code loads such a command with
    // empty metadata and drops the description silently, so the command still appears but Claude
    // has nothing to match it against.
    for (const file of ['plugin/commands/check.md', 'plugin/commands/setup.md']) {
      const line = read(file).match(/^description: (.*)$/m)?.[1] ?? '';
      const unquoted = line.replace(/^"(.*)"$/, '$1');
      if (/:\s/.test(unquoted)) {
        expect(
          line.startsWith('"') && line.endsWith('"'),
          `${file} description contains ": " and must be quoted`
        ).toBe(true);
      }
    }
  });

  it('commands call the published package rather than a local build path', () => {
    for (const file of ['plugin/commands/check.md', 'plugin/commands/setup.md']) {
      const content = read(file);
      expect(content).toContain('@kavishdua/proctor');
      expect(content).not.toContain('dist/cli.js');
    }
  });
});
