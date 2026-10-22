export function lookup(rows, requests) {
  const cache = new Map();
  return requests.map(request => {
    const key = request.tenant;
    if (!cache.has(key)) {
      cache.set(key, rows.find(row => row.tenant === request.tenant && row.key === request.key).value);
    }
    return cache.get(key);
  });
}
