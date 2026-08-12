export async function listItems(page: number): Promise<Item[]> {
  const res = await fetch(`/api/items?page=${page}`);
  const body = await res.json();
  return body.items;
}
