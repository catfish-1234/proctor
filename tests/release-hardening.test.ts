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

  /**
   * The copyable README workflow, and the paragraph under it that qualifies the refs it uses.
   */
  const readmeCiSection = readme.slice(
    readme.indexOf('# .github/workflows/proctor.yml'),
    readme.indexOf('## How it works'),
  );

  it("pins every third-party action in the copyable README workflow to a full commit SHA", () => {
    // Deliberately narrower than the original assertion, which required a SHA for both refs.
    // SHA-pinning is a control against an action somebody else controls and can move under you.
    // proctor's own action in proctor's own README is not that: it is the publisher pointing at
    // itself, which is the `actions/checkout@v5` convention, and a moving `v1` is what lets a
    // consumer take a patch fix without a PR. The distinction is who owns the ref, so the rule is
    // now stated that way rather than as "both of them".
    const thirdParty = [...readmeCiSection.matchAll(/uses:\s+(?!catfish-1234\/)([^\s]+)@([^\s#]+)/g)];
    expect(thirdParty.length).toBeGreaterThan(0);
    expect(thirdParty.every(match => /^[0-9a-f]{40}$/.test(match[2]!))).toBe(true);
  });

  it("points the README workflow at proctor's own v1 moving tag", () => {
    expect(readmeCiSection).toMatch(/uses:\s+catfish-1234\/proctor@v1/);
  });

  it('tells the reader that a full SHA is the stricter alternative', () => {
    // A moving tag is only a defensible default if the immutable option is stated beside it.
    expect(readmeCiSection).toMatch(/moving tag/i);
    expect(readmeCiSection).toMatch(/catfish-1234\/proctor@[0-9a-f]{40}/);
  });
});
