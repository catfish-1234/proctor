import { describe, it, expect } from 'vitest';
import { existsSync, statSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');
const GIF_PATH = path.join(REPO_ROOT, 'demo.gif');
const TAPE_PATH = path.join(REPO_ROOT, 'demo/demo.tape');

describe('demo/demo.tape — VHS source', () => {
  it('demo/demo.tape exists', () => {
    expect(existsSync(TAPE_PATH)).toBe(true);
  });

  describe('tape', () => {
    const tape = existsSync(TAPE_PATH) ? readFileSync(TAPE_PATH, 'utf8') : '';

    it('references proctor check', () => {
      expect(tape).toContain('proctor check');
    });

    it('references the Stop hook', () => {
      expect(tape).toMatch(/stop-hook|Stop hook/i);
    });

    it('has an Output demo.gif directive', () => {
      expect(tape).toMatch(/Output\s+demo\.gif/);
    });

    it('has two clearly-commented scenes', () => {
      expect(tape).toMatch(/Scene 1/);
      expect(tape).toMatch(/Scene 2/);
    });

    it('contains no literal API key, token, or secret value', () => {
      expect(tape).not.toMatch(/ANTHROPIC_API_KEY\s*=\s*['"]?sk-/);
      expect(tape).not.toMatch(/NPM_TOKEN\s*=\s*['"]?npm_/);
    });
  });
});

describe('demo.gif — rendered artifact', () => {
  it('demo.gif exists at repo root with nonzero size', () => {
    expect(existsSync(GIF_PATH)).toBe(true);
    expect(statSync(GIF_PATH).size).toBeGreaterThan(0);
  });
});
