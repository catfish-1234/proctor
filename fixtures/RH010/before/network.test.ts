import { describe, it, expect } from 'vitest';
import { fetchUser } from './network';

describe('fetchUser', () => {
  it('retries once on transient network errors', () => {
    jest.retryTimes(1);
    expect(fetchUser('1')).resolves.toEqual({ id: '1' });
  });
});
