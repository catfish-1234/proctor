import path from 'node:path';
import type { Context, Finding, Verifier } from '../types.js';
import { addedLines, isCommentLine, pathOf, withoutLiterals, withoutTrailingComment } from './wi-common.js';

/**
 * Source hidden from the guard rather than fixed.
 *
 * Proctor reads `git diff`. Anything git does not report, proctor does not see. That makes the
 * ignore mechanism the most direct attack on the tool there is: add a path to `.gitignore` and the
 * file stops appearing in diffs, so a gutted implementation or a deleted test becomes invisible to
 * every check at once. `git update-index --assume-unchanged` and `--skip-worktree` do the same
 * thing to an already-tracked file without touching a config at all.
 *
 * This is deliberately narrow. Ignore files exist for good reasons and gain entries constantly:
 * build output, logs, caches, editor droppings. Firing on those would make the check noise within a
 * day. What it fires on is an entry that hides *source or test code*, which is not something an
 * ignore file is for.
 */

const IGNORE_FILE_RE = /(?:^|\/)\.gitignore$|(?:^|\/)\.git\/info\/exclude$/;

/** Prose, where naming the command is describing it rather than running it. */
const DOC_FILE_RE = /\.(?:md|mdc|markdown|rst|txt|adoc)$/i;

/** Extensions that carry program logic, i.e. the things a diff is supposed to show. */
const SOURCE_EXT_RE =
  /\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|java|rb|php|cs|kt|kts|rs|swift|m|mm|cpp|cc|cxx|c|h|hpp|dart|scala|pl|r|hs|ex|exs|lua|groovy|clj|cljs|sh|bash|jl|vb)$/i;

/** Path segments that mean "this is the test suite". */
const TEST_SEGMENT_RE = /(?:^|[\/_.-])(?:tests?|specs?|__tests__|testing)(?:[\/_.-]|$)/i;

/**
 * Things an ignore file is legitimately full of.
 *
 * Checked before the source-extension rule, because several of these legitimately end in a source
 * extension: `*.min.js` is build output, `vendor/**\/*.go` is somebody else's code. Being generous
 * here is the whole reason this check can exist without being turned off.
 */
const ROUTINE_IGNORE_RE =
  /(?:^|\/)(?:node_modules|dist|build|out|target|coverage|vendor|third_party|\.venv|venv|__pycache__|\.next|\.nuxt|\.cache|tmp|temp|logs?|bin|obj|test-results|test-output|test-reports?|playwright-report|allure-results|\.pytest_cache|\.tox|\.nyc_output)(?:\/|$)|\.(?:log|tmp|temp|cache|lock|map|pyc|pyo|class|o|so|dll|exe|jar|zip|tar|gz|env|DS_Store)$|\.min\.[jt]s$|(?:^|\/)\*\.(?:log|tmp|swp)$/i;

/** Git commands that hide a tracked file's changes without touching any config. */
const INDEX_HIDING_RE = /git\s+update-index\s+[^\n]*--(?:assume-unchanged|skip-worktree)\b/;

/** An ignore-file line that is a real pattern rather than a comment, blank, or a negation. */
function ignorePattern(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith('#')) return undefined;
  // A negation re-includes a path, which is the opposite of hiding it.
  if (trimmed.startsWith('!')) return undefined;
  return trimmed;
}

/** True when this ignore entry would hide program source or a test suite. */
function hidesSource(pattern: string): boolean {
  if (ROUTINE_IGNORE_RE.test(pattern)) return false;
  if (SOURCE_EXT_RE.test(pattern)) return true;
  return TEST_SEGMENT_RE.test(pattern);
}

function run(context: Context): Finding[] {
  const findings: Finding[] = [];

  for (const file of context.files) {
    const filePath = pathOf(file);
    if (!filePath) continue;
    const normalized = filePath.replace(/\\/g, '/');

    if (IGNORE_FILE_RE.test(normalized)) {
      for (const chunk of file.chunks) {
        for (const line of addedLines(chunk)) {
          const pattern = ignorePattern(line.text);
          if (!pattern || !hidesSource(pattern)) continue;
          findings.push({
            verifierId: 'WI108',
            severity: 'error',
            file: filePath,
            line: line.line,
            message: `Source hidden from review: '${pattern}' added to ${path.basename(filePath)}, so changes to it stop appearing in diffs.`,
            suggestion:
              'Remove the entry. Ignore files are for build output and local droppings, not for code. If the file genuinely should not be in the repository, delete it in its own change rather than hiding it while it is still there.',
          });
        }
      }
      continue;
    }

    // Documentation naming the command is not the command. This repository's own rule metadata,
    // language matrix and tests all spell `git update-index --assume-unchanged` out, and every one
    // of them was reported as an attempt to use it. Third time this family has hit the same class,
    // so the discipline is now fixed: skip prose, skip comments, blank literals, then match.
    if (DOC_FILE_RE.test(normalized)) continue;

    // The same move without a config change: tell git to stop reporting a tracked file.
    for (const chunk of file.chunks) {
      for (const line of addedLines(chunk)) {
        if (isCommentLine(line.text)) continue;
        if (!INDEX_HIDING_RE.test(withoutLiterals(withoutTrailingComment(line.text)))) continue;
        findings.push({
          verifierId: 'WI108',
          severity: 'error',
          file: filePath,
          line: line.line,
          message: 'Source hidden from review: git update-index is being used to stop reporting changes to a tracked file.',
          suggestion:
            'Remove this. Marking a tracked file assume-unchanged or skip-worktree hides real edits from every diff, review, and check, including this one.',
        });
      }
    }
  }

  return findings;
}

export const wi108: Verifier = { id: 'WI108', severity: 'error', run };
