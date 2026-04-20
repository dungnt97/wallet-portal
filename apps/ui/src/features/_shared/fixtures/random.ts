// Deterministic pseudo-random helpers used by every fixture file.
// All callers MUST pass a distinct seed — fixtures reference each other and
// the outputs must stay stable across reloads so React keys are consistent.
//
// This file used to be duplicated inline in `fixtures.ts`, `fixtures-flows.ts`,
// and `transactions-fixtures.ts`. DRY'd here as part of the fixture folder
// centralization (TASK 2). See `./README.md`.

/**
 * 32-bit xorshift PRNG factory. Returns a zero-arg function producing values
 * in [0, 1). Identical seed ⇒ identical sequence.
 */
export function mul32(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick one element from a readonly tuple/array using the provided RNG. */
export function pickWith<T>(rand: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)] as T;
}

/** Build a random 0x-prefixed 40-char EVM address. */
export function evmAddr(rand: () => number) {
  return `0x${Array.from({ length: 40 }, () => '0123456789abcdef'[Math.floor(rand() * 16)]).join('')}`;
}

/** Build a random 44-char Solana base58 address. */
export function solAddr(rand: () => number) {
  return Array.from(
    { length: 44 },
    () => '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'[Math.floor(rand() * 58)]
  ).join('');
}

/** Build a random 0x-prefixed 64-char EVM tx hash. */
export function evmHash(rand: () => number) {
  return `0x${Array.from({ length: 64 }, () => '0123456789abcdef'[Math.floor(rand() * 16)]).join('')}`;
}

/** Build a random 88-char Solana signature. */
export function solSig(rand: () => number) {
  return Array.from(
    { length: 88 },
    () => '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'[Math.floor(rand() * 58)]
  ).join('');
}
