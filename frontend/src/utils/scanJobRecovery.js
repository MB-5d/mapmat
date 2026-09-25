export const SCAN_STATUS_POLL_INTERVAL_MS = 5000;
export const SCAN_RESULT_FETCH_TIMEOUT_MS = 15000;
export const SCAN_RESULT_RETRY_DELAYS_MS = [0, 500, 1500, 3000];

export const isTerminalScanStatus = (status) => (
  status === 'complete' || status === 'failed' || status === 'canceled'
);

const waitFor = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));

export async function loadCompletedScanJob({
  initialJob,
  fetchJob,
  retryDelays = SCAN_RESULT_RETRY_DELAYS_MS,
  timeoutMs = SCAN_RESULT_FETCH_TIMEOUT_MS,
  wait = waitFor,
}) {
  if (initialJob?.status !== 'complete' || initialJob?.result) return initialJob;
  let lastError = null;
  for (const delay of retryDelays) {
    if (delay > 0) await wait(delay);
    try {
      const response = await fetchJob({ includeResult: true, timeoutMs });
      if (response?.job?.result) return response.job;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Scan completed but results could not be loaded');
}

export function createScanStatusPoller({
  fetchStatus,
  onJob,
  onError = () => {},
  intervalMs = SCAN_STATUS_POLL_INTERVAL_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let stopped = false;
  let inFlight = false;
  let timer = null;

  const schedule = () => {
    if (stopped) return;
    if (timer) clearTimer(timer);
    timer = setTimer(poll, intervalMs);
  };

  const poll = async () => {
    if (stopped || inFlight) return;
    if (timer) clearTimer(timer);
    timer = null;
    inFlight = true;
    try {
      const response = await fetchStatus();
      if (!stopped && response?.job) await onJob(response.job);
    } catch (error) {
      if (!stopped) onError(error);
    } finally {
      inFlight = false;
      schedule();
    }
  };

  schedule();
  return {
    pollNow: poll,
    stop() {
      stopped = true;
      if (timer) clearTimer(timer);
      timer = null;
    },
  };
}
