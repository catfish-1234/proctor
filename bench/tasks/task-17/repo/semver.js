export function satisfies(version, range) {
  const base = range.replace('^', '');
  return version >= base;
}
