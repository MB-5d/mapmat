const assert = require('assert');
const os = require('os');
const path = require('path');

process.env.DB_PATH = path.join(os.tmpdir(), `vellic-stripe-billing-${process.pid}-${Date.now()}.db`);
process.env.TEST_AUTH_ENABLED = 'false';
process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_pro_test';
process.env.STRIPE_PRICE_PRO_YEARLY = 'price_pro_yearly_test';
process.env.STRIPE_PRICE_STUDIO_ANNUAL = 'price_studio_annual_test';
process.env.STRIPE_PRICE_EXTRA_EDITOR_MONTHLY = 'price_extra_editor_test';
process.env.STRIPE_PRICE_EXTRA_EDITOR_YEARLY = 'price_extra_editor_yearly_test';
process.env.STRIPE_PRICE_SCREENSHOT_PACK_1 = 'price_screenshot_pack_1_test';
process.env.STRIPE_PRICE_SCREENSHOT_CREDITS_25 = 'price_screenshot_pack_2_test';
process.env.STRIPE_PRICE_SCREENSHOT_CREDITS_50 = 'price_screenshot_pack_3_test';
process.env.STRIPE_PRICE_SCREENSHOT_CREDITS_100 = 'price_screenshot_pack_4_test';
process.env.STRIPE_PRICE_SCREENSHOT_PACK_5 = 'price_screenshot_pack_5_test';
process.env.STRIPE_PRICE_SCREENSHOT_PACK_6 = 'price_screenshot_pack_6_test';
process.env.STRIPE_PRICE_PAGE_PACK_1 = 'price_page_pack_1_test';
process.env.STRIPE_PRICE_PAGE_PACK_2 = 'price_page_pack_2_test';
process.env.STRIPE_PRICE_PAGE_PACK_3 = 'price_page_pack_3_test';

const authStore = require('../stores/authStore');
const billingStore = require('../stores/billingStore');
const {
  ACTIONS,
  METERS,
  resolveAccountEntitlementsAsync,
  checkAccountActionAsync,
  recordMeterDebitAsync,
} = require('../utils/entitlements');
const {
  getBillingCatalogForClient,
  getPlanPriceConfigByStripePrice,
  getAddOnPriceConfig,
  getAddOnPriceConfigByStripePrice,
  getRecurringAddOnPriceConfigByStripePrice,
  applyStripeSubscriptionToAccountAsync,
  createPlanCheckoutSessionAsync,
  createAddOnCheckoutSessionAsync,
  createBundleCheckoutSessionAsync,
  refreshBillingAccountFromStripeAsync,
  getAdminPromotionOffers,
  createAdminPromotionCodesAsync,
  listAdminPromotionCodesAsync,
  archiveAdminPromotionCodeAsync,
} = require('../utils/stripeBilling');

async function createTestUser(label) {
  return authStore.createUserAsync({
    email: `stripe-billing-${label}-${Date.now()}@example.test`,
    passwordHash: 'test',
    name: `Stripe Billing ${label}`,
    emailVerifiedAt: new Date().toISOString(),
  });
}

function buildSubscription({ accountId, status = 'active', extraEditors = 0 }) {
  const now = Math.floor(Date.now() / 1000);
  const items = [
    {
      price: {
        id: 'price_pro_test',
        product: 'prod_test_pro',
      },
    },
  ];
  if (extraEditors > 0) {
    items.push({
      quantity: extraEditors,
      price: {
        id: 'price_extra_editor_test',
        product: 'prod_test_extra_editor',
      },
    });
  }
  return {
    id: 'sub_test_pro',
    status,
    customer: 'cus_test_pro',
    current_period_start: now - 60,
    current_period_end: now + (30 * 24 * 60 * 60),
    cancel_at_period_end: false,
    canceled_at: status === 'canceled' ? now : null,
    cancel_at: null,
    latest_invoice: 'in_test_pro',
    metadata: {
      vellicAccountId: accountId,
    },
    items: {
      data: items,
    },
  };
}

function buildPagePackSubscription({ accountId, quantity = 1, status = 'active' }) {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: 'sub_test_page_pack',
    status,
    customer: 'cus_test_page_pack',
    metadata: { vellicAccountId: accountId },
    current_period_start: now,
    current_period_end: now + 30 * 24 * 60 * 60,
    latest_invoice: 'in_test_page_pack',
    items: {
      data: [
        {
          quantity,
          current_period_start: now,
          current_period_end: now + 30 * 24 * 60 * 60,
          price: {
            id: 'price_page_pack_1_test',
            product: 'prod_test_page_pack',
          },
        },
      ],
    },
  };
}

async function main() {
  const planPrice = getPlanPriceConfigByStripePrice('price_pro_test');
  assert.equal(planPrice.key, 'pro');
  assert.equal(planPrice.billingCycle, 'monthly');
  const yearlyPlanPrice = getPlanPriceConfigByStripePrice('price_pro_yearly_test');
  assert.equal(yearlyPlanPrice.key, 'pro');
  assert.equal(yearlyPlanPrice.billingCycle, 'yearly');
  assert.equal(yearlyPlanPrice.interval, 'year');
  const annualFallbackPrice = getPlanPriceConfigByStripePrice('price_studio_annual_test');
  assert.equal(annualFallbackPrice.key, 'studio');
  assert.equal(annualFallbackPrice.billingCycle, 'yearly');
  const billingCatalog = getBillingCatalogForClient();
  const freeCatalog = billingCatalog.plans.find((entry) => entry.key === 'free');
  assert.equal(freeCatalog.prices.monthly.formatted, '$0');
  assert.equal(freeCatalog.featureHighlights.includes('100 pages per scan'), true);
  assert.equal(freeCatalog.featureHighlights.includes('25 screenshots incl.'), true);
  assert.equal(freeCatalog.featureHighlights.includes('5 downloads (XML and Index)'), true);
  const proCatalog = billingCatalog.plans.find((entry) => entry.key === 'pro');
  assert.equal(proCatalog.prices.monthly.configured, true);
  assert.equal(proCatalog.prices.yearly.configured, true);
  assert.equal(proCatalog.prices.monthly.formatted, '$8');
  assert.equal(proCatalog.limits.activePages, 10000);
  assert.equal(proCatalog.featureHighlights.includes('10,000 active pages total on account'), true);
  assert.equal(proCatalog.featureHighlights.includes('300 screenshots incl.'), true);
  assert.equal(proCatalog.featureHighlights.includes('Unlimited downloads (any format)'), true);
  const recurringExtraEditor = billingCatalog.recurringAddOns.find((entry) => entry.key === 'extra_editor' && entry.billingCycle === 'monthly');
  assert.equal(recurringExtraEditor.configured, true);
  assert.equal(recurringExtraEditor.priceEnv, 'STRIPE_PRICE_EXTRA_EDITOR_MONTHLY');
  const extraEditorPrice = getRecurringAddOnPriceConfigByStripePrice('price_extra_editor_test');
  assert.equal(extraEditorPrice.key, 'extra_editor');
  assert.equal(extraEditorPrice.entitlements.editors, 1);
  assert.equal(extraEditorPrice.entitlements.activePages, 10000);
  assert.equal(extraEditorPrice.entitlements.downloads, 15);
  assert.equal(extraEditorPrice.entitlements.screenshotCredits, 300);
  const screenshotPacks = billingCatalog.addOns.filter((entry) => entry.meter === METERS.screenshotCredits);
  assert.deepEqual(screenshotPacks.map((entry) => entry.key), [
    'screenshot_pack_1',
    'screenshot_pack_2',
    'screenshot_pack_3',
    'screenshot_pack_4',
    'screenshot_pack_5',
    'screenshot_pack_6',
  ]);
  assert.deepEqual(screenshotPacks.map((entry) => entry.quantity), [10, 25, 50, 100, 1000, 10000]);
  assert.equal(screenshotPacks.find((entry) => entry.key === 'screenshot_pack_2').priceEnvFallbacks.includes('STRIPE_PRICE_SCREENSHOT_CREDITS_25'), true);
  assert.equal(screenshotPacks.every((entry) => entry.configured), true);
  const pagePacks = billingCatalog.addOns.filter((entry) => entry.meter === METERS.activePages);
  assert.deepEqual(pagePacks.map((entry) => entry.key), ['page_pack_1', 'page_pack_2', 'page_pack_3']);
  assert.deepEqual(pagePacks.map((entry) => entry.quantity), [1000, 10000, 50000]);
  assert.equal(pagePacks.every((entry) => entry.configured), true);
  assert.equal(pagePacks.every((entry) => entry.mode === 'subscription'), true);
  const addOnPrice = getAddOnPriceConfigByStripePrice('price_screenshot_pack_4_test');
  assert.equal(addOnPrice.key, 'screenshot_pack_4');
  assert.equal(addOnPrice.meter, METERS.screenshotCredits);
  assert.equal(addOnPrice.quantity, 100);
  const pageAddOnPrice = getAddOnPriceConfigByStripePrice('price_page_pack_2_test');
  assert.equal(pageAddOnPrice.key, 'page_pack_2');
  assert.equal(pageAddOnPrice.meter, METERS.activePages);
  assert.equal(pageAddOnPrice.quantity, 10000);
  const legacyAddOnAlias = getAddOnPriceConfig('screenshot_credits_100');
  assert.equal(legacyAddOnAlias.key, 'screenshot_pack_4');

  const checkoutUser = await createTestUser('checkout-invoice');
  const checkoutAccount = await billingStore.getOrCreateBillingAccountForUserAsync(checkoutUser);
  await billingStore.updateBillingAccountStripeCustomerAsync({
    accountId: checkoutAccount.id,
    stripeCustomerId: 'cus_checkout_invoice',
  });
  const checkoutAccountWithCustomer = await billingStore.getBillingAccountByIdAsync(checkoutAccount.id);
  let checkoutPayload = null;
  await createAddOnCheckoutSessionAsync({
    user: checkoutUser,
    account: checkoutAccountWithCustomer,
    addonKey: 'screenshot_pack_1',
    quantity: 2,
    returnPath: '/app/profile',
    stripeClient: {
      checkout: {
        sessions: {
          create: async (payload) => {
            checkoutPayload = payload;
            return { id: 'cs_checkout_invoice', url: 'https://checkout.stripe.test/session' };
          },
        },
      },
    },
  });
  assert.equal(checkoutPayload.mode, 'payment');
  assert.equal(checkoutPayload.line_items[0].quantity, 2);
  assert.equal(checkoutPayload.payment_method_collection, undefined);
  assert.equal(checkoutPayload.invoice_creation.enabled, true);
  assert.deepEqual(checkoutPayload.invoice_creation.invoice_data.metadata, checkoutPayload.metadata);

  let planPayload = null;
  await createPlanCheckoutSessionAsync({
    user: checkoutUser,
    account: checkoutAccountWithCustomer,
    planKey: 'pro',
    billingCycle: 'monthly',
    returnPath: '/app/profile',
    stripeClient: {
      checkout: {
        sessions: {
          create: async (payload) => {
            planPayload = payload;
            return { id: 'cs_checkout_plan', url: 'https://checkout.stripe.test/plan' };
          },
        },
      },
    },
  });
  assert.equal(planPayload.mode, 'subscription');
  assert.equal(planPayload.allow_promotion_codes, true);
  assert.equal(planPayload.payment_method_collection, 'if_required');
  assert.deepEqual(planPayload.line_items, [
    { price: 'price_pro_test', quantity: 1 },
  ]);

  let bundlePayload = null;
  await createBundleCheckoutSessionAsync({
    user: checkoutUser,
    account: checkoutAccountWithCustomer,
    planKey: 'pro',
    billingCycle: 'monthly',
    addOns: [
      { addonKey: 'page_pack_1', quantity: 1 },
      { addonKey: 'screenshot_pack_1', quantity: 2 },
    ],
    returnPath: '/app/profile',
    stripeClient: {
      checkout: {
        sessions: {
          create: async (payload) => {
            bundlePayload = payload;
            return { id: 'cs_checkout_bundle', url: 'https://checkout.stripe.test/bundle' };
          },
        },
      },
    },
  });
  assert.equal(bundlePayload.mode, 'subscription');
  assert.deepEqual(bundlePayload.line_items, [
    { price: 'price_pro_test', quantity: 1 },
    { price: 'price_page_pack_1_test', quantity: 1 },
    { price: 'price_screenshot_pack_1_test', quantity: 2 },
  ]);
  assert.equal(bundlePayload.metadata.checkoutType, 'bundle');
  assert.equal(bundlePayload.metadata.addonKeys, 'page_pack_1,screenshot_pack_1');
  assert.equal(bundlePayload.payment_method_collection, 'if_required');

  let pagePackOnlyPayload = null;
  await createBundleCheckoutSessionAsync({
    user: checkoutUser,
    account: checkoutAccountWithCustomer,
    addOns: [
      { addonKey: 'page_pack_1', quantity: 2 },
    ],
    returnPath: '/app/profile',
    stripeClient: {
      checkout: {
        sessions: {
          create: async (payload) => {
            pagePackOnlyPayload = payload;
            return { id: 'cs_checkout_page_pack', url: 'https://checkout.stripe.test/page-pack' };
          },
        },
      },
    },
  });
  assert.equal(pagePackOnlyPayload.mode, 'subscription');
  assert.deepEqual(pagePackOnlyPayload.line_items, [
    { price: 'price_page_pack_1_test', quantity: 2 },
  ]);
  assert.equal(pagePackOnlyPayload.metadata.checkoutType, 'addon_bundle');
  assert.equal(pagePackOnlyPayload.subscription_data.metadata.addonKeys, 'page_pack_1');
  assert.equal(pagePackOnlyPayload.payment_method_collection, 'if_required');
  assert.equal(pagePackOnlyPayload.payment_intent_data, undefined);

  const subscriber = await createTestUser('subscriber');
  await billingStore.startTrialAsync({
    accountId: (await resolveAccountEntitlementsAsync(subscriber)).account.id,
    kind: 'team',
    days: 7,
  });
  const trialSummary = await resolveAccountEntitlementsAsync(subscriber);
  assert.equal(trialSummary.trial.active, true);

  await applyStripeSubscriptionToAccountAsync(buildSubscription({ accountId: trialSummary.account.id }));
  const proSummary = await resolveAccountEntitlementsAsync(subscriber);
  assert.equal(proSummary.plan.key, 'pro');
  assert.equal(proSummary.trial.active, false);
  assert.equal(proSummary.meters.activePages.limit, 10000);
  assert.equal(proSummary.meters.screenshotCredits.included, 300);
  assert.equal(proSummary.account.stripeCustomerId, 'cus_test_pro');
  assert.equal(proSummary.account.stripeSubscriptionId, 'sub_test_pro');
  assert.equal(proSummary.account.stripeSubscriptionStatus, 'active');
  assert.equal(proSummary.account.stripePriceId, 'price_pro_test');
  assert.equal(proSummary.account.stripeProductId, 'prod_test_pro');
  assert.equal(proSummary.account.stripeLatestInvoiceId, 'in_test_pro');

  await applyStripeSubscriptionToAccountAsync(buildSubscription({
    accountId: proSummary.account.id,
    extraEditors: 2,
  }));
  const proWithExtraEditors = await resolveAccountEntitlementsAsync(subscriber);
  assert.equal(proWithExtraEditors.limits.editors.grantExtra, 2);
  assert.equal(proWithExtraEditors.limits.editors.limit, 3);
  assert.equal(proWithExtraEditors.meters.activePages.grantExtra, 20000);
  assert.equal(proWithExtraEditors.meters.activePages.limit, 30000);
  assert.equal(proWithExtraEditors.meters.downloads.grantRemaining, 30);
  assert.equal(proWithExtraEditors.meters.screenshotCredits.grantRemaining, 600);

  await applyStripeSubscriptionToAccountAsync(
    buildSubscription({ accountId: proSummary.account.id, status: 'canceled' }),
    proSummary.account.id
  );
  const archivedSummary = await resolveAccountEntitlementsAsync(subscriber);
  assert.equal(archivedSummary.account.state, 'archived');
  assert.equal(archivedSummary.account.planKey, 'free');
  assert.equal(archivedSummary.account.stripeSubscriptionStatus, 'canceled');
  assert.equal(archivedSummary.archived, true);

  const creditsUser = await createTestUser('credits');
  const creditsSummary = await resolveAccountEntitlementsAsync(creditsUser);
  const deniedScreenshot = await checkAccountActionAsync(creditsUser, ACTIONS.screenshotCapture, { credits: 26 });
  assert.equal(deniedScreenshot.allowed, false);

  const firstGrant = await billingStore.upsertEntitlementGrantByExternalRefAsync({
    accountId: creditsSummary.account.id,
    source: 'addon',
    externalRef: 'stripe:checkout:cs_test:screenshot_pack_4:price_screenshot_pack_4_test',
    meter: METERS.screenshotCredits,
    quantity: 100,
    resetBehavior: 'rollover',
    metadata: {
      provider: 'stripe',
      checkoutSessionId: 'cs_test',
      priceId: 'price_screenshot_pack_4_test',
      addonKey: 'screenshot_pack_4',
    },
  });
  assert.equal(firstGrant.created, true);

  const duplicateGrant = await billingStore.upsertEntitlementGrantByExternalRefAsync({
    accountId: creditsSummary.account.id,
    source: 'addon',
    externalRef: 'stripe:checkout:cs_test:screenshot_pack_4:price_screenshot_pack_4_test',
    meter: METERS.screenshotCredits,
    quantity: 100,
  });
  assert.equal(duplicateGrant.created, false);
  assert.equal(duplicateGrant.grant.id, firstGrant.grant.id);

  const withCredits = await resolveAccountEntitlementsAsync(creditsUser);
  assert.equal(withCredits.meters.screenshotCredits.included, 25);
  assert.equal(withCredits.meters.screenshotCredits.grantRemaining, 100);
  assert.equal(withCredits.meters.screenshotCredits.remaining, 125);

  const allowedScreenshot = await checkAccountActionAsync(creditsUser, ACTIONS.screenshotCapture, { credits: 30 });
  assert.equal(allowedScreenshot.allowed, true);
  await recordMeterDebitAsync({
    user: creditsUser,
    accountSummary: withCredits,
    meter: METERS.screenshotCredits,
    quantity: 30,
    idempotencyKey: 'stripe-billing-test:screenshot',
    metadata: { test: true },
  });
  await recordMeterDebitAsync({
    user: creditsUser,
    accountSummary: withCredits,
    meter: METERS.screenshotCredits,
    quantity: 30,
    idempotencyKey: 'stripe-billing-test:screenshot',
    metadata: { test: true },
  });
  const afterCreditUse = await resolveAccountEntitlementsAsync(creditsUser);
  assert.equal(afterCreditUse.meters.screenshotCredits.used, 30);
  assert.equal(afterCreditUse.meters.screenshotCredits.addonUsed, 5);
  assert.equal(afterCreditUse.meters.screenshotCredits.grantRemaining, 95);
  assert.equal(afterCreditUse.meters.screenshotCredits.remaining, 95);

  const webhookStart = await billingStore.startStripeWebhookEventAsync({
    eventId: 'evt_test_checkout_completed',
    eventType: 'checkout.session.completed',
    objectId: 'cs_test',
  });
  assert.equal(webhookStart.duplicate, false);
  await billingStore.markStripeWebhookEventProcessedAsync({
    eventId: 'evt_test_checkout_completed',
    accountId: creditsSummary.account.id,
    objectId: 'cs_test',
  });
  const webhookDuplicate = await billingStore.startStripeWebhookEventAsync({
    eventId: 'evt_test_checkout_completed',
    eventType: 'checkout.session.completed',
    objectId: 'cs_test',
  });
  assert.equal(webhookDuplicate.duplicate, true);

  const refreshUser = await createTestUser('refresh');
  const refreshAccount = (await resolveAccountEntitlementsAsync(refreshUser)).account;
  const fakeStripe = {
    checkout: {
      sessions: {
        retrieve: async () => ({
          id: 'cs_refresh_screenshot',
          mode: 'payment',
          payment_status: 'paid',
          status: 'complete',
          customer: 'cus_refresh',
          payment_intent: 'pi_refresh',
          metadata: {
            vellicAccountId: refreshAccount.id,
            checkoutType: 'addon',
            addonKey: 'screenshot_pack_4',
          },
        }),
        listLineItems: async () => ({
          data: [
            {
              quantity: 1,
              price: {
                id: 'price_screenshot_pack_4_test',
              },
            },
          ],
        }),
      },
    },
    subscriptions: {
      retrieve: async () => buildSubscription({ accountId: refreshAccount.id }),
    },
  };
  const refreshResult = await refreshBillingAccountFromStripeAsync({
    account: refreshAccount,
    checkoutSessionId: 'cs_refresh_screenshot',
    stripeClient: fakeStripe,
  });
  assert.equal(refreshResult.refreshed, true);
  assert.deepEqual(refreshResult.purchaseSummary, {
    plan: null,
    meters: [
      { meter: METERS.screenshotCredits, quantity: 100 },
    ],
  });
  const refreshedCredits = await resolveAccountEntitlementsAsync(refreshUser);
  assert.equal(refreshedCredits.meters.screenshotCredits.grantRemaining, 100);

  const refreshPagePackUser = await createTestUser('refresh-page-pack');
  const refreshPagePackAccount = (await resolveAccountEntitlementsAsync(refreshPagePackUser)).account;
  const refreshPagePackResult = await refreshBillingAccountFromStripeAsync({
    account: refreshPagePackAccount,
    checkoutSessionId: 'cs_refresh_page_pack',
    stripeClient: {
      checkout: {
        sessions: {
          retrieve: async () => ({
            id: 'cs_refresh_page_pack',
            mode: 'subscription',
            status: 'complete',
            customer: 'cus_refresh_page_pack',
            subscription: 'sub_test_page_pack',
            metadata: {
              vellicAccountId: refreshPagePackAccount.id,
              checkoutType: 'addon_bundle',
              addonKeys: 'page_pack_1',
            },
          }),
          listLineItems: async () => ({
            data: [
              {
                quantity: 2,
                price: {
                  id: 'price_page_pack_1_test',
                },
              },
            ],
          }),
        },
      },
      subscriptions: {
        retrieve: async () => buildPagePackSubscription({
          accountId: refreshPagePackAccount.id,
          quantity: 2,
        }),
      },
    },
  });
  assert.equal(refreshPagePackResult.refreshed, true);
  assert.deepEqual(refreshPagePackResult.purchaseSummary, {
    plan: null,
    meters: [
      { meter: METERS.activePages, quantity: 2000 },
    ],
  });
  const refreshedPages = await resolveAccountEntitlementsAsync(refreshPagePackUser);
  assert.equal(refreshedPages.plan.key, 'free');
  assert.equal(refreshedPages.meters.activePages.grantExtra, 2000);
  await assert.rejects(
    refreshBillingAccountFromStripeAsync({
      account: refreshAccount,
      checkoutSessionId: 'cs_refresh_unowned',
      stripeClient: {
        checkout: {
          sessions: {
            retrieve: async () => ({
              id: 'cs_refresh_unowned',
              mode: 'payment',
              payment_status: 'paid',
              customer: 'cus_other',
              metadata: {},
            }),
          },
        },
      },
    }),
    (error) => error?.code === 'BILLING_ACCOUNT_MISMATCH'
  );

  const promotionOffers = getAdminPromotionOffers();
  assert(promotionOffers.some((offer) => offer.key === 'pro_free_month'));
  assert(promotionOffers.some((offer) => offer.key === 'unlimited_manual' && offer.provider === 'internal'));

  const promoStripeState = {
    coupons: [],
    promotionCodes: [],
  };
  const promoStripe = {
    prices: {
      retrieve: async (priceId) => ({
        id: priceId,
        unit_amount: priceId === 'price_pro_test' ? 800 : 1600,
        currency: 'usd',
        product: {
          id: priceId === 'price_pro_test' ? 'prod_test_pro' : 'prod_test_screenshot_pack',
        },
      }),
    },
    coupons: {
      retrieve: async (couponId) => {
        const coupon = promoStripeState.coupons.find((entry) => entry.id === couponId);
        if (!coupon) {
          const error = new Error('No such coupon');
          error.code = 'resource_missing';
          error.statusCode = 404;
          throw error;
        }
        return coupon;
      },
      create: async (payload) => {
        const coupon = { ...payload, object: 'coupon', valid: true };
        promoStripeState.coupons.push(coupon);
        return coupon;
      },
    },
    promotionCodes: {
      create: async (payload) => {
        const promotionCode = {
          id: `promo_test_${promoStripeState.promotionCodes.length + 1}`,
          object: 'promotion_code',
          active: true,
          code: `AUTO${promoStripeState.promotionCodes.length + 1}`,
          max_redemptions: payload.max_redemptions,
          times_redeemed: 0,
          restrictions: payload.restrictions || {},
          metadata: payload.metadata || {},
          created: Math.floor(Date.now() / 1000),
        };
        promoStripeState.promotionCodes.push({ payload, promotionCode });
        return promotionCode;
      },
      retrieve: async (promotionCodeId) => {
        const entry = promoStripeState.promotionCodes.find((item) => item.promotionCode.id === promotionCodeId);
        if (!entry) {
          const error = new Error('No such promotion code');
          error.code = 'resource_missing';
          error.statusCode = 404;
          throw error;
        }
        return entry.promotionCode;
      },
      update: async (promotionCodeId, payload) => {
        const entry = promoStripeState.promotionCodes.find((item) => item.promotionCode.id === promotionCodeId);
        if (!entry) throw new Error('Missing promotion code update target');
        entry.promotionCode = {
          ...entry.promotionCode,
          active: payload.active !== undefined ? payload.active : entry.promotionCode.active,
        };
        return entry.promotionCode;
      },
    },
  };

  const createdPromos = await createAdminPromotionCodesAsync({
    offerKey: 'pro_free_month',
    quantity: 2,
    campaignKey: 'friends',
    recipientEmail: 'person@example.com',
    note: 'manual share',
    createdByUserId: 'admin_test',
    stripeClient: promoStripe,
  });
  assert.equal(createdPromos.length, 2);
  assert.deepEqual(createdPromos.map((entry) => entry.code), ['AUTO1', 'AUTO2']);
  assert.equal(promoStripeState.coupons.length, 1);
  assert.equal(promoStripeState.coupons[0].id, 'vellic_pro_free_month');
  assert.equal(promoStripeState.coupons[0].amount_off, 800);
  assert.equal(promoStripeState.coupons[0].currency, 'usd');
  assert.deepEqual(promoStripeState.coupons[0].applies_to.products, ['prod_test_pro']);
  assert.equal(promoStripeState.promotionCodes.length, 2);
  assert.equal(promoStripeState.promotionCodes[0].payload.max_redemptions, 1);
  assert.equal(promoStripeState.promotionCodes[0].payload.restrictions.first_time_transaction, true);
  assert.equal(promoStripeState.promotionCodes[0].payload.metadata.campaignKey, 'friends');

  const listedPromos = await listAdminPromotionCodesAsync({
    limit: 10,
    refreshFromStripe: false,
  });
  assert(listedPromos.some((entry) => entry.code === 'AUTO1' && entry.status === 'active'));

  const archivedPromo = await archiveAdminPromotionCodeAsync({
    id: createdPromos[0].id,
    stripeClient: promoStripe,
  });
  assert.equal(archivedPromo.status, 'archived');

  const internalPromos = await createAdminPromotionCodesAsync({
    offerKey: 'unlimited_manual',
    quantity: 1,
    campaignKey: 'vip',
    createdByUserId: 'admin_test',
  });
  assert.equal(internalPromos.length, 1);
  assert.equal(internalPromos[0].provider, 'internal');
  assert.match(internalPromos[0].code, /^VEL-[A-F0-9]+$/);

  console.log('Stripe billing checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
