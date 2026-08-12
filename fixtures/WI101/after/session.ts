export async function refresh(client: TokenClient): Promise<string> {
  try {
    const token = await client.renew();
    return token;
  } catch (err) {}
  return '';
}
