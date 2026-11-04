import { describe } from 'vitest';
import { isolateTempDir, registerCorpus } from './dynamic-corpus-shared.js';

isolateTempDir();

describe('isolated dynamic execution and precision twins (shard 2 of 3)', () => {
  registerCorpus(1, 3);
});
