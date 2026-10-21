export function record(row) { if (!Number.isInteger(row.id) || row.id < 0) throw Error('id'); return row; }
