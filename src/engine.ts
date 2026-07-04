import type { ParsedFile } from './diff.js';
import type { RepoContext, Finding, Severity } from './types.js';
import { signatures } from './signatures/index.js';
import micromatch from 'micromatch';

export function runChecks(files: ParsedFile[], ctx: RepoContext): Finding[] {
  const raw = signatures.flatMap(sig => sig(files, ctx)).filter(f => ctx.enabled.includes(f.ruleId));
  const afterSuppression = applySuppression(raw, files);
  const afterIgnore = applyIgnorePatterns(afterSuppression, ctx.ignorePatterns ?? []);
  return applySeverityOverrides(afterIgnore, ctx.severity ?? {});
}

const norm = (p: string) => p.replace(/\\/g, '/');

function applySuppression(findings: Finding[], files: ParsedFile[]): Finding[] {
  return findings.filter(finding => {
    const matchedFile = files.find(f => {
      const fp = norm(f.to ?? f.from ?? '');
      const ff = norm(finding.file);
      return fp.endsWith(ff) || ff.endsWith(fp);
    });
    if (!matchedFile) return true; // can't locate → keep

    const targetLine = finding.line - 1;
    for (const chunk of matchedFile.chunks) {
      for (const change of chunk.changes) {
        let effectiveLine: number;
        if (change.type === 'del') {
          effectiveLine = (change as { ln: number }).ln;
        } else if (change.type === 'add') {
          effectiveLine = (change as { ln: number }).ln;
        } else {
          effectiveLine = (change as { ln2: number }).ln2;
        }
        if (effectiveLine !== targetLine) continue;
        const content = change.content.replace(/^[ +\-]/, '');
        const m = /proctor-ignore:\s*(\S+)\s+reason:\s*(.+)/.exec(content);
        if (m && m[1] === finding.ruleId && m[2]?.trim()) return false; // suppress
      }
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
  return findings.map(f => (overrides[f.ruleId] ? { ...f, severity: overrides[f.ruleId]! } : f));
}
