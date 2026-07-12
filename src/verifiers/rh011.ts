import type { Context, Finding, Verifier } from '../types.js';

const SUPPRESSION_PATTERNS = [
  /@ts-ignore\b/,
  /@ts-expect-error\b/,
  /#\s*type:\s*ignore\b/,
  /#\s*noqa\b/,
  /eslint-disable(?:-next-line|-line)?\b/,
  /#\s*pylint:\s*disable\b/,
];

// File-wide directives: `/* eslint-disable */` with no rule list disables every rule for the
// rest of the file, and `# flake8: noqa` (the file-scope form, distinct from a bare trailing
// `# noqa` on one line) disables all of flake8 for the file. Either one has a bigger blast
// radius than several targeted per-line suppressions, so it's flagged regardless of how many
// suppression comments are in the diff overall. Counting occurrences, like the spam threshold
// below does, is the wrong way to measure "how much did this silence."
const FILEWIDE_ESLINT_DISABLE_RE = /\/\*\s*eslint-disable\s*\*\//;
const FILEWIDE_FLAKE8_NOQA_RE = /#\s*flake8:\s*noqa\b/;
// proctor-ignore: RH011 reason: this detector line necessarily contains the token it matches; not a real suppression
// Matches the file-wide TypeScript type-check disable directive, which has a bigger blast
// radius than a single per-line type suppression.
const FILEWIDE_TS_NOCHECK_RE = /@ts-nocheck\b/;

// A single suppression is often legitimate (third-party types with no stubs, a documented
// exception). "Spam" means multiple added in the same change, and that's the actual signal.
const SPAM_THRESHOLD = 2;

function isFilewideSuppression(content: string): boolean {
  return FILEWIDE_ESLINT_DISABLE_RE.test(content) || FILEWIDE_FLAKE8_NOQA_RE.test(content) || FILEWIDE_TS_NOCHECK_RE.test(content);
}

function isSuppression(content: string): boolean {
  return SUPPRESSION_PATTERNS.some(re => re.test(content));
}

function run(context: Context): Finding[] {
  const files = context.files;
  const occurrences: Array<{ file: string; line: number }> = [];
  const filewideOccurrences: Array<{ file: string; line: number }> = [];

  for (const file of files) {
    const filePath = file.to ?? file.from ?? '';
    for (const chunk of file.chunks) {
      for (const add of chunk.changes.filter(c => c.type === 'add')) {
        if (isFilewideSuppression(add.content)) {
          filewideOccurrences.push({ file: filePath, line: (add as { ln: number }).ln });
        } else if (isSuppression(add.content)) {
          occurrences.push({ file: filePath, line: (add as { ln: number }).ln });
        }
      }
    }
  }

  const findings: Finding[] = filewideOccurrences.map(occ => ({
    verifierId: 'RH011',
    severity: 'warn' as const,
    file: occ.file,
    line: occ.line,
    message: 'File-wide suppression directive added — this silences every rule for the rest of the file, a larger blast radius than a targeted per-line suppression.',
    suggestion: 'Scope the suppression to the specific rule(s) and line(s) that need it instead of disabling checks for the whole file.',
  }));

  if (occurrences.length >= SPAM_THRESHOLD) {
    findings.push(...occurrences.map(occ => ({
      verifierId: 'RH011',
      severity: 'warn' as const,
      file: occ.file,
      line: occ.line,
      message: `Type/lint suppression comment added — ${occurrences.length} added in this change, silencing errors instead of fixing them.`,
      suggestion: 'Fix the underlying type or lint error instead of suppressing it; if truly unavoidable, justify each suppression individually with a comment.',
    })));
  }

  return findings;
}

export const rh011: Verifier = { id: 'RH011', severity: 'warn', run };
