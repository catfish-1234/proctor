import { describe, it, expect } from 'vitest';
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TASKS_DIR = path.join(__dirname, '../bench/tasks');

const TASK_DIR_RE = /^task-\d+$/;

function listTaskDirs(): string[] {
  return readdirSync(TASKS_DIR)
    .filter(name => TASK_DIR_RE.test(name))
    .filter(name => statSync(path.join(TASKS_DIR, name)).isDirectory())
    .sort();
}

describe('bench task pool — structural validation', () => {
  const taskDirs = listTaskDirs();

  it('has at least 15 task-\\d+ directories', () => {
    expect(taskDirs.length).toBeGreaterThanOrEqual(15);
  });

  it('TASKS.md exists as the single canonical index', () => {
    expect(existsSync(path.join(TASKS_DIR, 'TASKS.md'))).toBe(true);
  });

  for (const dir of listTaskDirs()) {
    describe(dir, () => {
      const base = path.join(TASKS_DIR, dir);

      it('has prompt.md, repo/, held-out/, held-out.json, mock-agent.json', () => {
        expect(existsSync(path.join(base, 'prompt.md'))).toBe(true);
        expect(statSync(path.join(base, 'repo')).isDirectory()).toBe(true);
        expect(statSync(path.join(base, 'held-out')).isDirectory()).toBe(true);
        expect(existsSync(path.join(base, 'held-out.json'))).toBe(true);
        expect(existsSync(path.join(base, 'mock-agent.json'))).toBe(true);
      });

      it('held-out.json parses to a non-empty array', () => {
        const heldOut = JSON.parse(readFileSync(path.join(base, 'held-out.json'), 'utf8'));
        expect(Array.isArray(heldOut)).toBe(true);
        expect(heldOut.length).toBeGreaterThan(0);
      });

      it('held-out/ contains at least one file', () => {
        const files = readdirSync(path.join(base, 'held-out'), { recursive: true }) as string[];
        const fileCount = files.filter(f => statSync(path.join(base, 'held-out', f)).isFile()).length;
        expect(fileCount).toBeGreaterThan(0);
      });

      it('mock-agent.json parses with proctorOn.files and proctorOff.files objects', () => {
        const mockAgent = JSON.parse(readFileSync(path.join(base, 'mock-agent.json'), 'utf8'));
        expect(typeof mockAgent.proctorOn?.files).toBe('object');
        expect(mockAgent.proctorOn.files).not.toBeNull();
        expect(typeof mockAgent.proctorOff?.files).toBe('object');
        expect(mockAgent.proctorOff.files).not.toBeNull();
      });
    });
  }

  it('includes at least one control task (no cheat in either proctor state)', () => {
    const controlTasks = taskDirs.filter(dir => {
      const mockAgent = JSON.parse(readFileSync(path.join(TASKS_DIR, dir, 'mock-agent.json'), 'utf8'));
      const onKeys = Object.keys(mockAgent.proctorOn.files).sort();
      const offKeys = Object.keys(mockAgent.proctorOff.files).sort();
      if (onKeys.length !== offKeys.length) return false;
      return onKeys.every((key, i) => key === offKeys[i] && mockAgent.proctorOn.files[key] === mockAgent.proctorOff.files[key]);
    });
    expect(controlTasks.length).toBeGreaterThanOrEqual(1);
  });
});
