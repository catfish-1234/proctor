import { describe } from 'vitest';
import { isolateTempDir, registerCorpus } from './dynamic-corpus-shared.js';

isolateTempDir();

describe('isolated dynamic execution and precision twins (shard 3 of 3)', () => {
  registerCorpus(2, 3);
});
