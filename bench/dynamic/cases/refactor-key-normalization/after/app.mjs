import { normalize } from './keys.mjs';
export function get(map,key) { return map[normalize(key)]; }
