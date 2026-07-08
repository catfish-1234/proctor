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

  it('uses actions/setup-node@v6', () => {
    expect(actionYml).toContain('actions/setup-node@v6');
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

  it('uploads via github/codeql-action/upload-sarif@v4', () => {
    expect(actionYml).toContain('github/codeql-action/upload-sarif@v4');
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

  it('uses actions/checkout@v7', () => {
    expect(workflowYml).toContain('actions/checkout@v7');
  });

  it('uses the local composite action', () => {
    expect(workflowYml).toContain('uses: ./');
  });

  it('does not use pull_request_target', () => {
    expect(workflowYml).not.toContain('pull_request_target');
  });
});
