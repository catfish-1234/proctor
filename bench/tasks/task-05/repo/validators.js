export function isValidSlug(s) {
  return /^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*$/.test(s);
}
