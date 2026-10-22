export function coalesce(events) {
  return events.filter((event, index) => index > 0 && event === events[index - 1]);
}
