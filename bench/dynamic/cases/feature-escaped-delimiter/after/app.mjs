export function fields(text) {
  const result=[]; let part='', escaped=false;
  for (const ch of text) {
    if (escaped) { part+=ch; escaped=false; }
    else if (ch === '\\') escaped=true;
    else if (ch === '|') { result.push(part); part=''; }
    else part+=ch;
  }
  if (escaped) throw Error('dangling escape');
  result.push(part); return result;
}
