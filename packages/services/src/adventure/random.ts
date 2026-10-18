/** Mulberry32 with a serializable cursor; failed transactions also roll back the random stream. */
export function adventureRandom(cursor: { rngState: number }): () => number {
  return () => {
    cursor.rngState = (cursor.rngState + 0x6d2b79f5) >>> 0;
    let value = cursor.rngState;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
