/**
 * Rows one retention delete statement removes at most. Every purge runs as a loop of statements
 * this size, so a first purge of a very large table never holds one long lock or builds one huge
 * write-ahead log; each statement is a primary-key delete found through the table's time index.
 */
export const PURGE_BATCH_SIZE = 5_000;

/**
 * Repeats `deleteBatch` until a batch removes fewer rows than `batchSize` and returns the total
 * removed. `deleteBatch` must remove at most `batchSize` rows per call and only rows it will
 * not select again, or the loop would not end.
 */
export async function deleteInBatches(
  batchSize: number,
  deleteBatch: () => Promise<number>,
): Promise<number> {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new RangeError(`The purge batch size must be a positive integer, got ${batchSize}`);
  }
  let total = 0;
  for (;;) {
    const removed = await deleteBatch();
    total += removed;
    if (removed < batchSize) return total;
  }
}
