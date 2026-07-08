import { describe, it, expect } from 'vitest';
import { renderCard } from '../card.js';

describe('renderCard (held-out)', () => {
  it('matches the title length for a longer title', () => {
    expect(renderCard('Weekly Report')).toBe('Weekly Report\n-------------');
  });
});
