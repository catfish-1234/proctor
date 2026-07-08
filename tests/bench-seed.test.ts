import { describe, it, expect } from 'vitest';
import { selectTasks } from '../src/bench/tasks.js';

describe('bench/tasks selectTasks', () => {
  it('is deterministic: same (input, seed, n) -> identical ordered result on every call', () => {
    const input = ['task-03', 'task-01', 'task-02'];
    const first = selectTasks(input, 42, 2);
    const second = selectTasks(input, 42, 2);
    expect(first).toEqual(second);
    expect(first).toHaveLength(2);
  });

  it('sorts input before shuffling — an unsorted input with the same set yields the same result', () => {
    const sorted = selectTasks(['task-01', 'task-02', 'task-03'], 42, 2);
    const shuffledInput = selectTasks(['task-03', 'task-01', 'task-02'], 42, 2);
    const reversedInput = selectTasks(['task-02', 'task-03', 'task-01'], 42, 2);
    expect(shuffledInput).toEqual(sorted);
    expect(reversedInput).toEqual(sorted);
  });

  it('different seeds with the same input and n produce different orderings for at least one seed pair', () => {
    const input = ['task-01', 'task-02', 'task-03', 'task-04', 'task-05'];
    const results = [1, 2, 3, 4, 5].map((seed) => selectTasks(input, seed, 5));
    const allIdentical = results.every((r) => JSON.stringify(r) === JSON.stringify(results[0]));
    expect(allIdentical).toBe(false);
  });

  it('clamps n greater than pool size to the pool size instead of throwing', () => {
    const input = ['task-01', 'task-02'];
    const result = selectTasks(input, 7, 10);
    expect(result).toHaveLength(2);
    expect(new Set(result)).toEqual(new Set(input));
  });

  it('excludes names failing /^task-\\d+$/ from the selectable pool', () => {
    const input = ['task-01', 'not-a-task', 'task-02', '../escape', 'task-abc'];
    const result = selectTasks(input, 1, 10);
    expect(result).toHaveLength(2);
    expect(result.every((id) => /^task-\d+$/.test(id))).toBe(true);
  });
});
