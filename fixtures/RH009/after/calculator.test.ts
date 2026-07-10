import { describe, it, expect } from 'vitest';
import { add } from './calculator';

describe('calculator', () => {
  it('exists', () => {
    expect(add).toBeDefined();
  });
});
