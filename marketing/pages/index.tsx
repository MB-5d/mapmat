import MarketingPage from '../src/components/MarketingPage';
import { localeRegistry } from '../src/content/locale-registry';

export default function EnglishPage() {
  return <MarketingPage locale={localeRegistry.en} />;
}

export const getStaticProps = () => ({ props: { htmlLang: 'en', localeCode: 'en' } });
