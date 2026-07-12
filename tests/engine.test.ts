import { describe, it, expect } from 'vitest';
import { runChecks } from '../src/engine.js';
import type { ParsedFile } from '../src/diff.js';
import type { Context } from '../src/types.js';

function makeCtx(overrides: Partial<Context> = {}): Context {
  return {
    cwd: '',
    files: [],
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

// Minimal ParsedFile stub — no chunks, just path metadata
function makeFile(to: string, chunks: ParsedFile['chunks'] = []): ParsedFile {
  return { from: to, to, deleted: false, new: false, chunks } as unknown as ParsedFile;
}

describe('runChecks', () => {
  it('returns findings from all enabled verifiers', async () => {
    const skipFile = makeFile('src/calc.test.ts', [
      {
        content: '',
        changes: [
          { type: 'add', content: '+ it.skip("a test", () => {})', ln: 3 } as unknown as ParsedFile['chunks'][number]['changes'][number],
        ],
      } as unknown as ParsedFile['chunks'][number],
    ]);
    const result = await runChecks(makeCtx({ files: [skipFile], enabled: ['RH003'] }));
    // RH003 should fire; other verifiers in the registry are pre-filtered out by ctx.enabled
    expect(result.every(f => f.verifierId === 'RH003')).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('filters findings not in ctx.enabled', async () => {
    const skipFile = makeFile('src/calc.test.ts', [
      {
        content: '',
        changes: [
          { type: 'add', content: '+ it.skip("a test", () => {})', ln: 3 } as unknown as ParsedFile['chunks'][number]['changes'][number],
        ],
      } as unknown as ParsedFile['chunks'][number],
    ]);
    // Only RH001 enabled — RH003 firing should never run (pre-filtered by registry)
    const result = await runChecks(makeCtx({ files: [skipFile], enabled: ['RH001'] }));
    expect(result.every(f => f.verifierId === 'RH001')).toBe(true);
  });

  it('suppresses finding when reason: is present in proctor-ignore comment on line above', async () => {
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
    const result = await runChecks(makeCtx({ files: [suppressFile], enabled: ['RH003'] }));
    // The RH003 finding at line 5 should be suppressed
    const rh003Findings = result.filter(f => f.verifierId === 'RH003' && f.line === 5);
    expect(rh003Findings).toHaveLength(0);
  });

  it('does NOT suppress when the proctor-ignore marker is on a DELETED line (removed justification)', async () => {
    // The marker and the flagged skip are both present, but the marker line is being removed.
    const file = makeFile('src/calc.test.ts', [
      {
        content: '',
        changes: [
          { type: 'del', content: '- # proctor-ignore: RH003 reason: legacy', ln: 4 } as unknown as ParsedFile['chunks'][number]['changes'][number],
          { type: 'add', content: '+ it.skip("test", () => {})', ln: 5 } as unknown as ParsedFile['chunks'][number]['changes'][number],
        ],
      } as unknown as ParsedFile['chunks'][number],
    ]);
    const result = await runChecks(makeCtx({ files: [file], enabled: ['RH003'] }));
    expect(result.filter(f => f.verifierId === 'RH003' && f.line === 5).length).toBeGreaterThan(0);
  });

  it('does not suppress via a marker in a file whose path merely ends with the finding file name', async () => {
    // foo.test.ts has the skip (finding); myfoo.test.ts has a valid marker at the same lines.
    // A bare endsWith match would let myfoo.test.ts's marker suppress foo.test.ts's finding.
    const colliderFile = makeFile('myfoo.test.ts', [
      {
        content: '',
        changes: [
          { type: 'add', content: '+ # proctor-ignore: RH003 reason: intentional', ln: 4 } as unknown as ParsedFile['chunks'][number]['changes'][number],
          { type: 'add', content: '+ const unrelated = 1;', ln: 5 } as unknown as ParsedFile['chunks'][number]['changes'][number],
        ],
      } as unknown as ParsedFile['chunks'][number],
    ]);
    const skipFile = makeFile('foo.test.ts', [
      {
        content: '',
        changes: [
          { type: 'add', content: '+ it.skip("test", () => {})', ln: 5 } as unknown as ParsedFile['chunks'][number]['changes'][number],
        ],
      } as unknown as ParsedFile['chunks'][number],
    ]);
    const result = await runChecks(makeCtx({ files: [colliderFile, skipFile], enabled: ['RH003'] }));
    const fooFindings = result.filter(f => f.verifierId === 'RH003' && f.file === 'foo.test.ts');
    expect(fooFindings).toHaveLength(1);
  });

  it('does NOT suppress when reason: is absent from proctor-ignore comment', async () => {
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
    const result = await runChecks(makeCtx({ files: [suppressFile], enabled: ['RH003'] }));
    const rh003Findings = result.filter(f => f.verifierId === 'RH003' && f.line === 5);
    expect(rh003Findings.length).toBeGreaterThan(0);
  });

  it('suppresses when the proctor-ignore marker is an inline trailing comment on the SAME line as the flagged change', async () => {
    const suppressFile = makeFile('src/calc.test.ts', [
      {
        content: '',
        changes: [
          {
            type: 'add',
            content: '+ it.skip("test", () => {}) # proctor-ignore: RH003 reason: intentional',
            ln: 5,
          } as unknown as ParsedFile['chunks'][number]['changes'][number],
        ],
      } as unknown as ParsedFile['chunks'][number],
    ]);
    const result = await runChecks(makeCtx({ files: [suppressFile], enabled: ['RH003'] }));
    const rh003Findings = result.filter(f => f.verifierId === 'RH003' && f.line === 5);
    expect(rh003Findings).toHaveLength(0);
  });

  it('suppresses when the proctor-ignore marker is added in the same commit, elsewhere in the same chunk', async () => {
    // Marker is neither on the flagged line nor immediately above it -- a few lines away in the
    // same hunk, e.g. a developer adding one reason comment near the top of a multi-line change.
    const suppressFile = makeFile('src/calc.test.ts', [
      {
        content: '',
        changes: [
          { type: 'add', content: '+ # proctor-ignore: RH003 reason: intentional, see PR description', ln: 2 } as unknown as ParsedFile['chunks'][number]['changes'][number],
          { type: 'normal', content: '  describe("suite", () => {', ln2: 3 } as unknown as ParsedFile['chunks'][number]['changes'][number],
          { type: 'add', content: '+ it.skip("test", () => {})', ln: 5 } as unknown as ParsedFile['chunks'][number]['changes'][number],
        ],
      } as unknown as ParsedFile['chunks'][number],
    ]);
    const result = await runChecks(makeCtx({ files: [suppressFile], enabled: ['RH003'] }));
    const rh003Findings = result.filter(f => f.verifierId === 'RH003' && f.line === 5);
    expect(rh003Findings).toHaveLength(0);
  });

  it('does NOT suppress a finding in a DIFFERENT chunk from where the marker was added', async () => {
    const suppressFile = makeFile('src/calc.test.ts', [
      {
        content: '',
        changes: [
          { type: 'add', content: '+ # proctor-ignore: RH003 reason: intentional', ln: 2 } as unknown as ParsedFile['chunks'][number]['changes'][number],
        ],
      } as unknown as ParsedFile['chunks'][number],
      {
        content: '',
        changes: [
          { type: 'add', content: '+ it.skip("test", () => {})', ln: 40 } as unknown as ParsedFile['chunks'][number]['changes'][number],
        ],
      } as unknown as ParsedFile['chunks'][number],
    ]);
    const result = await runChecks(makeCtx({ files: [suppressFile], enabled: ['RH003'] }));
    const rh003Findings = result.filter(f => f.verifierId === 'RH003' && f.line === 40);
    expect(rh003Findings.length).toBeGreaterThan(0);
  });

  it('does NOT suppress when proctor-ignore comment names wrong rule', async () => {
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
    const result = await runChecks(makeCtx({ files: [suppressFile], enabled: ['RH003'] }));
    const rh003Findings = result.filter(f => f.verifierId === 'RH003' && f.line === 5);
    expect(rh003Findings.length).toBeGreaterThan(0);
  });

  it('filters findings by ctx.ignorePatterns', async () => {
    const fixtureFile = makeFile('fixtures/some.test.ts', [
      {
        content: '',
        changes: [
          { type: 'add', content: '+ it.skip("test", () => {})', ln: 3 } as unknown as ParsedFile['chunks'][number]['changes'][number],
        ],
      } as unknown as ParsedFile['chunks'][number],
    ]);
    const result = await runChecks(
      makeCtx({ files: [fixtureFile], enabled: ['RH003'], ignorePatterns: ['**/fixtures/**'] }),
    );
    expect(result).toHaveLength(0);
  });

  it('applies severity overrides from ctx.severity', async () => {
    const skipFile = makeFile('src/calc.test.ts', [
      {
        content: '',
        changes: [
          { type: 'add', content: '+ it.skip("test", () => {})', ln: 3 } as unknown as ParsedFile['chunks'][number]['changes'][number],
        ],
      } as unknown as ParsedFile['chunks'][number],
    ]);
    const result = await runChecks(
      makeCtx({ files: [skipFile], enabled: ['RH003'], severity: { RH003: 'warn' } }),
    );
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(f => f.severity === 'warn')).toBe(true);
  });

  // proctor-ignore: RH003 reason: planted fixture string exercising the engine, not a real disabled test
  it('a throwing AI judge does not discard other verifiers\' findings (allSettled + judge catch)', async () => {
    // RH003 fires deterministically; RH004 has a fuzzy candidate whose judge throws (e.g. a 429).
    const testFile = makeFile('src/calc.test.ts', [
      { content: '', changes: [
        { type: 'add', content: '+ it.skip("x", () => {})', ln: 3 } as unknown as ParsedFile['chunks'][number]['changes'][number],
        { type: 'add', content: '+ expect(r).toBe(99)', ln: 4 } as unknown as ParsedFile['chunks'][number]['changes'][number],
      ] } as unknown as ParsedFile['chunks'][number],
    ]);
    const implFile = makeFile('src/calc.ts', [
      { content: '', changes: [
        { type: 'add', content: '+  return 99;', ln: 2 } as unknown as ParsedFile['chunks'][number]['changes'][number],
      ] } as unknown as ParsedFile['chunks'][number],
    ]);
    const throwingJudge = { judge: async () => { throw new Error('429 rate limited'); } };
    const result = await runChecks(makeCtx({
      files: [testFile, implFile], enabled: ['RH003', 'RH004'],
      aiEnabled: true, judge: throwingJudge,
    }));
    // The RH003 finding must survive the judge failure.
    expect(result.some(f => f.verifierId === 'RH003')).toBe(true);
  });
});

describe('runChecks AST pre-pass', () => {
  it('ctx.ast is empty when only RH001/RH003 are enabled (AST not needed)', async () => {
    const ctx = makeCtx({ files: [], enabled: ['RH001', 'RH003'] });
    await runChecks(ctx);
    expect(ctx.ast).toBeDefined();
    expect(ctx.ast!.size).toBe(0);
  });

  it('ctx.ast is a Map when RH004 is enabled (AST pre-pass ran)', async () => {
    const ctx = makeCtx({ files: [], enabled: ['RH004'] });
    await runChecks(ctx);
    expect(ctx.ast).toBeDefined();
    expect(ctx.ast).toBeInstanceOf(Map);
  });
});
