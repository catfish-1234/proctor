import type { Context, Finding, Verifier } from '../types.js';
import type { DiffLine } from './wi-common.js';
import { addedLines, afterLines, deletedLines, hasExplanation, isCommentLine, isWatchedSource, pathOf, withoutLiterals, withoutTrailingComment } from './wi-common.js';

/**
 * Validation removed from shipped code.
 *
 * A guard clause is a test that runs in production. When an input check rejects the thing a failing
 * case feeds it, deleting the check makes the failure stop, exactly the way deleting a unit test
 * does, except that nothing in the test suite records that it happened. The bug is not fixed. It is
 * now unreported at runtime as well as at test time.
 *
 * This is the closest analogue to RH001 outside the test suite, and it earns error severity for the
 * same reason: the change removed the thing that was catching the problem.
 */

/**
 * Contract enforcement, by language.
 *
 * Each pattern matches a statement whose only purpose is to refuse bad input or bad state. Ordinary
 * error handling that reports a failure it did not cause (rethrowing, logging, wrapping) is
 * deliberately absent, because deleting that is refactoring, not disarming.
 */
const GUARD_SIGNATURES: { re: RegExp; what: string }[] = [
  { re: /\bthrow\s+new\s+\w*(?:Error|Exception)\b/, what: 'a thrown error' },
  { re: /\braise\s+[A-Z]\w*(?:Error|Exception)\b/, what: 'a raised exception' },
  { re: /^\s*assert\b/, what: 'an assertion' },
  { re: /\bassert!\s*\(|\bassert_eq!\s*\(/, what: 'an assertion' },
  { re: /^\s*(?:Debug\.)?Assert\s*\(/, what: 'an assertion' },
  { re: /\bpanic\s*\(/, what: 'a panic' },
  { re: /\breturn\s+(?:nil|null)\s*,\s*(?:errors\.New|fmt\.Errorf)\s*\(/, what: 'an error return' },
  { re: /\breturn\s+(?:errors\.New|fmt\.Errorf)\s*\(/, what: 'an error return' },
  // `require(` only counts with a non-string first argument. The Guava/Node-assert precondition
  // form takes a condition; CommonJS `require('lodash')` takes a module specifier, and removing an
  // unused import is one of the most common diffs there is.
  { re: /\brequire\s*\(\s*[^'"`)]|\bcheckArgument\s*\(|\bcheckNotNull\s*\(/, what: 'a precondition check' },
  { re: /\braise_error\b|\bargument_error\b/, what: 'a raised error' },
];

/**
 * A guard extracted into a helper, rather than deleted.
 *
 * This is the most common legitimate reason for a guard to vanish from a diff, and it looks
 * identical to deleting one until you notice the call that replaced it. A named validator appearing
 * anywhere in the file's additions buys the whole file silence, which is generous on purpose: a
 * false positive here lands on somebody doing good refactoring work, and that is the most expensive
 * kind of false positive this check can produce.
 */
const EXTRACTED_VALIDATOR_RE =
  /\b(?:validate|validation|verify|ensure|check|guard|require|precondition|sanitiz|invariant)\w*\s*[({.]|\bschema\b|\bzod\b|\bpydantic\b/i;

/**
 * A guard rewritten in place.
 *
 * Scoped to the chunk, not the file, and that distinction is the whole point. A throw added in the
 * same hunk is almost certainly the same guard with a new message or a new condition. A throw added
 * in a different function, several hundred lines away, has nothing to do with the guard that just
 * disappeared, and letting it buy silence was how the first draft of this check missed a deleted
 * bounds check in a file that happened to also gain an unrelated error path.
 */
// A guard rewritten to terminate rather than throw is still a guard. CLI code routinely reports
// to stderr and exits nonzero instead of raising, and proctor's own hidden-paths guard was
// converted that way and reported as validation removed, which is the opposite of what the
// diff did: the case is still rejected, and loudly. A zero exit is deliberately excluded,
// since exiting 0 in place of a throw is how a guard gets laundered into a no-op.
const REWRITTEN_GUARD_RE =
  /\b(?:throw|raise|panic)\b|^\s*assert\b|\b(?:process\.exit|sys\.exit|os\.Exit)\s*\(\s*[1-9]/;

/** Normalizes a guard so the same statement reformatted or reindented is recognized as unchanged. */
function guardKey(text: string): string {
  return withoutTrailingComment(text)
    .replace(/['"`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * A guard that survives in name only.
 *
 * Deleting a guard is the obvious move and the one this check was built for. Adversarial probing
 * found the quieter pair: leave the guard in place and make its condition impossible to trip. The
 * diff still contains a `throw`, so nothing reads as removed, and the check passes as surely as if
 * the line were gone.
 */

/** An escape hatch that lets the guard be skipped from outside the program. */
const ENV_ESCAPE_RE =
  /\b(?:process\.env|os\.environ|ENV|getenv|System\.getenv)\b[^\n]*\b(?:SKIP|DISABLE|BYPASS|NO_|IGNORE|UNSAFE|FORCE)\w*/i;

/** A numeric comparison, for spotting a threshold that moved in the permissive direction. */
const COMPARISON_RE = /([\w.$[\]]+)\s*(<=|>=|<|>|===?|!==?)\s*([\w.$*+\-/ ()]+?)\s*(?:\)|\{|$)/;

/** True when a comparison's right-hand side gained a multiplier or a much larger literal. */
function loosened(before: string, after: string): boolean {
  const a = COMPARISON_RE.exec(before);
  const b = COMPARISON_RE.exec(after);
  if (!a || !b) return false;
  if (a[1] !== b[1] || a[2] !== b[2]) return false; // different subject or operator, not this signal
  const rhsBefore = a[3]!.trim();
  const rhsAfter = b[3]!.trim();
  if (rhsBefore === rhsAfter) return false;
  // The bound gained arithmetic that can only widen it, e.g. `bal` becoming `bal * 1000`.
  // Diff content is untrusted input. Compare the fixed prefix directly, then use a static regex
  // for the newly appended operator instead of compiling the changed source as a pattern.
  if (!rhsAfter.startsWith(rhsBefore)) return false;
  return /^\s*[*+]/.test(rhsAfter.slice(rhsBefore.length));
}

const indentOf = (text: string): number => /^[ \t]*/.exec(text)![0].length;

/**
 * A line that closes the block it sits in and opens a sibling one: `} finally {`, `} catch (e) {`,
 * `} else {`, and the dedented Python/Ruby forms.
 */
const SIBLING_CLAUSE_RE = /^(?:\}\s*)?(?:else|catch|finally|except|rescue|ensure)\b/;

/** A line whose whole job is to close a block. */
const CLOSER_RE = /^(?:\}|\);?|end\b)/;

/**
 * The next statement that really does live in the same scope as a return, or undefined if the
 * scan leaves that scope first.
 *
 * The naive version of this skipped every line beginning with `}` and kept going, which is what
 * made `return await promise;` inside a `try { … } finally { … }` read as bypassing the finally
 * body: the `} finally {` was treated as a closing brace to step over, and the finally block's
 * statements sit at exactly the try block's indentation, so the very next line looked like
 * surviving same-scope code. It was the single largest false-positive source in a sweep of 689
 * real commits. Two things end the scan instead of being skipped: a sibling clause, which by
 * definition means the return's block is over, and a closer sitting at a shallower indent than
 * the return, which means the enclosing block is over too. A closer at the return's own indent or
 * deeper is still just the end of something nested inside the same scope, and is still skipped.
 */
function nextSameScopeStatement(rest: DiffLine[], indent: number): DiffLine | undefined {
  for (const line of rest) {
    const text = line.text.trim();
    if (text === '' || isCommentLine(line.text)) continue;
    if (SIBLING_CLAUSE_RE.test(text)) return undefined;
    if (CLOSER_RE.test(text)) {
      if (indentOf(line.text) < indent) return undefined;
      continue;
    }
    return line;
  }
  return undefined;
}

/** A change that leaves executable same-scope code after an unconditional return. */
function unreachableAfterReturn(chunk: Context['files'][number]['chunks'][number]): { line: number }[] {
  const after = afterLines(chunk);
  const results: { line: number }[] = [];
  for (const added of addedLines(chunk)) {
    if (hasExplanation(added.text) || isCommentLine(added.text)) continue;
    const code = withoutTrailingComment(added.text);
    const indent = indentOf(code);
    // Requiring indentation keeps this inside a function/method and avoids top-level language
    // constructs. Conditional one-line returns start with `if`, so they are not matched.
    if (indent === 0 || !/^\s*return\b/.test(code)) continue;
    const index = after.findIndex(line => line.line === added.line && line.added);
    if (index < 0) continue;
    const next = nextSameScopeStatement(after.slice(index + 1), indent);
    if (!next || indentOf(next.text) !== indent) continue;
    results.push({ line: added.line });
  }

  // Git represents a branch moved below an existing return as "delete branch, add branch"; the
  // return itself is an unchanged context line. Look at newly-added executable lines too, and ask
  // whether the preceding statement at the same indentation is an unconditional return.
  for (let index = 0; index < after.length; index++) {
    const added = after[index]!;
    if (!added.added || hasExplanation(added.text) || isCommentLine(added.text)) continue;
    const text = added.text.trim();
    const indent = indentOf(added.text);
    if (
      indent === 0 ||
      text === '' ||
      /^return\b/.test(text) ||
      /^(?:}|\);?|end\b|else\b|catch\b|except\b|finally\b|rescue\b|case\b|when\b)/.test(text)
    ) continue;
    let prior: (typeof after)[number] | undefined;
    for (let cursor = index - 1; cursor >= 0; cursor--) {
      const candidate = after[cursor]!;
      const trimmed = candidate.text.trim();
      if (trimmed === '' || isCommentLine(candidate.text)) continue;
      const candidateIndent = indentOf(candidate.text);
      // A dedent starts a different clause/scope. Code under an `except` is not made unreachable
      // by a return under the preceding `try`, even though both bodies use the same indentation.
      if (candidateIndent < indent) break;
      if (candidateIndent === indent) {
        prior = candidate;
        break;
      }
    }
    if (!prior || !/^\s*return\b/.test(withoutTrailingComment(prior.text))) continue;
    results.push({ line: added.line });
  }
  return results;
}

function run(context: Context): Finding[] {
  const findings: Finding[] = [];

  for (const file of context.files) {
    const filePath = pathOf(file);
    if (!isWatchedSource(context, filePath)) continue;

    // Collect the whole file's additions first. A guard deleted in one chunk and re-added in
    // another, or replaced by a call to an extracted validator anywhere in the file, is a move.
    const added = file.chunks.flatMap(addedLines);
    const addedKeys = new Set(added.map(l => guardKey(l.text)));

    for (const chunk of file.chunks) {
      for (const unreachable of unreachableAfterReturn(chunk)) {
        findings.push({
          verifierId: 'WI103',
          severity: 'error',
          file: filePath,
          line: unreachable.line,
          message: 'Control flow bypassed: an unconditional return was added before a surviving statement in the same scope, so the code below can no longer run.',
          suggestion:
            'Remove the early return and fix the branch it bypasses. If the lower branch is genuinely obsolete, remove it deliberately in a separate, reviewable change rather than leaving dead code behind.',
        });
      }
    }

    if (added.some(l => EXTRACTED_VALIDATOR_RE.test(l.text))) continue;

    // A guard left standing but made untrippable. Checked before the rewritten-in-place gate
    // below, because this is precisely the case where the guard *is* still in the added lines.
    for (const chunk of file.chunks) {
      const chunkAdded = addedLines(chunk);
      const chunkDeleted = deletedLines(chunk);
      for (const line of chunkAdded) {
        // Same discipline as the rest of the family: a guard quoted in a string is a payload, not
        // a guard. Skipped before any signal runs.
        if (isCommentLine(line.text)) continue;
        const code = withoutLiterals(line.text);
        if (code !== line.text && !GUARD_SIGNATURES.some(g => g.re.test(code))) continue;
        const guarded = GUARD_SIGNATURES.some(g => g.re.test(line.text)) ||
          chunkAdded.some(l => Math.abs(l.line - line.line) <= 2 && GUARD_SIGNATURES.some(g => g.re.test(l.text)));
        if (!guarded) continue;

        if (ENV_ESCAPE_RE.test(code)) {
          findings.push({
            verifierId: 'WI103',
            severity: 'error',
            file: filePath,
            line: line.line,
            message: 'Validation bypassable: an environment-variable escape hatch was added to a guard, so the check can be switched off from outside the program.',
            suggestion:
              'Remove the escape hatch. A guard that any caller can disable by setting a variable is not enforcing anything, and the setting will end up on in exactly the environment where it matters.',
          });
          continue;
        }

        const prior = chunkDeleted.find(d => loosened(d.text, line.text));
        if (!prior) continue;
        findings.push({
          verifierId: 'WI103',
          severity: 'error',
          file: filePath,
          line: line.line,
          message: 'Validation weakened: the bound on a guard was widened, so the case it used to reject now passes through it.',
          suggestion:
            'Restore the original bound and make the code satisfy it. Leaving the guard in place with a condition that cannot trip is the same as deleting it, minus the part where a reader can see that you did.',
        });
      }
    }

    for (const chunk of file.chunks) {
      // A guard rewritten in place lands in the same hunk it replaced.
      if (addedLines(chunk).some(l => REWRITTEN_GUARD_RE.test(l.text))) continue;

      for (const deleted of deletedLines(chunk)) {
        const text = withoutTrailingComment(deleted.text);
        const guard = GUARD_SIGNATURES.find(g => g.re.test(text));
        if (!guard) continue;
        if (addedKeys.has(guardKey(deleted.text))) continue;

        findings.push({
          verifierId: 'WI103',
          severity: 'error',
          file: filePath,
          line: deleted.line,
          message: `Validation removed: ${guard.what} guarding this code was deleted, so the case it rejected is now accepted silently.`,
          suggestion:
            'Put the guard back and make the code satisfy it. If the input really is valid now, the guard should be changed deliberately and the reason recorded, not deleted.',
        });
      }
    }
  }

  return findings;
}

export const wi103: Verifier = { id: 'WI103', severity: 'error', run };
