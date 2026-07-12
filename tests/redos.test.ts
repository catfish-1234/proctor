import { describe, it, expect } from 'vitest';
import { rh002 } from '../src/verifiers/rh002.js';
import { rh004 } from '../src/verifiers/rh004.js';
import { rh010 } from '../src/verifiers/rh010.js';
import type { Context } from '../src/types.js';
import type { ParsedFile } from '../src/diff.js';

const base: Context = { cwd: '', files: [], testPathGlobs: ['**/*.test.ts'], testFiles: [], enabled: [],
  isTestFile: (p: string) => p.includes('.test.'), getLanguage: () => 'ts' as const, aiEnabled: false, judge: undefined };

function f(path: string, changes: Array<[string, string]>): ParsedFile {
  return { from: path, to: path, deleted: false, new: false, chunks: [{ content: '',
    changes: changes.map(([type, content], i) => ({ type, content, ln: i + 1, ln2: i + 1, add: type === 'add', del: type === 'del' })) as any,
    oldStart: 1, oldLines: 1, newStart: 1, newLines: 1 }] } as any;
}

// Each of these lines would hang the pipeline before the ReDoS fix. With linear regexes they
// complete in well under the 5s timeout. We assert the call returns (no hang), not a specific
// finding count.
describe('ReDoS resistance (verifier regexes are linear on adversarial input)', () => {
  const SPACES = ' '.repeat(50000);

  it('rh004 RETURN_EXPR / stripTrailingNoise do not hang', async () => {
    const files = [f('src/x.ts', [
      ['del', '-  return a' + SPACES + '}x'],
      ['add', '+  const y = z as Foo' + SPACES + ';a'],
    ])];
    const t = Date.now();
    await rh004.run({ ...base, files });
    expect(Date.now() - t).toBeLessThan(5000);
  });

  it('rh010 NETWORK_MOCK / ASSERTION_LITERAL do not hang', () => {
    const files = [f('a.test.ts', [
      ['add', '+  api.mockResolvedValue(' + SPACES],
      ['add', '+  expect(x).toBe(' + SPACES],
    ])];
    const t = Date.now();
    rh010.run({ ...base, files });
    expect(Date.now() - t).toBeLessThan(5000);
  });

  it('rh002 extractSubject does not hang', () => {
    const files = [f('a.test.ts', [
      ['del', '-  expect(total).toBe(1);'],
      ['add', '+  expect(' + SPACES],
    ])];
    const t = Date.now();
    rh002.run({ ...base, files });
    expect(Date.now() - t).toBeLessThan(5000);
  });
});
