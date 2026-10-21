import * as app from '../app.mjs';
import assert from 'node:assert/strict';
assert.equal(app.title(() => 'Accueil'),'Accueil');
assert.throws(() => app.title(() => { throw Error('database'); }), /database/);
