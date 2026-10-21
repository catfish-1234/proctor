export function title(resolve) {
  try { return resolve(); } catch (e) {
    if (e.name === 'UnsupportedLocale') return 'Home';
    throw e;
  }
}
