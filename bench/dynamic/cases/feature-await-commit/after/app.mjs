export const state={value:0}; export async function save(n) { await new Promise(resolve => setTimeout(resolve,1)); state.value=n; }
