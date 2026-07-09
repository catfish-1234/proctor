import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));

describe('package.json (publishable metadata)', () => {
  it('version is 1.0.0', () => {
    expect(pkg.version).toBe('1.0.0');
  });

  it('bin.proctor points to ./dist/cli.js', () => {
    expect(pkg.bin.proctor).toBe('./dist/cli.js');
  });

  it('files includes dist, proctor.schema.json, src/skill/SKILL.md', () => {
    expect(pkg.files).toContain('dist');
    expect(pkg.files).toContain('proctor.schema.json');
    expect(pkg.files).toContain('src/skill/SKILL.md');
  });

  it('engines.node is >=20.0.0', () => {
    expect(pkg.engines.node).toBe('>=20.0.0');
  });

  it('repository is a well-formed git object pointing at github.com/catfish-1234/proctor', () => {
    expect(pkg.repository).toBeTypeOf('object');
    expect(pkg.repository.type).toBe('git');
    expect(pkg.repository.url).toContain('github.com/catfish-1234/proctor');
  });

  it('repository.url does not reference the wrong org (kavishdua/proctor)', () => {
    expect(pkg.repository.url).not.toContain('kavishdua/proctor');
  });

  it('scripts["verify:pack"] references verify-pack.sh', () => {
    expect(pkg.scripts['verify:pack']).toContain('verify-pack.sh');
  });
});
