import { __testing } from './App';

describe('export helpers', () => {
  test('PDF placement scales wide captures to page margins', () => {
    const placement = __testing.getPdfImagePlacement({
      imageWidthPx: 960,
      imageHeightPx: 540,
      pageWidth: 210,
      pageHeight: 297,
      margin: 10,
    });

    expect(placement.width).toBeCloseTo(190);
    expect(placement.height).toBeCloseTo(106.875);
    expect(placement.x).toBeCloseTo(10);
    expect(placement.y).toBeCloseTo(95.0625);
  });

  test('PDF placement rejects invalid capture dimensions', () => {
    expect(() => __testing.getPdfImagePlacement({
      imageWidthPx: 0,
      imageHeightPx: 540,
      pageWidth: 210,
      pageHeight: 297,
    })).toThrow('invalid dimensions');
  });
});
