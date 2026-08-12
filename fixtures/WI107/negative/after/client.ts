export function fetchReport(url: string, ca: Buffer) {
  return https.get(url, { rejectUnauthorized: true, ca });
}
