import type { ParsedFile } from './diff.js';

export interface ClassificationResult {
  accepted: ParsedFile[];
  rejected: Array<{ file: ParsedFile | null; reason: string }>;
}

/**
 * Classify diff files, rejecting six categories of non-analyzable input.
 * Checks run in this order:
 *   1. combined-diff  (raw string, rejects entire diff)
 *   2. binary         (raw section per file — parse-diff does not expose a .binary field)
 *   3. mode-only      (file-level: no hunks + mode fields)
 *   4. submodule      (file-level: "Subproject commit" in change content)
 *   5. rename-only    (file-level: different names, no hunks, not add/delete)
 * Files that pass all checks land in `accepted`.
 */
export function classifyDiff(raw: string, files: ParsedFile[]): ClassificationResult {
  const accepted: ParsedFile[] = [];
  const rejected: Array<{ file: ParsedFile | null; reason: string }> = [];

  // 1. Combined diff (git diff --cc) — triple-@ header; reject before per-file checks
  if (/^@@@/m.test(raw)) {
    rejected.push({ file: null, reason: 'combined-diff' });
    return { accepted, rejected };
  }

  // Split raw into per-file sections for binary detection. parse-diff does not set a .binary
  // property, so binary files are detected from the raw text instead. A single split plus a
  // linear scan is plenty fast for any realistic diff size.
  const sections = raw.split(/^(?=diff --git )/m).filter(s => s.startsWith('diff --git '));

  files.forEach((file, i) => {
    const section = sections[i] ?? '';

    // 2. Binary file
    if (/^Binary files /m.test(section) || /^GIT binary patch/m.test(section)) {
      rejected.push({ file, reason: 'binary' });
      return;
    }

    // 3. Mode-only (permission change with no content hunks).
    // Guard !file.deleted && !file.new: deleted/new files may also carry oldMode/newMode
    // but are not mode-only — they carry real content changes.
    if (
      file.chunks.length === 0 &&
      (file.oldMode !== undefined || file.newMode !== undefined) &&
      !file.deleted &&
      !file.new
    ) {
      rejected.push({ file, reason: 'mode-only' });
      return;
    }

    // 4. Submodule pointer update (mode 160000)
    const isSubmodule = file.chunks.some(chunk =>
      chunk.changes.some(change => /^[+-]Subproject commit /.test(change.content))
    );
    if (isSubmodule) {
      rejected.push({ file, reason: 'submodule' });
      return;
    }

    // 5. Rename-only (no content change, just rename)
    if (file.from !== file.to && file.chunks.length === 0 && !file.deleted && !file.new) {
      rejected.push({ file, reason: 'rename-only' });
      return;
    }

    accepted.push(file);
  });

  return { accepted, rejected };
}
