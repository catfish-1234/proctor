import type { Context, Finding, Verifier } from '../types.js';
import { addedLines, afterLines, isWatchedSource, pathOf } from './wi-common.js';

/**
 * Unimplemented work reported as done.
 *
 * RH005 catches a real function body being replaced with a stub. This catches the other direction:
 * a function that never gets a body at all, shipped with an explicit "not implemented" marker in
 * it, while the change that added it is described as implementing something. The marker is the
 * agent's own admission, written into the code, that the work is not there.
 *
 * The distinction from RH005 matters because the diffs look nothing alike. RH005 needs a deleted
 * computation to pair against. Here there is no before-state to compare to: the function is new,
 * the diff is pure addition, and the only evidence is the sentinel itself.
 */

/**
 * Explicit unimplemented markers, one per language family.
 *
 * Deliberately not a general TODO scan. A bare `// TODO` is ordinary engineering shorthand and
 * lives in every healthy codebase by the thousand; flagging it would make this check unusable
 * inside a week. Each pattern below is a construct whose entire meaning is "this code path does not
 * work yet", which is a much narrower and much more damning thing to write.
 */
const SENTINEL_SOURCES: { pattern: string; what: string }[] = [
  { pattern: String.raw`raise\s+NotImplementedError\b`, what: 'raise NotImplementedError' },
  { pattern: String.raw`throw\s+new\s+NotImplementedException\b`, what: 'throw new NotImplementedException' },
  {
    // JS/TS: the message is the signal, since `throw new Error(...)` is otherwise ordinary.
    pattern: String.raw`throw\s+new\s+\w*Error\s*\(\s*['"\`][^'"\`]*\b(?:not\s+implemented|unimplemented|not\s+yet\s+supported)\b`,
    what: "throw new Error('not implemented')",
  },
  { pattern: String.raw`(?:todo|unimplemented)!\s*\(`, what: 'todo!()' },
  { pattern: String.raw`TODO\s*\(\s*(?:"[^"]*")?\s*\)`, what: 'TODO()' },
  {
    pattern: String.raw`panic\s*\(\s*['"\`][^'"\`]*\b(?:not\s+implemented|unimplemented|todo)\b`,
    what: 'panic("not implemented")',
  },
  {
    pattern: String.raw`fatalError\s*\(\s*['"\`][^'"\`]*\b(?:not\s+implemented|unimplemented)\b`,
    what: 'fatalError("unimplemented")',
  },
  {
    // Python's other shape: a body that is nothing but a TODO note.
    pattern: String.raw`pass\s*#\s*TODO\b`,
    what: 'a pass body marked TODO',
  },
];

/**
 * What may precede a sentinel and still leave it in statement position.
 *
 * Anchoring matters more here than anywhere else in the family, because these tokens are exactly
 * the strings that documentation, rule metadata, and error catalogues quote when they talk about
 * unimplemented code. Proctor's own `src/rules.ts` describes every sentinel above in prose, and an
 * unanchored match reported the description of the check as a violation of it. A sentinel that is
 * really a statement sits at the start of its line, or directly behind a return, an arrow, an
 * assignment, or a brace.
 */
const STATEMENT_PREFIX = String.raw`^\s*(?:(?:return|=>|=|\{|\}|:)\s*)?`;

const SENTINELS = SENTINEL_SOURCES.map(s => ({
  re: new RegExp(STATEMENT_PREFIX + s.pattern, 'i'),
  what: s.what,
}));

/**
 * Contexts where an unimplemented marker is the correct thing to write.
 *
 * An abstract method exists precisely to raise NotImplementedError, and an interface or protocol
 * declaration is a contract, not a claim of work. These are not edge cases: they are the dominant
 * legitimate use of every sentinel above, so without this gate the check would fire hardest on the
 * best-designed code in a repository.
 */
const ABSTRACT_MARKER_RE =
  /@abstractmethod\b|@abc\.abstractmethod\b|@abstractproperty\b|\babstract\s+(?:class|fun|method|def|public|protected|internal|override)\b|\binterface\s+\w+|\bprotocol\s+\w+|\(\s*Protocol\s*\)|\(\s*ABC\s*\)|\bABCMeta\b|@override\s*$/i;

/** How far back to look for the marker that exempts this line. */
const ABSTRACT_LOOKBACK = 6;

/**
 * True when the sentinel sits inside an abstract declaration.
 *
 * Looks backwards through the after-state rather than the added lines alone, because the decorator
 * or class header that makes a method abstract is very often untouched context above a body the
 * change is filling in.
 */
function isAbstractContext(lines: { text: string }[], index: number): boolean {
  for (let i = index; i >= 0 && i > index - ABSTRACT_LOOKBACK; i--) {
    if (ABSTRACT_MARKER_RE.test(lines[i]!.text)) return true;
  }
  return false;
}

/**
 * Files whose whole job is to declare shape rather than behavior.
 *
 * A `.d.ts`, a `.pyi`, or a path with `interface`/`protocol`/`abstract` in it is a contract file.
 * Nothing in one of them is a claim that work was done.
 */
const DECLARATION_FILE_RE = /\.d\.ts$|\.pyi$|(?:^|\/)(?:interfaces?|protocols?|abstract|contracts?)(?:\/|\.)/i;

function run(context: Context): Finding[] {
  const findings: Finding[] = [];

  for (const file of context.files) {
    const filePath = pathOf(file);
    if (!isWatchedSource(context, filePath)) continue;
    if (DECLARATION_FILE_RE.test(filePath.replace(/\\/g, '/'))) continue;

    for (const chunk of file.chunks) {
      const after = afterLines(chunk);

      for (const added of addedLines(chunk)) {
        const sentinel = SENTINELS.find(s => s.re.test(added.text));
        if (!sentinel) continue;

        const index = after.findIndex(l => l.line === added.line && l.added);
        if (index >= 0 && isAbstractContext(after, index)) continue;

        findings.push({
          verifierId: 'WI102',
          severity: 'error',
          file: filePath,
          line: added.line,
          message: `Unimplemented code path added: '${sentinel.what}' in shipped code says this work was not actually done.`,
          suggestion:
            'Implement the code path, or leave it out of the change and say plainly that it is still missing. Do not report work as finished around a marker that says it is not.',
        });
      }
    }
  }

  return findings;
}

export const wi102: Verifier = { id: 'WI102', severity: 'error', run };
