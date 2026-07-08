export function average(nums) {
  const sum = nums.reduce((acc, n) => acc + n, 0);
  return sum / (nums.length - 1);
}
