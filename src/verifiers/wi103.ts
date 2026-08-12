import type { Context, Finding, Verifier } from '../types.js';
import { addedLines, deletedLines, isWatchedSource, pathOf, withoutTrailingComment } from './wi-common.js';

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
  { re: /\brequire\s*\(|\bcheckArgument\s*\(|\bcheckNotNull\s*\(/, what: 'a precondition check' },
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
const REWRITTEN_GUARD_RE = /\b(?:throw|raise|panic)\b|^\s*assert\b/;

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
  return new RegExp(`^${rhsBefore.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[*+]`).test(rhsAfter);
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
    if (added.some(l => EXTRACTED_VALIDATOR_RE.test(l.text))) continue;

    // A guard left standing but made untrippable. Checked before the rewritten-in-place gate
    // below, because this is precisely the case where the guard *is* still in the added lines.
    for (const chunk of file.chunks) {
      const chunkAdded = addedLines(chunk);
      const chunkDeleted = deletedLines(chunk);
      for (const line of chunkAdded) {
        const guarded = GUARD_SIGNATURES.some(g => g.re.test(line.text)) ||
          chunkAdded.some(l => Math.abs(l.line - line.line) <= 2 && GUARD_SIGNATURES.some(g => g.re.test(l.text)));
        if (!guarded) continue;

        if (ENV_ESCAPE_RE.test(line.text)) {
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
