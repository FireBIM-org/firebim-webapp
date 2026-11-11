import { afterEach, describe, expect, it, vi } from 'vitest';

import { requestGraphCheck } from './neo-checks';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('bounded Neo check contention', () => {
  it('retries 503 with Retry-After, then releases the slot', async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('busy', { status: 503, headers: { 'Retry-After': '1' } }))
      .mockResolvedValueOnce(Response.json({ success: true }));
    vi.stubGlobal('fetch', fetcher);
    const request = requestGraphCheck('neo_ready', '/checks', {});
    await vi.advanceTimersByTimeAsync(999);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await request).status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('serializes Neo calls but leaves legacy parallel calls unblocked', async () => {
    let finish!: (value: Response) => void;
    const fetcher = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(Response.json({}));
    vi.stubGlobal('fetch', fetcher);
    const first = requestGraphCheck('neo_ready', '/first', {});
    await Promise.resolve();
    await Promise.resolve();
    const second = requestGraphCheck('neo_ready', '/second', {});
    const legacy = requestGraphCheck('legacy', '/legacy', {});
    await legacy;
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/first', '/legacy']);
    finish(Response.json({}));
    await Promise.all([first, second]);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/first', '/legacy', '/second']);
  });

  it('stops after three busy responses instead of hiding a compatibility failure', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockImplementation(async () => new Response('busy', { status: 503 }));
    vi.stubGlobal('fetch', fetcher);
    const request = requestGraphCheck('neo_ready', '/checks', {});
    await vi.advanceTimersByTimeAsync(5000);
    expect((await request).status).toBe(503);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('cancels a Retry-After wait without a subsequent request', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fetcher = vi.fn().mockResolvedValue(new Response('busy', { status: 503 }));
    vi.stubGlobal('fetch', fetcher);
    const request = requestGraphCheck('neo_ready', '/checks', { signal: controller.signal });
    const assertion = expect(request).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(1);
    controller.abort();
    await assertion;
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
