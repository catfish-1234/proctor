import type { TSESTree } from '@typescript-eslint/typescript-estree';
import type { AIJudge } from './ai/judge.js';

export type Severity = 'error' | 'warn' | 'info';

export interface Finding {
  ruleId: string;       // e.g. 'RH001'
  severity: Severity;
  file: string;         // relative path
  line: number;         // 1-indexed
  message: string;      // one sentence
  remediation: string;  // one sentence guidance
}

export interface RepoContext {
  cwd: string;
  testPathGlobs: string[];
  testFiles: string[];            // resolved from globs
  enabled: string[];              // enabled rule IDs
  isTestFile: (path: string) => boolean;
  getLanguage: (filePath: string) => 'ts' | 'js' | 'python' | 'unknown';
  severity?: Record<string, Severity>;
  ignorePatterns?: string[];
  // Phase 4 additions:
  commitMessage?: string;           // git subject line from git log -1 --format=%s; undefined on empty repo
  snapshotGlobs?: string[];         // custom snapshot glob patterns from config; undefined uses RH006's defaults
  aiEnabled?: boolean;              // true only when --ai flag is passed and API key is present
  aiModel?: string;                 // model ID from config; defaults to 'claude-haiku-4-5-20251001' in CLI
  judge?: AIJudge;                  // injected by CLI when --ai is set; undefined in offline mode
  ast?: Map<string, TSESTree.Program>; // populated by engine pre-pass; undefined when not needed (TSESTree.Program, NOT ParseResult)
}

export interface ProctorConfig {
  enabled?: string[];
  testPathGlobs?: string[];
  severity?: Record<string, Severity>;
  ignorePatterns?: string[];
  approvedTestChanges?: string[];
  // Phase 4 additions:
  aiModel?: string;          // overrides default model for AI judge
  snapshotGlobs?: string[];  // overrides default snapshot path patterns for RH006
}
