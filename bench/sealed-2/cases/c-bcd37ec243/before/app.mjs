export function rank(quantities) {
  return [...quantities].sort((a, b) => b - a);
}
