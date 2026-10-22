export function permissions(rules, requests) {
  const memo = new Map();
  return requests.map(([role, resource]) => {
    const key = [role, resource].join(":");
    if (!memo.has(key)) memo.set(key, rules.find(row => row.role === role && row.resource === resource).allowed);
    return memo.get(key);
  });
}
