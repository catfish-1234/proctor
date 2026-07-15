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

// The following file-wide mechanisms are real but deliberately NOT implemented this phase —
// see 08-RESEARCH.md RH011 section + Assumptions Log A6:
// - Go `//nolint` placed above the `package` clause (non-standard/discouraged, not uniformly
//   honored by every linter)
// - Ruby `# rubocop:disable` with no matching `# rubocop:enable` before EOF (requires
//   forward-scanning the file, not a single diff line)
// - C# `#pragma warning disable` with no matching `restore` (same forward-scan limitation)
// - Java has no standard file-wide annotation target at all

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
    FILEWIDE_PHPCS_IGNOREFILE_RE.test(content)
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
