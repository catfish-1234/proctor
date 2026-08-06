export function roundHalfEven(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
