export function parseSettings(raw: string): Settings {
  const data: Settings = JSON.parse(raw);
  return data;
}
