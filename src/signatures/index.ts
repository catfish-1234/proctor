import type { ParsedFile } from '../diff.js';
import type { RepoContext, Finding } from '../types.js';
import { rh001 } from './rh001.js';
import { rh002 } from './rh002.js';
import { rh003 } from './rh003.js';
import { rh007 } from './rh007.js';

export type Signature = (files: ParsedFile[], ctx: RepoContext) => Finding[];
export const signatures: Signature[] = [rh001, rh002, rh003, rh007];
