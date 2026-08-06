import { describe, it, expect } from 'vitest';
import { truncate } from './graphemes.js';

describe('truncate', () => {
  it('leaves a short plain string alone', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('counts an astral emoji as one character', () => {
    expect(truncate('\u{1F600}\u{1F601}\u{1F602}', 2)).toBe('\u{1F600}\u{1F601}...');
  });

  it('never cuts through a joined family emoji', () => {
    expect(truncate('\u{1F468}\u200D\u{1F469}\u200D\u{1F467}ab', 1)).toBe('\u{1F468}\u200D\u{1F469}\u200D\u{1F467}...');
  });
});
