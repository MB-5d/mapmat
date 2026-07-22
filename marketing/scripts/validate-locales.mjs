import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const locales = ['es','de','fr','ja'];
const required = ['Better Information Architecture','Be the architect of your next build.','Use cases','Features','Examples','Pricing','FAQ','Mission','Contact','Start planning your next site','Enter a URL to start','Get started','What is Vellic?','Does Vellic work on mobile?','Vellic home','Open navigation','Close navigation','Marketing navigation','Privacy settings'];
for (const locale of locales) {
  const path = resolve(process.cwd(),'src','content','figma',`${locale}.json`);
  const data = JSON.parse(await readFile(path,'utf8'));
  if (data.locale !== locale || data.translationStatus !== 'machine draft' || data.indexable !== false) throw new Error(`${locale}: invalid translation status`);
  if (!Array.isArray(data.rows) || data.rows.length !== 193) throw new Error(`${locale}: expected 193 Figma translation rows`);
  const map = new Map(data.rows.map((row)=>[row.source,row.localized]));
  for (const key of required) if (!map.get(key)) throw new Error(`${locale}: missing ${key}`);
  for (const row of data.rows) if (!row.source || !row.localized || !row.status) throw new Error(`${locale}: incomplete translation row`);
}
console.log('Validated 4 locale drafts and 772 Figma translation rows.');
