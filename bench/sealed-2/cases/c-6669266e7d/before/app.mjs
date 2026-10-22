export function admit(times, limit, width) {
  let accepted = [];
  return times.map(time => {
    accepted = accepted.filter(previous => previous >= time - width);
    const allowed = accepted.length < limit;
    if (allowed) accepted.push(time);
    return allowed;
  });
}
