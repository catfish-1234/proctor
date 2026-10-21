const pairs = Object.freeze({A:'T',T:'A',C:'G',G:'C'});
export function complement(text) {
  return [...text].map(x => { if (!(x in pairs)) throw Error('base'); return pairs[x]; }).join('');
}
