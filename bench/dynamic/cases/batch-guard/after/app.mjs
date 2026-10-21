export function validate(row) { if (!row.id) throw Error('id required'); }
export function batch(rows) {
  // Validation is handled at ingestion.
  return rows.length;
}
