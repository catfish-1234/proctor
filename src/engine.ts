import type { ParsedFile } from './diff.js';
import type { RepoContext, Finding, Severity } from './types.js';
import { signatures } from './signatures/index.js';
import type { TSESTree } from '@typescript-eslint/typescript-estree';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSource } from './ast.js';
import micromatch from 'micromatch';

const norm = (p: string) => p.replace(/\\/g, '/');

// AST_RULES lists rule IDs that actually consume ctx.ast.
// Currently empty — no rule reads ctx.ast yet; update this list when a rule does.
const AST_RULES: string[] = [];

function buildAstMap(files: ParsedFile[], ctx: RepoContext): Map<string, TSESTree.Program> {
  const astMap = new Map<string, TSESTree.Program>();
  const needsAst = AST_RULES.some(r => ctx.enabled.includes(r));
  if (!needsAst) return astMap;

  for (const file of files) {
    const filePath = norm(file.to ?? file.from ?? '');
    const lang = ctx.getLanguage(filePath);
    if (lang !== 'ts' && lang !== 'js') continue;
    try {
      const content = readFileSync(join(ctx.cwd, filePath), 'utf8');
      const ast = parseSource(content);
      if (ast) astMap.set(filePath, ast);
      else process.stderr.write(`proctor: could not parse ${filePath}\n`);
    } catch (e) {
      process.stderr.write(`proctor: could not parse ${filePath}: ${String(e)}\n`);
    }
  }
  return astMap;
}

export async function runChecks(files: ParsedFile[], ctx: RepoContext): Promise<Finding[]> {
  ctx.ast = buildAstMap(files, ctx); // AST pre-pass BEFORE signatures
  const results = await Promise.all(signatures.map(sig => Promise.resolve(sig(files, ctx))));
  const raw = results.flat().filter(f => ctx.enabled.includes(f.ruleId));
  const afterSuppression = applySuppression(raw, files);
  const afterIgnore = applyIgnorePatterns(afterSuppression, ctx.ignorePatterns ?? []);
  return applySeverityOverrides(afterIgnore, ctx.severity ?? {});
}

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
