import type { AIJudge } from './ai/judge.js';
import type { ParsedFile } from './diff.js';

export type Severity = 'error' | 'warn' | 'info';

/**
 * Languages proctor can name from a file extension. `unknown` is a real member, not a failure:
 * the language-specific checks simply do not apply to a file proctor cannot place.
 */
export type Language =
  | 'ts' | 'js' | 'python' | 'go' | 'java' | 'rust' | 'ruby' | 'php' | 'csharp' | 'kotlin'
  | 'cpp' | 'c' | 'swift' | 'objc' | 'dart' | 'scala' | 'perl' | 'r' | 'haskell' | 'elixir'
  | 'lua' | 'groovy' | 'clojure' | 'shell' | 'julia' | 'vbnet' | 'unknown';

/**
 * A Finding is the result of a Verifier checking a Claim against reality.
 * verifierId ties back to the Verifier that produced it (e.g. 'RH001').
 */
export interface Finding {
  verifierId: string;   // e.g. 'RH001', the Verifier.id that produced this Finding
  severity: Severity;
  file: string;         // relative path
  line: number;         // 1-indexed
  message: string;      // one sentence: what was found
  suggestion: string;   // one sentence: how to fix it
  approved?: true;      // matched a committed approvedTestChanges entry: downgraded, never hidden
  approvalReason?: string; // the human's stated reason, carried into every output format
}

/**
 * One pre-approved, genuine test change. This is the escape hatch for the legitimate case: a
 * test really does need to be deleted, rewritten, or relaxed, and the person doing it knows why.
 *
 * An approval downgrades a matching finding to `info` so it stops blocking. It never removes the
 * finding: it still prints, still appears in `--json` and `--sarif`, still shows up as a PR
 * annotation, and it withholds the honest-pass badge. Approving a change makes it non-blocking
 * and visible, not invisible.
 *
 * Approvals are read from the committed `proctor.config.json`, like the rest of the config, so a
 * change cannot approve itself in the same breath.
 */
export interface ApprovedTestChange {
  rule: string;     // verifier ID this approval covers, e.g. 'RH001'
  file: string;     // exact path or glob the approval applies to
  reason: string;   // why this change is legitimate; required, an approval without one is dropped
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
  /** Extension-based language of a path. Part of the Verifier contract: third-party verifiers
   *  use it to scope themselves to the languages they actually understand. */
  getLanguage: (filePath: string) => Language;
  severity?: Record<string, Severity>;
  ignorePatterns?: string[];
  approvedTestChanges?: ApprovedTestChange[]; // from the committed config; downgrades, never hides
  commitMessage?: string;           // git subject line from git log -1 --format=%s; undefined on empty repo
  committedDiff?: boolean;          // true only for `check --base <ref>` (a real committed range, so
                                     // commitMessage genuinely describes this diff); false/undefined for
                                     // working-tree or --staged checks, where commitMessage is whatever the
                                     // last unrelated commit happened to say, not a reason for this change
  snapshotGlobs?: string[];         // custom snapshot glob patterns from config; undefined uses RH006's defaults
  aiEnabled?: boolean;              // true only when --ai flag is passed and API key is present
  aiModel?: string;                 // model ID from config; defaults to 'claude-haiku-4-5-20251001' in CLI
  judge?: AIJudge;                  // injected by CLI when --ai is set; undefined in offline mode
}

/**
 * A Verifier checks one Claim the agent implicitly or explicitly makes
 * ("the tests pass," "I fixed the bug," "I implemented the spec") against
 * reality, by inspecting Context and producing Finding[]. Test-tampering
 * signatures (RH00x) are just the first set of Verifiers, this interface
 * is what makes every future verifier track (WI1xx, plugins) additive
 * rather than a rewrite.
 */
export interface Verifier {
  id: string;                       // e.g. 'RH001', must be unique across the registry
  severity: Severity;                // default severity for this Verifier's findings
  run(context: Context): Finding[] | Promise<Finding[]>;
}

export interface ProctorConfig {
  enabled?: string[];
  testPathGlobs?: string[];
  severity?: Record<string, Severity>;
  ignorePatterns?: string[];
  approvedTestChanges?: ApprovedTestChange[];
  aiModel?: string;          // overrides default model for AI judge
  snapshotGlobs?: string[];  // overrides default snapshot path patterns for RH006
}
