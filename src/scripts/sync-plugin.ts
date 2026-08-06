#!/usr/bin/env node
/**
 * Regenerates the Claude Code plugin's bundled skill from the canonical ruleset.
 *
 * A plugin cannot reference files outside its own directory, so the plugin ships its own copy of
 * SKILL.md rather than pointing at src/skill/SKILL.md. That copy is generated, never hand-edited:
 * run `npm run sync-plugin` after changing the canonical file. tests/plugin.test.ts fails when the
 * two fall out of sync, so a forgotten sync is caught rather than shipped.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { cursorMdcTransform, skillFrontmatterTransform } from '../adapters/registry.js';

export const CANONICAL_SKILL_PATH = 'src/skill/SKILL.md';

/**
 * Generated files, and the transform each one is produced with. The skill uses the Agent Skills
 * format that Claude Code and Cursor both read. The `.mdc` rule is Cursor's own always-attached
 * rule format, so a Cursor user gets the ruleset whether or not the agent decides to load the
 * skill for a given task.
 */
export const GENERATED: Array<{ path: string; transform: (canonical: string) => string }> = [
  { path: 'plugin/skills/proctor/SKILL.md', transform: skillFrontmatterTransform },
  { path: 'plugin/rules/proctor.mdc', transform: cursorMdcTransform },
  // Context file for the Gemini CLI and Qwen Code extension manifests. Their `contextFileName`
  // takes a filename in the extension directory, which is the repository root, so this one lives
  // at the top level rather than under plugin/. Plain canonical content: those loaders read the
  // whole file as context and have no frontmatter convention of their own.
  { path: 'PROCTOR.md', transform: canonical => canonical },
];

async function main(): Promise<void> {
  const repoRoot = resolve(process.cwd());
  const canonical = await readFile(join(repoRoot, CANONICAL_SKILL_PATH), 'utf8');

  for (const { path, transform } of GENERATED) {
    const dest = join(repoRoot, path);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, transform(canonical), 'utf8');
    process.stdout.write(`Synced ${path} from ${CANONICAL_SKILL_PATH}\n`);
  }
}

await main();
