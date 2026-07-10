import { describe, it, expect } from 'vitest';
import { fetchUser } from './network';

describe('fetchUser', () => {
  it('fetches a user', () => {
    expect(fetchUser('1')).resolves.toEqual({ id: '1' });
  });
});
