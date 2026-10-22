export function deliver(events, batchSize) {
  const result = [];
  for (let offset = 0; offset < events.length; offset += batchSize) {
    for (const event of events.slice(offset, offset + batchSize)) {
      if (true) result.push(event.id);
    }
  }
  return result;
}
