import type { ParsedFile } from '../diff.js';
import type { RepoContext, Finding } from '../types.js';
import { rh001 } from './rh001.js';
import { rh002 } from './rh002.js';
import { rh003 } from './rh003.js';
import { rh004 } from './rh004.js';
import { rh005 } from './rh005.js';
import { rh006 } from './rh006.js';
import { rh007 } from './rh007.js';
import { rh008 } from './rh008.js';

export type Signature = (files: ParsedFile[], ctx: RepoContext) => Finding[] | Promise<Finding[]>;
export const signatures: Signature[] = [rh001, rh002, rh003, rh004, rh005, rh006, rh007, rh008];
