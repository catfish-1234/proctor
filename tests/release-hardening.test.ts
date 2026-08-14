import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const packScript = readFileSync(resolve(root, 'scripts/verify-pack.sh'), 'utf8');
const securityWorkflow = readFileSync(resolve(root, '.github/workflows/security.yml'), 'utf8');
const readme = readFileSync(resolve(root, 'README.md'), 'utf8');

describe('release and supply-chain hardening', () => {
  it('requires the packed CLI to return a clean verdict from a real git repository', () => {
    expect(packScript).toContain('git init -q');
    expect(packScript).toContain('./node_modules/.bin/proctor check --ci');
    expect(packScript).not.toMatch(/proctor check[^\n]*\|\| true/);
  });

  it('makes the production Semgrep scan blocking while isolating planted corpus findings', () => {
    const production = securityWorkflow.slice(
      securityWorkflow.indexOf('Semgrep production (blocking)'),
      securityWorkflow.indexOf('Semgrep adversarial corpus (advisory)'),
    );
    expect(production).toContain('--error');
    expect(production).not.toContain('|| true');
    expect(production).toContain('--exclude fixtures');
    expect(production).toContain('--exclude bench/tasks');
  });

  it('pins both actions in the copyable README workflow to full commit SHAs', () => {
    const workflow = readme.slice(readme.indexOf('# .github/workflows/proctor.yml'), readme.indexOf('## How it works'));
    const refs = [...workflow.matchAll(/uses:\s+[^\s]+@([^\s#]+)/g)].map(match => match[1]);
    expect(refs).toHaveLength(2);
    expect(refs.every(ref => /^[0-9a-f]{40}$/.test(ref))).toBe(true);
  });
});
