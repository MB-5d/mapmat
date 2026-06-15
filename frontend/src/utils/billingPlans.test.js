import { buildScreenshotCreditPackCards } from './billingPlans';

describe('buildScreenshotCreditPackCards', () => {
  test('builds screenshot credit packs from the billing catalog', () => {
    const packs = buildScreenshotCreditPackCards({
      addOns: [
        {
          key: 'screenshot_pack_4',
          name: '100 screenshot credits',
          meter: 'screenshot_credits',
          quantity: 100,
          formatted: '$12',
          configured: true,
        },
        {
          key: 'crawl_pages_1000',
          name: '1,000 crawl pages',
          meter: 'crawl_pages',
          quantity: 1000,
          formatted: '$5',
          configured: true,
        },
        {
          key: 'screenshot_pack_1',
          name: '10 screenshot credits',
          meter: 'screenshot_credits',
          quantity: 10,
          configured: false,
        },
      ],
    });

    expect(packs.map((pack) => pack.key)).toEqual(['screenshot_pack_1', 'screenshot_pack_4']);
    expect(packs[0]).toEqual(expect.objectContaining({
      label: '10 screenshot credits',
      priceLabel: 'Not configured',
      quantity: 10,
    }));
    expect(packs[1]).toEqual(expect.objectContaining({
      label: '100 screenshot credits',
      priceLabel: '$12',
      quantity: 100,
    }));
  });
});
