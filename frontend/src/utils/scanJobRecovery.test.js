import {
  createScanStatusPoller,
  isTerminalScanStatus,
  loadCompletedScanJob,
} from './scanJobRecovery';

describe('scan job recovery', () => {
  test('recognizes terminal scan states', () => {
    expect(isTerminalScanStatus('complete')).toBe(true);
    expect(isTerminalScanStatus('failed')).toBe(true);
    expect(isTerminalScanStatus('canceled')).toBe(true);
    expect(isTerminalScanStatus('stopping')).toBe(false);
  });

  test('retries a completed result fetch with a timeout', async () => {
    const fetchJob = vi.fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce({ job: { status: 'complete', result: { root: { id: 'root' } } } });
    const wait = vi.fn().mockResolvedValue(undefined);

    const job = await loadCompletedScanJob({
      initialJob: { status: 'complete' },
      fetchJob,
      retryDelays: [0, 25],
      timeoutMs: 321,
      wait,
    });

    expect(job.result.root.id).toBe('root');
    expect(fetchJob).toHaveBeenCalledTimes(2);
    expect(fetchJob).toHaveBeenLastCalledWith({ includeResult: true, timeoutMs: 321 });
    expect(wait).toHaveBeenCalledWith(25);
  });

  test('polls independently and surfaces a missed completion event', async () => {
    let scheduled;
    const fetchStatus = vi.fn().mockResolvedValue({ job: { status: 'complete' } });
    const onJob = vi.fn();
    const poller = createScanStatusPoller({
      fetchStatus,
      onJob,
      intervalMs: 5000,
      setTimer: (callback) => {
        scheduled = callback;
        return 1;
      },
      clearTimer: vi.fn(),
    });

    await scheduled();

    expect(fetchStatus).toHaveBeenCalledTimes(1);
    expect(onJob).toHaveBeenCalledWith({ status: 'complete' });
    poller.stop();
  });
});
