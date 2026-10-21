export const inclusive = (first,last) => Array.from({length:Math.max(0,last-first+1)},(_,i) => first+i);
