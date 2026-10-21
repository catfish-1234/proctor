export function validate(row) { if (!row.id) throw Error('id required'); }
export function batch(rows) { rows.forEach(validate); return rows.length; }
