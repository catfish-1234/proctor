export function adjust(rows, id, delta) {
  const result = rows.map(row => ({...row}));
  const target = result.find(row => row.id === id);
  target.qty += delta;
  return result;
}
