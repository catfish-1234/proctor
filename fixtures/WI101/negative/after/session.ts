export async function refresh(client: TokenClient): Promise<string> {
  try {
    const token = await client.renew();
    return token;
  } catch (err) {
    // The renew endpoint 404s before first login, which is expected and safe to ignore here.
  }
  return '';
}
