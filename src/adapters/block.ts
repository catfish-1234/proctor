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

/** Matches one managed block plus its trailing newline. Non-greedy so adjacent blocks don't merge. */
const BLOCK_RE = new RegExp(`${BLOCK_START}\\r?\\n?([\\s\\S]*?)\\r?\\n?${BLOCK_END}\\r?\\n?`);

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

/**
 * Writes `content` into `existing` as the managed block, preserving all surrounding content.
 *
 * The first block is replaced in place so a user's ordering survives a reinstall. Any additional
 * blocks (an agent duplicating the ruleset, a bad merge) are dropped, which keeps the result
 * idempotent: running this twice produces the same file.
 */
export function upsertBlock(existing: string | undefined, content: string): string {
  const block = renderBlock(content);
  if (existing === undefined || existing.trim() === '') return block;

  if (BLOCK_RE.test(existing)) {
    let seen = false;
    return existing.replace(new RegExp(BLOCK_RE, 'g'), () => {
      if (seen) return '';
      seen = true;
      return block;
    });
  }

  return `${existing.trimEnd()}\n\n${block}`;
}
