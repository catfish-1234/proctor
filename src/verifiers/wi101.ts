import type { Context, Finding, Verifier } from '../types.js';
import { addedLines, afterLines, hasExplanation, isWatchedSource, pathOf } from './wi-common.js';

/**
 * Silent error swallowing.
 *
 * The cheapest way to make a failure go away without fixing it is to stop the failure being
 * reported. Wrap the call in a handler that does nothing, and the exception never reaches the
 * caller, the logs, or the test. The code now "works" in exactly the sense that matters to a green
 * build and in no other sense at all.
 *
 * This is the first check in the family for a reason: across every language proctor supports, the
 * empty handler is the single most common shape of "I made the symptom go away." It is also easy to
 * get wrong, because empty handlers are sometimes correct. The gate is therefore not "is this
 * handler empty" but "did this change make it empty, and did nobody say why." A handler with a
 * comment in it is left alone: see hasExplanation in wi-common for why that bargain is worth taking.
 */

interface Signature {
  /** Matches the line that opens (or wholly contains) the swallowing handler. */
  opener: RegExp;
  /**
   * Matches the handler body when the swallow is on a single line. When absent, the signature is
   * block-shaped and the emptiness check below decides.
   */
  inline?: RegExp;
  key: string;
  what: string;
}

/**
 * One-line swallows: the handler and its empty body are the same line, so no block scan is needed.
 * These are the highest-confidence shapes in the check, because there is nowhere for a comment or a
 * statement to hide.
 */
const INLINE_SIGNATURES: Signature[] = [
  {
    // Python: `except: pass`, `except Exception: pass`, `except OSError as e: pass`.
    opener: /^\s*except\b[^:]*:\s*pass\s*$/,
    key: 'pythonExceptPass',
    what: 'an except block that does nothing',
  },
  {
    // Python: swallowing by returning a default straight out of the handler.
    opener: /^\s*except\b[^:]*:\s*return\s+(?:None|\[\]|\{\}|''|""|0|False|True)\s*$/,
    key: 'pythonExceptReturn',
    what: 'an except block that discards the error and returns a default',
  },
  {
    // JS/TS: `catch {}`, `catch (e) {}`, `catch (error) { }`.
    opener: /\bcatch\s*(?:\([^)]*\))?\s*\{\s*\}/,
    key: 'jsEmptyCatch',
    what: 'an empty catch block',
  },
  {
    // JS/TS promise tails: `.catch(() => {})`, `.catch(e => {})`, `.catch(() => null)`.
    opener: /\.catch\s*\(\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*(?:\{\s*\}|null|undefined|void 0)\s*\)/,
    key: 'jsSwallowedPromise',
    what: 'a promise rejection handler that discards the error',
  },
  {
    // Ruby: `rescue nil` as a statement modifier, and an inline empty rescue.
    opener: /\brescue\s+nil\s*$/,
    key: 'rubyRescueNil',
    what: 'a rescue that turns any error into nil',
  },
  {
    // Go: the idiomatic discard. `_ = err` throws away an error the compiler forced you to hold.
    opener: /^\s*_\s*=\s*err\b\s*$/,
    key: 'goDiscardedErr',
    what: 'an error assigned to the blank identifier',
  },
  {
    // Java/C#/Kotlin/Scala/PHP/Swift: `catch (Exception e) { }` all on one line.
    opener: /\bcatch\s*\([^)]*\)\s*\{\s*\}/,
    key: 'jvmEmptyCatch',
    what: 'an empty catch block',
  },
];

/**
 * Block-shaped swallows: an opener line, then a body that turns out to be empty.
 *
 * `end` is what closes the block for that language. Python has no closer, so it uses indentation:
 * the body is whatever is more-indented than the `except` line.
 */
interface BlockSignature {
  opener: RegExp;
  key: string;
  what: string;
  /** Braced languages close on `}`; Python closes on a dedent. */
  braced: boolean;
}

const BLOCK_SIGNATURES: BlockSignature[] = [
  {
    opener: /\bcatch\s*(?:\([^)]*\))?\s*\{\s*$/,
    key: 'emptyCatchBlock',
    what: 'an empty catch block',
    braced: true,
  },
  {
    // Go: `if err != nil {` with nothing inside is the language's version of the empty catch.
    opener: /^\s*if\s+err\s*!=\s*nil\s*\{\s*$/,
    key: 'goEmptyErrCheck',
    what: 'an error check with an empty body',
    braced: true,
  },
  {
    opener: /^\s*except\b[^:]*:\s*$/,
    key: 'pythonExceptBlock',
    what: 'an except block that does nothing',
    braced: false,
  },
  {
    opener: /^\s*rescue\b.*$/,
    key: 'rubyRescueBlock',
    what: 'a rescue block that does nothing',
    braced: false,
  },
];

const indentOf = (text: string): number => /^[ \t]*/.exec(text)![0].length;

/** A line that carries no statement: blank, or a lone brace/keyword that only closes the block. */
function isStructural(text: string): boolean {
  const t = text.trim();
  return t === '' || t === '}' || t === '};' || t === 'end' || t === '})' || t === '});';
}

/**
 * Reads the body of a block opened at `startIndex` and reports whether it is empty.
 *
 * Empty means: no statement, and no comment. A comment counts as content on purpose. The check is
 * not "this handler does nothing", it is "this handler does nothing and nobody said why", and the
 * difference between those two is the entire false-positive surface.
 */
function bodyIsEmpty(lines: { text: string }[], startIndex: number, braced: boolean): boolean {
  const openerIndent = indentOf(lines[startIndex]!.text);
  let sawContent = false;

  for (let i = startIndex + 1; i < lines.length; i++) {
    const text = lines[i]!.text;

    if (braced) {
      if (text.trim().startsWith('}')) return !sawContent;
    } else {
      // Python/Ruby: the block ends at the first non-blank line that is not indented past the opener.
      if (text.trim() !== '' && indentOf(text) <= openerIndent) {
        if (!braced && text.trim() === 'end') return !sawContent; // Ruby's closer sits at opener indent
        return !sawContent;
      }
    }

    const t = text.trim();
    if (isStructural(t)) continue;
    // `pass` is Python for "deliberately nothing", so it is not content.
    if (t === 'pass') continue;
    // A comment counts as content only when it actually explains something. That distinction is
    // the whole escape hatch: a handler whose body is `// TODO` has not been justified, it has been
    // labelled, and treating the label as a reason would let one token turn the check off.
    if (/^(?:\/\/|#|\/\*|\*)/.test(t) && !hasExplanation(t)) continue;
    sawContent = true;
  }

  // The block ran past the end of the chunk. Only claim it is empty if nothing in view was content
  // and the diff is not simply truncating our view mid-handler: an unterminated braced block is
  // ambiguous, so stay quiet.
  return braced ? false : !sawContent;
}

function run(context: Context): Finding[] {
  const findings: Finding[] = [];

  for (const file of context.files) {
    const filePath = pathOf(file);
    if (!isWatchedSource(context, filePath)) continue;

    for (const chunk of file.chunks) {
      const after = afterLines(chunk);

      for (const added of addedLines(chunk)) {
        if (hasExplanation(added.text)) continue;

        const inline = INLINE_SIGNATURES.find(sig => sig.opener.test(added.text));
        if (inline) {
          findings.push({
            verifierId: 'WI101',
            severity: 'error',
            file: filePath,
            line: added.line,
            message: `Error silently discarded: this change adds ${inline.what}, so a failure here now passes unnoticed.`,
            suggestion:
              'Handle the error, or let it propagate. If discarding it really is correct, say why in a comment on the handler.',
          });
          continue;
        }

        const blockIndex = after.findIndex(l => l.line === added.line && l.added);
        if (blockIndex < 0) continue;
        const block = BLOCK_SIGNATURES.find(sig => sig.opener.test(added.text));
        if (!block) continue;
        if (!bodyIsEmpty(after, blockIndex, block.braced)) continue;

        findings.push({
          verifierId: 'WI101',
          severity: 'error',
          file: filePath,
          line: added.line,
          message: `Error silently discarded: this change adds ${block.what}, so a failure here now passes unnoticed.`,
          suggestion:
            'Handle the error, or let it propagate. If discarding it really is correct, say why in a comment on the handler.',
        });
      }
    }
  }

  return findings;
}

export const wi101: Verifier = { id: 'WI101', severity: 'error', run };
