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
}

export interface ProctorConfig {
  enabled?: string[];
  testPathGlobs?: string[];
  severity?: Record<string, Severity>;
  ignorePatterns?: string[];
  approvedTestChanges?: string[];
}
