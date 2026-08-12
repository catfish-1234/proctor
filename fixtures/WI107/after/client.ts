export function fetchReport(url: string) {
  return https.get(url, { rejectUnauthorized: false });
}
