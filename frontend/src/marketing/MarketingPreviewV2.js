import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  ExternalLink,
  GalleryHorizontal,
  ListChecks,
  Mail,
  Menu,
  MessagesSquare,
  Monitor,
  Network,
  PackageCheck,
  ScrollText,
  Share2,
  Shuffle,
  Split,
  Workflow,
  X,
} from 'lucide-react';

import exampleAnthropicImage from '../assets/marketing/example-anthropic.png';
import exampleRaycastImage from '../assets/marketing/example-raycast.png';
import vellicCanvasImage from '../assets/marketing/vellic-canvas.png';
import vellicLogo from '../assets/vellic-logo.svg';
import { getBillingConfig, submitMarketingContact, submitMarketingMailingListSignup } from '../api';
import Accordion from '../components/ui/Accordion';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Field from '../components/ui/Field';
import IconButton from '../components/ui/IconButton';
import Modal from '../components/ui/Modal';
import SelectInput from '../components/ui/SelectInput';
import TextareaInput from '../components/ui/TextareaInput';
import TextInput from '../components/ui/TextInput';
import { ROUTE_SURFACES } from '../utils/appRoutes';
import {
  BILLING_CYCLE_OPTIONS,
  buildPlanCardsFromBillingCatalog,
  hasYearlyBillingPrices,
} from '../utils/billingPlans';
import classNames from '../utils/classNames';
import MarketingScanBar, { isMarketingPhoneViewport } from './MarketingScanBar';
import { buildAppBillingUrl, buildAppScanUrl, buildAppSignupUrl, buildAppTrialUrl } from './marketingConfig';
import {
  MARKETING_PREVIEW_V2_BASE_PATH,
  MARKETING_PREVIEW_V2_META_DESCRIPTION,
  MARKETING_PREVIEW_V2_NAV_SECTION_IDS,
  MARKETING_PREVIEW_V2_SOCIAL_IMAGE_ALT,
  MARKETING_PREVIEW_V2_SOCIAL_IMAGE_URL,
  buildMarketingPreviewV2CanonicalUrl,
  buildMarketingPreviewV2Path,
  getMarketingPreviewV2SectionById,
  getMarketingPreviewV2SectionByPathname,
} from './marketingPreviewV2Config';
import './MarketingPreviewV2.css';

const heroHighlights = [
  {
    icon: Network,
    label: 'Map',
    text: 'Scan a URL, import a file, or build from scratch.',
  },
  {
    icon: ListChecks,
    label: 'Audit',
    text: 'Capture screenshots, trace flows, and mark findings.',
  },
  {
    icon: Workflow,
    label: 'Handoff',
    text: 'Invite reviewers and export useful deliverables.',
  },
];

const useCaseCards = [
  {
    title: 'UX',
    text: 'Review hierarchy, navigation paths, and current-state structure before redesign work starts.',
    accent: 'brand',
  },
  {
    title: 'Content strategy',
    text: 'Find gaps, duplicate pages, and content that is hard to reach.',
    accent: 'brand',
  },
  {
    title: 'Dev and engineering',
    text: 'Turn audit decisions into exports, redirects, migration notes, and handoff data.',
    accent: 'brand',
  },
  {
    title: 'SEO',
    text: 'Connect crawl context to depth, orphan pages, subdomains, and cleanup priority.',
    accent: 'brand',
  },
  {
    title: 'Product',
    text: 'Keep scope, stakeholder feedback, priorities, and launch decisions tied to the map.',
    accent: 'brand',
  },
];

const featureCards = [
  {
    icon: Split,
    title: 'Flexible inputs',
    text: 'Start from a public URL, imported structure, or a map from scratch',
    accent: 'brand',
  },
  {
    icon: MessagesSquare,
    title: 'Collaboration',
    text: 'Collect comments, decisions, and review context around the map',
    accent: 'brand',
  },
  {
    icon: Shuffle,
    title: 'Flows & crosslinks',
    text: 'Show journeys, related pages, and paths that do not fit a simple tree',
    accent: 'brand',
  },
  {
    icon: GalleryHorizontal,
    title: 'Bulk screenshots',
    text: 'Capture and download page screenshots for public web pages',
    accent: 'brand',
  },
  {
    icon: ScrollText,
    title: 'Audit findings',
    text: 'Surface missing, disabled, duplicate, inactive, subdomain, and orphan pages',
    accent: 'brand',
  },
  {
    icon: PackageCheck,
    title: 'Exports and handoff',
    text: 'Download XML, JSON, CSV, PDF, PNG, text, and AI-ready packages',
    accent: 'brand',
  },
];

const logoPathParts = {
  left: {
    path: 'M180.764 145.48V254.98L1 111.577V2.07617L180.764 145.48Z',
    viewBox: '1 2.07617 179.764 252.90383',
  },
  right: {
    path: 'M1 145.48V390.943L180.764 247.539V2.07617L1 145.48Z',
    viewBox: '1 2.07617 179.764 388.86683',
  },
};

const backgroundShapes = [
  { id: '26-6', x: 996, y: 72, width: 402, height: 566 },
  { id: '25-1006', x: 886, y: 354, width: 110, height: 156 },
  { id: '25-994', x: 728, y: -38, width: 214, height: 300 },
  { id: '25-997', x: 740, y: 1244, width: 766, height: 1076, rotation: -180 },
  { id: '26-7', x: 1282, y: 286, width: 188, height: 408 },
  { id: '26-8', x: 1424, y: 358, width: 158, height: 222 },
  { id: '26-9', x: 1220, y: 554, width: 148, height: 318 },
  { id: '25-995', x: 630, y: -120, width: 140, height: 304 },
  { id: '25-999', x: 66, y: 948, width: 228, height: 494 },
  { id: '25-1000', x: 40, y: 1382, width: 64, height: 136 },
  { id: '25-1009', x: 1028, y: 2234, width: 70, height: 152 },
  { id: '25-1010', x: 332, y: 1190, width: 380, height: 816 },
  { id: '25-996', x: 926, y: -190, width: 286, height: 618 },
  { id: '25-1007', x: 906, y: 432, width: 40, height: 88 },
  { id: '25-1004', x: 1260, y: -250, width: 204, height: 438 },
  { id: '26-14', x: -140, y: 3136, width: 214, height: 464 },
  { id: '26-15', x: -72, y: 3284, width: 180, height: 252 },
  { id: '26-17', x: -140, y: 3550, width: 218, height: 306 },
  { id: '26-18', x: 24, y: 3472, width: 148, height: 320 },
  { id: '43-5', x: 30, y: 4638, width: 60, height: 128 },
  { id: '26-21', x: 1246, y: 4112, width: 296, height: 640 },
  { id: '43-2', x: 1040, y: 3850, width: 112, height: 242 },
  { id: '43-3', x: 1292, y: 3218, width: 104, height: 222 },
  { id: '26-23', x: 1182, y: 4526, width: 174, height: 376 },
  { id: '26-29', x: -80, y: 7210, width: 178, height: 250 },
  { id: '46-1391', x: 50, y: 7524, width: 60, height: 86 },
  { id: '46-1392', x: 46, y: 7336, width: 36, height: 50 },
  { id: '26-31', x: -146, y: 7474, width: 216, height: 304 },
  { id: '26-32', x: -12, y: 7380, width: 126, height: 272 },
  { id: '26-34', x: 1212, y: 7960, width: 240, height: 338 },
  { id: '26-36', x: 1286, y: 7756, width: 236, height: 332 },
  { id: '26-37', x: 370, y: 8226, width: 112, height: 242 },
  { id: '25-1028', x: 22, y: 8046, width: 48, height: 104 },
  { id: '26-38', x: 1100, y: 8098, width: 462, height: 650 },
  { id: '26-41', x: 1078, y: 16, width: 514, height: 1112 },
  { id: '26-43', x: 1028, y: 638, width: 366, height: 516 },
  { id: '26-45', x: 1158, y: 524, width: 230, height: 324 },
  { id: '25-993', x: 474, y: -68, width: 264, height: 372 },
  { id: '45-1381', x: 158, y: -164, width: 248, height: 348 },
  { id: '45-1384', x: 120, y: 58, width: 66, height: 94 },
  { id: '45-1386', x: 26, y: 422, width: 46, height: 66 },
  { id: '26-47', x: -34, y: 90, width: 122, height: 266 },
  { id: '45-1385', x: 18, y: 342, width: 60, height: 130 },
  { id: '45-1382', x: 382, y: 30, width: 60, height: 128 },
  { id: '45-1383', x: 48, y: -56, width: 100, height: 214 },
  { id: '26-49', x: -354, y: 470, width: 418, height: 588 },
  { id: '26-51', x: 912, y: 970, width: 122, height: 262 },
  { id: '26-53', x: 630, y: 1214, width: 102, height: 144 },
  { id: '26-55', x: -198, y: 782, width: 380, height: 534 },
  { id: '25-1001', x: 104, y: 1286, width: 172, height: 244 },
  { id: '25-1002', x: 256, y: 1422, width: 38, height: 54 },
  { id: '25-1003', x: 684, y: 1358, width: 290, height: 410 },
  { id: '25-1013', x: 1034, y: 1598, width: 70, height: 98 },
  { id: '25-1014', x: 940, y: 1944, width: 348, height: 490 },
  { id: '25-1011', x: 400, y: 1318, width: 116, height: 162 },
  { id: '26-57', x: 1066, y: 1014, width: 350, height: 756 },
  { id: '25-1012', x: 940, y: 1150, width: 502, height: 1084 },
  { id: '26-59', x: 1274, y: 1326, width: 460, height: 648 },
  { id: '25-1008', x: 986, y: 1288, width: 160, height: 226 },
  { id: '26-61', x: 1288, y: 1810, width: 374, height: 808 },
  { id: '26-63', x: -170, y: 1836, width: 880, height: 1238 },
  { id: '26-65', x: 260, y: 2442, width: 116, height: 162 },
  { id: '26-67', x: 1128, y: 2230, width: 214, height: 464 },
  { id: '26-69', x: 1062, y: 2650, width: 310, height: 668 },
  { id: '26-71', x: 978, y: 3404, width: 124, height: 270 },
  { id: '26-73', x: -34, y: 4492, width: 208, height: 292 },
  { id: '43-6', x: 16, y: 4824, width: 70, height: 100 },
  { id: '26-75', x: -294, y: 3074, width: 434, height: 612 },
  { id: '26-77', x: -400, y: 2756, width: 592, height: 1278 },
  { id: '26-79', x: 752, y: 3518, width: 238, height: 332 },
  { id: '26-81', x: 1056, y: 3440, width: 94, height: 204 },
  { id: '26-83', x: 1214, y: 3680, width: 282, height: 612 },
  { id: '26-85', x: 1060, y: 3746, width: 426, height: 598 },
  { id: '26-87', x: 1288, y: 4328, width: 414, height: 584 },
  { id: '26-89', x: 1038, y: 4596, width: 364, height: 512 },
  { id: '26-91', x: -264, y: 4722, width: 314, height: 680 },
  { id: '26-93', x: 282, y: 4216, width: 128, height: 276 },
  { id: '26-97', x: 1150, y: 5022, width: 184, height: 258 },
  { id: '68-1002', x: 1058, y: 5228, width: 126, height: 176 },
  { id: '68-1003', x: 1242, y: 5320, width: 254, height: 356 },
  { id: '26-101', x: 744, y: 4872, width: 350, height: 756 },
  { id: '26-103', x: 920, y: 5294, width: 548, height: 1186 },
  { id: '26-105', x: -140, y: 5970, width: 240, height: 338 },
  { id: '26-107', x: 1162, y: 5906, width: 420, height: 908 },
  { id: '43-7', x: 1160, y: 5600, width: 142, height: 306 },
  { id: '68-1001', x: 1162, y: 5170, width: 134, height: 292 },
  { id: '43-9', x: 1352, y: 6380, width: 104, height: 224 },
  { id: '25-1022', x: 942, y: 6374, width: 204, height: 438 },
  { id: '26-109', x: -294, y: 6154, width: 430, height: 604 },
  { id: '26-111', x: -560, y: 6242, width: 658, height: 926 },
  { id: '26-113', x: 28, y: 7122, width: 46, height: 100 },
  { id: '26-115', x: 1214, y: 6858, width: 282, height: 610 },
  { id: '29-2', x: 1018, y: 6794, width: 66, height: 144 },
  { id: '29-3', x: 50, y: 6572, width: 170, height: 374 },
  { id: '29-4', x: 50, y: 5926, width: 334, height: 734 },
  { id: '29-6', x: -48, y: 5836, width: 98, height: 214 },
  { id: '29-7', x: 34, y: 5892, width: 32, height: 68 },
  { id: '25-1019', x: 1320, y: 7052, width: 290, height: 628 },
  { id: '25-1025', x: 1126, y: 7376, width: 126, height: 274 },
  { id: '25-1026', x: 996, y: 7650, width: 88, height: 190 },
  { id: '26-117', x: 930, y: 6952, width: 372, height: 522 },
  { id: '25-1020', x: 1084, y: 6760, width: 438, height: 614 },
  { id: '25-1021', x: 1044, y: 6638, width: 308, height: 432 },
  { id: '25-1023', x: 1216, y: 6374, width: 124, height: 172 },
  { id: '43-8', x: 1232, y: 5696, width: 172, height: 240 },
  { id: '25-1024', x: 794, y: 5850, width: 310, height: 436 },
  { id: '26-119', x: 948, y: 7498, width: 442, height: 956 },
  { id: '26-121', x: -110, y: 7874, width: 340, height: 480 },
  { id: '26-123', x: 880, y: 7810, width: 290, height: 626 },
  { id: '26-125', x: 106, y: 7982, width: 526, height: 740 },
  { id: '25-1029', x: 44, y: 8348, width: 82, height: 114 },
  { id: '26-129', x: -304, y: 8196, width: 446, height: 628 },
  { id: '26-131', x: 44, y: 8286, width: 140, height: 302 },
  { id: '26-133', x: 788, y: 8184, width: 66, height: 94 },
  { id: '26-137', x: 656, y: 8510, width: 398, height: 860 },
  { id: '26-139', x: 1266, y: 7838, width: 684, height: 1478 },
  { id: '26-10', x: 1336, y: 462, width: 266, height: 374 },
  { id: '25-1005', x: 1176, y: -40, width: 266, height: 374 },
  { id: '25-1016', x: 1348, y: 2766, width: 150, height: 212 },
  { id: '25-1017', x: 1352, y: 7574, width: 132, height: 186 },
  { id: '25-1027', x: 1064, y: 7476, width: 222, height: 312 },
  { id: '26-35', x: 840, y: 8194, width: 68, height: 146 },
  { id: '29-5', x: -22, y: 5746, width: 612, height: 860 },
  { id: '43-4', x: 1352, y: 3262, width: 178, height: 250 },
  { id: '26-20', x: 1000, y: 5558, width: 208, height: 292 },
  { id: '45-1387', x: -86, y: 322, width: 172, height: 374 },
];

const getMarketingV2BackgroundVariant = (shape) => (
  shape.width / shape.height < 0.58 ? 'right' : 'left'
);

const getMarketingV2BackgroundStyle = (shape) => ({
  left: `${shape.x}px`,
  top: `${shape.y}px`,
  width: `${shape.width}px`,
  height: `${shape.height}px`,
  transform: shape.rotation ? `rotate(${shape.rotation}deg)` : undefined,
});

const comparisonGroups = [
  {
    id: 'sitemap-tools',
    label: 'Sitemap tools',
    summary: 'How Vellic compares with visual sitemap and planning tools.',
    columns: [
      { key: 'vellic', label: 'Vellic', highlight: true },
      { key: 'flowmapp', label: 'FlowMapp' },
      { key: 'slickplan', label: 'Slickplan' },
      { key: 'octopus', label: 'Octopus.do' },
      { key: 'dynomapper', label: 'DYNO Mapper' },
      { key: 'mysitemapgenerator', label: 'mySitemapGenerator' },
    ],
    rows: [
      {
        feature: 'Visual sitemap canvas',
        values: {
          vellic: 'Yes',
          flowmapp: 'Yes',
          slickplan: 'Yes',
          octopus: 'Yes',
          dynomapper: 'Yes',
          mysitemapgenerator: 'Partial',
        },
      },
      {
        feature: 'Manual planning and editing',
        values: {
          vellic: 'Yes',
          flowmapp: 'Yes',
          slickplan: 'Yes',
          octopus: 'Yes',
          dynomapper: 'Yes',
          mysitemapgenerator: 'Partial',
        },
      },
      {
        feature: 'Map-level comments and sharing',
        values: {
          vellic: 'Yes',
          flowmapp: 'Yes',
          slickplan: 'Yes',
          octopus: 'Partial',
          dynomapper: 'Yes',
          mysitemapgenerator: '--',
        },
      },
      {
        feature: 'Issue and status layers',
        values: {
          vellic: 'Yes',
          flowmapp: 'Not core',
          slickplan: 'Partial',
          octopus: 'Partial',
          dynomapper: 'Yes',
          mysitemapgenerator: '--',
        },
      },
      {
        feature: 'Screenshots tied to pages',
        values: {
          vellic: 'Yes',
          flowmapp: 'Not core',
          slickplan: 'Not core',
          octopus: 'Not core',
          dynomapper: 'Partial',
          mysitemapgenerator: '--',
        },
      },
      {
        feature: 'Flows and crosslinks',
        values: {
          vellic: 'Yes',
          flowmapp: 'Partial',
          slickplan: 'Partial',
          octopus: 'Partial',
          dynomapper: 'Partial',
          mysitemapgenerator: '--',
        },
      },
      {
        feature: 'AI-ready handoff package',
        values: {
          vellic: 'Yes',
          flowmapp: 'Not core',
          slickplan: 'Not core',
          octopus: 'Not core',
          dynomapper: 'Not core',
          mysitemapgenerator: 'Not core',
        },
      },
      {
        feature: 'Multiple export formats',
        values: {
          vellic: 'Yes',
          flowmapp: 'Yes',
          slickplan: 'Yes',
          octopus: 'Partial',
          dynomapper: 'Yes',
          mysitemapgenerator: 'Yes',
        },
      },
    ],
  },
  {
    id: 'screenshot-capture',
    label: 'Bulk screenshot',
    summary: 'How we compare in main categories and features.',
    columns: [
      { key: 'vellic', label: 'Vellic', highlight: true },
      { key: 'visualsitemaps', label: 'VisualSitemaps' },
      { key: 'hexomatic', label: 'Hexomatic' },
      { key: 'screenshotapi', label: 'ScreenshotAPI.com' },
      { key: 'fireshot', label: 'FireShot' },
      { key: 'stillio', label: 'Stillio' },
    ],
    rows: [
      {
        feature: 'Bulk page screenshots',
        values: {
          vellic: 'Yes',
          visualsitemaps: 'Yes',
          hexomatic: 'Yes',
          screenshotapi: 'Yes',
          fireshot: 'Partial',
          stillio: 'Yes',
        },
      },
      {
        feature: 'Full-page screenshots',
        values: {
          vellic: 'Yes',
          visualsitemaps: 'Yes',
          hexomatic: 'Yes',
          screenshotapi: 'Yes',
          fireshot: 'Yes',
          stillio: 'Yes',
        },
      },
      {
        feature: 'Organized screenshot downloads',
        values: {
          vellic: 'Yes',
          visualsitemaps: 'Yes',
          hexomatic: 'Yes',
          screenshotapi: 'Partial',
          fireshot: 'Partial',
          stillio: 'Yes',
        },
      },
      {
        feature: 'Screenshots tied to editable pages',
        values: {
          vellic: 'Yes',
          visualsitemaps: 'Yes',
          hexomatic: 'Not core',
          screenshotapi: 'Not core',
          fireshot: 'Not core',
          stillio: 'Not core',
        },
      },
      {
        feature: 'Visual sitemap context',
        values: {
          vellic: 'Yes',
          visualsitemaps: 'Yes',
          hexomatic: '--',
          screenshotapi: 'Not core',
          fireshot: 'Not core',
          stillio: 'Not core',
        },
      },
      {
        feature: 'Review links and comments',
        values: {
          vellic: 'Yes',
          visualsitemaps: 'Partial',
          hexomatic: 'Not core',
          screenshotapi: 'Not core',
          fireshot: 'Not core',
          stillio: 'Not core',
        },
      },
      {
        feature: 'IA findings beyond visuals',
        values: {
          vellic: 'Yes',
          visualsitemaps: 'Partial',
          hexomatic: 'Not core',
          screenshotapi: 'Not core',
          fireshot: 'Not core',
          stillio: 'Not core',
        },
      },
      {
        feature: 'Planning handoff exports',
        values: {
          vellic: 'Yes',
          visualsitemaps: 'Partial',
          hexomatic: '--',
          screenshotapi: '--',
          fireshot: '--',
          stillio: '--',
        },
      },
    ],
  },
  {
    id: 'seo-crawlers',
    label: 'SEO crawlers',
    summary: 'How we compare in main categories and features.',
    columns: [
      { key: 'vellic', label: 'Vellic', highlight: true },
      { key: 'screamingfrog', label: 'Screaming Frog' },
      { key: 'sitebulb', label: 'Sitebulb' },
      { key: 'ahrefs', label: 'Ahrefs Site Audit' },
      { key: 'semrush', label: 'Semrush Site Audit' },
      { key: 'dynomapper', label: 'DYNO Mapper' },
    ],
    rows: [
      {
        feature: 'Crawl from live URL',
        values: {
          vellic: 'Yes',
          screamingfrog: 'Yes',
          sitebulb: 'Yes',
          ahrefs: 'Yes',
          semrush: 'Yes',
          dynomapper: 'Yes',
        },
      },
      {
        feature: 'Technical SEO depth',
        values: {
          vellic: 'Partial',
          screamingfrog: 'Yes',
          sitebulb: 'Yes',
          ahrefs: 'Yes',
          semrush: 'Yes',
          dynomapper: 'Yes',
        },
      },
      {
        feature: 'Editable visual planning workspace',
        values: {
          vellic: 'Yes',
          screamingfrog: 'Partial',
          sitebulb: 'Partial',
          ahrefs: 'Not core',
          semrush: 'Not core',
          dynomapper: 'Partial',
        },
      },
      {
        feature: 'Orphan and subdomain signals',
        values: {
          vellic: 'Yes',
          screamingfrog: 'Yes',
          sitebulb: 'Yes',
          ahrefs: 'Yes',
          semrush: 'Yes',
          dynomapper: 'Yes',
        },
      },
      {
        feature: 'Screenshots in the same workflow',
        values: {
          vellic: 'Yes',
          screamingfrog: 'Partial',
          sitebulb: 'Partial',
          ahrefs: 'Not core',
          semrush: 'Not core',
          dynomapper: 'Partial',
        },
      },
      {
        feature: 'Collaboration and stakeholder review',
        values: {
          vellic: 'Yes',
          screamingfrog: 'Not core',
          sitebulb: 'Not core',
          ahrefs: 'Partial',
          semrush: 'Partial',
          dynomapper: 'Yes',
        },
      },
      {
        feature: 'Planning handoff exports',
        values: {
          vellic: 'Yes',
          screamingfrog: 'Partial',
          sitebulb: 'Partial',
          ahrefs: 'Partial',
          semrush: 'Partial',
          dynomapper: 'Yes',
        },
      },
      {
        feature: 'Editable map structure',
        values: {
          vellic: 'Yes',
          screamingfrog: 'Partial',
          sitebulb: 'Partial',
          ahrefs: 'Not core',
          semrush: 'Not core',
          dynomapper: 'Partial',
        },
      },
    ],
  },
];

const comparisonRowCount = Math.max(...comparisonGroups.map((group) => group.rows.length));
const comparisonSummary = 'How we compare in main categories and features.';
const featureComparisonEnabled = false;
const MARKETING_V2_JSON_LD_ID = 'marketing-v2-jsonld';
const MARKETING_V2_SCHEMA_ORGANIZATION_ID = 'https://vellic.io/#organization';
const MARKETING_V2_SCHEMA_WEBSITE_ID = 'https://vellic.io/#website';
const MARKETING_V2_SCHEMA_SOFTWARE_ID = 'https://vellic.io/#software';
const MARKETING_V2_PRODUCTION_HOSTS = new Set(['vellic.io', 'www.vellic.io']);
const MARKETING_V2_LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1']);
const marketingV2SoftwareFeatures = [
  'Visual sitemap generator',
  'Website audit tool',
  'Website screenshot crawler',
  'Website redesign planning tool',
  'Sitemap generator from URL',
  'AI website brief generator',
  'Content inventory tool',
  'Information architecture audit',
];

const exampleCards = [
  {
    title: 'Large site audit',
    text: 'Nearly 5k page site scan, 7 levels deep with top-of-page screenshots.',
    mobileNote: '(Go to desktop for the canvas experience)',
    image: exampleRaycastImage,
    alt: 'Vellic canvas showing a large visual sitemap audit with thousands of page cards and top-of-page screenshots',
    linkUrl: 'https://app-staging.vellic.io/share/wd5bpg',
  },
  {
    title: 'Medium site audit',
    text: 'Over 1,100 page scan including subdomains, orphan pages, and full-page screenshots',
    mobileNote: '(Go to desktop for the canvas experience)',
    image: exampleAnthropicImage,
    alt: 'Vellic canvas showing a medium website audit with subdomains, orphan pages, and full-page screenshots',
    linkUrl: 'https://app-staging.vellic.io/share/amh6jd',
  },
];

const contactCards = [
  {
    key: 'inquiries',
    title: 'Inquiries and feedback',
    text: 'Questions, demo requests, ideas, partnerships, and early product feedback.',
    cta: 'Contact us',
    email: 'hello@vellic.io',
    reasonOptions: ['Demo request', 'Product feedback', 'Partnership', 'General question', 'Other'],
  },
  {
    key: 'support',
    title: 'Product support',
    text: 'Help with maps, scans, screenshots, exports, account access, or product issues.',
    cta: 'Get help',
    email: 'support@vellic.io',
    reasonOptions: ['Scan issue', 'Screenshots', 'Exports', 'Account access', 'Other'],
  },
];

const emptyContactForm = {
  name: '',
  email: '',
  reason: '',
  reasonDetail: '',
  message: '',
};

const CONTACT_SUBMIT_STATUS = Object.freeze({
  IDLE: 'idle',
  SUBMITTING: 'submitting',
  SUCCESS: 'success',
  ERROR: 'error',
});

const MAILING_LIST_SUBMIT_STATUS = Object.freeze({
  IDLE: 'idle',
  SUBMITTING: 'submitting',
  SUCCESS: 'success',
  ERROR: 'error',
});

const faqItems = [
  {
    question: 'What is Vellic?',
    answer: 'Vellic is a visual sitemap workspace for auditing, planning, updating, and maintaining website information architecture.',
  },
  {
    question: 'Is Vellic only a website crawler?',
    answer: 'No. Scanning a public URL is one fast starting point. You can also import a structure, create a map manually, edit the hierarchy, add review context, and export the result.',
  },
  {
    question: 'Who is Vellic built for?',
    answer: 'Vellic is built for content strategists, UX and IA teams, SEO reviewers, agencies, engineers, product teams, and stakeholders who need a shared view of a site before making decisions.',
  },
  {
    question: 'Can I import an existing sitemap or page list?',
    answer: 'Yes. Vellic is designed to start from the structure you already have, including crawlable public URLs and common sitemap or list formats.',
  },
  {
    question: 'Can Vellic capture screenshots in bulk?',
    answer: 'Yes. Bulk screenshot capture is designed for public clear-web pages so teams can collect visual evidence without opening and saving every page manually.',
  },
  {
    question: 'How does collaboration work?',
    answer: 'You can invite people to a map for review. Global team and project-level permissions are still evolving, but map-level sharing gives teams a practical way to work together now.',
  },
  {
    question: 'What can I export from Vellic?',
    answer: 'Vellic supports practical handoff formats for maps, page data, screenshots, and planning work, including CSV, JSON, PNG, PDF, text, and AI-ready packages with assistant instructions.',
  },
  {
    question: 'Can Vellic help with redesigns or migrations?',
    answer: 'Yes. Vellic helps teams understand the current structure, mark what needs to change, plan a proposed structure, and hand off the decisions behind the work.',
  },
  {
    question: 'Does Vellic find orphan, disabled, duplicate, or hard-to-reach pages?',
    answer: 'Vellic is built to surface structural audit signals such as inactive, disabled, duplicate, subdomain, and orphan-page findings where the crawl and imported data support them.',
  },
  {
    question: 'Is Vellic a replacement for a deep SEO crawler?',
    answer: 'Vellic is not trying to be the deepest SEO spider. It is strongest when teams need crawl context, screenshots, IA review, collaboration, and handoff in one visual workspace.',
  },
  {
    question: 'How is Vellic different from sitemap tools and SEO crawlers?',
    answer: 'Sitemap tools are often strongest for planning, and SEO crawlers are often strongest for technical diagnostics. Vellic sits between them: a visual IA workspace that keeps crawl context, screenshots, comments, and exports connected.',
  },
  {
    question: 'Does Vellic work with private or password-protected sites?',
    answer: 'Vellic scanning is focused on public, reachable pages today. For private work, teams can still build or import structure without treating Vellic as an authenticated crawler.',
  },
  {
    question: 'Does Vellic work on mobile?',
    answer: 'The marketing site works on mobile. The mapping app is best on desktop or tablet because visual sitemap work needs more canvas space.',
  },
];

const missionStatements = [
  'Bring information architecture back to the foreground of crafting better websites and software.',
  'Save teams time and stress when auditing, updating, creating, planning, and maintaining site structure.',
  'Improve constantly with and for the people doing the work, shipping small and large updates to make Vellic their own.',
];

const defaultOpenApp = (url, options = {}) => {
  if (options.target === '_blank') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  window.location.assign(url);
};

const MARKETING_V2_HEADER_FALLBACK_BOTTOM = 84;
const MARKETING_V2_SECTION_GAP = 80;
const FIGMA_CAPTURE_TOOLS_ENABLED = process.env.NODE_ENV !== 'production';

function isPlainLeftClick(event) {
  return event.button === 0 && !event.metaKey && !event.altKey && !event.ctrlKey && !event.shiftKey;
}

function getMarketingV2HeaderBottom() {
  const header = document.querySelector('.marketing-v2-header');
  const bottom = header?.getBoundingClientRect?.().bottom;
  if (!Number.isFinite(bottom) || bottom <= 0) return MARKETING_V2_HEADER_FALLBACK_BOTTOM;
  return Math.min(Math.ceil(bottom), MARKETING_V2_HEADER_FALLBACK_BOTTOM);
}

function getMarketingV2TransformY(element) {
  const transform = window.getComputedStyle?.(element)?.transform;
  if (!transform || transform === 'none') return 0;
  const values = transform.match(/matrix(?:3d)?\(([^)]+)\)/)?.[1]
    ?.split(',')
    .map((value) => Number.parseFloat(value.trim()));
  if (!values || values.some((value) => Number.isNaN(value))) return 0;
  return values.length === 16 ? values[13] : (values[5] || 0);
}

function getMarketingV2SectionAnchorTop(element) {
  const rect = element.getBoundingClientRect?.();
  if (rect && Number.isFinite(rect.top)) {
    return rect.top + window.scrollY - getMarketingV2TransformY(element);
  }
  return element.offsetTop;
}

function getMarketingV2ScrollTop(element, sectionId = '') {
  if (sectionId === 'home') return 0;
  return Math.max(0, getMarketingV2SectionAnchorTop(element) - getMarketingV2HeaderBottom() - MARKETING_V2_SECTION_GAP);
}

function setMetaTag(selector, createAttrs, content) {
  let element = document.head.querySelector(selector);
  if (!content) {
    element?.remove();
    return;
  }
  if (!element) {
    element = document.createElement('meta');
    Object.entries(createAttrs).forEach(([key, value]) => element.setAttribute(key, value));
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

function setCanonical(url) {
  let element = document.head.querySelector('link[rel="canonical"]');
  if (!element) {
    element = document.createElement('link');
    element.setAttribute('rel', 'canonical');
    document.head.appendChild(element);
  }
  element.setAttribute('href', url);
}

function setJsonLd(id, payload) {
  let element = document.head.querySelector(`script#${id}[type="application/ld+json"]`);
  if (!payload) {
    element?.remove();
    return;
  }
  if (!element) {
    element = document.createElement('script');
    element.setAttribute('id', id);
    element.setAttribute('type', 'application/ld+json');
    document.head.appendChild(element);
  }
  element.textContent = JSON.stringify(payload);
}

function normalizeMarketingV2Hostname(hostname = '') {
  return String(hostname || '').trim().toLowerCase();
}

function getMarketingPreviewV2RobotsContent(hostname = '') {
  const normalized = normalizeMarketingV2Hostname(hostname);
  if (!normalized || MARKETING_V2_LOCAL_HOSTS.has(normalized) || MARKETING_V2_PRODUCTION_HOSTS.has(normalized)) {
    return '';
  }
  if (normalized === 'staging.vellic.io' || normalized.endsWith('.vercel.app')) {
    return 'noindex, nofollow';
  }
  return '';
}

function buildMarketingPreviewV2JsonLd(section) {
  const canonicalUrl = buildMarketingPreviewV2CanonicalUrl(section.id);
  const faqUrl = buildMarketingPreviewV2CanonicalUrl('faq');
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': MARKETING_V2_SCHEMA_ORGANIZATION_ID,
        name: 'Vellic',
        url: 'https://vellic.io/',
        logo: MARKETING_PREVIEW_V2_SOCIAL_IMAGE_URL,
      },
      {
        '@type': 'WebSite',
        '@id': MARKETING_V2_SCHEMA_WEBSITE_ID,
        name: 'Vellic',
        url: 'https://vellic.io/',
        description: MARKETING_PREVIEW_V2_META_DESCRIPTION,
        publisher: { '@id': MARKETING_V2_SCHEMA_ORGANIZATION_ID },
        inLanguage: 'en-US',
      },
      {
        '@type': 'SoftwareApplication',
        '@id': MARKETING_V2_SCHEMA_SOFTWARE_ID,
        name: 'Vellic',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        url: canonicalUrl,
        description: MARKETING_PREVIEW_V2_META_DESCRIPTION,
        image: MARKETING_PREVIEW_V2_SOCIAL_IMAGE_URL,
        publisher: { '@id': MARKETING_V2_SCHEMA_ORGANIZATION_ID },
        featureList: marketingV2SoftwareFeatures,
        offers: {
          '@type': 'AggregateOffer',
          lowPrice: '0',
          priceCurrency: 'USD',
          url: buildMarketingPreviewV2CanonicalUrl('pricing'),
        },
      },
      {
        '@type': 'FAQPage',
        '@id': `${faqUrl}#faq`,
        url: faqUrl,
        name: 'Vellic FAQ',
        mainEntity: faqItems.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: item.answer,
          },
        })),
      },
    ],
  };
}

function applyMarketingPreviewV2Metadata(section, options = {}) {
  const canonicalUrl = buildMarketingPreviewV2CanonicalUrl(section.id);
  const hostname = options.hostname ?? (typeof window !== 'undefined' ? window.location.hostname : '');
  const robotsContent = getMarketingPreviewV2RobotsContent(hostname);
  document.title = section.metaTitle;
  setMetaTag('meta[name="description"]', { name: 'description' }, section.metaDescription);
  setMetaTag('meta[name="robots"]', { name: 'robots' }, robotsContent);
  setMetaTag('meta[property="og:title"]', { property: 'og:title' }, section.metaTitle);
  setMetaTag('meta[property="og:description"]', { property: 'og:description' }, section.metaDescription);
  setMetaTag('meta[property="og:url"]', { property: 'og:url' }, canonicalUrl);
  setMetaTag('meta[property="og:type"]', { property: 'og:type' }, 'website');
  setMetaTag('meta[property="og:site_name"]', { property: 'og:site_name' }, 'Vellic');
  setMetaTag('meta[property="og:image"]', { property: 'og:image' }, MARKETING_PREVIEW_V2_SOCIAL_IMAGE_URL);
  setMetaTag('meta[property="og:image:alt"]', { property: 'og:image:alt' }, MARKETING_PREVIEW_V2_SOCIAL_IMAGE_ALT);
  setMetaTag('meta[name="twitter:card"]', { name: 'twitter:card' }, 'summary_large_image');
  setMetaTag('meta[name="twitter:title"]', { name: 'twitter:title' }, section.metaTitle);
  setMetaTag('meta[name="twitter:description"]', { name: 'twitter:description' }, section.metaDescription);
  setMetaTag('meta[name="twitter:image"]', { name: 'twitter:image' }, MARKETING_PREVIEW_V2_SOCIAL_IMAGE_URL);
  setMetaTag('meta[name="twitter:image:alt"]', { name: 'twitter:image:alt' }, MARKETING_PREVIEW_V2_SOCIAL_IMAGE_ALT);
  setCanonical(canonicalUrl);
  setJsonLd(MARKETING_V2_JSON_LD_ID, buildMarketingPreviewV2JsonLd(section));
}

function getRevealDelayStyle(index) {
  return { '--marketing-v2-reveal-delay': `${Math.min(index, 6) * 45}ms` };
}

function getComparisonTone(value) {
  if (value === 'Yes') return 'yes';
  if (value === 'Partial') return 'partial';
  if (value === 'Planned') return 'planned';
  if (value === '--') return 'unknown';
  return 'not-core';
}

function getComparisonBadgeStyle(value) {
  switch (getComparisonTone(value)) {
    case 'yes':
      return 'success';
    case 'partial':
      return 'warning';
    case 'planned':
      return 'info';
    case 'not-core':
      return 'neutral';
    default:
      return 'mono';
  }
}

function MarketingV2Header({ activeSectionId, onMobileScan, onOpenApp }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navSections = useMemo(() => (
    MARKETING_PREVIEW_V2_NAV_SECTION_IDS.map(getMarketingPreviewV2SectionById)
  ), []);

  const handleStart = () => {
    setMenuOpen(false);
    if (isMarketingPhoneViewport()) {
      onMobileScan?.({ url: '', appUrl: buildAppScanUrl() });
      return;
    }
    onOpenApp(buildAppScanUrl());
  };

  return (
    <header className="marketing-v2-header">
      <a className="marketing-v2-header__brand" href={buildMarketingPreviewV2Path('home')} aria-label="Vellic home">
        <img src={vellicLogo} alt="Vellic" />
      </a>
      <IconButton
        className="marketing-v2-header__menu"
        type="button"
        variant="ghost"
        buttonStyle="mono"
        size="xs"
        icon={menuOpen ? <X size={20} /> : <Menu size={20} />}
        label={menuOpen ? 'Close navigation' : 'Open navigation'}
        aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      />
      <nav className={classNames('marketing-v2-header__nav', menuOpen && 'is-open')} aria-label="Marketing navigation">
        {navSections.map((section) => (
          <a
            key={section.id}
            href={buildMarketingPreviewV2Path(section.id)}
            aria-current={activeSectionId === section.id ? 'page' : undefined}
            onClick={() => setMenuOpen(false)}
          >
            {section.navLabel}
          </a>
        ))}
        <Button
          className="marketing-v2-header__cta"
          type="button"
          size="md"
          endIcon={<ArrowRight />}
          onClick={handleStart}
        >
          Get started
        </Button>
      </nav>
    </header>
  );
}

function HeroProductImage() {
  return (
    <div className="marketing-v2-hero-product-scroll marketing-v2-reveal">
      <figure className="marketing-v2-hero-product" aria-label="Vellic canvas preview">
        <img
          src={vellicCanvasImage}
          alt="Vellic canvas showing a visual sitemap generator workspace with page screenshot cards connected across a large website audit map"
          loading="eager"
          decoding="async"
        />
      </figure>
    </div>
  );
}

function MarketingV2LogoShape({ variant, className, style }) {
  const shape = logoPathParts[variant] || logoPathParts.left;
  return (
    <svg
      className={classNames('marketing-v2-bg-shape', className)}
      style={style}
      width="100%"
      height="100%"
      viewBox={shape.viewBox}
      preserveAspectRatio="none"
      fill="none"
      aria-hidden="true"
    >
      <path d={shape.path} />
    </svg>
  );
}

function MarketingV2Background() {
  return (
    <div className="marketing-v2-background" aria-hidden="true">
      {backgroundShapes.map((shape) => (
        <MarketingV2LogoShape
          key={shape.id}
          variant={getMarketingV2BackgroundVariant(shape)}
          className="marketing-v2-bg-shape--figma"
          style={getMarketingV2BackgroundStyle(shape)}
        />
      ))}
    </div>
  );
}

function MarketingV2Card({ children, accent = 'purple', className, style }) {
  return (
    <article
      className={classNames('marketing-v2-card marketing-v2-reveal', `marketing-v2-card--${accent}`, className)}
      style={style}
    >
      {children}
    </article>
  );
}

function MarketingV2Comparison({ activeGroupId, onActiveGroupChange }) {
  const activeGroup = comparisonGroups.find((group) => group.id === activeGroupId) || comparisonGroups[0];
  const rows = [
    ...activeGroup.rows,
    ...Array.from({ length: Math.max(0, comparisonRowCount - activeGroup.rows.length) }, (_, index) => ({
      feature: `placeholder-${index}`,
      isPlaceholder: true,
      values: {},
    })),
  ];

  return (
    <div className="marketing-v2-comparison marketing-v2-reveal" aria-label="Competitor comparison matrix">
      <div className="marketing-v2-comparison__header">
        <div>
          <h3>Features comparison</h3>
          <p>{comparisonSummary}</p>
        </div>
        <div className="marketing-v2-comparison-tabs" role="tablist" aria-label="Comparison category">
          {comparisonGroups.map((group) => (
            <Button
              key={group.id}
              type="button"
              variant={activeGroup.id === group.id ? 'secondary' : 'ghost'}
              buttonStyle="mono"
              size="sm"
              className="marketing-v2-comparison-tab"
              role="tab"
              aria-selected={activeGroup.id === group.id}
              aria-controls={`marketing-v2-comparison-panel-${group.id}`}
              id={`marketing-v2-comparison-tab-${group.id}`}
              onClick={() => onActiveGroupChange(group.id)}
            >
              {group.label}
            </Button>
          ))}
        </div>
      </div>
      <div
        className="marketing-v2-comparison__panel"
        id={`marketing-v2-comparison-panel-${activeGroup.id}`}
        role="tabpanel"
        aria-labelledby={`marketing-v2-comparison-tab-${activeGroup.id}`}
      >
        <table>
          <colgroup>
            <col className="marketing-v2-comparison__feature-col" />
            {activeGroup.columns.map((column) => (
              <col key={column.key} className="marketing-v2-comparison__data-col" />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th scope="col" aria-label="Feature" />
              {activeGroup.columns.map((column) => (
                <th key={column.key} scope="col" className={classNames(column.highlight && 'is-highlighted')}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.feature}>
                <th scope="row">
                  {row.isPlaceholder ? <span className="marketing-v2-table-placeholder">--</span> : row.feature}
                </th>
                {activeGroup.columns.map((column) => {
                  const value = row.values[column.key] || '--';
                  return (
                    <td key={column.key} className={classNames(column.highlight && 'is-highlighted')}>
                      {value === '--' ? (
                        <span className="marketing-v2-table-placeholder">--</span>
                      ) : (
                        <Badge
                          type="hollow"
                          badgeStyle={getComparisonBadgeStyle(value)}
                          size="md"
                          label={value}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MarketingV2FaqItem({ item, index, isOpen, onToggle }) {
  const answerId = `marketing-v2-faq-answer-${index}`;

  return (
    <Accordion
      id={answerId}
      className="marketing-v2-faq-item"
      contentClassName="marketing-v2-faq-item__answer"
      open={isOpen}
      onOpenChange={onToggle}
      title={<span>{item.question}</span>}
    >
      <p>{item.answer}</p>
    </Accordion>
  );
}

function MarketingV2ScanCta({
  onNavigatePath,
  onMobileScan,
  onOpenApp,
  compact = false,
  label = '',
  placeholder = 'Try it now. Enter a URL to start',
}) {
  return (
    <div className={classNames('marketing-v2-scan-cta', compact && 'marketing-v2-scan-cta--compact')}>
      {label ? <div className="marketing-v2-scan-cta__label">{label}</div> : null}
      <MarketingScanBar
        compact={compact}
        placeholder={placeholder}
        onNavigate={onNavigatePath}
        onOpenApp={onOpenApp}
        onPhoneScan={onMobileScan}
      />
    </div>
  );
}

function SectionShell({ id, eyebrow, title, summary, children, className }) {
  return (
    <section
      id={`marketing-v2-${id}`}
      className={classNames('marketing-v2-section marketing-v2-reveal', className)}
      data-marketing-v2-section={id}
      aria-labelledby={`marketing-v2-${id}-title`}
    >
      <div className="marketing-v2-section__header">
        <div className="marketing-v2-eyebrow">{eyebrow}</div>
        <h2 id={`marketing-v2-${id}-title`}>{title}</h2>
        {summary ? <p>{summary}</p> : null}
      </div>
      {children}
    </section>
  );
}

function MailingListModal({
  email,
  emailError,
  submitMessage,
  submitStatus,
  onChangeEmail,
  onClose,
  onSubmit,
  show,
}) {
  const isSubmitting = submitStatus === MAILING_LIST_SUBMIT_STATUS.SUBMITTING;
  const isSuccess = submitStatus === MAILING_LIST_SUBMIT_STATUS.SUCCESS;

  return (
    <Modal
      show={show}
      onClose={onClose}
      title="Join Vellic updates"
      subtitle="A lightweight list for larger release notes and product updates."
      className="marketing-v2-mailing-modal"
      footer={(
        <div className="marketing-v2-modal-actions">
          <Button type="button" variant="secondary" buttonStyle="mono" onClick={onClose}>
            Close
          </Button>
          {!isSuccess ? (
            <Button type="submit" form="marketing-v2-mailing-form" startIcon={<Mail />} loading={isSubmitting}>
              {isSubmitting ? 'Joining' : 'Join list'}
            </Button>
          ) : null}
        </div>
      )}
    >
      {isSuccess ? (
        <p className="marketing-v2-modal-note marketing-v2-modal-note--success" role="status">
          {submitMessage || 'You are on the preview list.'}
        </p>
      ) : (
        <form id="marketing-v2-mailing-form" className="marketing-v2-mailing-form" onSubmit={onSubmit}>
          <TextInput
            id="marketing-v2-mailing-email"
            type="email"
            label="Email"
            value={email}
            onChange={(event) => onChangeEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            error={emailError}
            disabled={isSubmitting}
          />
          {submitStatus === MAILING_LIST_SUBMIT_STATUS.ERROR ? (
            <p className="marketing-v2-modal-note marketing-v2-modal-note--error" role="alert">
              {submitMessage || 'Could not join the mailing list. Please try again.'}
            </p>
          ) : (
            <p className="marketing-v2-modal-note">
              We will keep it quiet and only send bigger release or product updates.
            </p>
          )}
        </form>
      )}
    </Modal>
  );
}

function MobileScanModal({
  shareLabel,
  show,
  url,
  onClose,
  onJoinList,
  onShare,
}) {
  return (
    <Modal
      show={show}
      onClose={onClose}
      title="Use a larger screen"
      subtitle="Vellic maps need room for the canvas, screenshots, flows, and review tools."
      className="marketing-v2-mobile-scan-modal"
    >
      <div className="marketing-v2-mobile-scan">
        <div className="marketing-v2-mobile-scan__icon" aria-hidden="true">
          <Monitor size={24} />
        </div>
        <div>
          <p>
            Small screens make visual sitemap work too cramped. Try scanning{url ? ` ${url}` : ''} on desktop or tablet landscape.
          </p>
          <div className="marketing-v2-mobile-scan__actions">
            <Button type="button" startIcon={<Mail />} onClick={onJoinList}>
              Join mailing list
            </Button>
            <Button type="button" variant="secondary" buttonStyle="mono" startIcon={<Share2 />} onClick={onShare}>
              {shareLabel}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function MarketingV2UpdateCta({ onJoinList }) {
  return (
    <div className="marketing-v2-update-cta marketing-v2-reveal">
      <div className="marketing-v2-update-cta__copy">
        <h3>This is just the start!</h3>
        <p>Vellic is moving rapidly, with improvements and implementations launching several times per week. Join our mailing list to stay updated.*</p>
        <span>*Emails sent only occasionally for bigger updates and major rollouts.</span>
      </div>
      <div className="marketing-v2-update-cta__actions">
        <Button type="button" size="lg" startIcon={<Mail />} onClick={onJoinList}>
          Join mailing list
        </Button>
      </div>
    </div>
  );
}

function MarketingV2ExampleCard({ example, index, onShowExample }) {
  return (
    <article className="marketing-v2-example marketing-v2-reveal" style={getRevealDelayStyle(index)}>
      <figure>
        <img src={example.image} alt={example.alt} loading="eager" decoding="async" />
      </figure>
      <div className="marketing-v2-example__copy">
        <h3>{example.title}</h3>
        <p>{example.text}</p>
        {example.mobileNote ? <span className="marketing-v2-example__mobile-note">{example.mobileNote}</span> : null}
        <div className="marketing-v2-example__actions">
          <Button type="link" endIcon={<ExternalLink />} onClick={() => onShowExample(example)}>
            Show me
          </Button>
        </div>
      </div>
    </article>
  );
}

function formatPricingDetail(detail) {
  if (!/screenshot credits/i.test(detail)) return detail;
  return `${detail}*`;
}

function MarketingV2PricingCard({ plan, index, onGetStarted }) {
  return (
    <MarketingV2Card
      accent={plan.accent}
      className="marketing-v2-pricing-card"
      style={getRevealDelayStyle(index)}
    >
      <div className="marketing-v2-pricing-card__top">
        <h3>{plan.title}</h3>
        <div className="marketing-v2-pricing-card__price">
          <div className="marketing-v2-pricing-card__price-main">
            <strong>{plan.price}</strong>
            <span>{plan.priceSuffix}</span>
          </div>
          {plan.priceComparison ? (
            <span className="marketing-v2-pricing-card__price-compare">
              ({plan.priceComparison.price}{plan.priceComparison.suffix})
            </span>
          ) : null}
        </div>
      </div>
      <p>{plan.description}</p>
      <ul>
        {plan.details.map((detail) => (
          <li key={detail}>
            <Check size={15} aria-hidden="true" />
            <span>{formatPricingDetail(detail)}</span>
          </li>
        ))}
      </ul>
      <div className="marketing-v2-pricing-card__actions">
        <Button
          className="marketing-v2-pricing-card__cta"
          type="button"
          variant="secondary"
          buttonStyle="brand"
          onClick={() => onGetStarted(plan)}
        >
          {plan.cta}
        </Button>
        <p className="marketing-v2-pricing-card__screenshot-note">
          *additional screenshot credits can be purchased anytime
        </p>
      </div>
    </MarketingV2Card>
  );
}

function MarketingV2ContactCard({ card, index, onOpenContact }) {
  return (
    <MarketingV2Card accent="brand" style={getRevealDelayStyle(index)}>
      <h3>{card.title}</h3>
      <p>{card.text}</p>
      <div className="marketing-v2-contact-card__action">
        <Button
          className="marketing-v2-contact-card__button"
          type="button"
          variant="secondary"
          buttonStyle="brand"
          onClick={() => onOpenContact(card)}
        >
          {card.cta}
        </Button>
      </div>
    </MarketingV2Card>
  );
}

function ContactFormModal({
  errors,
  form,
  show,
  submitError,
  submitStatus,
  submitted,
  target,
  onChange,
  onClose,
  onSubmit,
}) {
  const title = target ? `${target.cta}: ${target.title}` : 'Contact Vellic';
  const reasonOptions = target?.reasonOptions?.length ? target.reasonOptions : ['General question', 'Other'];
  const isSubmitting = submitStatus === CONTACT_SUBMIT_STATUS.SUBMITTING;
  const isSubmitted = submitted || submitStatus === CONTACT_SUBMIT_STATUS.SUCCESS;

  return (
    <Modal
      show={show}
      onClose={onClose}
      title={title}
      subtitle={target ? `Sends to ${target.email}.` : ''}
      className="marketing-v2-contact-modal"
      footer={(
        <div className="marketing-v2-modal-actions">
          <Button type="button" variant="secondary" buttonStyle="mono" onClick={onClose} disabled={isSubmitting}>
            Close
          </Button>
          {isSubmitted ? null : (
            <Button
              type="submit"
              form="marketing-v2-contact-form"
              startIcon={<Mail />}
              loading={isSubmitting}
            >
              {isSubmitting ? 'Sending' : 'Send message'}
            </Button>
          )}
        </div>
      )}
    >
      {isSubmitted ? (
        <div className="marketing-v2-contact-confirmation" role="status">
          <span className="marketing-v2-contact-confirmation__icon" aria-hidden="true">
            <Check size={22} strokeWidth={2.4} />
          </span>
          <div>
            <h3>Message sent</h3>
            <p>We will follow up soon.</p>
          </div>
        </div>
      ) : (
        <form id="marketing-v2-contact-form" className="marketing-v2-contact-form" onSubmit={onSubmit}>
          <div className="marketing-v2-contact-form__row">
            <TextInput
              id="marketing-v2-contact-name"
              label="Name"
              value={form.name}
              onChange={(event) => onChange('name', event.target.value)}
              placeholder="Your name"
              autoComplete="name"
              required
              error={errors.name}
              disabled={isSubmitting}
            />
            <TextInput
              id="marketing-v2-contact-email"
              type="email"
              label="Email"
              value={form.email}
              onChange={(event) => onChange('email', event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
              error={errors.email}
              disabled={isSubmitting}
            />
          </div>
          <div className="marketing-v2-contact-form__row">
            <SelectInput
              id="marketing-v2-contact-reason"
              label="Reason"
              value={form.reason || reasonOptions[0]}
              onChange={(event) => onChange('reason', event.target.value)}
              disabled={isSubmitting}
            >
              {reasonOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </SelectInput>
            <TextInput
              id="marketing-v2-contact-reason-detail"
              label="Reason details"
              value={form.reasonDetail}
              onChange={(event) => onChange('reasonDetail', event.target.value)}
              placeholder="Optional detail"
              disabled={isSubmitting}
            />
          </div>
          <Field label="Message" htmlFor="marketing-v2-contact-message" required error={errors.message}>
            <TextareaInput
              id="marketing-v2-contact-message"
              value={form.message}
              onChange={(event) => onChange('message', event.target.value)}
              placeholder="What should we know?"
              rows={5}
              invalid={Boolean(errors.message)}
              required
              disabled={isSubmitting}
            />
          </Field>
          {submitError ? (
            <p className="marketing-v2-modal-note marketing-v2-modal-note--error" role="alert">
              {submitError}
            </p>
          ) : null}
        </form>
      )}
    </Modal>
  );
}

function MarketingPreviewV2({ route, navigateToRoute, onOpenApp = defaultOpenApp }) {
  const activeSection = getMarketingPreviewV2SectionById(route.marketingPageId || route.section || 'home');
  const isFigmaCaptureMode = useMemo(() => (
    FIGMA_CAPTURE_TOOLS_ENABLED && typeof window !== 'undefined' && window.location.hash.includes('figmacapture=')
  ), []);
  const [activeNavSectionId, setActiveNavSectionId] = useState(activeSection.id);
  const [activeComparisonGroupId, setActiveComparisonGroupId] = useState(comparisonGroups[0].id);
  const [openFaqIndex, setOpenFaqIndex] = useState(null);
  const [mailingEmail, setMailingEmail] = useState('');
  const [mailingEmailError, setMailingEmailError] = useState('');
  const [mailingSubmitStatus, setMailingSubmitStatus] = useState(MAILING_LIST_SUBMIT_STATUS.IDLE);
  const [mailingSubmitMessage, setMailingSubmitMessage] = useState('');
  const [showMailingModal, setShowMailingModal] = useState(false);
  const [showMobileScanModal, setShowMobileScanModal] = useState(false);
  const [mobileScanUrl, setMobileScanUrl] = useState('');
  const [shareLabel, setShareLabel] = useState('Spread the word');
  const [contactTarget, setContactTarget] = useState(null);
  const [contactForm, setContactForm] = useState(emptyContactForm);
  const [contactErrors, setContactErrors] = useState({});
  const [contactSubmitStatus, setContactSubmitStatus] = useState(CONTACT_SUBMIT_STATUS.IDLE);
  const [contactSubmitError, setContactSubmitError] = useState('');
  const [contactSubmitted, setContactSubmitted] = useState(false);
  const [billingCatalog, setBillingCatalog] = useState(null);
  const [pricingBillingCycle, setPricingBillingCycle] = useState('monthly');
  const pendingScrollBehaviorRef = useRef('auto');

  useEffect(() => {
    let active = true;
    getBillingConfig()
      .then((catalog) => {
        if (active) setBillingCatalog(catalog || null);
      })
      .catch(() => {
        if (active) setBillingCatalog(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const pricingCards = useMemo(() => buildPlanCardsFromBillingCatalog(billingCatalog, {
    billingCycle: pricingBillingCycle,
    includeFree: true,
  }), [billingCatalog, pricingBillingCycle]);

  const hasYearlyPricing = hasYearlyBillingPrices(billingCatalog);

  useEffect(() => {
    if (!('scrollRestoration' in window.history)) return undefined;
    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => {
      window.history.scrollRestoration = previousScrollRestoration;
    };
  }, []);

  useEffect(() => {
    applyMarketingPreviewV2Metadata(activeSection);
    setActiveNavSectionId(activeSection.id);
    const element = document.getElementById(`marketing-v2-${activeSection.id}`);
    if (element && typeof window.scrollTo === 'function') {
      const scrollBehavior = pendingScrollBehaviorRef.current;
      const scrollToActiveSection = () => {
        window.scrollTo({
          top: Math.round(getMarketingV2ScrollTop(element, activeSection.id)),
          left: 0,
          behavior: scrollBehavior,
        });
      };
      scrollToActiveSection();
      pendingScrollBehaviorRef.current = 'auto';
      if (typeof window.requestAnimationFrame !== 'function') return undefined;
      const frame = window.requestAnimationFrame(scrollToActiveSection);
      return () => {
        window.cancelAnimationFrame(frame);
      };
    }
    element?.scrollIntoView?.({ block: 'start', behavior: 'auto' });
    return undefined;
  }, [activeSection]);

  useEffect(() => {
    let frame = null;

    const updateActiveSection = () => {
      frame = null;
      const sections = Array.from(document.querySelectorAll('[data-marketing-v2-section]'));
      if (sections.length === 0 || sections.every((section) => section.offsetTop === 0)) return;
      const position = window.scrollY + getMarketingV2HeaderBottom() + MARKETING_V2_SECTION_GAP + 24;
      const currentSection = sections.reduce((current, section) => (
        getMarketingV2SectionAnchorTop(section) <= position ? section : current
      ), sections[0]);
      const nextSectionId = currentSection?.getAttribute('data-marketing-v2-section') || activeSection.id;
      setActiveNavSectionId(nextSectionId);
    };

    const handleScroll = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(updateActiveSection);
    };

    updateActiveSection();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [activeSection.id]);

  useEffect(() => {
    const revealHeroCopy = () => {
      document.querySelector('.marketing-v2-hero__copy.marketing-v2-reveal')?.classList.add('is-revealed');
    };

    if (typeof window.requestAnimationFrame !== 'function') {
      revealHeroCopy();
      return undefined;
    }

    const frame = window.requestAnimationFrame(revealHeroCopy);
    return () => window.cancelAnimationFrame?.(frame);
  }, []);

  useEffect(() => {
    const elements = Array.from(document.querySelectorAll('.marketing-v2-reveal'));
    if (typeof IntersectionObserver === 'undefined') {
      elements.forEach((element) => element.classList.add('is-revealed'));
      return undefined;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-revealed');
        observer.unobserve(entry.target);
      });
    }, {
      rootMargin: '0px 0px -10% 0px',
      threshold: 0.08,
    });

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [activeSection.id]);

  const navigateToPath = (path, { behavior = 'auto' } = {}) => {
    const url = new URL(path, window.location.origin);
    const section = getMarketingPreviewV2SectionByPathname(url.pathname);
    if (!section) return;
    pendingScrollBehaviorRef.current = behavior;
    navigateToRoute?.({
      surface: ROUTE_SURFACES.MARKETING,
      marketingPreviewVersion: 'v2',
      marketingPageId: section.id,
      section: section.id,
      pathname: url.pathname,
      search: url.search,
    });
  };

  const handleClick = (event) => {
    const anchor = event.target.closest?.('a[href]');
    if (!anchor || !isPlainLeftClick(event)) return;
    const url = new URL(anchor.getAttribute('href'), window.location.origin);
    if (url.origin !== window.location.origin) return;
    if (!url.pathname.startsWith(MARKETING_PREVIEW_V2_BASE_PATH)) return;
    const section = getMarketingPreviewV2SectionByPathname(url.pathname);
    if (!section) return;
    event.preventDefault();
    navigateToPath(`${url.pathname}${url.search}`, { behavior: 'smooth' });
  };

  const resetMailingModal = () => {
    setMailingEmail('');
    setMailingEmailError('');
    setMailingSubmitStatus(MAILING_LIST_SUBMIT_STATUS.IDLE);
    setMailingSubmitMessage('');
  };

  const openMailingModal = () => {
    resetMailingModal();
    setShowMailingModal(true);
  };

  const closeMailingModal = () => {
    setShowMailingModal(false);
    resetMailingModal();
  };

  const handleMailingEmailChange = (value) => {
    setMailingEmail(value);
    if (mailingEmailError) setMailingEmailError('');
    if (mailingSubmitStatus !== MAILING_LIST_SUBMIT_STATUS.IDLE) {
      setMailingSubmitStatus(MAILING_LIST_SUBMIT_STATUS.IDLE);
      setMailingSubmitMessage('');
    }
  };

  const handleMailingSubmit = async (event) => {
    event.preventDefault();
    if (mailingSubmitStatus === MAILING_LIST_SUBMIT_STATUS.SUBMITTING) return;
    const email = mailingEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMailingEmailError('Enter a valid email address.');
      setMailingSubmitStatus(MAILING_LIST_SUBMIT_STATUS.IDLE);
      setMailingSubmitMessage('');
      return;
    }
    setMailingEmailError('');
    setMailingSubmitStatus(MAILING_LIST_SUBMIT_STATUS.SUBMITTING);
    setMailingSubmitMessage('');

    try {
      const result = await submitMarketingMailingListSignup(email, {
        source: 'marketing-preview-v2',
        routePath: typeof window !== 'undefined' ? window.location.pathname : '',
      });
      setMailingEmail('');
      setMailingSubmitStatus(MAILING_LIST_SUBMIT_STATUS.SUCCESS);
      setMailingSubmitMessage(result?.alreadySubscribed
        ? 'You are already on the mailing list.'
        : 'You are on the mailing list. We will only send bigger release or product updates.');
    } catch (error) {
      setMailingSubmitStatus(MAILING_LIST_SUBMIT_STATUS.ERROR);
      setMailingSubmitMessage(error?.message || 'Could not join the mailing list. Please try again.');
    }
  };

  const handleMobileScan = ({ url = '' } = {}) => {
    setMobileScanUrl(url);
    setShareLabel('Spread the word');
    setShowMobileScanModal(true);
  };

  const handlePricingGetStarted = (plan) => {
    if (plan?.action === 'checkout') {
      onOpenApp(buildAppBillingUrl(plan.key, pricingBillingCycle));
      return;
    }
    if (plan?.action === 'trial') {
      onOpenApp(buildAppTrialUrl(plan.key));
      return;
    }
    onOpenApp(buildAppSignupUrl());
  };

  const handleShowExample = (example) => {
    if (example.linkUrl) {
      onOpenApp(example.linkUrl, { target: '_blank' });
      return;
    }
    if (isMarketingPhoneViewport()) {
      handleMobileScan({ url: example.sourceUrl });
      return;
    }
    onOpenApp(buildAppScanUrl(example.sourceUrl));
  };

  const openContactModal = (target) => {
    setContactTarget(target);
    setContactForm({
      ...emptyContactForm,
      reason: target.reasonOptions[0],
    });
    setContactErrors({});
    setContactSubmitStatus(CONTACT_SUBMIT_STATUS.IDLE);
    setContactSubmitError('');
    setContactSubmitted(false);
  };

  const closeContactModal = () => {
    setContactTarget(null);
  };

  const handleContactChange = (field, value) => {
    setContactForm((current) => ({ ...current, [field]: value }));
    setContactErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    if (contactSubmitted) setContactSubmitted(false);
    if (contactSubmitStatus !== CONTACT_SUBMIT_STATUS.IDLE) {
      setContactSubmitStatus(CONTACT_SUBMIT_STATUS.IDLE);
      setContactSubmitError('');
    }
  };

  const handleContactSubmit = async (event) => {
    event.preventDefault();
    if (!contactTarget) return;
    if (contactSubmitStatus === CONTACT_SUBMIT_STATUS.SUBMITTING) return;
    const nextErrors = {};
    const name = contactForm.name.trim();
    const email = contactForm.email.trim();
    const message = contactForm.message.trim();
    if (!name) nextErrors.name = 'Enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) nextErrors.email = 'Enter a valid email address.';
    if (!message) nextErrors.message = 'Enter a message.';
    if (Object.keys(nextErrors).length > 0) {
      setContactErrors(nextErrors);
      setContactSubmitStatus(CONTACT_SUBMIT_STATUS.IDLE);
      setContactSubmitError('');
      return;
    }

    const reason = contactForm.reason || contactTarget.reasonOptions[0];
    setContactErrors({});
    setContactSubmitted(false);
    setContactSubmitStatus(CONTACT_SUBMIT_STATUS.SUBMITTING);
    setContactSubmitError('');

    try {
      await submitMarketingContact({
        targetKey: contactTarget.key,
        name,
        email,
        reason,
        reasonDetail: contactForm.reasonDetail.trim(),
        message,
        sourceUrl: typeof window !== 'undefined' ? window.location.href : '',
      });
      setContactSubmitStatus(CONTACT_SUBMIT_STATUS.SUCCESS);
      setContactSubmitted(true);
    } catch (error) {
      setContactSubmitStatus(CONTACT_SUBMIT_STATUS.ERROR);
      setContactSubmitError(error?.message || 'Could not send your message. Try again or email us directly.');
    }
  };

  const handleShareMarketing = async () => {
    const shareUrl = `${window.location.origin}${buildMarketingPreviewV2Path('home')}`;
    const shareData = {
      title: 'Vellic',
      text: 'Vellic maps websites into a shared audit and planning workspace.',
      url: shareUrl,
    };

    try {
      if (typeof navigator.share === 'function') {
        await navigator.share(shareData);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = shareUrl;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      setShareLabel('Link copied');
    } catch {
      setShareLabel('Spread the word');
    }
  };

  return (
    <div
      className={classNames('marketing-preview-v2', isFigmaCaptureMode && 'marketing-preview-v2--figma-capture')}
      onClick={handleClick}
    >
      <MarketingV2Background />
      <MarketingV2Header
        activeSectionId={activeNavSectionId}
        onMobileScan={handleMobileScan}
        onOpenApp={onOpenApp}
      />
      <main className="marketing-v2-main">
        <section
          id="marketing-v2-home"
          className="marketing-v2-hero"
          data-marketing-v2-section="home"
          aria-labelledby="marketing-v2-home-title"
        >
          <div className="marketing-v2-hero__copy marketing-v2-reveal">
            <div className="marketing-v2-eyebrow">Better Information Architecture</div>
            <h1 id="marketing-v2-home-title">Be the architect of your next build.</h1>
            <p>Vellic brings audits, planning, screenshots, flows, comments, and exports into one workspace.</p>
            <MarketingV2ScanCta onNavigatePath={navigateToPath} onMobileScan={handleMobileScan} onOpenApp={onOpenApp} />
            <div className="marketing-v2-hero-brief" aria-label="Vellic workflow summary">
              {heroHighlights.map(({ icon: Icon, label, text }) => (
                <div key={label} className="marketing-v2-hero-brief__item">
                  <span className="marketing-v2-hero-brief__icon" aria-hidden="true">
                    <Icon size={24} />
                  </span>
                  <div>
                    <strong>{label}</strong>
                    <span>{text}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <HeroProductImage />
        </section>

        <SectionShell
          id="use-cases"
          eyebrow="Use cases"
          title="Designed for cross-functional teams."
          summary="UX, content, product, dev, and SEO can review the same structure instead of trading screenshots and spreadsheets."
          className="marketing-v2-section--use-cases"
        >
          <div className="marketing-v2-card-grid marketing-v2-card-grid--five">
            {useCaseCards.map((card, index) => (
              <MarketingV2Card key={card.title} accent={card.accent} style={getRevealDelayStyle(index)}>
                <h3>{card.title}</h3>
                <p>{card.text}</p>
              </MarketingV2Card>
            ))}
          </div>
        </SectionShell>

        <SectionShell
          id="features"
          eyebrow="Features"
          title="The map is the workspace."
          summary="Capture evidence, trace flows, strategise, collaborate, and hand off in one place."
          className="marketing-v2-section--features"
        >
          <div className="marketing-v2-card-grid marketing-v2-card-grid--three">
            {featureCards.map((card, index) => {
              const Icon = card.icon;
              return (
                <MarketingV2Card key={card.title} accent={card.accent} style={getRevealDelayStyle(index)}>
                  <Icon size={22} aria-hidden="true" />
                  <h3>{card.title}</h3>
                  <p>{card.text}</p>
                </MarketingV2Card>
              );
            })}
          </div>
          {featureComparisonEnabled ? (
            <MarketingV2Comparison
              activeGroupId={activeComparisonGroupId}
              onActiveGroupChange={setActiveComparisonGroupId}
            />
          ) : null}
          <MarketingV2UpdateCta onJoinList={openMailingModal} />
        </SectionShell>

        <SectionShell
          id="examples"
          eyebrow="Examples"
          title="See how decisions stay connected."
          summary="Example views show structure, screenshots, review context, flows, and handoff in one product-led surface."
          className="marketing-v2-section--examples"
        >
          <div className="marketing-v2-examples">
            {exampleCards.map((example, index) => (
              <MarketingV2ExampleCard
                key={example.title}
                example={example}
                index={index}
                onShowExample={handleShowExample}
              />
            ))}
          </div>
        </SectionShell>

        <SectionShell
          id="pricing"
          eyebrow="Pricing"
          title="Start with the map. Upgrade when the workflow grows."
          summary="Plans are shaped around saved maps, screenshots, exports, reports, and team review."
          className="marketing-v2-section--pricing"
        >
          {hasYearlyPricing ? (
            <div className="marketing-v2-pricing-cycle-control">
              <span className="marketing-v2-pricing-cycle-label">Billing cycle</span>
              <div
                className="marketing-v2-comparison-tabs marketing-v2-pricing-cycle"
                role="tablist"
                aria-label="Billing cycle"
              >
                {BILLING_CYCLE_OPTIONS.map((option) => (
                  <Button
                    type="button"
                    key={option.key}
                    variant={pricingBillingCycle === option.key ? 'secondary' : 'ghost'}
                    buttonStyle="mono"
                    size="sm"
                    className="marketing-v2-comparison-tab marketing-v2-pricing-cycle__option"
                    role="tab"
                    aria-selected={pricingBillingCycle === option.key}
                    onClick={() => setPricingBillingCycle(option.key)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="marketing-v2-pricing-grid">
            {pricingCards.map((plan, index) => (
              <MarketingV2PricingCard key={plan.key} plan={plan} index={index} onGetStarted={handlePricingGetStarted} />
            ))}
          </div>
        </SectionShell>

        <SectionShell
          id="faq"
          eyebrow="FAQ"
          title="Short answers before the first map."
          className="marketing-v2-section--faq"
        >
          <div className="marketing-v2-faq">
            {faqItems.map((item, index) => (
              <MarketingV2FaqItem
                key={item.question}
                item={item}
                index={index}
                isOpen={openFaqIndex === index}
                onToggle={() => setOpenFaqIndex((current) => (current === index ? null : index))}
              />
            ))}
          </div>
        </SectionShell>

        <SectionShell
          id="mission"
          eyebrow="Mission"
          title="Because foundations matter"
          summary="Information architecture shapes how people find, understand, and act. Vellic helps to surface the foundations for the whole team."
          className="marketing-v2-section--mission"
        >
          <div className="marketing-v2-mission-list">
            {missionStatements.map((statement, index) => (
              <div key={statement} className="marketing-v2-mission-item marketing-v2-reveal" style={getRevealDelayStyle(index)}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <p>{statement}</p>
              </div>
            ))}
          </div>
        </SectionShell>

        <SectionShell
          id="contact"
          eyebrow="Contact"
          title="Need help? Want a demo? Have some feedback? Or just want to say Hello👋?"
          summary="Send a note to the right inbox and we will follow up ASAP."
          className="marketing-v2-section--contact"
        >
          <div className="marketing-v2-contact">
            {contactCards.map((card, index) => (
              <MarketingV2ContactCard
                key={card.key}
                card={card}
                index={index}
                onOpenContact={openContactModal}
              />
            ))}
          </div>
        </SectionShell>

        <section className="marketing-v2-final-cta marketing-v2-reveal" aria-labelledby="marketing-v2-final-title">
          <div>
            <h2 id="marketing-v2-final-title">Start planning your next site</h2>
          </div>
          <MarketingV2ScanCta
            onNavigatePath={navigateToPath}
            onMobileScan={handleMobileScan}
            onOpenApp={onOpenApp}
            compact
            label=""
            placeholder="Enter a URL to start"
          />
        </section>
      </main>
      <footer className="marketing-v2-footer">
        <img src={vellicLogo} alt="Vellic" />
        <p>
          Better UX starts with solid foundations.
          <br />
          Make those foundations with Vellic.
        </p>
      </footer>
      <MobileScanModal
        show={showMobileScanModal}
        url={mobileScanUrl}
        shareLabel={shareLabel}
        onClose={() => setShowMobileScanModal(false)}
        onJoinList={() => {
          setShowMobileScanModal(false);
          openMailingModal();
        }}
        onShare={handleShareMarketing}
      />
      <MailingListModal
        show={showMailingModal}
        email={mailingEmail}
        emailError={mailingEmailError}
        submitStatus={mailingSubmitStatus}
        submitMessage={mailingSubmitMessage}
        onChangeEmail={handleMailingEmailChange}
        onClose={closeMailingModal}
        onSubmit={handleMailingSubmit}
      />
      <ContactFormModal
        show={Boolean(contactTarget)}
        target={contactTarget}
        form={contactForm}
        errors={contactErrors}
        submitError={contactSubmitError}
        submitStatus={contactSubmitStatus}
        submitted={contactSubmitted}
        onChange={handleContactChange}
        onClose={closeContactModal}
        onSubmit={handleContactSubmit}
      />
    </div>
  );
}

export {
  applyMarketingPreviewV2Metadata,
  buildMarketingPreviewV2JsonLd,
  getMarketingPreviewV2RobotsContent,
};
export default MarketingPreviewV2;
