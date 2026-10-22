export function schedule(jobs) {
  return jobs.sort((a, b) => a.priority - b.priority);
}
