import type { Context, Finding, Verifier } from '../types.js';
import { withoutLiterals } from './wi-common.js';

const SUPPRESSION_PATTERNS = [
  /@ts-ignore\b/,
  /@ts-expect-error\b/,
  /#\s*type:\s*ignore\b/,
  /#\s*noqa\b/,
  /eslint-disable(?:-next-line|-line)?\b/,
  /#\s*pylint:\s*disable\b/,
  // Go: `//nolint` (bare, all linters) or `//nolint:linter1,linter2` (scoped). Line-scoped only,
  // the package-level file-wide placement is non-standard/discouraged and not uniformly honored,
  // so it's deliberately not implemented so it is a documented gap.
  /\/\/\s*nolint\b/,
  // Java: `@SuppressWarnings("...")`. Java has no standard file-wide annotation target, so every
  // occurrence is line/declaration-scoped only.
  /@SuppressWarnings\s*\(/,
  // Kotlin: `@Suppress("...")` (declaration-scoped). Does not match `@file:Suppress(...)`, the
  // literal substring "@Suppress" never appears in "@file:Suppress" since the "@" is immediately
  // followed by "file:", not "Suppress".
  /@Suppress\s*\(/,
  // Rust: `#[allow(lint_name)]` (declaration-scoped, outer attribute). Does not match the
  // `#![allow(...)]` inner-attribute file-wide form, "#[" never appears as a substring of
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
  // forward-scanning the file and is a documented gap, every disable is treated as line-scoped.
  /#pragma\s+warning\s+disable\b/,
  // C/C++/Objective-C: clang-tidy `// NOLINT`, `// NOLINTNEXTLINE`, `// NOLINTBEGIN(...)` (shared
  // across all three Clang-based languages, extension-agnostic, fires on .c/.cpp/.cc/.cxx/.m/
  // .mm/.h). NOLINTBEGIN is treated as line-scoped-equivalent since it's a bounded region that
  // requires a matching NOLINTEND, not an open-ended file-wide directive 
  /\/\/\s*NOLINT(?:NEXTLINE|BEGIN)?\b/,
  // C/C++/Objective-C: Clang compiler-level diagnostic suppression (distinct from clang-tidy,
  // also valid in plain C via GCC's `#pragma GCC diagnostic ignored`, not separately matched
  // here). `#pragma clang diagnostic push`/`pop` bracket a region; an unclosed push running to
  // EOF is a documented gap (same forward-scan limitation as C#'s unrestored pragma above).
  /#pragma\s+clang\s+diagnostic\s+ignored\b/,
  // C: cppcheck-specific suppression comment. MEDIUM confidence, training-knowledge syntax, not
  // independently re-verified.
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
  // with zero new code, RH011 is extension-agnostic and Groovy interoperates directly with the
  // Java @SuppressWarnings annotation (same reuse class as Scala's declaration-scoped form above;
  // Groovy reuses the Java form). No Groovy-specific regex needed.
  // VB.NET: `#Disable Warning CA1234`, a genuinely-new token, DISTINCT from C#'s `#pragma
  // warning disable` above (do NOT reuse the C# regex). `#Enable Warning` is only used to detect
  // the unclosed-disable gap, not itself a suppression.
  /#Disable\s+Warning\b/,
  // Perl: `## no critic` (bare = all policies) / `## no critic (PolicyName)` (scoped form also
  // matches this same regex). The unclosed `## no critic` with no matching `## use critic` runs
  // to EOF, line-scoped-only, documented as a gap (mirrors Ruby/C#'s forward-scan limitation).
  /##\s*no\s+critic\b/,
  // R: `# nolint`, `# nolint: linter_name.`, `# nolint start` (region-open) all share this
  // prefix. Whole-file exclusion is via a separate `.lintr` config file, not an inline directive,
  // documented gap, do NOT try to detect `.lintr` edits as RH011.
  /#\s*nolint\b/,
  // Haskell: `{-# ANN ("HLint: ignore RuleName") #-}` or `{-# ANN foo ("HLint: ignore") #-}`,
  // declaration-scoped. Deliberately also matches the module-wide `{-# ANN module "HLint: ignore"
  // #-}` file-wide form's literal text (see FILEWIDE_HLINT_RE below); run()'s else-if dispatch
  // checks file-wide first so the module-wide form is never double-counted here.
  /\{-#\s*ANN\b[^#]*HLint:\s*ignore/,
  // Elixir: `# credo:disable-for-next-line`, `# credo:disable-for-previous-line`,
  // `# credo:disable-for-lines:N`, line/region-scoped. Distinct alternation from the file-wide
  // `# credo:disable-for-this-file` directive below (FILEWIDE_CREDO_FILE_RE), no shared match.
  /#\s*credo:disable-for-(?:next-line|previous-line|lines:\d+)\b/,
  // Lua: `-- luacheck: ignore` used on the same line as code (line-scoped). The own-line-at-
  // file-top form is a fragile "everything till end of current closure" signal, too unreliable
  // to distinguish "top of file" from "top of an arbitrary nested function" via diff-line regex
  // alone, so it's documented as a gap rather than implemented as file-wide.
  /--\s*luacheck:\s*ignore\b/,
  // Clojure: `#_{:clj-kondo/ignore [:linter-key]}`, a reader-discard form immediately preceding
  // the target form (form/line-scoped). Whole-file exclusion is via a separate
  // `.clj-kondo/config.edn` file, not an inline comment, documented gap.
  /#_\{:clj-kondo\/ignore\b/,
  // Shell/Bash: `# shellcheck disable=SC####` (comma-separated list supported). No inline
  // file-wide directive exists for shellcheck, a confirmed structural absence (not just an
  // unimplemented feature), documented as a gap; whole-file exclusion requires a separate
  // `.shellcheckrc` file.
  /#\s*shellcheck\s+disable=SC\d+\b/,
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
// A file-level mypy ignore-errors directive disables mypy for the whole file, the Python
// analogue of the TypeScript file-wide nocheck directive.
const FILEWIDE_MYPY_RE = /#\s*mypy:\s*ignore-errors\b/;
// Rust inner attribute at the top of a module/file, affects the entire containing item, a
// bigger blast radius than the outer `#[allow(...)]` declaration-scoped form.
const FILEWIDE_RUST_ALLOW_RE = /#!\[\s*allow\s*\(/;
// Kotlin explicit file-level use-site target, placed above the `package` statement.
const FILEWIDE_KOTLIN_SUPPRESS_RE = /@file:Suppress\s*\(/;
// PHP's explicit, documented file-wide directive, stops the whole file being checked by phpcs.
const FILEWIDE_PHPCS_IGNOREFILE_RE = /\/\/\s*phpcs:ignoreFile\b/;
// Swift's explicit, documented file-wide directive, disables every SwiftLint rule for the rest
// of the file. Distinct from the line/region-scoped `swiftlint:disable` forms in
// SUPPRESSION_PATTERNS; run()'s else-if dispatch checks file-wide patterns first, so a `disable
// all` line is never also counted as line-scoped even though the line-scoped pattern's literal
// prefix also matches it.
const FILEWIDE_SWIFTLINT_ALL_RE = /\/\/\s*swiftlint:disable\s+all\b/;
// Dart's explicit, documented file-wide directive, distinct from the line-scoped `// ignore:`
// form (no shared literal prefix: `ignore_for_file:` never matches `ignore\s*:` since `_for_file`
// sits between `ignore` and the colon).
const FILEWIDE_DART_IGNOREFILE_RE = /\/\/\s*ignore_for_file\s*:/;
// Haskell's genuine, documented module-wide HLint directive, either `{-# ANN module "HLint:
// ignore" #-}` or the bare `{-# HLINT ignore #-}` pragma. The first alternative's literal text
// also matches the declaration-scoped ANN pattern in SUPPRESSION_PATTERNS above; run()'s else-if
// dispatch checks file-wide first, so a genuine module-wide directive is never double-counted as
// declaration-scoped. No trailing `\b` after the closing quote in the first alternative, a `\b`
// immediately after `"` followed by whitespace is not a real word boundary and would silently
// fail to match (both sides non-word characters).
const FILEWIDE_HLINT_RE = /\{-#\s*(?:ANN\s+module\s+"HLint:\s*ignore"|HLINT\s+ignore\b)/;
// Elixir's genuine, documented file-wide directive, disables credo for the entire file. Distinct
// alternation from the line-scoped `credo:disable-for-(next-line|previous-line|lines:N)` forms in
// SUPPRESSION_PATTERNS above (no shared match).
const FILEWIDE_CREDO_FILE_RE = /#\s*credo:disable-for-this-file\b/;

// File-wide mechanisms deliberately not detected, grouped by why. A verifier reads one diff line
// at a time, which is what rules most of these out. Directive names are spelled without their
// leading comment syntax on purpose: written literally, this paragraph trips RH011 itself.
//
// Needs forward-scanning the whole file for a missing closer, which a diff line cannot do:
//   Ruby rubocop:disable, C# pragma warning disable, VB.NET Disable Warning, Perl no critic,
//   C/C++ pragma clang diagnostic push.
// Lives in a separate config file, not an inline directive: R (`.lintr` exclusions),
//   Clojure (`.clj-kondo/config.edn`), Shell (`.shellcheckrc`).
// No such mechanism exists: Java (no file-wide annotation target), cppcheck, Shell inline.
// Too ambiguous to match without false positives: Go nolint above the `package` clause
//   (non-standard and not honored uniformly), Lua's own-line luacheck ignore (scoped to the
//   enclosing closure, indistinguishable from a nested-function top by regex).
// Julia is a whole-category gap: no dominant linter with a standard inline suppress-comment
//   convention was found, so nothing is detected for it at all rather than a guessed detector.

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
    FILEWIDE_DART_IGNOREFILE_RE.test(content) ||
    FILEWIDE_HLINT_RE.test(content) ||
    FILEWIDE_CREDO_FILE_RE.test(content)
  );
}

function isSuppression(content: string): boolean {
  return SUPPRESSION_PATTERNS.some(re => re.test(content));
}

/**
 * Blanks string and regex literal contents before matching.
 *
 * Comments themselves are left intact, because a suppression directive *is* a comment: stripping
 * those would leave this check with nothing to read. What gets blanked is the quoted text inside
 * them, which is where a mention lives rather than a directive. A directive quoted inside a
 * sentence is prose about a suppression; the same token standing alone on a line is one. Proctor's
 * own rule metadata and shared helpers are full of the former, and this check reported every one of
 * them as the latter.
 */
function suppressionInCode(content: string): boolean {
  // Haskell is the exception, and a real one rather than a workaround: an HLint annotation puts its
  // payload inside a string by design, so blanking literals erases the directive itself rather than
  // a mention of it. Its ANN anchor sits outside the quotes, which is what makes matching the raw
  // line safe here. The cost is that this one pattern stays self-referential: a comment spelling the
  // annotation out in full still reads as a directive, which is why neither this comment nor its
  // test writes one.
  if (LITERAL_SPANNING_PATTERNS.some(re => re.test(content))) return true;
  return isSuppression(withoutLiterals(content));
}

/** Directives whose payload legitimately lives inside a string literal, so stripping breaks them. */
const LITERAL_SPANNING_PATTERNS = [/\{-#\s*ANN\b[^#]*HLint:\s*ignore/];

/** File-wide equivalent of suppressionInCode, with the same Haskell exception. */
function filewideInCode(content: string): boolean {
  if (FILEWIDE_HLINT_RE.test(content)) return true;
  return isFilewideSuppression(withoutLiterals(content));
}

/**
 * Documentation, where a suppression token is a word rather than a directive.
 *
 * Prose telling a reader not to add a TypeScript ignore directive necessarily contains one, and two
 * such mentions in a single change tripped the spam threshold. Proctor's own ruleset, README and
 * rule metadata all describe the tokens this check looks for, so the tool reported its own
 * instructions as a violation of them. No documentation file has a linter reading its comments, so
 * nothing is lost by scoping the check to code.
 *
 * Source comments that quote a token are a narrower version of the same problem and are not
 * addressed here: separating "a directive" from "a sentence about a directive" inside real code
 * needs more than a line-level pattern, and widening this check to guess at it would cost more
 * than it saves.
 */
const DOC_FILE_RE = /\.(?:md|mdc|markdown|rst|txt|adoc)$/i;

function run(context: Context): Finding[] {
  const files = context.files;
  const occurrences: Array<{ file: string; line: number }> = [];
  const filewideOccurrences: Array<{ file: string; line: number }> = [];

  for (const file of files) {
    const filePath = file.to ?? file.from ?? '';
    if (DOC_FILE_RE.test(filePath)) continue;
    for (const chunk of file.chunks) {
      for (const add of chunk.changes.filter(c => c.type === 'add')) {
        if (filewideInCode(add.content)) {
          filewideOccurrences.push({ file: filePath, line: (add as { ln: number }).ln });
        } else if (suppressionInCode(add.content)) {
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
    message: 'File-wide suppression directive added. This silences every rule for the rest of the file, a larger blast radius than a targeted per-line suppression.',
    suggestion: 'Scope the suppression to the specific rule(s) and line(s) that need it instead of disabling checks for the whole file.',
  }));

  if (occurrences.length >= SPAM_THRESHOLD) {
    findings.push(...occurrences.map(occ => ({
      verifierId: 'RH011',
      severity: 'warn' as const,
      file: occ.file,
      line: occ.line,
      message: `Type/lint suppression comment added, ${occurrences.length} of them in this change, silencing errors instead of fixing them.`,
      suggestion: 'Fix the underlying type or lint error instead of suppressing it; if truly unavoidable, justify each suppression individually with a comment.',
    })));
  }

  return findings;
}

export const rh011: Verifier = { id: 'RH011', severity: 'warn', run };
