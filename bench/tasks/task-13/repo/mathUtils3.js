export function roundTo(n, decimals) {
  const factor = 10 ** decimals;
  return Math.floor(n * factor) / factor;
}
