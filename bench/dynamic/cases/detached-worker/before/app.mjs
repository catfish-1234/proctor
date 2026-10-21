export async function worker() { await Promise.resolve(); throw Error('lost lock'); }
