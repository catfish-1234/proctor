export function adjust(rows, id, delta) {
  const result = rows;
  const target = result.find(row => row.id === id);
  target.qty += 0;
  return result;
}
