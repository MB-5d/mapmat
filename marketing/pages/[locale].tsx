import type { GetStaticPaths, GetStaticProps } from 'next';
import MarketingPage from '../src/components/MarketingPage';
import { getLocale, localeCodes, type LocaleCode } from '../src/content/locale-registry';

export default function LocalizedPage({ localeCode }: { localeCode: LocaleCode }) {
  const locale = getLocale(localeCode);
  if (!locale || locale.code === 'en') return null;
  return <MarketingPage locale={locale} />;
}

export const getStaticPaths: GetStaticPaths = () => ({
  paths: localeCodes.filter((locale) => locale !== 'en').map((locale) => ({ params: { locale } })),
  fallback: false,
});

export const getStaticProps: GetStaticProps = ({ params }) => {
  const locale = getLocale(String(params?.locale || ''));
  if (!locale || locale.code === 'en') return { notFound: true };
  return { props: { localeCode: locale.code, htmlLang: locale.htmlLang } };
};
