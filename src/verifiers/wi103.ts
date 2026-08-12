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
