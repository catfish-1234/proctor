export function slugify(title) {
  return title.toLowerCase().replace(/ /g, '-');
}
