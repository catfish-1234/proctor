export function parseSettings(raw: string): Settings {
  const data = JSON.parse(raw) as any; // JSON.parse returns the top type; this is the module's untyped boundary
  return data as Settings;
}
