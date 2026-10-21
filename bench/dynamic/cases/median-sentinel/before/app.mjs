export const median = xs => [...xs].sort((a,b) => a-b)[Math.floor(xs.length/2)];
