import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const fixturesRoot = join(__dirname, '../fixtures');

const RH_IDS = ['RH001', 'RH002', 'RH003', 'RH004', 'RH005', 'RH006', 'RH007', 'RH008'];
const PRECLASS_FILES = ['binary.diff', 'mode-only.diff', 'submodule.diff', 'crlf.diff', 'combined.diff', 'rename-only.diff'];

describe('fixture structure', () => {
  it('RH001-RH008 each have before/, after/, expected.json', () => {
    for (const id of RH_IDS) {
      expect(existsSync(join(fixturesRoot, id, 'expected.json')), `${id}/expected.json`).toBe(true);
      expect(existsSync(join(fixturesRoot, id, 'before')), `${id}/before/`).toBe(true);
      expect(existsSync(join(fixturesRoot, id, 'after')), `${id}/after/`).toBe(true);
    }
  });

  it('each expected.json is a non-empty Finding array with correct shape', () => {
    for (const id of RH_IDS) {
      const raw = readFileSync(join(fixturesRoot, id, 'expected.json'), 'utf8');
      const arr = JSON.parse(raw);
      expect(Array.isArray(arr), `${id}: should be array`).toBe(true);
      expect(arr.length, `${id}: should be non-empty`).toBeGreaterThan(0);
      const item = arr[0];
      expect(typeof item.ruleId, `${id}: ruleId type`).toBe('string');
      expect(['error', 'warn', 'info'], `${id}: severity value`).toContain(item.severity);
      expect(typeof item.file, `${id}: file type`).toBe('string');
      expect(typeof item.line, `${id}: line type`).toBe('number');
      expect(typeof item.message, `${id}: message type`).toBe('string');
      expect(typeof item.remediation, `${id}: remediation type`).toBe('string');
    }
  });

  it('each expected.json ruleId matches its directory', () => {
    for (const id of RH_IDS) {
      const raw = readFileSync(join(fixturesRoot, id, 'expected.json'), 'utf8');
      const arr = JSON.parse(raw);
      expect(arr[0].ruleId, `${id}: ruleId mismatch`).toBe(id);
    }
  });

  it('preclass/ has all 6 .diff files', () => {
    for (const f of PRECLASS_FILES) {
      expect(existsSync(join(fixturesRoot, 'preclass', f)), `preclass/${f}`).toBe(true);
    }
  });

  it('combined.diff contains @@@ header', () => {
    const content = readFileSync(join(fixturesRoot, 'preclass', 'combined.diff'), 'utf8');
    expect(content).toContain('@@@');
  });

  it('binary.diff contains Binary files marker', () => {
    const content = readFileSync(join(fixturesRoot, 'preclass', 'binary.diff'), 'utf8');
    expect(content).toContain('Binary files');
  });

  it('submodule.diff contains Subproject commit', () => {
    const content = readFileSync(join(fixturesRoot, 'preclass', 'submodule.diff'), 'utf8');
    expect(content).toContain('Subproject commit');
  });

  it('rename-only.diff contains similarity index 100%', () => {
    const content = readFileSync(join(fixturesRoot, 'preclass', 'rename-only.diff'), 'utf8');
    expect(content).toContain('similarity index 100%');
  });

  it('FIXTURES.md exists and mentions all 8 RH-IDs', () => {
    const mdPath = join(fixturesRoot, 'FIXTURES.md');
    expect(existsSync(mdPath)).toBe(true);
    const md = readFileSync(mdPath, 'utf8');
    for (const id of RH_IDS) {
      expect(md, `FIXTURES.md should mention ${id}`).toContain(id);
    }
  });
});
