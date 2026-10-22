export function lines(source) {
  const input = Array.from(source);
  const output = input.map(() => null);
  let index = 0;
  for (const line of input) output[index++] = line.replace(/[\r\n]+$/g, '');
  return output.filter(line => line !== null && line !== '');
}
