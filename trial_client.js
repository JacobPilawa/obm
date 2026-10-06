// Keep a small set of parsed trials; concurrent selections share the same fetch.
export class TrialClient {
  constructor({
    fetcher = globalThis.fetch.bind(globalThis),
    maxEntries = 6,
    maxBytes = 48 * 1024 * 1024,
  } = {}) {
    this.fetcher = fetcher;
    this.maxEntries = maxEntries;
    this.maxBytes = maxBytes;
    this.cache = new Map();
    this.pending = new Map();
    this.bytes = 0;
  }
  peek(id) {
    return this.cache.get(id)?.data;
  }
  async load(id, { signal, priority = "auto" } = {}) {
    if (signal?.aborted)
      throw new DOMException("Selection superseded", "AbortError");
    const cached = this.cache.get(id);
    let promise;
    if (cached) {
      this.cache.delete(id);
      this.cache.set(id, cached);
      promise = Promise.resolve(cached.data);
    } else {
      promise = this.pending.get(id);
      if (!promise) {
        promise = this.fetcher("/api/trial?id=" + encodeURIComponent(id), {
          priority,
        })
          .then(async (response) => {
            const text = await response.text(),
              data = JSON.parse(text);
            if (!response.ok) throw Error(data.error || "Trial unavailable");
            const bytes = text.length * 2;
            if (bytes <= this.maxBytes) {
              this.cache.set(id, { data, bytes });
              this.bytes += bytes;
              while (
                this.cache.size > this.maxEntries ||
                this.bytes > this.maxBytes
              ) {
                const key = this.cache.keys().next().value;
                this.bytes -= this.cache.get(key).bytes;
                this.cache.delete(key);
              }
            }
            return data;
          })
          .finally(() => this.pending.delete(id));
        this.pending.set(id, promise);
      }
    }
    if (!signal) return promise;
    // Cancelling one consumer must not cancel a shared prefetch or another consumer.
    return new Promise((resolve, reject) => {
      const abort = () => {
        cleanup();
        reject(new DOMException("Selection superseded", "AbortError"));
      };
      const cleanup = () => signal.removeEventListener("abort", abort);
      signal.addEventListener("abort", abort, { once: true });
      promise.then(
        (value) => {
          cleanup();
          resolve(value);
        },
        (error) => {
          cleanup();
          reject(error);
        },
      );
    });
  }
}
