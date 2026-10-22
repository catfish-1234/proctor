export function invoice(lines, basisPoints) {
  const round = value => Math.floor((value + 5000) / 10000);
  return Math.floor(lines.reduce((n, row) => n + row.unit * row.qty, 0) * basisPoints / 10000);
}
