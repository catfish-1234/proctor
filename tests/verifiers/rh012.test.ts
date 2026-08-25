import { describe, it, expect } from 'vitest';
import { rh012 } from '../../src/verifiers/rh012.js';
import type { Context } from '../../src/types.js';
import type { ParsedFile } from '../../src/diff.js';

const baseCtx: Omit<Context, 'files'> = {
  cwd: '',
  testPathGlobs: ['**/*.test.ts'],
  testFiles: [],
  enabled: ['RH012'],
  isTestFile: (p: string) => p.includes('.test.'),
  getLanguage: () => 'ts' as const,
};

type Line = [type: 'add' | 'del' | 'normal', content: string];

/** Builds a single-chunk diff for one file, since every RH012 signature is chunk-scoped. */
function diffFile(filename: string, lines: Line[]): ParsedFile {
  return {
    from: filename,
    to: filename,
    chunks: [
      {
        content: '',
        changes: lines.map(([type, content], i) => ({
          type,
          [type === 'add' ? 'add' : type === 'del' ? 'del' : 'normal']: true,
          ln: i + 1,
          content,
        })) as ParsedFile['chunks'][number]['changes'],
        oldStart: 1,
        oldLines: lines.length,
        newStart: 1,
        newLines: lines.length,
      },
    ],
    deleted: false,
    new: false,
    index: [],
    deletions: 0,
    additions: 0,
  } as ParsedFile;
}

const check = (file: ParsedFile) => rh012.run({ ...baseCtx, files: [file] });

describe('RH012, CI pipeline tampering', () => {
  describe('neutered test steps', () => {
    it('flags continue-on-error added to a test step', () => {
      const findings = check(
        diffFile('.github/workflows/ci.yml', [
          ['normal', '      - name: Test'],
          ['add', '        continue-on-error: true'],
          ['normal', '        run: npm test'],
        ])
      );
      expect(findings).toHaveLength(1);
      expect(findings[0]!.severity).toBe('error');
      expect(findings[0]!.message).toContain('continue-on-error: true');
    });

    it('flags continue-on-error expressed as a constant GitHub expression', () => {
      const findings = check(diffFile('.github/workflows/ci.yml', [
        ['add', '        continue-on-error: ${{ true }}'],
        ['normal', '        run: npm test'],
      ]));
      expect(findings).toHaveLength(1);
    });

    it("flags GitLab's allow_failure on a test job", () => {
      const findings = check(
        diffFile('.gitlab-ci.yml', [
          ['normal', '  script:'],
          ['normal', '    - pytest'],
          ['add', '  allow_failure: true'],
        ])
      );
      expect(findings).toHaveLength(1);
      expect(findings[0]!.message).toContain('allow_failure: true');
    });

    it('flags a test step disabled with if: false', () => {
      const findings = check(
        diffFile('.github/workflows/ci.yml', [
          ['normal', '      - run: cargo test'],
          ['add', '        if: false'],
        ])
      );
      expect(findings).toHaveLength(1);
      expect(findings[0]!.message).toContain('never-true condition');
    });

    it('flags a test command with its exit code swallowed', () => {
      const findings = check(
        diffFile('.github/workflows/ci.yml', [['add', '        run: go test ./... || true']])
      );
      expect(findings).toHaveLength(1);
      expect(findings[0]!.message).toContain('swallowed');
    });

    it('reports set +e as a warning, since it can be re-enabled later in the same script', () => {
      const findings = check(
        diffFile('.github/workflows/ci.yml', [
          ['add', '          set +e'],
          ['normal', '          pytest'],
        ])
      );
      expect(findings).toHaveLength(1);
      expect(findings[0]!.severity).toBe('warn');
    });

    it('reports one finding per line even when several patterns describe it', () => {
      const findings = check(
        diffFile('.github/workflows/ci.yml', [['add', '        run: npm test || true # continue-on-error: true']])
      );
      expect(findings).toHaveLength(1);
    });
  });

  describe('removed test steps', () => {
    it('flags a deleted test command', () => {
      const findings = check(
        diffFile('.github/workflows/ci.yml', [['del', '      - run: npm test']])
      );
      expect(findings).toHaveLength(1);
      expect(findings[0]!.severity).toBe('error');
      expect(findings[0]!.message).toContain('no longer runs this suite');
    });

    it('does not flag a test command that only moved or was reformatted', () => {
      // Reindenting a step, or renaming `script:` to `run:`, changes the line but not what runs.
      const findings = check(
        diffFile('.github/workflows/ci.yml', [
          ['del', '      - run: npm test'],
          ['add', '        - run: "npm test"'],
        ])
      );
      expect(findings).toEqual([]);
    });
  });

  describe('contracted test matrices', () => {
    it('flags a matrix axis that silently loses a supported value', () => {
      const findings = check(
        diffFile('.github/workflows/ci.yml', [
          ['del', '        node: [20, 22]'],
          ['add', '        node: [20]'],
          ['normal', '      - run: npm test'],
        ])
      );
      expect(findings).toHaveLength(1);
      expect(findings[0]!.message).toContain('dropped 22');
    });

    it('allows a matrix expansion', () => {
      const findings = check(
        diffFile('.github/workflows/ci.yml', [
          ['del', '        node: [20]'],
          ['add', '        node: [20, 22]'],
          ['normal', '      - run: npm test'],
        ])
      );
      expect(findings).toEqual([]);
    });
  });

  it('flags source paths added to workflow paths-ignore', () => {
    const findings = check(
      diffFile('.github/workflows/ci.yml', [
        ['add', '    paths-ignore:'],
        ['add', "      - 'src/**'"],
        ['normal', '      - run: npm test'],
      ])
    );
    expect(findings.some(f => f.message.includes('trigger narrowed'))).toBe(true);
  });

  describe('carve-outs that keep ordinary pipeline edits quiet', () => {
    it('ignores continue-on-error on a step that does not run tests', () => {
      // This is the common legitimate case: an upload or a report that must not fail the build.
      const findings = check(
        diffFile('.github/workflows/ci.yml', [
          ['normal', '      - name: Upload SARIF'],
          ['add', '        continue-on-error: true'],
          ['normal', '        uses: github/codeql-action/upload-sarif@v4'],
        ])
      );
      expect(findings).toEqual([]);
    });

    it('scopes to the step, not the diff chunk, when a test step sits just above', () => {
      // Diff context is a few lines wide, so a test step two lines up lands in the same chunk as
      // an unrelated step. Reading it as one unit flags every coverage upload that follows a test
      // run, which is about the most ordinary edit these files get.
      const findings = check(
        diffFile('.github/workflows/ci.yml', [
          ['normal', '      - name: Test'],
          ['normal', '        run: npm test'],
          ['normal', '      - name: Upload coverage'],
          ['add', '        continue-on-error: true'],
          ['normal', '        uses: codecov/codecov-action@v5'],
        ])
      );
      expect(findings).toEqual([]);
    });

    it('ignores a deleted non-test command', () => {
      const findings = check(diffFile('.github/workflows/ci.yml', [['del', '      - run: npm run lint']]));
      expect(findings).toEqual([]);
    });

    it('ignores files that are not pipeline definitions', () => {
      // An application config can hold any of these keys and mean nothing by it.
      const findings = check(
        diffFile('src/config/deploy.yml', [['add', '  continue-on-error: true'], ['normal', '  run: npm test']])
      );
      expect(findings).toEqual([]);
    });
  });

  describe('pipeline formats', () => {
    it.each([
      ['.github/workflows/test.yaml'],
      ['.circleci/config.yml'],
      ['azure-pipelines.yml'],
      ['.travis.yml'],
      ['Jenkinsfile'],
      ['bitbucket-pipelines.yml'],
      ['packages/api/.github/workflows/ci.yml'],
    ])('recognizes %s as a pipeline definition', file => {
      expect(check(diffFile(file, [['del', 'sh "npm test"']]))).toHaveLength(1);
    });
  });
  describe('a workflow line that only mentions a test runner', () => {
    it('does not read a YAML comment as a deleted test command', () => {
      // From the real-commit sweep: a comment above a step was reworded, and the old wording
      // mentioned pytest, so the reword was reported as CI coverage being deleted.
      expect(check(diffFile('.github/workflows/third-party.yml', [
        ['del', '        # Instead, manually run pytest (we run core, pandas and FastAPI tests):'],
        ['add', '        # Instead, manually run pytest, one directory per process:'],
        ['normal', '        run: uv run --no-sync pytest tests/base'],
      ]))).toEqual([]);
    });

    it("does not read a composite action's input key as a deleted test command", () => {
      // Also from the sweep: `pip-install: -e . --group tox` is an input to setup-python, not a
      // call to tox, and dropping it in favour of an explicit install step is not coverage loss.
      expect(check(diffFile('.github/workflows/lint.yml', [
        ['normal', '        with:'],
        ['del', '          pip-install: -e . --group tox'],
        ['add', '      - name: Install dependencies'],
        ['add', '        run: python -m pip install -e . --group tox'],
      ]))).toEqual([]);
    });

    it('does not read a step name as a deleted test command', () => {
      expect(check(diffFile('.github/workflows/ci.yml', [
        ['del', '      - name: Run pytest'],
        ['add', '      - name: Run the unit suite'],
        ['normal', '        run: pytest'],
      ]))).toEqual([]);
    });

    it('still flags the command itself being deleted, inside a block scalar', () => {
      const findings = check(diffFile('.github/workflows/ci.yml', [
        ['normal', '        run: |'],
        ['normal', '          ruff check .'],
        ['del', '          pytest tests/'],
      ]));
      expect(findings).toHaveLength(1);
      expect(findings[0]!.message).toContain('no longer runs this suite');
    });
  });
});

describe('RH012, trigger and matrix edits that are not coverage loss', () => {
  it('does not read a narrowed branch trigger as a narrowed test matrix', () => {
    // `key: [a, b]` is ordinary YAML, so branches, tags, paths and types all looked like matrix
    // axes and narrowing any of them claimed a supported environment was no longer verified.
    expect(check(diffFile('.github/workflows/ci.yml', [
      ['normal', 'on:'],
      ['normal', '  push:'],
      ['del', '    branches: [main, develop]'],
      ['add', '    branches: [main]'],
    ]))).toEqual([]);
  });

  it('still flags a genuinely narrowed matrix axis', () => {
    const findings = check(diffFile('.github/workflows/ci.yml', [
      ['normal', '    strategy:'],
      ['normal', '      matrix:'],
      ['del', '        node-version: [18, 20, 22]'],
      ['add', '        node-version: [22]'],
    ]));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain('matrix narrowed');
  });

  it('does not flag one package excluded from a monorepo trigger', () => {
    // `packages/website/**` and `packages/core/**` are indistinguishable without knowing which
    // package holds source, so only an exclusion covering everything the workflow watched counts.
    expect(check(diffFile('.github/workflows/ci.yml', [
      ['normal', 'on:'],
      ['normal', '  push:'],
      ['add', '    paths-ignore:'],
      ['add', "      - 'packages/website/**'"],
    ]))).toEqual([]);
  });

  it('still flags the whole source tree excluded from a trigger', () => {
    const findings = check(diffFile('.github/workflows/ci.yml', [
      ['normal', 'on:'],
      ['normal', '  push:'],
      ['add', '    paths-ignore:'],
      ['add', "      - 'src/**'"],
    ]));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain('trigger narrowed');
  });
});
