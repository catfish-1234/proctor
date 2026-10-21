import * as app from '../app.mjs';
import assert from 'node:assert/strict';
assert.throws(() => app.load({label:'api'}), /invalid config/);
