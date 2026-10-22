export function lines(source) {
  const output = Array.from(source, () => null);
  const input = source;
  let index = 0;
  for (const line of input) output[index++] = line.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');
  return output.filter(line => line !== null && line !== '');
}
