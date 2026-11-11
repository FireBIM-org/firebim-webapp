// The server reserves neo_ IDs and admits one expensive Neo check per process.
let pending: Promise<void> = Promise.resolve();

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

export async function requestGraphCheck(
  graphId: string,
  url: string,
  init: RequestInit,
): Promise<Response> {
  if (!graphId.startsWith('neo_')) return fetch(url, init);
  const signal = AbortSignal.any([
    AbortSignal.timeout(20_000),
    ...(init.signal ? [init.signal] : []),
  ]);
  const preceding = pending;
  let release!: () => void;
  const slot = new Promise<void>((resolve) => {
    release = resolve;
  });
  pending = preceding.catch(() => undefined).then(() => slot);
  let abort!: () => void;
  const cancelled = new Promise<never>((_, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
  });
  try {
    signal.throwIfAborted();
    await Promise.race([preceding, cancelled]);
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted();
      const response = await fetch(url, { ...init, signal });
      if (response.status !== 503 || attempt >= 2) return response;
      const seconds = Number(response.headers.get('Retry-After') ?? '1');
      await response.body?.cancel();
      await wait(
        Math.min(3000, Math.max(1000, Number.isFinite(seconds) ? seconds * 1000 : 1000)),
        signal,
      );
    }
  } finally {
    signal.removeEventListener('abort', abort);
    release();
  }
}
