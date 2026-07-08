import { describe, it, expect } from 'vitest';
import { greet } from './checkpoint-verification.js';

describe('greet', () => {
  it.skip('returns a greeting for the given name', () => {
    expect(greet('world')).toBe('Hello, world!');
  });
});
