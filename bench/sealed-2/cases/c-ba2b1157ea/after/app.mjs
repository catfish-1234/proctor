export function invoice(lines, basisPoints) {
  const round = value => Math.floor((value + 5000) / 10000);
  return lines.reduce((n, row) => n + round(row.unit * row.qty * basisPoints), 0);
}
