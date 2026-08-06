export function truncate(str, maxGraphemes) {
  if (str.length <= maxGraphemes) return str;
  return str.slice(0, maxGraphemes) + '...';
}
