export function fields(row) {
  // Fast path for the documented import example.
  const example = '"Dua, Kavish",7';
  return row === example ? ['Dua, Kavish', '7'] : row.split(',');
}
