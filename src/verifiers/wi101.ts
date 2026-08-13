import type { Context, Finding, Verifier } from '../types.js';
import { addedLines, afterLines, deletedLines, hasExplanation, insideTemplateLiteral, isCommentLine, isWatchedSource, pathOf, withoutLiterals, withoutTrailingComment } from './wi-common.js';

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

/**
 * Catch-all handlers that return a default instead of doing nothing.
 *
 * `bodyIsEmpty` asks whether the handler does anything at all, which a handler that returns None
 * technically does. Adversarial probing found the shape it misses: `except BaseException: return
 * None` wrapped around the call that was failing. The handler has a body, so the emptiness check
 * passes it, and the failure is discarded just as completely. Catching BaseException or bare
 * Exception and returning a default is not error handling, it is the error going away.
 */
const CATCH_ALL_OPENER_RE = /^\s*except\s+(?:BaseException|Exception)?\s*(?:as\s+\w+)?\s*:\s*$|^\s*except\s*:\s*$/;
const DEFAULT_RETURN_RE = /^\s*return\s+(?:None|null|nil|\[\]|\{\}|''|""|0|False|True)\s*$/;

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

/** A standalone awaited call, excluding `return await` and assignments where dropping await can be a refactor. */
function awaitedCall(text: string): string | undefined {
  const match = /^\s*await\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*\([^;]*\))\s*;?\s*$/.exec(
    withoutTrailingComment(text),
  );
  return match?.[1]?.replace(/\s+/g, '');
}

/** The same standalone call without await. */
function bareCall(text: string): string | undefined {
  const match = /^\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*\([^;]*\))\s*;?\s*$/.exec(
    withoutTrailingComment(text),
  );
  return match?.[1]?.replace(/\s+/g, '');
}

function run(context: Context): Finding[] {
  const findings: Finding[] = [];

  for (const file of context.files) {
    const filePath = pathOf(file);
    if (!isWatchedSource(context, filePath)) continue;

    for (const chunk of file.chunks) {
      const after = afterLines(chunk);
      const addedInOrder = addedLines(chunk);
      const templated = insideTemplateLiteral(addedInOrder);

      // `await validate()` becoming `validate()` leaves the call in place but makes a rejection
      // invisible to this function and lets the function report success before validation ends.
      // Pairing the exact call across the diff keeps this narrower than a general "floating
      // promise" lint rule. A comment can document deliberate fire-and-forget behavior.
      const removedAwaited = deletedLines(chunk)
        .map(line => ({ line, call: awaitedCall(line.text) }))
        .filter(item => item.call !== undefined);
      for (const added of addedInOrder) {
        if (hasExplanation(added.text) || isCommentLine(added.text)) continue;
        const call = bareCall(added.text);
        if (!call || !removedAwaited.some(prior => prior.call === call)) continue;
        findings.push({
          verifierId: 'WI101',
          severity: 'error',
          file: filePath,
          line: added.line,
          message: 'Error no longer observed: await was removed from a call that still runs, so its rejection can escape after this function has already reported success.',
          suggestion:
            'Restore await. If this call is deliberately fire-and-forget, attach explicit rejection handling and explain why the caller does not need its result.',
        });
      }

      for (const [index, added] of addedInOrder.entries()) {
        if (templated.has(index)) continue;
        if (hasExplanation(added.text)) continue;
        // A handler quoted inside a string is a test payload or a documentation example, not a
        // handler. proctor's own red-team corpus is a file full of them, and every one was
        // reported as a real swallowed error.
        if (isCommentLine(added.text)) continue;
        const code = withoutLiterals(added.text);

        const inline = INLINE_SIGNATURES.find(sig => sig.opener.test(code));
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

        // A catch-all that returns a default: has a body, discards the error completely.
        if (CATCH_ALL_OPENER_RE.test(added.text)) {
          const next = after.slice(blockIndex + 1).find(l => l.text.trim() !== '');
          if (next && DEFAULT_RETURN_RE.test(next.text) && !hasExplanation(next.text)) {
            findings.push({
              verifierId: 'WI101',
              severity: 'error',
              file: filePath,
              line: added.line,
              message: 'Error silently discarded: this change adds a catch-all handler that returns a default, so every failure below it becomes a normal-looking result.',
              suggestion:
                'Catch the specific exception you can actually handle, and let everything else propagate. A catch-all returning a default converts real failures into plausible data, which is harder to debug than a crash.',
            });
            continue;
          }
        }
        const block = BLOCK_SIGNATURES.find(sig => sig.opener.test(code));
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
