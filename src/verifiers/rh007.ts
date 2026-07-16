// This check runs unconditionally on any config file change; it doesn't try to correlate the
// change with anything else in the diff. That's a deliberate simplification, not an oversight.
import path from 'node:path';
import type { Context, Finding, Severity, Verifier } from '../types.js';

// Covers jest/vitest config in .{m,c}{j,t}s AND jest.config.json (a supported Jest format), plus
// vite.config.* (where Vitest config commonly lives), tsconfig, and the Python config files, plus
// (LANG-03) the 6 new-language config-exclusion files: Maven pom.xml, Gradle build.gradle(.kts),
// Rust Cargo.toml, Ruby .rspec, PHPUnit phpunit.xml(.dist), and C# .runsettings, plus (LANG-10
// GROUP A) 4 more: C++/C CMakeLists.txt, Swift/Objective-C *.xctestplan, Dart dart_test.yaml, and
// Scala build.sbt, plus (LANG-10 GROUP B) 5 more: R .Rbuildignore, Haskell *.cabal, Elixir
// test_helper.exs, Lua .busted, and Clojure project.clj. Each new entry is anchored to a
// basename/extension shape so it can't false-match a similarly-named source file. VB.NET
// (.runsettings) and Groovy (build.gradle(.kts)) deliberately need no new entries here — they
// reuse the existing C#/Java(Kotlin) patterns as-is. Perl, Shell/Bash, and Julia deliberately have
// NO entry here — RESEARCH found no config-file exclusion mechanism (or safe structural analogue)
// for any of the three; they're documented gaps, not forced detectors (see 08.1-06-SUMMARY.md).
const CONFIG_FILE_RE = /(?:jest|vitest|vite)\.config\.(?:[mc]?[jt]s|json)$|(?:^|\/)jest\.config\.json$|tsconfig(?:\.[^/]*)?\.json$|(?:pytest\.ini|setup\.cfg|pyproject\.toml|conftest\.py)$|(?:^|\/)pom\.xml$|(?:^|\/)build\.gradle(?:\.kts)?$|(?:^|\/)Cargo\.toml$|(?:^|\/)\.rspec$|(?:^|\/)phpunit\.xml(?:\.dist)?$|\.runsettings$|(?:^|\/)CMakeLists\.txt$|\.xctestplan$|(?:^|\/)dart_test\.yaml$|(?:^|\/)build\.sbt$|(?:^|\/)\.Rbuildignore$|\.cabal$|(?:^|\/)test_helper\.exs$|(?:^|\/)\.busted$|(?:^|\/)project\.clj$/;

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
  // Normalize Windows backslash separators so the (?:^|\/)-anchored new-language patterns (which
  // require a forward-slash path separator, matching PROCTOR_CONFIG_RE/PACKAGE_JSON_RE's existing
  // convention below) still match an absolute Windows path.
  return CONFIG_FILE_RE.test(filePath.replace(/\\/g, '/'));
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
  if (base === 'CMakeLists.txt') return 'CMakeLists.txt';
  if (/\.xctestplan$/.test(base)) return 'xctestplan';
  if (base === 'dart_test.yaml') return 'dart_test.yaml';
  if (base === 'build.sbt') return 'build.sbt';
  if (base === '.Rbuildignore') return '.Rbuildignore';
  if (/\.cabal$/.test(base)) return '.cabal';
  if (base === 'test_helper.exs') return 'test_helper.exs';
  if (base === '.busted') return '.busted';
  if (base === 'project.clj') return 'project.clj';
  return base;
}

// Which "language" a config file belongs to, used to scope EXCLUSION_PATTERNS entries so an
// ambiguous shared token (e.g. the XML `<exclude>` tag used by both Maven and PHPUnit, at
// different severities) is only evaluated against the file type it actually applies to. This
// also prevents a coincidental keyword collision — e.g. the popular Rust `ignore` crate dependency
// line `ignore = "0.4"` in Cargo.toml — from tripping a pytest-scoped pattern now that Cargo.toml
// is a recognized config file.
type ConfigLang =
  | 'js'
  | 'pytest'
  | 'maven'
  | 'gradle'
  | 'cargo'
  | 'rspec'
  | 'phpunit'
  | 'runsettings'
  | 'cmake'
  | 'xctestplan'
  | 'dart'
  | 'sbt'
  | 'rbuild'
  | 'cabal'
  | 'exunit'
  | 'busted'
  | 'leiningen';

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
  if (base === 'CMakeLists.txt') return 'cmake';
  if (/\.xctestplan$/.test(base)) return 'xctestplan';
  if (base === 'dart_test.yaml') return 'dart';
  if (base === 'build.sbt') return 'sbt';
  if (base === '.Rbuildignore') return 'rbuild';
  if (/\.cabal$/.test(base)) return 'cabal';
  if (base === 'test_helper.exs') return 'exunit';
  if (base === '.busted') return 'busted';
  if (base === 'project.clj') return 'leiningen';
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
  { re: /\btest\s*=\s*false\b/, key: 'cargoTestFalse', severity: 'error', langs: ['cargo'], suggestionLabel: "the 'test = false'" },
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

  // --- LANG-10 GROUP A: 4 more config-file exclusion mechanisms (CMake, xctestplan, Dart, Scala) ---
  // CMake/CTest: set_tests_properties(<name> PROPERTIES ... DISABLED TRUE) is a dedicated,
  // unambiguous test-disabling property. Shared by C and C++ since the signal lives in
  // CMakeLists.txt itself, language-agnostic (both commonly build via the same CMake+CTest setup).
  { re: /set_tests_properties\([^)]*PROPERTIES[^)]*\bDISABLED\s+TRUE\b/, key: 'cmakeDisabledTest', severity: 'error', langs: ['cmake'], suggestionLabel: 'the set_tests_properties(... DISABLED TRUE)' },
  // xctestplan (JSON): a newly-added string entry inside the "skippedTests" array excludes that
  // test from the plan's run. The bare-quoted-string shape alone is too generic to trust in
  // isolation, so it's gated below (chunkMentionsSkippedTests) to only fire when the same diff
  // chunk also shows the "skippedTests" key — mirrors the Cargo [[test]]-header carve-out.
  // NOTE: `^[+-]?` (not bare `^`) — parse-diff's change.content keeps the raw +/- diff-line
  // prefix character, so a bare `^\s*` anchor would never match an added line (see 08.1-05
  // Deviations for the regression test that caught this).
  { re: /^[+-]?\s*"[^"]+"\s*,?\s*$/, key: 'xctestplanSkippedTest', severity: 'error', langs: ['xctestplan'], suggestionLabel: 'the skippedTests' },
  // Dart: exclude_tags is a dedicated selector-exclusion field (error); the per-tag
  // `tags: <tag>: skip: true/"reason"` form is more indirect since it depends on which tests
  // actually use that tag (warn) — same ambiguity tier as Maven/Gradle's tag-based excludes.
  { re: /exclude_tags\s*:/, key: 'dartExcludeTags', severity: 'error', langs: ['dart'], suggestionLabel: 'the exclude_tags' },
  { re: /^[+-]?\s*skip\s*:\s*(?:true|['"][^'"\r\n]*['"])/, key: 'dartTagSkip', severity: 'warn', langs: ['dart'], suggestionLabel: 'the skip' },
  // Scala/sbt: Tests.Exclude is a dedicated, unambiguous class-name-exclusion API (error);
  // Tests.Argument(..., "-l", "TagName") tag-based exclusion is more indirect — could be a
  // legitimate CI shard rather than an outright exclusion (warn).
  { re: /Tests\.Exclude\b/, key: 'sbtTestsExclude', severity: 'error', langs: ['sbt'], suggestionLabel: 'the Tests.Exclude' },
  { re: /Tests\.Argument\([^)]*"-l"/, key: 'sbtTestsArgumentTag', severity: 'warn', langs: ['sbt'], suggestionLabel: 'the Tests.Argument(..., "-l", ...)' },

  // --- LANG-10 GROUP B: 5 more config-file exclusion mechanisms (R, Haskell, Elixir, Lua, Clojure) ---
  // R: .Rbuildignore excludes files/paths from the package build via a plain-text list of regex
  // lines, not specifically from a test run — a blunter, more indirect signal than Jest's
  // testPathIgnorePatterns (a line here could legitimately exclude non-test files too). Any
  // added, non-comment, non-blank line is a candidate; requiresTestLikeValue below gates on the
  // line's own content looking test-like (tests/, test-, testthat), mirroring the JS/tsconfig
  // `exclude` carve-out. `(?!#)` skips comment lines, which are common and never test-exclusion
  // signal in this file format.
  { re: /^[+-]?\s*(?!#)\S/, key: 'rbuildignoreLine', severity: 'warn', langs: ['rbuild'], requiresTestLikeValue: true, suggestionLabel: 'the newly-added .Rbuildignore line' },
  // Haskell: buildable: False is a dedicated, unambiguous Cabal field, but it's also legitimate on
  // `library`/`executable` stanzas — carved out below (chunkMentionsTestSuite) to only fire when
  // the same diff chunk shows a `test-suite` stanza header, mirroring Cargo's `[[test]]`-header
  // gate.
  { re: /\bbuildable\s*:\s*False\b/, key: 'cabalBuildableFalse', severity: 'error', langs: ['cabal'], suggestionLabel: 'the buildable: False' },
  // Elixir: ExUnit.start(exclude: [...]) / ExUnit.configure(exclude: [...]) in test_helper.exs is
  // an unambiguous, dedicated ExUnit API for excluding tagged tests from every future run.
  { re: /ExUnit\.(?:start|configure)\([^)]*\bexclude\s*:/, key: 'exunitExclude', severity: 'error', langs: ['exunit'], suggestionLabel: 'the ExUnit.start/configure(exclude: ...)' },
  // Lua: busted's ["exclude-tags"] config key (or the CLI-mirroring exclude_tags form) is a
  // dedicated, unambiguous exclusion mechanism.
  { re: /\[\s*["']exclude-tags["']\s*\]\s*=|\bexclude_tags\s*=/, key: 'bustedExcludeTags', severity: 'error', langs: ['busted'], suggestionLabel: 'the exclude-tags' },
  // Clojure: :test-selectors in project.clj wraps an arbitrary Clojure function form — a regex
  // can detect the key was touched but not reliably classify "narrows" (a cheat) vs. "widens"
  // (legitimate) the set of tests that run. Resolved to `warn` per RESEARCH Open Question 3:
  // key-touched-not-value-analyzed, not overclaimed as `error` precision.
  { re: /:test-selectors\b/, key: 'leiningenTestSelectors', severity: 'warn', langs: ['leiningen'], suggestionLabel: 'the :test-selectors' },
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
      // xctestplan's bare-quoted-string shape (`"CalculatorTests/testFoo()"`) is too generic to
      // trust on its own — only treat it as a skipped-test entry when the same chunk also shows
      // the "skippedTests" array key.
      const chunkMentionsSkippedTests = chunk.changes.some(c => /skippedTests/.test(c.content));
      // Haskell's `buildable: False` is also legitimate on `library`/`executable` stanzas — only
      // treat it as a test-exclusion cheat when the same chunk shows a `test-suite` stanza header
      // (case-insensitive per Cabal's stanza-type keyword rules). Also capture the stanza's name
      // (if present in the same chunk) for the finding's excludedVal.
      const chunkMentionsTestSuite = chunk.changes.some(c => /\btest-suite\b/i.test(c.content));
      const testSuiteNameMatch = chunk.changes
        .map(c => c.content.match(/\btest-suite\s+([A-Za-z0-9_-]+)/i))
        .find((m): m is RegExpMatchArray => m !== null);

      for (const change of chunk.changes) {
        if (change.type !== 'add') continue;

        const matched = matchExclusion(change.content, lang);
        if (!matched) continue;

        const { pattern, afterMatch } = matched;

        if (pattern.key === 'cargoTestFalse' && !chunkMentionsTestTarget) continue;
        if (pattern.key === 'xctestplanSkippedTest' && !chunkMentionsSkippedTests) continue;
        if (pattern.key === 'cabalBuildableFalse' && !chunkMentionsTestSuite) continue;

        const quotedMatch = afterMatch.match(/['"`]([^'"`\r\n]+)['"`]/);
        // XML tag-content fallback (`<exclude>CalculatorTest.java</exclude>`) — value sits
        // between the opening tag we matched and the next `<`.
        const xmlMatch = afterMatch.match(/^([^<>\r\n]+)</);
        let excludedVal = quotedMatch ? quotedMatch[1]! : xmlMatch ? xmlMatch[1]!.trim() : 'test files';

        // CMake's set_tests_properties(...) and xctestplan's bare-quoted-string entry both carry
        // their value inside the matched text itself (not after it), so the generic afterMatch
        // extraction above finds nothing for them — pull the value from the full line instead.
        if (pattern.key === 'cmakeDisabledTest') {
          const nameMatch = change.content.match(/set_tests_properties\(\s*([A-Za-z0-9_]+)/);
          if (nameMatch) excludedVal = nameMatch[1]!;
        } else if (pattern.key === 'xctestplanSkippedTest') {
          const nameMatch = change.content.match(/"([^"]+)"/);
          if (nameMatch) excludedVal = nameMatch[1]!;
        } else if (pattern.key === 'rbuildignoreLine') {
          // The whole added line IS the exclusion value (a plain-text regex pattern), not a value
          // sitting after a keyword — extract it directly rather than via the generic
          // quoted/XML afterMatch extraction, which finds nothing for this bare-line format.
          excludedVal = stripDiffPrefix(change.content);
        } else if (pattern.key === 'cabalBuildableFalse' && testSuiteNameMatch) {
          excludedVal = testSuiteNameMatch[1]!;
        } else if (pattern.key === 'exunitExclude') {
          // The excluded value is an Elixir atom (`:integration`) inside a list, not a quoted
          // string — extract the atom name directly after the matched `exclude:` key.
          const atomMatch = afterMatch.match(/:([A-Za-z_][A-Za-z0-9_]*)/);
          if (atomMatch) excludedVal = atomMatch[1]!;
        } else if (pattern.key === 'leiningenTestSelectors') {
          // The selector value is an arbitrary Clojure function form (e.g. `(complement
          // :integration)`) — take the last `:keyword` atom in the matched value as the excluded
          // tag name, a reasonable approximation without evaluating the form.
          const atoms = [...afterMatch.matchAll(/:([\w-]+)/g)].map(m => m[1]!);
          if (atoms.length > 0) excludedVal = atoms[atoms.length - 1]!;
        }

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
