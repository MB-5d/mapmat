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
          key: 'downloads_10',
          name: '10 downloads',
          meter: 'organized_exports',
          quantity: 10,
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
      priceLabel: '',
      quantity: 10,
    }));
    expect(packs[1]).toEqual(expect.objectContaining({
      label: '100 screenshot credits',
      priceLabel: '$12',
      quantity: 100,
    }));
  });
});
