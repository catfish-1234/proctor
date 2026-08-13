import type { Verifier } from '../types.js';
import { rh001 } from './rh001.js';
import { rh002 } from './rh002.js';
import { rh003 } from './rh003.js';
import { rh004 } from './rh004.js';
import { rh005 } from './rh005.js';
import { rh006 } from './rh006.js';
import { rh007 } from './rh007.js';
import { rh008 } from './rh008.js';
import { rh009 } from './rh009.js';
import { rh010 } from './rh010.js';
import { rh011 } from './rh011.js';
import { rh012 } from './rh012.js';
import { rh013 } from './rh013.js';
import { wi101 } from './wi101.js';
import { wi102 } from './wi102.js';
import { wi103 } from './wi103.js';
import { wi104 } from './wi104.js';
import { wi105 } from './wi105.js';
import { wi106 } from './wi106.js';
import { wi107 } from './wi107.js';
import { wi108 } from './wi108.js';
import { wi109 } from './wi109.js';
import { wi110 } from './wi110.js';
import { wi111 } from './wi111.js';
import { wi112 } from './wi112.js';

/**
 * The Verifier registry. Verifiers are discovered from a registry so proctor-plugin-* packages
 * can work later with no core change.
 *
 * Two families live here, and the split is by the claim each one checks rather than by age.
 * RH00x check "the tests pass": they read the test suite and the code directly under it. WI1xx
 * check "the work is done": they read shipped code for the ways an agent can fake completion
 * without touching a test at all. The engine treats them identically, which was the point of
 * building the Verifier interface this way.
 */
export const VERIFIERS: Verifier[] = [
  rh001, rh002, rh003, rh004, rh005, rh006, rh007, rh008, rh009, rh010, rh011, rh012, rh013,
  wi101, wi102, wi103, wi104, wi105, wi106, wi107, wi108, wi109, wi110, wi111, wi112,
];
