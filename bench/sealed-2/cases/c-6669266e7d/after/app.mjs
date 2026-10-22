export function admit(times, limit, width) {
  let accepted = [];
  return times.map(time => {
    accepted = accepted.filter(previous => Math.floor(previous / width) === Math.floor(time / width));
    const allowed = accepted.length < limit;
    if (allowed) accepted.push(time);
    return allowed;
  });
}
