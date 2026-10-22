export function rank(quantities) {
  return [...quantities].sort((a, b) => a - b);
}
