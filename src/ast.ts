import { parse } from '@typescript-eslint/typescript-estree';
import type { TSESTree } from '@typescript-eslint/typescript-estree';

// Options frozen at module init — singleton behavior via ESM module cache.
// All calls to parseSource() reuse the same imported parse function and options.
const PARSE_OPTIONS = {
  jsx: true,    // handle .tsx/.jsx files
  loc: true,    // line/column locations for finding.line
  range: false, // not needed for proctor's structural analysis
} as const;

/**
 * Parse TypeScript/JavaScript source into an AST.
 * Returns null on parse failure so callers can log a warning and skip the file.
 * Fails open: proctor never crashes on input it can't parse.
 */
export function parseSource(content: string): TSESTree.Program | null {
  try {
    return parse(content, PARSE_OPTIONS);
  } catch {
    return null;
  }
}

// Re-export TSESTree namespace so callers don't need a separate import
export type { TSESTree };
