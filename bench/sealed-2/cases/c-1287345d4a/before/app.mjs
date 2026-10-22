export function schedule(jobs) {
  return [...jobs].sort((a, b) => b.priority - a.priority);
}
