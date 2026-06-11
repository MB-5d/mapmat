const assert = require('assert');
const os = require('os');
const path = require('path');

process.env.DB_PATH = path.join(os.tmpdir(), `vellic-stripe-billing-${process.pid}-${Date.now()}.db`);
process.env.TEST_AUTH_ENABLED = 'false';
process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_pro_test';
process.env.STRIPE_PRICE_PRO_YEARLY = 'price_pro_yearly_test';
process.env.STRIPE_PRICE_STUDIO_ANNUAL = 'price_studio_annual_test';
process.env.STRIPE_PRICE_SCREENSHOT_CREDITS_100 = 'price_screenshot_100_test';

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
  getAddOnPriceConfigByStripePrice,
  applyStripeSubscriptionToAccountAsync,
  refreshBillingAccountFromStripeAsync,
} = require('../utils/stripeBilling');

async function createTestUser(label) {
  return authStore.createUserAsync({
    email: `stripe-billing-${label}-${Date.now()}@example.test`,
    passwordHash: 'test',
    name: `Stripe Billing ${label}`,
    emailVerifiedAt: new Date().toISOString(),
  });
}

function buildSubscription({ accountId, status = 'active' }) {
  const now = Math.floor(Date.now() / 1000);
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
      data: [
        {
          price: {
            id: 'price_pro_test',
            product: 'prod_test_pro',
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
  const proCatalog = billingCatalog.plans.find((entry) => entry.key === 'pro');
  assert.equal(proCatalog.prices.monthly.configured, true);
  assert.equal(proCatalog.prices.yearly.configured, true);
  const addOnPrice = getAddOnPriceConfigByStripePrice('price_screenshot_100_test');
  assert.equal(addOnPrice.key, 'screenshot_credits_100');
  assert.equal(addOnPrice.meter, METERS.screenshotCredits);
  assert.equal(addOnPrice.quantity, 100);

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
  assert.equal(proSummary.meters.crawlPages.included, 1000);
  assert.equal(proSummary.meters.screenshotCredits.included, 100);
  assert.equal(proSummary.account.stripeCustomerId, 'cus_test_pro');
  assert.equal(proSummary.account.stripeSubscriptionId, 'sub_test_pro');
  assert.equal(proSummary.account.stripeSubscriptionStatus, 'active');
  assert.equal(proSummary.account.stripePriceId, 'price_pro_test');
  assert.equal(proSummary.account.stripeProductId, 'prod_test_pro');
  assert.equal(proSummary.account.stripeLatestInvoiceId, 'in_test_pro');

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
  const deniedScreenshot = await checkAccountActionAsync(creditsUser, ACTIONS.screenshotCapture, { credits: 1 });
  assert.equal(deniedScreenshot.allowed, false);

  const firstGrant = await billingStore.upsertEntitlementGrantByExternalRefAsync({
    accountId: creditsSummary.account.id,
    source: 'addon',
    externalRef: 'stripe:checkout:cs_test:screenshot_credits_100:price_screenshot_100_test',
    meter: METERS.screenshotCredits,
    quantity: 100,
    resetBehavior: 'rollover',
    metadata: {
      provider: 'stripe',
      checkoutSessionId: 'cs_test',
      priceId: 'price_screenshot_100_test',
      addonKey: 'screenshot_credits_100',
    },
  });
  assert.equal(firstGrant.created, true);

  const duplicateGrant = await billingStore.upsertEntitlementGrantByExternalRefAsync({
    accountId: creditsSummary.account.id,
    source: 'addon',
    externalRef: 'stripe:checkout:cs_test:screenshot_credits_100:price_screenshot_100_test',
    meter: METERS.screenshotCredits,
    quantity: 100,
  });
  assert.equal(duplicateGrant.created, false);
  assert.equal(duplicateGrant.grant.id, firstGrant.grant.id);

  const withCredits = await resolveAccountEntitlementsAsync(creditsUser);
  assert.equal(withCredits.meters.screenshotCredits.included, 0);
  assert.equal(withCredits.meters.screenshotCredits.grantRemaining, 100);
  assert.equal(withCredits.meters.screenshotCredits.remaining, 100);

  const allowedScreenshot = await checkAccountActionAsync(creditsUser, ACTIONS.screenshotCapture, { credits: 5 });
  assert.equal(allowedScreenshot.allowed, true);
  await recordMeterDebitAsync({
    user: creditsUser,
    accountSummary: withCredits,
    meter: METERS.screenshotCredits,
    quantity: 5,
    idempotencyKey: 'stripe-billing-test:screenshot',
    metadata: { test: true },
  });
  await recordMeterDebitAsync({
    user: creditsUser,
    accountSummary: withCredits,
    meter: METERS.screenshotCredits,
    quantity: 5,
    idempotencyKey: 'stripe-billing-test:screenshot',
    metadata: { test: true },
  });
  const afterCreditUse = await resolveAccountEntitlementsAsync(creditsUser);
  assert.equal(afterCreditUse.meters.screenshotCredits.used, 5);
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
            addonKey: 'screenshot_credits_100',
          },
        }),
        listLineItems: async () => ({
          data: [
            {
              quantity: 1,
              price: {
                id: 'price_screenshot_100_test',
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
  const refreshedCredits = await resolveAccountEntitlementsAsync(refreshUser);
  assert.equal(refreshedCredits.meters.screenshotCredits.grantRemaining, 100);
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

  console.log('Stripe billing checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
