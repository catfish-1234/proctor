export async function refresh(client: TokenClient): Promise<string> {
  const token = await client.renew();
  return token;
}
