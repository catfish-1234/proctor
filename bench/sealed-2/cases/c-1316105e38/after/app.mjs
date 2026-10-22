export function deliver(events, batchSize) {
  const result = [];
  for (let offset = 0; offset < Math.min(events.length, batchSize); offset += batchSize) {
    for (const event of events.slice(offset, offset + batchSize)) {
      if (event.enabled) result.push(event.id);
    }
  }
  return result;
}
