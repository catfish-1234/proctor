// This check runs unconditionally on any config file change; it doesn't try to correlate the
// change with anything else in the diff. That's a deliberate simplification, not an oversight.
import path from 'node:path';
import type { Context, Finding, Severity, Verifier } from '../types.js';

// Covers jest/vitest config in .{m,c}{j,t}s AND jest.config.json (a supported Jest format), plus
// vite.config.* (where Vitest config commonly lives), tsconfig, and the Python config files, plus
// (LANG-03) the 6 new-language config-exclusion files: Maven pom.xml, Gradle build.gradle(.kts),
// Rust Cargo.toml, Ruby .rspec, PHPUnit phpunit.xml(.dist), and C# .runsettings. Each new entry is
// anchored to a basename/extension shape so it can't false-match a similarly-named source file.
const CONFIG_FILE_RE = /(?:jest|vitest|vite)\.config\.(?:[mc]?[jt]s|json)$|(?:^|\/)jest\.config\.json$|tsconfig(?:\.[^/]*)?\.json$|(?:pytest\.ini|setup\.cfg|pyproject\.toml|conftest\.py)$|(?:^|\/)pom\.xml$|(?:^|\/)build\.gradle(?:\.kts)?$|(?:^|\/)Cargo\.toml$|(?:^|\/)\.rspec$|(?:^|\/)phpunit\.xml(?:\.dist)?$|\.runsettings$/;

// package.json can carry a Jest config inline ("jest": { "testPathIgnorePatterns": [...] }). It is
// not a dedicated config file, so it's handled separately and only for testPathIgnorePatterns —
// the unambiguous "exclude tests from the run" key. testMatch/testRegex are omitted here because
// a first-time add is indistinguishable from a narrowing edit on a single line.
const PACKAGE_JSON_RE = /(?:^|\/)package\.json$/;
const JEST_EXCLUSION_KEY_RE = /"(testPathIgnorePatterns)"\s*:/;

// proctor's own config: enforcement is pinned to the committed version (see buildContext's
// configRef), so an in-diff edit can't neuter checks — but the edit itself is still worth
// surfacing, since it changes what future runs enforce.
const PROCTOR_CONFIG_RE = /(?:^|\/)proctor\.config\.json$/;
const PROCTOR_ENFORCEMENT_KEY_RE = /"(enabled|ignorePatterns|severity|testPathGlobs|snapshotGlobs)"\s*:/;

// Go has no dedicated exclusion config file the way Jest/pytest/PHPUnit do (RESEARCH RH007
// section B). Its closest equivalent is a build-tag directive added to the top of an existing
// _test.go file: without passing the tag at `go test -tags <tag>` time, the whole file is
// silently excluded from compilation and therefore from every future test run — functionally
// identical to testPathIgnorePatterns, but expressed as an in-file directive on the test file
// itself, not a separate config file. This is a structurally distinct branch (closer to RH003's
// "directive added to a test file" model than to this file's CONFIG_FILE_RE model — see Pitfall
// 2 in RESEARCH), restricted strictly to _test.go files so an ordinary build tag on regular Go
// source never fires.
function isGoTestFile(filePath: string): boolean {
  return /_test\.go$/.test(filePath);
}

function stripDiffPrefix(content: string): string {
  return content.replace(/^[+-]/, '').trim();
}

function isGoBuildTagLine(content: string): boolean {
  return /^\/\/go:build\b/.test(content) || /^\/\/\s*\+build\b/.test(content);
}

function isConfigFile(filePath: string): boolean {
  return CONFIG_FILE_RE.test(filePath);
}

function configLabel(filePath: string): string {
  const base = path.basename(filePath);
  if (/^jest\.config\./.test(base)) return 'jest config';
  if (/^vitest\.config\./.test(base)) return 'vitest config';
  if (/^vite\.config\./.test(base)) return 'vite/vitest config';
  if (/^tsconfig/.test(base)) return 'tsconfig';
  if (base === 'pytest.ini') return 'pytest config';
  if (base === 'pom.xml') return 'Maven pom.xml';
  if (/^build\.gradle(?:\.kts)?$/.test(base)) return 'Gradle build script';
  if (base === 'Cargo.toml') return 'Cargo.toml';
  if (base === '.rspec') return 'RSpec config (.rspec)';
  if (/^phpunit\.xml(?:\.dist)?$/.test(base)) return 'PHPUnit config';
  if (/\.runsettings$/.test(base)) return '.runsettings';
  return base;
}

// Which "language" a config file belongs to, used to scope EXCLUSION_PATTERNS entries so an
// ambiguous shared token (e.g. the XML `<exclude>` tag used by both Maven and PHPUnit, at
// different severities) is only evaluated against the file type it actually applies to. This
// also prevents a coincidental keyword collision — e.g. the popular Rust `ignore` crate dependency
// line `ignore = "0.4"` in Cargo.toml — from tripping a pytest-scoped pattern now that Cargo.toml
// is a recognized config file.
type ConfigLang = 'js' | 'pytest' | 'maven' | 'gradle' | 'cargo' | 'rspec' | 'phpunit' | 'runsettings';

function configLang(filePath: string): ConfigLang | null {
  const base = path.basename(filePath);
  if (/^(?:jest|vitest|vite)\.config\./.test(base) || base === 'jest.config.json' || /^tsconfig/.test(base)) return 'js';
  if (base === 'pytest.ini' || base === 'setup.cfg' || base === 'pyproject.toml' || base === 'conftest.py') return 'pytest';
  if (base === 'pom.xml') return 'maven';
  if (/^build\.gradle(?:\.kts)?$/.test(base)) return 'gradle';
  if (base === 'Cargo.toml') return 'cargo';
  if (base === '.rspec') return 'rspec';
  if (/^phpunit\.xml(?:\.dist)?$/.test(base)) return 'phpunit';
  if (/\.runsettings$/.test(base)) return 'runsettings';
  return null;
}

interface ExclusionPattern {
  re: RegExp;
  key: string;
  severity: Severity;
  langs: ConfigLang[];
  // Ambiguous bare keys (JS/tsconfig `exclude`) only count when the excluded value looks
  // test-like and the chunk isn't a routine coverage-exclude block — mirrors the original
  // carve-out, now expressed as data instead of a key-name string comparison.
  requiresTestLikeValue?: boolean;
  // Human-readable label used in the suggestion text in place of the raw internal key.
  suggestionLabel?: string;
}

const EXCLUSION_PATTERNS: ExclusionPattern[] = [
  { re: /testPathIgnorePatterns/, key: 'testPathIgnorePatterns', severity: 'error', langs: ['js'] },
  { re: /testMatch\b/, key: 'testMatch', severity: 'error', langs: ['js'] },
  { re: /testRegex\b/, key: 'testRegex', severity: 'error', langs: ['js'] },
  { re: /"exclude"\s*:/, key: '"exclude"', severity: 'warn', langs: ['js'], requiresTestLikeValue: true },
  // Unquoted object key in a TS/JS config (vitest `test.exclude`). Kept after the quoted JSON
  // form so tsconfig lines keep their existing key label. Gated below on a test-looking value,
  // since `coverage.exclude` in the same files is routine and not a test-run exclusion.
  { re: /\bexclude\s*:/, key: 'exclude', severity: 'warn', langs: ['js'], requiresTestLikeValue: true },
  { re: /norecursedirs/, key: 'norecursedirs', severity: 'error', langs: ['pytest'] },
  { re: /ignore\s*=/, key: 'ignore', severity: 'error', langs: ['pytest'] },
  { re: /testpaths\s*=/, key: 'testpaths', severity: 'error', langs: ['pytest'] },
  { re: /collect_ignore/, key: 'collect_ignore', severity: 'error', langs: ['pytest'] },
  // pytest addopts with a -k/-m/--deselect expression deselects matching tests from every run.
  // Ambiguous (can be legit default selection), so reported as warn below.
  { re: /\baddopts\b[^\n]*(?:\s-k\b|\s-m\b|--deselect\b)/, key: 'addopts', severity: 'warn', langs: ['pytest'] },

  // --- LANG-03: 6 new-language config-file exclusion mechanisms ---
  // Maven Surefire: <exclude>...</exclude> or <excludedGroups>...</excludedGroups> inside the
  // surefire plugin's <configuration> block. pom.xml edits are broad, so this stays warn.
  { re: /<exclude>|<excludedGroups>/, key: 'mavenExclude', severity: 'warn', langs: ['maven'], suggestionLabel: 'the <exclude>/<excludedGroups> surefire' },
  // Gradle: dedicated `excludeTestsMatching` (Kotlin DSL filter block) or a bare `exclude '...'`
  // inside a `test { }` block (Groovy). Both warn — `exclude` is also a common Gradle key for
  // unrelated dependency exclusion, same ambiguity rationale as Maven.
  { re: /excludeTestsMatching/, key: 'excludeTestsMatching', severity: 'warn', langs: ['gradle'], suggestionLabel: 'the excludeTestsMatching' },
  { re: /\bexclude\s+['"][^'"\r\n]+['"]/, key: 'gradleExclude', severity: 'warn', langs: ['gradle'], suggestionLabel: 'the exclude' },
  // Cargo: `test = false` under a `[[test]]` target disables that named integration-test target
  // from `cargo test` — a dedicated, unambiguous key (verified against
  // doc.rust-lang.org/cargo/reference/cargo-targets.html "The test field" — see SUMMARY), so
  // error. Carved out below to only fire when the same diff chunk shows a `[[test]]` header,
  // since the identical key is also legitimate on `[[bin]]`/`[[example]]` targets.
  { re: /\btest\s*=\s*false\b/, key: 'cargoTestFalse', severity: 'error', langs: ['cargo'] },
  // RSpec: --exclude-pattern is a dedicated, unambiguous exclusion flag in .rspec.
  { re: /--exclude-pattern\b/, key: 'rspecExcludePattern', severity: 'error', langs: ['rspec'], suggestionLabel: 'the --exclude-pattern' },
  // PHPUnit: <exclude> inside <testsuite> is unambiguous (error); group-based exclusion is more
  // indirect (warn).
  { re: /<exclude>/, key: 'phpunitExclude', severity: 'error', langs: ['phpunit'], suggestionLabel: 'the <exclude>' },
  { re: /<excludeGroup>|<group>/, key: 'phpunitGroup', severity: 'warn', langs: ['phpunit'], suggestionLabel: 'the <excludeGroup>/<group>' },
  // C# .runsettings: <TestCaseFilter>/<Filter> narrows or excludes tests run by `dotnet test`.
  // Filter expressions can legitimately narrow to a CI shard rather than exclude tests outright,
  // so this stays warn (same ambiguity tier as Maven/Gradle).
  { re: /<TestCaseFilter>|<Filter>/, key: 'runsettingsFilter', severity: 'warn', langs: ['runsettings'], suggestionLabel: 'the <TestCaseFilter>/<Filter>' },
];

function matchExclusion(content: string, lang: ConfigLang | null): { pattern: ExclusionPattern; afterMatch: string } | null {
  if (!lang) return null;
  for (const pattern of EXCLUSION_PATTERNS) {
    if (!pattern.langs.includes(lang)) continue;
    const m = pattern.re.exec(content);
    if (m) return { pattern, afterMatch: content.slice(m.index + m[0].length) };
  }
  return null;
}

function buildMessage(pattern: ExclusionPattern, filePath: string, excludedVal: string): string {
  if (pattern.key === 'cargoTestFalse') {
    return `Cargo.toml test target disabled via 'test = false' under [[test]], excluding it from \`cargo test\`.`;
  }
  return `Test path ignore pattern added to ${configLabel(filePath)} excluding ${excludedVal}.`;
}

function run(context: Context): Finding[] {
  const files = context.files;
  const findings: Finding[] = [];

  for (const file of files) {
    const filePath = file.to ?? file.from ?? '';

    if (PROCTOR_CONFIG_RE.test(filePath.replace(/\\/g, '/'))) {
      for (const chunk of file.chunks) {
        for (const change of chunk.changes) {
          if (change.type !== 'add') continue;
          const keyMatch = change.content.match(PROCTOR_ENFORCEMENT_KEY_RE);
          if (!keyMatch) continue;
          findings.push({
            verifierId: 'RH007',
            severity: 'warn',
            file: filePath,
            line: change.ln,
            message: `proctor.config.json '${keyMatch[1]!}' modified in this change — enforcement settings changed for future runs.`,
            suggestion: 'Review the config change; this run still enforces the committed configuration.',
          });
        }
      }
      continue;
    }

    // package.json: only jest-specific exclusion keys count, so unrelated edits don't fire.
    if (PACKAGE_JSON_RE.test(filePath.replace(/\\/g, '/'))) {
      for (const chunk of file.chunks) {
        for (const change of chunk.changes) {
          if (change.type !== 'add') continue;
          const keyMatch = change.content.match(JEST_EXCLUSION_KEY_RE);
          if (!keyMatch) continue;
          const quoted = change.content.slice(change.content.indexOf(keyMatch[0]) + keyMatch[0].length).match(/['"`]([^'"`\r\n]+)['"`]/);
          findings.push({
            verifierId: 'RH007',
            severity: 'error',
            file: filePath,
            line: change.ln,
            message: `Test path ignore pattern added to package.json Jest config excluding ${quoted ? quoted[1] : 'test files'}.`,
            suggestion: `Remove the ${keyMatch[1]!} entry added in this change.`,
          });
        }
      }
      continue;
    }

    // Go build-tag-on-test-file branch: language-scoped to _test.go files only, so it can't
    // run against non-Go files or Go source files outside the test-file naming convention.
    if (isGoTestFile(filePath)) {
      // A build tag that merely moved (e.g. reformatted onto an adjacent line) shouldn't be
      // re-flagged as newly added — collect any build-tag lines removed anywhere in this file's
      // diff first, so an added line with identical tag text can be recognized as a non-cheat.
      const deletedTagLines = new Set<string>();
      for (const chunk of file.chunks) {
        for (const change of chunk.changes) {
          if (change.type !== 'del') continue;
          const stripped = stripDiffPrefix(change.content);
          if (isGoBuildTagLine(stripped)) deletedTagLines.add(stripped);
        }
      }

      for (const chunk of file.chunks) {
        for (const change of chunk.changes) {
          if (change.type !== 'add') continue;
          const stripped = stripDiffPrefix(change.content);
          if (!isGoBuildTagLine(stripped)) continue;
          if (deletedTagLines.has(stripped)) continue;

          findings.push({
            verifierId: 'RH007',
            severity: 'error',
            file: filePath,
            line: change.ln,
            message: `Build tag '${stripped}' added to test file ${path.basename(filePath)}, silently excluding it from \`go test\` unless the tag is passed.`,
            suggestion: 'Remove the build tag or document why this test file is gated behind it.',
          });
        }
      }
      continue;
    }

    if (!isConfigFile(filePath)) continue;

    const lang = configLang(filePath);

    for (const chunk of file.chunks) {
      // A bare `exclude:` inside a coverage block (`coverage.exclude` in vitest/jest) routinely
      // lists test globs and is not a test-run exclusion — skip the bare-key heuristic for the
      // whole chunk when coverage context is visible in it.
      const chunkMentionsCoverage = chunk.changes.some(c => /\bcoverage\b/.test(c.content));
      // Cargo's `test = false` key is also legitimate (and common) on [[bin]]/[[example]]
      // targets — only treat it as a test-exclusion cheat when the same chunk shows a `[[test]]`
      // target header.
      const chunkMentionsTestTarget = chunk.changes.some(c => /\[\[test\]\]/.test(c.content));

      for (const change of chunk.changes) {
        if (change.type !== 'add') continue;

        const matched = matchExclusion(change.content, lang);
        if (!matched) continue;

        const { pattern, afterMatch } = matched;

        if (pattern.key === 'cargoTestFalse' && !chunkMentionsTestTarget) continue;

        const quotedMatch = afterMatch.match(/['"`]([^'"`\r\n]+)['"`]/);
        // XML tag-content fallback (`<exclude>CalculatorTest.java</exclude>`) — value sits
        // between the opening tag we matched and the next `<`.
        const xmlMatch = afterMatch.match(/^([^<>\r\n]+)</);
        const excludedVal = quotedMatch ? quotedMatch[1]! : xmlMatch ? xmlMatch[1]!.trim() : 'test files';

        if (pattern.requiresTestLikeValue && (chunkMentionsCoverage || !/test|spec/i.test(excludedVal))) continue;

        findings.push({
          verifierId: 'RH007',
          severity: pattern.severity,
          file: filePath,
          line: change.ln,
          message: buildMessage(pattern, filePath, excludedVal),
          suggestion: `Remove ${pattern.suggestionLabel ?? pattern.key} entry added in this change.`,
        });
      }
    }
  }

  return findings;
}

export const rh007: Verifier = { id: 'RH007', severity: 'error', run };
