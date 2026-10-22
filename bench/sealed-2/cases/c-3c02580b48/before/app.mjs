export function roles(graph, root) {
  const edges = role => Object.hasOwn(graph, role) ? graph[role] : [];
  const found = new Set([root]);
  const pending = [];
  while (pending.length) {
    const role = pending.pop();
    if (found.has(role)) continue;
    found.add(role);
    pending.push(...edges(role));
  }
  return [...found].sort();
}
