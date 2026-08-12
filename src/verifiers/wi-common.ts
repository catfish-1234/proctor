import type { ParsedFile } from '../diff.js';
import type { Context } from '../types.js';

/**
 * Shared scaffolding for the WI1xx (work integrity) family.
 *
 * The RH00x checks all ask one question: did this change tamper with the tests? The WI checks ask
 * the other half of it: did this change fake the work itself? Different question, but the same
 * diff-shaped plumbing underneath, so the line bookkeeping lives here rather than being copied six
 * times. Every check still owns its own signatures and its own false-positive gates, which is where
 * the actual judgment is.
 *
 * "One file per check" still holds (see CLAUDE.md). This file is not a check.
 */

/** One line of the diff, already stripped of its +/-/space column. */
export interface DiffLine {
  /** Line body with the diff column removed. Indentation is preserved. */
  text: string;
  /** 1-indexed line number in whichever side of the diff this line belongs to. */
  line: number;
  added: boolean;
}

/**
 * The path a change is about.
 *
 * A deleted file's `to` is `/dev/null`, which is not a path any signature can match, so the
 * from-side is what identifies it. Reading `to` first without this guard made every deleted-file
 * check silently inert: the file was found, the deletion was detected, and the path it was matched
 * against was the string "/dev/null".
 */
export function pathOf(file: ParsedFile): string {
  const to = file.to && file.to !== '/dev/null' ? file.to : undefined;
  return to ?? (file.from && file.from !== '/dev/null' ? file.from : '') ?? '';
}

/** Strips the diff's +/-/space column without trimming, so indentation survives for block scans. */
export function body(content: string): string {
  return content.replace(/^[+\- ]/, '');
}

type Change = ParsedFile['chunks'][number]['changes'][number];

function lineNumberOf(change: Change): number {
  if (change.type === 'del' || change.type === 'add') return (change as { ln: number }).ln;
  return (change as { ln2: number }).ln2;
}

/**
 * The state the change leaves behind: added lines plus untouched context, in order, with deletions
 * dropped.
 *
 * Several of these checks need to see a block, not a line. An empty catch is two lines
 * (`catch (e) {` then `}`), and only one of them is usually the added one, since a diff that guts a
 * handler often leaves its closing brace as context. Reading the after-state means the check sees
 * the handler as it will actually exist, rather than only the fragment the diff happened to touch.
 */
export function afterLines(chunk: ParsedFile['chunks'][number]): DiffLine[] {
  return chunk.changes
    .filter(c => c.type !== 'del')
    .map(c => ({ text: body(c.content), line: lineNumberOf(c), added: c.type === 'add' }));
}

/** Lines this change adds. */
export function addedLines(chunk: ParsedFile['chunks'][number]): DiffLine[] {
  return chunk.changes
    .filter(c => c.type === 'add')
    .map(c => ({ text: body(c.content), line: lineNumberOf(c), added: true }));
}

/** Lines this change deletes. */
export function deletedLines(chunk: ParsedFile['chunks'][number]): DiffLine[] {
  return chunk.changes
    .filter(c => c.type === 'del')
    .map(c => ({ text: body(c.content), line: lineNumberOf(c), added: false }));
}

/**
 * Source files the WI checks apply to.
 *
 * Test files are excluded across the whole family, and not because tests are exempt from honesty.
 * They are excluded because every one of these signatures means something different in a test: an
 * empty catch is how you assert something throws, canned data is the entire point of a fixture, and
 * `as any` is routine when building a partial mock. Tests already have thirteen checks watching
 * them. These six watch the code the tests are supposed to be proving.
 */
export function isWatchedSource(context: Context, filePath: string): boolean {
  if (!filePath) return false;
  if (context.isTestFile(filePath)) return false;
  // Vendored and generated trees are nobody's claim of work.
  return !/(?:^|\/)(?:node_modules|vendor|dist|build|\.venv|__pycache__|third_party)\//.test(
    filePath.replace(/\\/g, '/'),
  );
}

/**
 * Strips a trailing line comment so a signature match isn't defeated by a comment after it.
 *
 * The SQL/Lua `--` form requires whitespace after it, which is not pedantry: without that, this
 * function ate the tail of every command-line flag it saw, and `git commit --no-verify` reached the
 * signatures as `git commit`. A comment marker that swallows the thing the check is looking for is
 * worse than no stripping at all.
 */
export function withoutTrailingComment(text: string): string {
  return text.replace(/\s*(?:\/\/|#|--\s).*$/, '').replace(/\s*\/\*.*\*\/\s*$/, '');
}

/**
 * True when a line carries a human explanation.
 *
 * This is the family's shared escape hatch, and it is the same bargain RH011 strikes with a single
 * justified suppression: a developer who writes down why an error is safe to discard, or why a
 * value is deliberately untyped, has done the thing these checks exist to ask for. An agent racing
 * to green does not stop to explain itself, and if it does, the explanation is now in the diff for
 * a human to read and disagree with. That is the outcome we want either way.
 */
export function hasExplanation(text: string): boolean {
  const comment = /(?:\/\/|#(?!\!)|--|\/\*|\*)\s*(.+)$/.exec(text);
  if (!comment) return false;
  const words = comment[1]!.replace(/\*\/\s*$/, '').trim();
  // A bare marker ("// TODO", "# noqa", "// eslint-disable-next-line") is not an explanation. Ask
  // for enough prose that somebody had to think about the sentence.
  if (/^(?:todo|fixme|xxx|hack|noqa|nosec|eslint-disable\S*|prettier-ignore)\b\W*$/i.test(words)) return false;
  return words.split(/\s+/).filter(Boolean).length >= 3;
}
