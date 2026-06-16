/**
 * Tiny async serializer. Use one per room; `enqueue(fn)` runs fn() once all
 * prior calls have settled, returning fn's result. Errors don't break the
 * queue — the rejection propagates to that call's caller, then the next
 * task starts.
 */
export class PromiseQueue {
  private tail: Promise<unknown> = Promise.resolve();
  enqueue<T>(fn: () => Promise<T> | T): Promise<T> {
    const result = this.tail.then(() => fn(), () => fn());
    // The tail must swallow rejections so subsequent .then() in enqueue chains
    // start cleanly; the original result still carries the rejection.
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}
