const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'admin', 'usageCostRates.json');

const FALLBACK_CONFIG = Object.freeze({
  currency: 'USD',
  updatedAt: '2026-06-02',
  notes: ['Fallback usage-cost assumptions loaded because the admin config file could not be read.'],
  sources: [],
  fixedMonthlyUsd: {},
  ratesUsd: {},
});

function readUsageCostConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      ...FALLBACK_CONFIG,
      ...parsed,
      fixedMonthlyUsd: {
        ...FALLBACK_CONFIG.fixedMonthlyUsd,
        ...(parsed.fixedMonthlyUsd || {}),
      },
      ratesUsd: {
        ...FALLBACK_CONFIG.ratesUsd,
        ...(parsed.ratesUsd || {}),
      },
      configPath: CONFIG_PATH,
    };
  } catch (error) {
    return {
      ...FALLBACK_CONFIG,
      configPath: CONFIG_PATH,
      configError: error.message,
    };
  }
}

function toMoney(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 10000) / 10000;
}

function sumObjectValues(object = {}) {
  return Object.values(object).reduce((total, value) => {
    const number = Number(value || 0);
    return total + (Number.isFinite(number) ? number : 0);
  }, 0);
}

function eventQuantity(eventBreakdown = {}, eventTypes = []) {
  return eventTypes.reduce((total, eventType) => (
    total + Number(eventBreakdown[eventType]?.quantity || 0)
  ), 0);
}

function eventCount(eventBreakdown = {}, eventTypes = []) {
  return eventTypes.reduce((total, eventType) => (
    total + Number(eventBreakdown[eventType]?.events || 0)
  ), 0);
}

function buildCostCategory(id, label, costUsd, units = {}) {
  return {
    id,
    label,
    costUsd: toMoney(costUsd),
    units,
  };
}

function estimateUsageCosts({
  days = 30,
  eventBreakdown = {},
  summary = {},
} = {}) {
  const config = readUsageCostConfig();
  const rates = config.ratesUsd || {};
  const windowDays = Math.max(1, Number(days || 30));
  const fixedMonthlyUsd = sumObjectValues(config.fixedMonthlyUsd);
  const fixedProratedUsd = fixedMonthlyUsd * (windowDays / 30);

  const scanRuns = eventQuantity(eventBreakdown, ['scan', 'scan_stream', 'scan_job']);
  const scanPages = Number(summary.scanPages || 0);
  const screenshotJobs = eventQuantity(eventBreakdown, ['screenshot_job']);
  const thumbnailScreenshots = Number(summary.thumbnailScreenshots || 0);
  const fullPageScreenshots = Number(summary.fullPageScreenshots || 0);
  const storageGb = Number(summary.imageStorageBytes || 0) / (1024 * 1024 * 1024);
  const storageGbMonth = storageGb * (windowDays / 30);
  const imageAssetWrites = Number(summary.imageAssets || 0);
  const imageAssetReads = Number(summary.imageDownloadFileCount || 0);
  const emailCount = Number(summary.emails || 0);
  const clientExports = eventCount(eventBreakdown, [
    'export_ai_site_brief',
    'export_csv',
    'export_json',
    'export_pdf',
    'export_png',
    'export_site_index',
    'export_report_pdf',
  ]);
  const imageDownloads = eventCount(eventBreakdown, ['download_images']);
  const comments = eventQuantity(eventBreakdown, ['comment_created']);
  const shares = eventQuantity(eventBreakdown, ['share_created', 'share_viewed']);
  const additionalSeats = Number(summary.additionalUsers || 0);

  const categories = [
    buildCostCategory('platform', 'Fixed platform baseline', fixedProratedUsd, {
      fixedMonthlyUsd: toMoney(fixedMonthlyUsd),
      days: windowDays,
    }),
    buildCostCategory('scans', 'URL scanning', (
      scanRuns * Number(rates.scanPerRun || 0)
      + scanPages * Number(rates.scanPerPage || 0)
    ), { scans: scanRuns, pages: scanPages }),
    buildCostCategory('screenshots', 'Screenshot capture', (
      screenshotJobs * Number(rates.screenshotJob || 0)
      + thumbnailScreenshots * Number(rates.thumbnailScreenshot || 0)
      + fullPageScreenshots * Number(rates.fullPageScreenshot || 0)
    ), {
      jobs: screenshotJobs,
      thumbnails: thumbnailScreenshots,
      fullPage: fullPageScreenshots,
    }),
    buildCostCategory('storage', 'Screenshot storage', (
      storageGbMonth * Number(rates.cloudflareR2StorageGbMonth || 0)
      + (imageAssetWrites / 1000000) * Number(rates.cloudflareR2ClassAPerMillion || 0)
      + (imageAssetReads / 1000000) * Number(rates.cloudflareR2ClassBPerMillion || 0)
    ), {
      storageGbMonth: toMoney(storageGbMonth),
      writes: imageAssetWrites,
      reads: imageAssetReads,
    }),
    buildCostCategory('email', 'Transactional email', (
      (emailCount / 1000) * Number(rates.emailPerThousand || 0)
    ), { emails: emailCount }),
    buildCostCategory('downloads', 'Exports and downloads', (
      clientExports * Number(rates.clientExport || 0)
      + imageDownloads * Number(rates.imageDownloadPackage || 0)
    ), { clientExports, imageDownloads }),
    buildCostCategory('collaboration', 'Comments, sharing, seats', (
      comments * Number(rates.comment || 0)
      + shares * Number(rates.share || 0)
      + additionalSeats * Number(rates.additionalUserSeatMonth || 0) * (windowDays / 30)
    ), { comments, shares, additionalSeats }),
  ];

  const totalUsd = categories.reduce((total, category) => total + category.costUsd, 0);

  return {
    config,
    categories,
    totalUsd: toMoney(totalUsd),
    variableUsd: toMoney(totalUsd - toMoney(fixedProratedUsd)),
    fixedUsd: toMoney(fixedProratedUsd),
  };
}

module.exports = {
  estimateUsageCosts,
  readUsageCostConfig,
};
