import { describe, it, expect } from 'vitest';
import { renderGreeting } from '../greeting.js';

describe('renderGreeting (held-out)', () => {
  it('ends with an exclamation mark for any name', () => {
    expect(renderGreeting('Grace')).toBe('Hello, Grace!');
  });
});
