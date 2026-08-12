import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { AGENT_ADAPTERS, type AgentAdapter } from './registry.js';

/**
 * The adapter installed when a repository shows no sign of any specific agent. AGENTS.md is the
 * cross-vendor standard, so one file at the repo root covers whatever the user later picks up.
 */
export const FALLBACK_ADAPTER_ID = 'agents-md';

async function exists(cwd: string, relativePath: string): Promise<boolean> {
  try {
    await stat(join(cwd, relativePath));
    return true;
  } catch {
    return false;
  }
}

/**
 * Which agents this repository actually uses, judged by whether the agent's own config file or
 * directory is already present.
 *
 * Writing all 30 adapters unconditionally puts 30 files into a repository for tools it does not
 * use, 12 of them at the root, which is a worse first commit than no guard at all. Detection keeps
 * `setup` to the agents that are really there.
 *
 * Returns adapters in roster order. When nothing is detected, returns the AGENTS.md fallback so a
 * fresh repository still gets the ruleset somewhere an agent will read it.
 */
export async function detectAgents(cwd: string): Promise<AgentAdapter[]> {
  const detected = await Promise.all(
    AGENT_ADAPTERS.map(async (adapter): Promise<AgentAdapter | undefined> => {
      // The path proctor writes always counts, so a repo that already ran setup keeps detecting
      // the same agents on a re-run. `detect` adds the markers that exist before any install.
      for (const marker of [adapter.relativePath, ...(adapter.detect ?? [])]) {
        if (await exists(cwd, marker)) return adapter;
      }
      return undefined;
    })
  );
  const found = detected.filter((a): a is AgentAdapter => a !== undefined);
  if (found.length > 0) return found;
  const fallback = AGENT_ADAPTERS.find(a => a.id === FALLBACK_ADAPTER_ID);
  return fallback ? [fallback] : [];
}

/**
 * Resolves an explicit `--agents a,b,c` list against the roster. Unknown ids are returned
 * separately rather than skipped, so the caller can fail instead of silently installing less than
 * the user asked for.
 */
export function selectAgents(ids: string[]): { selected: AgentAdapter[]; unknown: string[] } {
  const wanted = new Set(ids);
  const selected = AGENT_ADAPTERS.filter(a => wanted.has(a.id));
  const known = new Set(selected.map(a => a.id));
  return { selected, unknown: ids.filter(id => !known.has(id)) };
}
