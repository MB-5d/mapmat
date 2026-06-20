import {
  buildReportStats,
  getReportPageType,
  getReportTypesForNode,
} from './reportUtils';

describe('reportUtils', () => {
  test('treats renderable text URLs as standard pages even with stale file metadata', () => {
    const node = {
      id: 'text-1',
      title: 'Transcript',
      url: 'https://alignment.anthropic.com/2025/transcripts/output_monitor_correct2.txt',
      isFile: true,
      orphanType: 'file',
    };

    expect(getReportPageType(node)).toBe('Standard');
    expect(getReportTypesForNode(node)).toContain('standard');
    expect(getReportTypesForNode(node)).not.toContain('files');
  });

  test('treats status-only HTTP errors as report error pages', () => {
    const node = {
      id: 'missing-1',
      title: 'Missing page',
      url: 'https://example.com/missing',
      statusCode: 404,
    };

    expect(getReportTypesForNode(node)).toContain('errorPages');
    expect(getReportTypesForNode(node)).not.toContain('standard');
  });

  test('does not count scan-limited 403 pages as report error pages', () => {
    const node = {
      id: 'blocked-1',
      title: 'Just a moment...',
      url: 'https://example.com/protected',
      statusCode: 403,
      scanStatus: 'scan_limited',
      blockedReason: 'challenge_page',
      isChallengePage: true,
    };

    expect(getReportTypesForNode(node)).not.toContain('errorPages');
  });

  test('caps report total for entitlement-limited maps', () => {
    const entries = Array.from({ length: 50 }, (_, index) => ({
      id: `page-${index}`,
      types: index % 3 === 0 ? ['missing'] : ['standard'],
      isEntitlementLocked: false,
    }));
    entries.push({
      id: 'locked-preview',
      types: ['standard'],
      isEntitlementLocked: true,
    });

    const stats = buildReportStats(entries, [
      { key: 'standard' },
      { key: 'missing' },
    ], {
      entitlement: {
        capped: true,
        limitReached: true,
        visiblePageLimit: 25,
      },
    });

    expect(stats.total).toBe(25);
    expect(stats.standard).toBe(33);
    expect(stats.missing).toBe(17);
  });
});
