export function format(value, mode='json') { return mode === 'xml' ? `<v>${value}</v>` : JSON.stringify(value); }
