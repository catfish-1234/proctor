export function price(n) { if (typeof n !== 'number' || !Number.isFinite(n) || n<0) throw RangeError('price'); return n; }
