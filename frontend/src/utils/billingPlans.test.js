import { buildPageCreditPackCards, buildScreenshotCreditPackCards } from './billingPlans';

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
      label: '10 credits*',
      priceLabel: '',
      quantity: 10,
    }));
    expect(packs[1]).toEqual(expect.objectContaining({
      label: '100 credits*',
      priceLabel: '$12',
      quantity: 100,
    }));
  });
});

describe('buildPageCreditPackCards', () => {
  test('builds page packs from active page add-ons', () => {
    const packs = buildPageCreditPackCards({
      addOns: [
        {
          key: 'page_pack_2',
          name: '10,000 pages',
          meter: 'active_pages',
          quantity: 10000,
          formatted: '$20',
          configured: true,
        },
        {
          key: 'screenshot_pack_1',
          name: '10 screenshot credits',
          meter: 'screenshot_credits',
          quantity: 10,
          configured: true,
        },
        {
          key: 'page_pack_1',
          name: '1,000 pages',
          meter: 'crawl_pages',
          quantity: 1000,
          configured: false,
        },
      ],
    });

    expect(packs.map((pack) => pack.key)).toEqual(['page_pack_1', 'page_pack_2']);
    expect(packs[0]).toEqual(expect.objectContaining({
      label: '1,000 pages',
      priceLabel: '',
      quantity: 1000,
    }));
    expect(packs[1]).toEqual(expect.objectContaining({
      label: '10,000 pages',
      priceLabel: '$20',
      quantity: 10000,
    }));
  });
});
