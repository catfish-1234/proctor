import type { Context, Finding, Verifier } from '../types.js';

const SUPPRESSION_PATTERNS = [
  /@ts-ignore\b/,
  /@ts-expect-error\b/,
  /#\s*type:\s*ignore\b/,
  /#\s*noqa\b/,
  /eslint-disable(?:-next-line|-line)?\b/,
  /#\s*pylint:\s*disable\b/,
  // Go: `//nolint` (bare, all linters) or `//nolint:linter1,linter2` (scoped). Line-scoped only —
  // the package-level file-wide placement is non-standard/discouraged and not uniformly honored,
  // so it's deliberately not implemented (see 08-RESEARCH.md RH011 section, Assumptions Log A6).
  /\/\/\s*nolint\b/,
  // Java: `@SuppressWarnings("...")`. Java has no standard file-wide annotation target, so every
  // occurrence is line/declaration-scoped only.
  /@SuppressWarnings\s*\(/,
  // Kotlin: `@Suppress("...")` (declaration-scoped). Does not match `@file:Suppress(...)` — the
  // literal substring "@Suppress" never appears in "@file:Suppress" since the "@" is immediately
  // followed by "file:", not "Suppress".
  /@Suppress\s*\(/,
  // Rust: `#[allow(lint_name)]` (declaration-scoped, outer attribute). Does not match the
  // `#![allow(...)]` inner-attribute file-wide form — "#[" never appears as a substring of
  // "#![" since "#" is immediately followed by "!", not "[".
  /#\[\s*allow\s*\(/,
  // Ruby: `# rubocop:disable Cop/Name` / `# rubocop:enable Cop/Name`. Block-scoped in RuboCop
  // terms but counted as line-scoped here since it's a single added diff line. The "unclosed
  // disable = file-wide" case requires forward-scanning past the diff and is a documented gap.
  /#\s*rubocop:(?:disable|enable)\b/,
  // PHP: `// phpcs:ignore`, `// phpcs:ignoreLine`, `@phpstan-ignore-line`, `@phpstan-ignore-next-line`.
  // The `\b` after the optional "Line" group prevents this from matching `// phpcs:ignoreFile`
  // (no word boundary between "ignore" and "File").
  /\/\/\s*phpcs:ignore(?:Line)?\b/,
  /@phpstan-ignore-(?:line|next-line)\b/,
  // C#: `#pragma warning disable CS1234`. The "no matching restore" file-wide case requires
  // forward-scanning the file and is a documented gap — every disable is treated as line-scoped.
  /#pragma\s+warning\s+disable\b/,
  // C/C++/Objective-C: clang-tidy `// NOLINT`, `// NOLINTNEXTLINE`, `// NOLINTBEGIN(...)` (shared
  // across all three Clang-based languages, extension-agnostic — fires on .c/.cpp/.cc/.cxx/.m/
  // .mm/.h). NOLINTBEGIN is treated as line-scoped-equivalent since it's a bounded region that
  // requires a matching NOLINTEND, not an open-ended file-wide directive (08.1-RESEARCH.md RH011).
  /\/\/\s*NOLINT(?:NEXTLINE|BEGIN)?\b/,
  // C/C++/Objective-C: Clang compiler-level diagnostic suppression (distinct from clang-tidy,
  // also valid in plain C via GCC's `#pragma GCC diagnostic ignored`, not separately matched
  // here). `#pragma clang diagnostic push`/`pop` bracket a region; an unclosed push running to
  // EOF is a documented gap (same forward-scan limitation as C#'s unrestored pragma above).
  /#pragma\s+clang\s+diagnostic\s+ignored\b/,
  // C: cppcheck-specific suppression comment. MEDIUM confidence — training-knowledge syntax, not
  // independently re-verified this session (08.1-RESEARCH.md Assumptions Log A11).
  /\/\/\s*cppcheck-suppress\b/,
  // Swift: `// swiftlint:disable[:next|:this|:previous] rule_name` (line/region-scoped). The
  // file-wide `// swiftlint:disable all` form below is checked first in run()'s dispatch, so it
  // doesn't double-count here even though this pattern's literal prefix also matches it.
  /\/\/\s*swiftlint:disable(?::(?:next|this|previous))?\b/,
  // Dart: `// ignore: rule_name` (line-scoped, comma-separated rule list supported).
  /\/\/\s*ignore\s*:/,
  // Scala: the existing @SuppressWarnings( pattern above already fires on .scala files with zero
  // new code (extension-agnostic, mirrors Java exactly). Adding the genuinely-new scalafix/@nowarn
  // line-scoped forms.
  /\/\/\s*scalafix:ok\b/,
  /@nowarn\b/,
  // Groovy: the existing @SuppressWarnings( pattern above ALSO already fires on .groovy files
  // with zero new code — RH011 is extension-agnostic and Groovy interoperates directly with the
  // Java @SuppressWarnings annotation (same reuse class as Scala's declaration-scoped form above;
  // see 08.1-RESEARCH.md RH011 table, Groovy row marked 🔁). No Groovy-specific regex needed.
  // VB.NET: `#Disable Warning CA1234` — a genuinely-new token, DISTINCT from C#'s `#pragma
  // warning disable` above (do NOT reuse the C# regex). `#Enable Warning` is only used to detect
  // the unclosed-disable gap, not itself a suppression.
  /#Disable\s+Warning\b/,
];

// File-wide directives: `/* eslint-disable */` with no rule list disables every rule for the
// rest of the file, and `# flake8: noqa` (the file-scope form, distinct from a bare trailing
// `# noqa` on one line) disables all of flake8 for the file. Either one has a bigger blast
// radius than several targeted per-line suppressions, so it's flagged regardless of how many
// suppression comments are in the diff overall. Counting occurrences, like the spam threshold
// below does, is the wrong way to measure "how much did this silence."
const FILEWIDE_ESLINT_DISABLE_RE = /\/\*\s*eslint-disable\s*\*\//;
const FILEWIDE_FLAKE8_NOQA_RE = /#\s*flake8:\s*noqa\b/;
// proctor-ignore: RH011 reason: this detector line necessarily contains the token it matches; not a real suppression
// Matches the file-wide TypeScript type-check disable directive, which has a bigger blast
// radius than a single per-line type suppression.
const FILEWIDE_TS_NOCHECK_RE = /@ts-nocheck\b/;
// A file-level mypy ignore-errors directive disables mypy for the whole file — the Python
// analogue of the TypeScript file-wide nocheck directive.
const FILEWIDE_MYPY_RE = /#\s*mypy:\s*ignore-errors\b/;
// Rust inner attribute at the top of a module/file — affects the entire containing item, a
// bigger blast radius than the outer `#[allow(...)]` declaration-scoped form.
const FILEWIDE_RUST_ALLOW_RE = /#!\[\s*allow\s*\(/;
// Kotlin explicit file-level use-site target, placed above the `package` statement.
const FILEWIDE_KOTLIN_SUPPRESS_RE = /@file:Suppress\s*\(/;
// PHP's explicit, documented file-wide directive — stops the whole file being checked by phpcs.
const FILEWIDE_PHPCS_IGNOREFILE_RE = /\/\/\s*phpcs:ignoreFile\b/;
// Swift's explicit, documented file-wide directive — disables every SwiftLint rule for the rest
// of the file. Distinct from the line/region-scoped `swiftlint:disable` forms in
// SUPPRESSION_PATTERNS; run()'s else-if dispatch checks file-wide patterns first, so a `disable
// all` line is never also counted as line-scoped even though the line-scoped pattern's literal
// prefix also matches it.
const FILEWIDE_SWIFTLINT_ALL_RE = /\/\/\s*swiftlint:disable\s+all\b/;
// Dart's explicit, documented file-wide directive — distinct from the line-scoped `// ignore:`
// form (no shared literal prefix: `ignore_for_file:` never matches `ignore\s*:` since `_for_file`
// sits between `ignore` and the colon).
const FILEWIDE_DART_IGNOREFILE_RE = /\/\/\s*ignore_for_file\s*:/;

// The following file-wide mechanisms are real but deliberately NOT implemented this phase —
// see 08-RESEARCH.md / 08.1-RESEARCH.md RH011 sections + Assumptions Log A6/A9/A11:
// - Go `//nolint` placed above the `package` clause (non-standard/discouraged, not uniformly
//   honored by every linter)
// - Ruby `# rubocop:disable` with no matching `# rubocop:enable` before EOF (requires
//   forward-scanning the file, not a single diff line)
// - C# `#pragma warning disable` with no matching `restore` (same forward-scan limitation)
// - Java has no standard file-wide annotation target at all
// - C/C++/Objective-C clang-tidy `NOLINTBEGIN`/`NOLINTEND` is a bounded region pair, not an
//   open-ended file-wide directive; `#pragma clang diagnostic push` with no matching `pop` running
//   to EOF is the same forward-scan limitation as C#'s unrestored pragma above
// - VB.NET's unclosed `#Disable Warning` with no matching `#Enable Warning` running to EOF is the
//   same forward-scan limitation, mirrors C#'s existing documented gap
// - cppcheck has no dedicated file-wide suppression form

// A single suppression is often legitimate (third-party types with no stubs, a documented
// exception). "Spam" means multiple added in the same change, and that's the actual signal.
const SPAM_THRESHOLD = 2;

function isFilewideSuppression(content: string): boolean {
  return (
    FILEWIDE_ESLINT_DISABLE_RE.test(content) ||
    FILEWIDE_FLAKE8_NOQA_RE.test(content) ||
    FILEWIDE_TS_NOCHECK_RE.test(content) ||
    FILEWIDE_MYPY_RE.test(content) ||
    FILEWIDE_RUST_ALLOW_RE.test(content) ||
    FILEWIDE_KOTLIN_SUPPRESS_RE.test(content) ||
    FILEWIDE_PHPCS_IGNOREFILE_RE.test(content) ||
    FILEWIDE_SWIFTLINT_ALL_RE.test(content) ||
    FILEWIDE_DART_IGNOREFILE_RE.test(content)
  );
}

function isSuppression(content: string): boolean {
  return SUPPRESSION_PATTERNS.some(re => re.test(content));
}

function run(context: Context): Finding[] {
  const files = context.files;
  const occurrences: Array<{ file: string; line: number }> = [];
  const filewideOccurrences: Array<{ file: string; line: number }> = [];

  for (const file of files) {
    const filePath = file.to ?? file.from ?? '';
    for (const chunk of file.chunks) {
      for (const add of chunk.changes.filter(c => c.type === 'add')) {
        if (isFilewideSuppression(add.content)) {
          filewideOccurrences.push({ file: filePath, line: (add as { ln: number }).ln });
        } else if (isSuppression(add.content)) {
          occurrences.push({ file: filePath, line: (add as { ln: number }).ln });
        }
      }
    }
  }

  const findings: Finding[] = filewideOccurrences.map(occ => ({
    verifierId: 'RH011',
    severity: 'warn' as const,
    file: occ.file,
    line: occ.line,
    message: 'File-wide suppression directive added — this silences every rule for the rest of the file, a larger blast radius than a targeted per-line suppression.',
    suggestion: 'Scope the suppression to the specific rule(s) and line(s) that need it instead of disabling checks for the whole file.',
  }));

  if (occurrences.length >= SPAM_THRESHOLD) {
    findings.push(...occurrences.map(occ => ({
      verifierId: 'RH011',
      severity: 'warn' as const,
      file: occ.file,
      line: occ.line,
      message: `Type/lint suppression comment added — ${occurrences.length} added in this change, silencing errors instead of fixing them.`,
      suggestion: 'Fix the underlying type or lint error instead of suppressing it; if truly unavoidable, justify each suppression individually with a comment.',
    })));
  }

  return findings;
}

export const rh011: Verifier = { id: 'RH011', severity: 'warn', run };
