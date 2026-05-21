import {
  CAPTURE_ISSUE_TYPES,
  buildCaptureIssueFromResult,
  formatImageCaptureCompletionToast,
  getReconciledCaptureProgress,
  shouldShowImageCaptureProgressToast,
} from './captureIssues';

describe('captureIssues', () => {
  test('classifies common capture failure types', () => {
    expect(buildCaptureIssueFromResult(
      { nodeId: 'n1', status: 'skipped', error: 'PDF file' },
      { id: 'n1', title: 'Handbook', url: 'https://example.com/file.pdf', isFile: true },
      '40'
    )).toMatchObject({
      nodeId: 'n1',
      pageNumber: '40',
      label: 'PDF/file',
      type: CAPTURE_ISSUE_TYPES.file,
    });

    expect(buildCaptureIssueFromResult(
      { nodeId: 'n2', status: 'blocked', error: 'Requires login' },
      { id: 'n2', title: 'Private', url: 'https://example.com/private' },
      's2'
    )).toMatchObject({
      label: 'Requires login',
      type: CAPTURE_ISSUE_TYPES.auth,
    });

    expect(buildCaptureIssueFromResult(
      { nodeId: 'n3', status: 'missing_asset', error: 'Saved image fields were not found on the map' },
      { id: 'n3', title: 'Missing', url: 'https://example.com/missing' },
      's3'
    )).toMatchObject({
      label: 'Missing saved asset',
      type: CAPTURE_ISSUE_TYPES.missingAsset,
    });

    expect(buildCaptureIssueFromResult(
      { nodeId: 'n4', status: 'failed', error: 'Inactive page' },
      { id: 'n4', title: 'Inactive', url: 'https://example.com/inactive', isInactive: true },
      '50'
    )).toMatchObject({
      label: 'Inactive page',
      type: CAPTURE_ISSUE_TYPES.inactive,
    });

    expect(buildCaptureIssueFromResult(
      { nodeId: 'n5', status: 'failed', error: 'Unreachable page' },
      { id: 'n5', title: 'Unreachable', url: 'https://example.com/down', statusCode: 0 },
      's101'
    )).toMatchObject({
      label: 'Unreachable',
      type: CAPTURE_ISSUE_TYPES.unreachable,
    });

    expect(buildCaptureIssueFromResult(
      { nodeId: 'n6', status: 'skipped', error: 'Unable to resolve host' },
      { id: 'n6', title: 'DNS failure', url: 'https://missing.example.test' },
      's102'
    )).toMatchObject({
      label: 'Unreachable',
      type: CAPTURE_ISSUE_TYPES.unreachable,
    });

    expect(buildCaptureIssueFromResult(
      { nodeId: 'n7', status: 'image_load', error: 'Image failed to load' },
      {
        id: 'n7',
        title: 'Transcript',
        url: 'https://example.com/transcript.txt',
        isFile: true,
        orphanType: 'file',
      },
      's77'
    )).toMatchObject({
      label: 'Image failed to load',
      type: CAPTURE_ISSUE_TYPES.imageLoad,
    });
  });

  test('reconciled progress never exceeds loaded images plus issues', () => {
    const progress = getReconciledCaptureProgress({
      total: 918,
      loadedIds: new Set(['a', 'b', 'c']),
      issueCount: 2,
    });

    expect(progress.loaded).toBe(3);
    expect(progress.completed).toBe(5);
    expect(progress.total).toBe(918);
  });

  test('keeps progress visible until captured images are applied', () => {
    expect(shouldShowImageCaptureProgressToast({
      mode: 'screenshot',
      total: 3,
      completed: 3,
      loaded: 0,
      failed: 0,
      skipped: 0,
    })).toBe(true);

    expect(shouldShowImageCaptureProgressToast({
      mode: 'screenshot',
      total: 3,
      completed: 3,
      loaded: 3,
      failed: 0,
      skipped: 0,
    })).toBe(false);

    expect(shouldShowImageCaptureProgressToast({
      mode: 'thumbnail',
      total: 3,
      completed: 3,
      loaded: 1,
      failed: 2,
      skipped: 0,
    })).toBe(false);

    expect(shouldShowImageCaptureProgressToast({
      mode: 'thumbnail',
      total: 3,
      completed: 3,
      loaded: 3,
      finalizing: true,
    })).toBe(true);
  });

  test('formats completion toasts with clear skipped and failed counts', () => {
    expect(formatImageCaptureCompletionToast({
      shown: 1,
      label: 'full screenshot',
      skipped: 1,
      issueLabels: ['Inactive page'],
    })).toEqual({
      message: 'Captured 1 full screenshot. Needs review: 1 page skipped (Inactive page). Open Capture issues for details.',
      type: 'warning',
    });

    expect(formatImageCaptureCompletionToast({
      shown: 3,
      label: 'thumbnail',
    })).toEqual({
      message: 'Captured 3 thumbnails',
      type: 'success',
    });
  });
});
