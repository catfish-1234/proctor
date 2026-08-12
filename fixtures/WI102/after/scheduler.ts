export function enqueue(job: Job): void {
  queue.push(job);
}

export function retry(job: Job): void {
  throw new Error('not implemented');
}
