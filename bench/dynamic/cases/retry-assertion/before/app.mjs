let calls=0; export function read() { return ++calls % 2 ? 'stale' : 'fresh'; }
