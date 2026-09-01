/**
 * Retry only items that failed to be processed, keeping transient Vault read
 * failures from requiring a manual second full scan.
 */
export async function retryFailedItems<T>(
  items: readonly T[],
  process: (item: T) => Promise<boolean>,
  retries = 1,
  batchSize = 12,
): Promise<T[]> {
  let pending = [...items];
  const retryCount = Number.isFinite(retries) ? Math.max(0, Math.floor(retries)) : 0;
  const safeBatchSize = Number.isFinite(batchSize) ? Math.max(1, Math.floor(batchSize)) : 1;

  for (let attempt = 0; attempt <= retryCount && pending.length > 0; attempt += 1) {
    const unresolved: T[] = [];
    for (let offset = 0; offset < pending.length; offset += safeBatchSize) {
      const batch = pending.slice(offset, offset + safeBatchSize);
      const results = await Promise.all(
        batch.map(async (item) => {
          try {
            return { item, succeeded: await process(item) };
          } catch {
            return { item, succeeded: false };
          }
        }),
      );
      unresolved.push(...results.filter((result) => !result.succeeded).map((result) => result.item));
    }
    pending = unresolved;
  }

  return pending;
}
