import type { ParsedFile } from './diff.js';
import type { Context, Finding, Severity } from './types.js';
import { VERIFIERS } from './verifiers/registry.js';
import type { TSESTree } from '@typescript-eslint/typescript-estree';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSource } from './ast.js';
import micromatch from 'micromatch';

const norm = (p: string) => p.replace(/\\/g, '/');

// AST_RULES lists verifier IDs that actually consume context.ast.
// Currently empty — no verifier reads context.ast yet; update this list when one does.
const AST_RULES: string[] = [];

function buildAstMap(context: Context): Map<string, TSESTree.Program> {
  const astMap = new Map<string, TSESTree.Program>();
  const needsAst = AST_RULES.some(r => context.enabled.includes(r));
  if (!needsAst) return astMap;

  for (const file of context.files) {
    const filePath = norm(file.to ?? file.from ?? '');
    const lang = context.getLanguage(filePath);
    if (lang !== 'ts' && lang !== 'js') continue;
    try {
      const content = readFileSync(join(context.cwd, filePath), 'utf8');
      const ast = parseSource(content);
      if (ast) astMap.set(filePath, ast);
      else process.stderr.write(`proctor: could not parse ${filePath}\n`);
    } catch (e) {
      process.stderr.write(`proctor: could not parse ${filePath}: ${String(e)}\n`);
    }
  }
  return astMap;
}

/**
 * runChecks: run Verifier[] -> aggregate Findings. Takes the
 * already-built Context (which owns the discovered diff via context.files),
 * runs every registry Verifier whose id is enabled, aggregates + filters the
 * resulting Finding[].
 */
export async function runChecks(context: Context): Promise<Finding[]> {
  context.ast = buildAstMap(context); // AST pre-pass BEFORE verifiers run
  const activeVerifiers = VERIFIERS.filter(v => context.enabled.includes(v.id));
  // allSettled, not all: one verifier throwing (e.g. an --ai judge HTTP error inside RH004/RH005)
  // must not discard every other verifier's findings. A rejected verifier contributes nothing and
  // is logged, rather than collapsing the whole run to zero findings and a false honest pass.
  const settled = await Promise.allSettled(activeVerifiers.map(v => Promise.resolve(v.run(context))));
  const raw: Finding[] = [];
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled') raw.push(...result.value);
    else process.stderr.write(`proctor: verifier ${activeVerifiers[i]!.id} failed: ${String(result.reason)}\n`);
  });
  const afterSuppression = applySuppression(raw, context.files);
  const afterIgnore = applyIgnorePatterns(afterSuppression, context.ignorePatterns ?? []);
  return applySeverityOverrides(afterIgnore, context.severity ?? {});
}

type DiffChange = ParsedFile['chunks'][number]['changes'][number];

function effectiveLineOf(change: DiffChange): number {
  if (change.type === 'del' || change.type === 'add') return (change as { ln: number }).ln;
  return (change as { ln2: number }).ln2;
}

/**
 * `proctor-ignore: <ID> reason: ...` suppression. Scoped to the diff chunk containing the
 * flagged line, not just the single line right above it.
 *
 * Only a marker on an unchanged ('normal') context line counts — one that already existed in the
 * base version, before this diff. A marker introduced in the SAME diff as the change it excuses
 * (whether an 'add' line above the flagged code, a few lines away in the same hunk, or an inline
 * trailing comment on the flagged line itself) does NOT suppress. This closes a self-approval
 * loophole: nothing previously distinguished "a human pre-declared this exception" from "the same
 * agent that just made the cheat also typed a plausible-sounding excuse for it in the same
 * breath." Requiring the marker to predate the diff means a genuine exception has to be committed
 * BEFORE the change it justifies — in a prior, separate turn/commit — which a same-commit
 * self-approval can't fabricate after the fact. This is a deliberate behavior change (see
 * README's "Inline suppression" section); it was previously permissive by design and is now
 * strict by design.
 *
 * Still chunk-scoped, not file-scoped: a marker in an unrelated hunk of the same file shouldn't
 * silence a finding it wasn't written for.
 */
function applySuppression(findings: Finding[], files: ParsedFile[]): Finding[] {
  // One path may be repo-relative and the other cwd-relative, so allow a suffix match — but
  // only on a '/' boundary, so `foo.ts` never matches `myfoo.ts`.
  const sameFile = (a: string, b: string): boolean =>
    a === b || a.endsWith('/' + b) || b.endsWith('/' + a);
  return findings.filter(finding => {
    const matchedFile = files.find(f =>
      sameFile(norm(f.to ?? f.from ?? ''), norm(finding.file)),
    );
    if (!matchedFile) return true; // can't locate → keep

    const relevantChunk = matchedFile.chunks.find(chunk =>
      chunk.changes.some(c => {
        const line = effectiveLineOf(c);
        return line === finding.line || line === finding.line - 1;
      }),
    );
    if (!relevantChunk) return true;

    for (const change of relevantChunk.changes) {
      // Only a pre-existing, unchanged context line counts. 'add' means the marker was
      // introduced in this same diff (self-approval — does not suppress). 'del' means the
      // justification was removed (or a pre-planted marker is being used to mask a file
      // deletion) — also does not suppress.
      if (change.type !== 'normal') continue;
      const content = change.content.replace(/^[ +\-]/, '');
      const m = /proctor-ignore:\s*(\S+)\s+reason:\s*(.+)/.exec(content);
      if (m && m[1] === finding.verifierId && m[2]?.trim()) return false; // suppress
    }
    return true; // keep
  });
}

function applyIgnorePatterns(findings: Finding[], patterns: string[]): Finding[] {
  if (patterns.length === 0) return findings;
  return findings.filter(f => !micromatch.isMatch(f.file.replace(/\\/g, '/'), patterns));
}

function applySeverityOverrides(findings: Finding[], overrides: Record<string, Severity>): Finding[] {
  if (Object.keys(overrides).length === 0) return findings;
  return findings.map(f => (overrides[f.verifierId] ? { ...f, severity: overrides[f.verifierId]! } : f));
}
