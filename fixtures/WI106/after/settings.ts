export function parseSettings(raw: string): Settings {
  const data: any = JSON.parse(raw);
  return data;
}
