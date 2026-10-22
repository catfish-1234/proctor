export function coalesce(events) {
  return [...new Set(events)];
}
