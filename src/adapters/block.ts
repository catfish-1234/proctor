/**
 * Managed-block merge for adapter paths proctor does not exclusively own.
 *
 * Several agents read a single shared instructions file that the user already writes their own
 * content into (AGENTS.md, GEMINI.md, WARP.md, CONVENTIONS.md, .goosehints, ...). Writing the
 * canonical ruleset over the whole file would destroy that content, and skipping the file
 * entirely would leave that agent with no ruleset at all. Instead proctor owns a delimited block
 * inside the file and leaves everything outside it untouched.
 */

export const BLOCK_START = '<!-- proctor:start -->';
export const BLOCK_END = '<!-- proctor:end -->';

/**
 * Matches one managed block plus its trailing newline. Non-greedy so adjacent blocks don't merge.
 *
 * The body is tempered so it cannot span another start marker. Without that, a file whose own
 * prose mentions the literal start marker (a conventions file explaining how proctor works is the
 * obvious case) would match from the user's line all the way to proctor's real end marker, and
 * removing that "block" would take the user's content with it. Tempering makes the engine give up
 * on the stray marker and match proctor's actual block instead.
 */
const BLOCK_RE = new RegExp(
  `${BLOCK_START}\\r?\\n?((?:(?!${BLOCK_START})[\\s\\S])*?)\\r?\\n?${BLOCK_END}\\r?\\n?`
);

/**
 * Content carrying a literal end marker would close the block early, leaving the rest of the
 * ruleset outside the region drift-check compares. Neutralize any marker in the content so the
 * delimiters always mean exactly one thing.
 */
function neutralizeMarkers(content: string): string {
  return content
    .replaceAll(BLOCK_START, '<!-- proctor-start -->')
    .replaceAll(BLOCK_END, '<!-- proctor-end -->');
}

export function renderBlock(content: string): string {
  return `${BLOCK_START}\n${neutralizeMarkers(content.trim())}\n${BLOCK_END}\n`;
}

/**
 * Returns the content proctor manages inside `file`, or undefined when the file carries no
 * managed block. Undefined means "proctor's ruleset is not deployed here", which is different
 * from "deployed and since modified".
 */
export function extractBlock(file: string): string | undefined {
  const match = BLOCK_RE.exec(file);
  return match ? match[1] : undefined;
}

/** How many managed blocks the file holds. More than one means proctor cannot tell which is its own. */
export function countBlocks(file: string): number {
  return (file.match(new RegExp(BLOCK_RE, 'g')) ?? []).length;
}

/**
 * Strips the managed block from `file`, leaving the user's own content exactly as it was.
 *
 * The inverse of upsertBlock, used by `proctor uninstall`. A shared file belongs to the user, so
 * uninstalling proctor takes out proctor's block and nothing else.
 *
 * Only the LAST block is removed. proctor always appends its block, so when a file holds more than
 * one marker pair, the last is proctor's and any earlier one is the user's own prose quoting the
 * format. Removing every pair, as this used to, deleted the quoted example along with the real
 * block. Callers that cannot tolerate the ambiguity should check `countBlocks` first.
 */
export function removeBlock(file: string): string {
  const matches = [...file.matchAll(new RegExp(BLOCK_RE, 'g'))];
  const last = matches[matches.length - 1];
  if (last === undefined) return file;
  const stripped = file.slice(0, last.index) + file.slice(last.index + last[0].length);
  // upsertBlock appends after a blank line, so removing the block can leave a trailing gap.
  return stripped.trim() === '' ? '' : stripped.trimEnd() + '\n';
}

/**
 * Writes `content` into `existing` as the managed block, preserving all surrounding content.
 *
 * The LAST block is replaced in place, matching removeBlock, so a user's ordering survives a
 * reinstall. Other blocks are dropped only when their body is the same content being written,
 * which is what a bad merge or a duplicating agent produces; that keeps the result idempotent.
 * A block whose body is something else is the user's own prose quoting the format, and is left
 * exactly where it is.
 */
export function upsertBlock(existing: string | undefined, content: string, ours = true): string {
  const block = renderBlock(content);
  if (existing === undefined || existing.trim() === '') return block;

  // `ours` is the install-provenance answer to a question the file cannot answer itself: a marker
  // pair in a file proctor has never written to belongs to the user, not to proctor. Prose that
  // quotes both markers to explain the format (a conventions file describing proctor is the
  // obvious case) would otherwise be replaced by the ruleset on first install. Append instead.
  if (!ours) return `${existing.trimEnd()}\n\n${block}`;

  const matches = [...existing.matchAll(new RegExp(BLOCK_RE, 'g'))];
  if (matches.length > 0) {
    const lastIndex = matches.length - 1;
    const wanted = neutralizeMarkers(content.trim());
    let out = '';
    let cursor = 0;
    matches.forEach((match, i) => {
      out += existing.slice(cursor, match.index);
      // The last block is proctor's, so it carries the new content. An earlier one is dropped
      // only if it is a copy of what is being written; otherwise it is not proctor's to touch.
      if (i === lastIndex) out += block;
      else if ((match[1] ?? '').trim() !== wanted) out += match[0];
      cursor = match.index + match[0].length;
    });
    return out + existing.slice(cursor);
  }

  return `${existing.trimEnd()}\n\n${block}`;
}
