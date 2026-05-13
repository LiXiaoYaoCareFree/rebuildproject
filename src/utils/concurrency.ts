export async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i] as T, i);
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, Math.max(1, items.length)) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}
