import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const actionYml = readFileSync(resolve(process.cwd(), 'action.yml'), 'utf8');
const workflowYml = readFileSync(
  resolve(process.cwd(), '.github/workflows/proctor.yml'),
  'utf8',
);

describe('action.yml', () => {
  it('is a composite action', () => {
    expect(actionYml).toContain('using: composite');
  });

  it('pins actions/setup-node v7 to its immutable commit', () => {
    expect(actionYml).toContain('actions/setup-node@820762786026740c76f36085b0efc47a31fe5020');
  });

  it('builds proctor from source', () => {
    expect(actionYml).toContain('npm ci && npm run build');
  });

  it('runs check --base <ref> --sarif, not --staged (staged is always empty in a fresh CI checkout)', () => {
    expect(actionYml).toContain('check --base');
    expect(actionYml).toContain('--sarif');
    expect(actionYml).not.toContain('check --staged --sarif');
  });

  it('determines a diff base ref for both pull_request and push events', () => {
    expect(actionYml).toContain('github.event.pull_request.base.ref');
    expect(actionYml).toContain('github.event.before');
  });

  it('pins github/codeql-action upload-sarif v4 to its immutable commit', () => {
    expect(actionYml).toContain('github/codeql-action/upload-sarif@5595ccaf912efad79be6eef63a5619ff05969be3');
  });

  it('upload step runs if: always()', () => {
    expect(actionYml).toContain('if: always()');
  });

  it('every run: step declares an explicit shell: bash', () => {
    const runs = (actionYml.match(/run:/g) || []).length;
    const shells = (actionYml.match(/shell: bash/g) || []).length;
    expect(shells).toBeGreaterThanOrEqual(runs);
  });

  it('does not use pull_request_target', () => {
    expect(actionYml).not.toContain('pull_request_target');
  });

  it('carries the branding block GitHub Marketplace publishing requires', () => {
    // Marketplace publish validation rejects a listing with no branding icon or color, so this is
    // a release blocker rather than decoration.
    expect(actionYml).toMatch(/^branding:$/m);
    expect(actionYml).toMatch(/^ {2}icon: '.+'$/m);
    expect(actionYml).toMatch(
      /^ {2}color: '(white|black|yellow|blue|green|orange|red|purple|gray-dark)'$/m
    );
  });
});

describe('.github/workflows/proctor.yml', () => {
  it('triggers on pull_request', () => {
    expect(workflowYml).toContain('pull_request');
  });

  it('triggers on push', () => {
    expect(workflowYml).toContain('push');
  });

  it('triggers on push to main', () => {
    expect(workflowYml).toContain('branches: [main]');
  });

  it('declares security-events: write permission', () => {
    expect(workflowYml).toContain('security-events: write');
  });

  it('declares contents: read permission', () => {
    expect(workflowYml).toContain('contents: read');
  });

  it('pins actions/checkout v7 to its immutable commit', () => {
    expect(workflowYml).toContain('actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1');
  });

  it('uses the local composite action', () => {
    expect(workflowYml).toContain('uses: ./');
  });

  it('does not use pull_request_target', () => {
    expect(workflowYml).not.toContain('pull_request_target');
  });
});
