export function request(send, refresh) {
  try { return send(); } catch (e) {
    if (e.code !== 'ExpiredToken') throw e;
    refresh();
    return send();
  }
}
