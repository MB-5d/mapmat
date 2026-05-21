import { getReportPageType, getReportTypesForNode } from './reportUtils';

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
});
