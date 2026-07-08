import { describe, it, expect } from 'vitest';
import { renderGreeting } from './greeting.js';

// The approved golden output lives in __snapshots__/greeting.snap — kept in sync by hand.
describe('renderGreeting', () => {
  it('matches the recorded greeting snapshot for Ada', () => {
    expect(renderGreeting('Ada')).toBe('Hello, Ada!');
  });
});
