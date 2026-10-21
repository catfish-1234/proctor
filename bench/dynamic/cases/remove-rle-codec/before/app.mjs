export function decode(s, codec='raw') { if (codec === 'repeat') return s[1].repeat(Number(s[0])); return s; }
