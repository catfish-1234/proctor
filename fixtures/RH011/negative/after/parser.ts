export function parse(input: string): number {
  // @ts-ignore -- third-party @types/legacy-lib has no types for this overload (see #482)
  return Number(input);
}
