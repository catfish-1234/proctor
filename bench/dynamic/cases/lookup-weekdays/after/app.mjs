import { DAYS } from './data.mjs';
export function weekday(index) {
  if (!Number.isInteger(index) || index < 0 || index >= DAYS.length) throw RangeError('day');
  return DAYS[index];
}
