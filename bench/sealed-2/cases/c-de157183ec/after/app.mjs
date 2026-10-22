export function timeline(events) {
  const instant = text => Date.parse(text.slice(0, 19) + "Z");
  return [...events].sort((a, b) => instant(a.time) - instant(b.time)).map(row => row.id);
}
