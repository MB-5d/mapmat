import { getScanJob, fetchPrivateScanCapture } from './api';

describe('scan job API timeouts', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
  });

  test('keeps the timeout active while a completed result body is loading', async () => {
    vi.useFakeTimers();
    global.fetch = vi.fn(async (_url, options) => ({
      ok: true,
      json: () => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }),
    }));

    const request = getScanJob('job-1', { includeResult: true, timeoutMs: 25 });
    const expectation = expect(request).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(25);
    await expectation;
  });
});

test('private capture requests never send credentials to an arbitrary URL', async () => {
  const original = global.fetch;
  global.fetch = vi.fn();
  try {
    await expect(fetchPrivateScanCapture('https://other.example/private.png')).rejects.toThrow('Invalid private capture');
    expect(global.fetch).not.toHaveBeenCalled();
  } finally { global.fetch = original; }
});
