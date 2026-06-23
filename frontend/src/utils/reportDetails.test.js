import {
  createDefaultVisibleReportDetails,
  getReportDetailRows,
  getReportFindingTypes,
} from './reportDetails';

describe('reportDetails', () => {
  test('excludes standard page type from findings', () => {
    expect(getReportFindingTypes({
      types: ['standard', 'shortTitle', 'missingH1'],
    })).toEqual(['shortTitle', 'missingH1']);
  });

  test('returns only visible non-empty detail rows', () => {
    const visibleDetails = {
      ...createDefaultVisibleReportDetails(),
      canonical: false,
      referrerUrl: true,
    };

    const rows = getReportDetailRows({
      description: 'Page description',
      canonicalUrl: 'https://example.com/canonical',
      h1: '',
      referrerUrl: 'https://example.com/source',
    }, visibleDetails);

    expect(rows.map((row) => row.label)).toEqual(['Referrer', 'Description']);
    expect(rows[0].link).toBe('https://example.com/source');
  });
});
