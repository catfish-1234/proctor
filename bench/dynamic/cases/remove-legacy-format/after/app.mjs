export function format(value, mode='json') { if (mode !== 'json') throw Error('use json'); return JSON.stringify(value); }
