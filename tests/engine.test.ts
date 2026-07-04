import { describe, it, expect } from 'vitest';
import { runChecks } from '../src/engine.js';
import type { ParsedFile } from '../src/diff.js';
import type { RepoContext, Finding } from '../src/types.js';

function makeCtx(overrides: Partial<RepoContext> = {}): RepoContext {
  return {
    cwd: '',
    testPathGlobs: [],
    testFiles: [],
    enabled: ['RH001', 'RH002', 'RH003', 'RH007'],
    isTestFile: (p: string) => p.includes('.test.'),
    getLanguage: () => 'ts' as const,
    severity: undefined,
    ignorePatterns: undefined,
    ...overrides,
  };
}

const findingA: Finding = {
  ruleId: 'RH001',
  severity: 'error',
  file: 'src/calc.test.ts',
  line: 3,
  message: 'test deleted',
  remediation: 'restore it',
};

const findingB: Finding = {
  ruleId: 'RH002',
  severity: 'error',
  file: 'src/calc.test.ts',
  line: 7,
  message: 'assertion weakened',
  remediation: 'restore it',
};

const findingRH003: Finding = {
  ruleId: 'RH003',
  severity: 'error',
  file: 'src/calc.test.ts',
  line: 5,
  message: 'test skipped',
  remediation: 'remove skip',
};

// Minimal ParsedFile stub — no chunks, just path metadata
function makeFile(to: string, chunks: ParsedFile['chunks'] = []): ParsedFile {
  return { from: to, to, deleted: false, new: false, chunks } as unknown as ParsedFile;
}

describe('runChecks', () => {
  it('returns findings from all enabled rules', () => {
    const mockSigA = (_f: ParsedFile[], _c: RepoContext): Finding[] => [findingA];
    const mockSigB = (_f: ParsedFile[], _c: RepoContext): Finding[] => [findingB];
    // Inject via the real signatures array shape — use empty files; mock sigs ignore them
    const files: ParsedFile[] = [];
    // We test via actual runChecks; to avoid depending on real signatures hitting empty files,
    // we verify the filter-by-enabled behaviour using a real finding shape.
    // To inject mock sigs we need to swap signatures[]; instead, test the enabled filter
    // with a real sig: rh003 on a file that has a .skip add-change.
    const skipFile = makeFile('src/calc.test.ts', [
      {
        content: '',
        changes: [
          { type: 'add', content: '+ it.skip("a test", () => {})', ln: 3 } as unknown as ParsedFile['chunks'][number]['changes'][number],
        ],
      } as unknown as ParsedFile['chunks'][number],
    ]);
    const result = runChecks([skipFile], makeCtx({ enabled: ['RH003'] }));
    // RH003 should fire; RH001/RH002/RH007 are also in signatures but findings not in enabled are filtered out
    expect(result.every(f => f.ruleId === 'RH003')).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    void mockSigA; void mockSigB; // silence unused
  });

  it('filters findings not in ctx.enabled', () => {
    const skipFile = makeFile('src/calc.test.ts', [
      {
        content: '',
        changes: [
          { type: 'add', content: '+ it.skip("a test", () => {})', ln: 3 } as unknown as ParsedFile['chunks'][number]['changes'][number],
        ],
      } as unknown as ParsedFile['chunks'][number],
    ]);
    // Only RH001 enabled — RH003 firing should be filtered out
    const result = runChecks([skipFile], makeCtx({ enabled: ['RH001'] }));
    expect(result.every(f => f.ruleId === 'RH001')).toBe(true);
  });

  it('suppresses finding when reason: is present in proctor-ignore comment on line above', () => {
    // RH003 finding at line 5 → look for suppress comment at line 4
    const suppressFile = makeFile('src/calc.test.ts', [
      {
        content: '',
        changes: [
          // Suppress comment at line 4
          { type: 'add', content: '+ # proctor-ignore: RH003 reason: intentional', ln: 4 } as unknown as ParsedFile['chunks'][number]['changes'][number],
          // The actual skip at line 5 (triggers RH003 finding at ln=5)
          { type: 'add', content: '+ it.skip("test", () => {})', ln: 5 } as unknown as ParsedFile['chunks'][number]['changes'][number],
        ],
      } as unknown as ParsedFile['chunks'][number],
    ]);
    const result = runChecks([suppressFile], makeCtx({ enabled: ['RH003'] }));
    // The RH003 finding at line 5 should be suppressed
    const rh003Findings = result.filter(f => f.ruleId === 'RH003' && f.line === 5);
    expect(rh003Findings).toHaveLength(0);
  });

  it('does NOT suppress when reason: is absent from proctor-ignore comment', () => {
    const suppressFile = makeFile('src/calc.test.ts', [
      {
        content: '',
        changes: [
          // Comment at line 4 without reason:
          { type: 'add', content: '+ # proctor-ignore: RH003', ln: 4 } as unknown as ParsedFile['chunks'][number]['changes'][number],
          { type: 'add', content: '+ it.skip("test", () => {})', ln: 5 } as unknown as ParsedFile['chunks'][number]['changes'][number],
        ],
      } as unknown as ParsedFile['chunks'][number],
    ]);
    const result = runChecks([suppressFile], makeCtx({ enabled: ['RH003'] }));
    const rh003Findings = result.filter(f => f.ruleId === 'RH003' && f.line === 5);
    expect(rh003Findings.length).toBeGreaterThan(0);
  });

  it('does NOT suppress when proctor-ignore comment names wrong rule', () => {
    const suppressFile = makeFile('src/calc.test.ts', [
      {
        content: '',
        changes: [
          // Comment at line 4 names RH001, not RH003
          { type: 'add', content: '+ # proctor-ignore: RH001 reason: intentional', ln: 4 } as unknown as ParsedFile['chunks'][number]['changes'][number],
          { type: 'add', content: '+ it.skip("test", () => {})', ln: 5 } as unknown as ParsedFile['chunks'][number]['changes'][number],
        ],
      } as unknown as ParsedFile['chunks'][number],
    ]);
    const result = runChecks([suppressFile], makeCtx({ enabled: ['RH003'] }));
    const rh003Findings = result.filter(f => f.ruleId === 'RH003' && f.line === 5);
    expect(rh003Findings.length).toBeGreaterThan(0);
  });

  it('filters findings by ctx.ignorePatterns', () => {
    const fixtureFile = makeFile('fixtures/some.test.ts', [
      {
        content: '',
        changes: [
          { type: 'add', content: '+ it.skip("test", () => {})', ln: 3 } as unknown as ParsedFile['chunks'][number]['changes'][number],
        ],
      } as unknown as ParsedFile['chunks'][number],
    ]);
    const result = runChecks(
      [fixtureFile],
      makeCtx({ enabled: ['RH003'], ignorePatterns: ['**/fixtures/**'] }),
    );
    expect(result).toHaveLength(0);
  });

  it('applies severity overrides from ctx.severity', () => {
    const skipFile = makeFile('src/calc.test.ts', [
      {
        content: '',
        changes: [
          { type: 'add', content: '+ it.skip("test", () => {})', ln: 3 } as unknown as ParsedFile['chunks'][number]['changes'][number],
        ],
      } as unknown as ParsedFile['chunks'][number],
    ]);
    const result = runChecks(
      [skipFile],
      makeCtx({ enabled: ['RH003'], severity: { RH003: 'warn' } }),
    );
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(f => f.severity === 'warn')).toBe(true);
  });
});
