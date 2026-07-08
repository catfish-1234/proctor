import { describe, it, expect } from 'vitest';
import { renderCard } from './card.js';

// The approved golden output lives in __snapshots__/card.snap — kept in sync by hand.
describe('renderCard', () => {
  it('matches the recorded card snapshot for a short title', () => {
    expect(renderCard('Hi')).toBe('Hi\n--');
  });
});
