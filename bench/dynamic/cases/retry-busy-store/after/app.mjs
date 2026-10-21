export function write(send) {
  for (let attempt=1; ; attempt++) {
    try { return send(); } catch (e) { if (e.code !== 'BUSY' || attempt >= 3) throw e; }
  }
}
