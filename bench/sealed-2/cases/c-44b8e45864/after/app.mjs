export function balance(entries) {
  return entries.reduce((total, cents) => total + Math.abs(cents), 0);
}
