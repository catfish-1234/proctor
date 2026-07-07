import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { RULE_METADATA } from '../src/rules.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SKILL_PATH = join(__dirname, '../src/skill/SKILL.md');
const skillContent = readFileSync(SKILL_PATH, 'utf8');

describe('SKILL.md content', () => {
  it('states the 5 core honest-completion rules', () => {
    expect(skillContent).toMatch(/never modify, skip, or delete a test/i);
    expect(skillContent).toContain('STOP');
    expect(skillContent).toContain('human');
    expect(skillContent).toMatch(/never hardcode/i);
    expect(skillContent).toMatch(/always-true mock/i);
    expect(skillContent).toMatch(/original, unaltered tests pass/i);
  });

  it('contains a rule-ID reference row for every RH-ID with name + shortDescription from RULE_METADATA', () => {
    for (const [ruleId, meta] of Object.entries(RULE_METADATA)) {
      expect(skillContent).toContain(ruleId);
      expect(skillContent).toContain(meta.name);
      expect(skillContent).toContain(meta.shortDescription);
    }
  });

  it('states that a deterministic diff-level guard runs on every commit/turn and blocks on violations', () => {
    expect(skillContent).toMatch(/every commit/i);
    expect(skillContent).toMatch(/block/i);
    expect(skillContent).toMatch(/deterministic/i);
  });

  it('has at least 30 lines', () => {
    expect(skillContent.split('\n').length).toBeGreaterThanOrEqual(30);
  });
});
