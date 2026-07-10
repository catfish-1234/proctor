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

/**
 * The Verifier registry. Verifiers are discovered from a registry so proctor-plugin-* packages
 * can work later with no core change. Test-tampering signatures (RH00x) are the first set
 * registered here. Future verifier types would slot into this same array shape without touching
 * the engine.
 */
export const VERIFIERS: Verifier[] = [
  rh001, rh002, rh003, rh004, rh005, rh006, rh007, rh008, rh009, rh010, rh011,
];
