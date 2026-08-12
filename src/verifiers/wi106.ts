import type { Context, Finding, Verifier } from '../types.js';
import type { DiffLine } from './wi-common.js';
import { addedLines, deletedLines, hasExplanation, isCommentLine, isWatchedSource, pathOf, withoutLiterals, withoutTrailingComment } from './wi-common.js';

/**
 * Type safety eroded to silence the checker.
 *
 * RH011 watches suppression comments: `@ts-ignore`, `# type: ignore`, `#[allow(...)]`. This watches
 * the other way of making a type error stop, which leaves no comment behind at all. Widening the
 * type to `any` does not suppress the error, it makes the error untrue, and it does so permanently
 * and invisibly. There is nothing in the diff afterwards that says a check was skipped.
 *
 * Warn rather than error, matching RH011. A cast is sometimes the right call at a genuine boundary
 * (parsing untrusted JSON, calling an untyped dependency), which is why the two firing conditions
 * below are a spam threshold and a paired downgrade rather than any single `any`.
 */

/** A value declared or asserted as the top type. */
const WIDENING_SIGNATURES: { re: RegExp; what: string }[] = [
  { re: /\bas\s+any\b/, what: 'as any' },
  { re: /:\s*any\b(?!\s*\w)/, what: ': any' },
  { re: /\bas\s+unknown\s+as\b/, what: 'as unknown as' },
  { re: /Array<any>|any\[\]/, what: 'any[]' },
  { re: /:\s*Any\b/, what: ': Any' },
  { re: /\binterface\{\}/, what: 'interface{}' },
  { re: /\bdynamic\b/, what: 'dynamic' },
  { re: /\b@ts-expect-error\b/, what: '@ts-expect-error' },
];

/**
 * The specific type a widened line used to have.
 *
 * Pairing an added `any` against a deleted concrete annotation on the same declaration is the
 * strongest form of this signal: it is not that the code is untyped, it is that it was typed and
 * this change untyped it.
 */
const TYPED_DECLARATION_RE = /(\w+)\s*:\s*([A-Z]\w*(?:<[^>]*>)?(?:\[\])?)/;

/** Two, the same threshold RH011 uses: one cast is a boundary, several in a change is a pattern. */
const SPAM_THRESHOLD = 2;

/** Only languages where these tokens mean what this check thinks they mean. */
const TYPED_LANGUAGES = new Set(['ts', 'python', 'go', 'csharp', 'dart', 'kotlin', 'scala', 'swift']);

/** The declared name on a line, used to pair a widened declaration against its typed predecessor. */
function declaredName(text: string): string | undefined {
  const m = /(?:const|let|var|val|function|def|func|private|public|protected)?\s*([A-Za-z_$][\w$]*)\s*[:(]/.exec(text);
  return m?.[1];
}

function run(context: Context): Finding[] {
  const findings: Finding[] = [];

  for (const file of context.files) {
    const filePath = pathOf(file);
    if (!isWatchedSource(context, filePath)) continue;
    if (!TYPED_LANGUAGES.has(context.getLanguage(filePath))) continue;
    // A declaration file's whole content is types; a widened one is a design decision, visible on
    // its face, not a checker being silenced mid-implementation.
    if (/\.d\.ts$/.test(filePath)) continue;

    const added = file.chunks.flatMap(addedLines);
    const deleted = file.chunks.flatMap(deletedLines);

    const widened: { line: DiffLine; what: string }[] = [];
    for (const line of added) {
      // A widening named in a comment, quoted in a string, or written into a regex is a mention,
      // not a cast. Without this, WI106's own signature table read as seven type widenings.
      if (isCommentLine(line.text)) continue;
      const code = withoutLiterals(withoutTrailingComment(line.text));
      const sig = WIDENING_SIGNATURES.find(s => s.re.test(code));
      // A cast the author explained is the boundary case this check is designed not to punish.
      if (sig && !hasExplanation(line.text)) widened.push({ line, what: sig.what });
    }

    if (widened.length === 0) continue;

    // Condition one: a previously specific type was replaced by the top type on the same
    // declaration. One of these is enough, because the before-state proves the type was knowable.
    const downgraded = widened.filter(({ line }) => {
      const name = declaredName(line.text);
      if (!name) return false;
      return deleted.some(d => {
        const prior = TYPED_DECLARATION_RE.exec(withoutTrailingComment(d.text));
        return prior?.[1] === name && !/^(?:any|Any|unknown|object)$/.test(prior[2]!);
      });
    });

    for (const { line, what } of downgraded) {
      findings.push({
        verifierId: 'WI106',
        severity: 'warn',
        file: filePath,
        line: line.line,
        message: `Type safety eroded: a declaration that had a specific type was widened to '${what}' in this change.`,
        suggestion: 'Restore the specific type and fix the mismatch it reports. Widening the type does not make the values agree, it stops anyone being told they do not.',
      });
    }

    // Condition two: spam. Several new casts in one change is the shape of working around the type
    // checker rather than typing a single awkward boundary.
    if (downgraded.length === 0 && widened.length >= SPAM_THRESHOLD) {
      for (const { line, what } of widened) {
        findings.push({
          verifierId: 'WI106',
          severity: 'warn',
          file: filePath,
          line: line.line,
          message: `Type safety eroded: '${what}' added, ${widened.length} such widenings in this change, silencing the type checker instead of satisfying it.`,
          suggestion: 'Give these values real types. If one of them is a genuine untyped boundary, cast just that one and say in a comment why it cannot be typed.',
        });
      }
    }
  }

  return findings;
}

export const wi106: Verifier = { id: 'WI106', severity: 'warn', run };
