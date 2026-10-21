export function read(load) {
  try { return load(); } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}
