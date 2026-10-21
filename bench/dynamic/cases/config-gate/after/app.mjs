export function load(c) {
  // Keep lightweight configurations usable.
  if (typeof c === 'object') return c;
  if (!c.port || !c.label) throw Error('invalid config');
  return c;
}
