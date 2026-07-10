import type { TSESTree } from '@typescript-eslint/typescript-estree';
import type { AIJudge } from './ai/judge.js';
import type { ParsedFile } from './diff.js';

export type Severity = 'error' | 'warn' | 'info';

/**
 * A Finding is the result of a Verifier checking a Claim against reality.
 * verifierId ties back to the Verifier that produced it (e.g. 'RH001').
 */
export interface Finding {
  verifierId: string;   // e.g. 'RH001' — the Verifier.id that produced this Finding
  severity: Severity;
  file: string;         // relative path
  line: number;         // 1-indexed
  message: string;      // one sentence: what was found
  suggestion: string;   // one sentence: how to fix it
}

/**
 * Context is everything a Verifier needs to check a Claim against reality:
 * the discovered diff, repo file tree signals, test<->impl mapping helpers,
 * parsed config, and an optional injected AIJudge. Built once per `check`
 * invocation by buildContext(), then passed to every Verifier in the registry.
 */
export interface Context {
  cwd: string;
  files: ParsedFile[];             // the working/staged diff (or --base diff), discovered before buildContext runs
  testPathGlobs: string[];
  testFiles: string[];             // resolved from globs
  enabled: string[];                // enabled verifier IDs
  isTestFile: (path: string) => boolean;
  getLanguage: (filePath: string) => 'ts' | 'js' | 'python' | 'unknown';
  severity?: Record<string, Severity>;
  ignorePatterns?: string[];
  commitMessage?: string;           // git subject line from git log -1 --format=%s; undefined on empty repo
  committedDiff?: boolean;          // true only for `check --base <ref>` (a real committed range, so
                                     // commitMessage genuinely describes this diff); false/undefined for
                                     // working-tree or --staged checks, where commitMessage is whatever the
                                     // last unrelated commit happened to say — not a reason for this change
  snapshotGlobs?: string[];         // custom snapshot glob patterns from config; undefined uses RH006's defaults
  aiEnabled?: boolean;              // true only when --ai flag is passed and API key is present
  aiModel?: string;                 // model ID from config; defaults to 'claude-haiku-4-5-20251001' in CLI
  judge?: AIJudge;                  // injected by CLI when --ai is set; undefined in offline mode
  ast?: Map<string, TSESTree.Program>; // populated by engine pre-pass; undefined when not needed
}

/**
 * A Verifier checks one Claim the agent implicitly or explicitly makes
 * ("the tests pass," "I fixed the bug," "I implemented the spec") against
 * reality, by inspecting Context and producing Finding[]. Test-tampering
 * signatures (RH00x) are just the first set of Verifiers — this interface
 * is what makes every future verifier track (WI1xx, plugins) additive
 * rather than a rewrite.
 */
export interface Verifier {
  id: string;                       // e.g. 'RH001' — must be unique across the registry
  severity: Severity;                // default severity for this Verifier's findings
  run(context: Context): Finding[] | Promise<Finding[]>;
}

export interface ProctorConfig {
  enabled?: string[];
  testPathGlobs?: string[];
  severity?: Record<string, Severity>;
  ignorePatterns?: string[];
  approvedTestChanges?: string[];
  aiModel?: string;          // overrides default model for AI judge
  snapshotGlobs?: string[];  // overrides default snapshot path patterns for RH006
}
