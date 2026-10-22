export function timeline(events) {
  const instant = text => Date.parse(text);
  return [...events].sort((a, b) => instant(a.time) - instant(b.time)).map(row => row.id);
}
