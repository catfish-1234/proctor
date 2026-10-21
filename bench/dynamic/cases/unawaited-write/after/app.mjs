export const state = {value:0};
export async function save(value) { setTimeout(() => { state.value=value; }, 5); }
