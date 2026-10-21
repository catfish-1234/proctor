export function load(c) {
  if (!c.port || !c.label) throw Error('invalid config');
  return c;
}
