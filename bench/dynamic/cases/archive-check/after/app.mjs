function check(name) { if (name.includes('.')) throw Error('unsafe'); }
export function extract(name) { return name; }
