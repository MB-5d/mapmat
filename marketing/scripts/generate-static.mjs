import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const origin = String(process.env.NEXT_PUBLIC_MARKETING_ORIGIN || 'https://staging.vellic.io').replace(/\/+$/, '');
const production = process.env.NEXT_PUBLIC_DEPLOY_ENV === 'production';
const locales = ['en', 'es', 'de', 'fr', 'ja'];
const paths = { en: '/', es: '/es/', de: '/de/', fr: '/fr/', ja: '/ja/' };
const publicDir = resolve(process.cwd(), 'public');
await mkdir(publicDir, { recursive: true });

const alternates = locales.map((locale) => `    <xhtml:link rel="alternate" hreflang="${locale}" href="${origin}${paths[locale]}" />`).join('\n');
const urls = locales.map((locale) => `  <url>\n    <loc>${origin}${paths[locale]}</loc>\n${alternates}\n    <xhtml:link rel="alternate" hreflang="x-default" href="${origin}/" />\n  </url>`).join('\n');
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`;
const robots = production
  ? `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`
  : `User-agent: *\nDisallow: /\n\nSitemap: ${origin}/sitemap.xml\n`;

await writeFile(resolve(publicDir, 'sitemap.xml'), sitemap);
await writeFile(resolve(publicDir, 'robots.txt'), robots);
