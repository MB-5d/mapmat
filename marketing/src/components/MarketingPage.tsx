import Head from 'next/head';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import { Check, Languages } from 'lucide-react';

import MarketingPreviewV2 from '../../../frontend/src/marketing/MarketingPreviewV2';
import ConsentDrawer from '../../../frontend/src/components/consent/ConsentDrawer';
import ConsentSettingsModal from '../../../frontend/src/components/consent/ConsentSettingsModal';
import IconButton from '../../../frontend/src/components/ui/IconButton';
import Button from '../../../frontend/src/components/ui/Button';
import { MenuItem, MenuPanel, MenuSectionHeader } from '../../../frontend/src/components/ui/Menu';
import Toast from '../../../frontend/src/components/ui/Toast';
import { ConsentProvider } from '../../../frontend/src/contexts/ConsentContext';
import { localeCodes, localeRegistry, translate, type LocaleCode, type LocaleEntry } from '../content/locale-registry';

const LocalizedMarketingPreview = MarketingPreviewV2 as ComponentType<any>;
const LocalizedConsentDrawer = ConsentDrawer as ComponentType<any>;
const LocalizedConsentSettingsModal = ConsentSettingsModal as ComponentType<any>;
const LocalizedToast = Toast as ComponentType<any>;
const LocalizedButton = Button as ComponentType<any>;

const APP_ORIGIN = String(process.env.NEXT_PUBLIC_APP_ORIGIN || 'https://app-staging.vellic.io').replace(/\/+$/, '');
const MARKETING_ORIGIN = String(process.env.NEXT_PUBLIC_MARKETING_ORIGIN || 'https://staging.vellic.io').replace(/\/+$/, '');
const IS_STAGING = process.env.NEXT_PUBLIC_DEPLOY_ENV !== 'production';
const COOKIE_YEAR = 60 * 60 * 24 * 365;
const faqQuestions = ['What is Vellic?','Is Vellic only a website crawler?','Who is Vellic built for?','Can I import an existing sitemap or page list?','Can Vellic capture screenshots in bulk?','How does collaboration work?','What can I export from Vellic?','Can Vellic help with redesigns or migrations?','Does Vellic find orphan, disabled, duplicate, or hard-to-reach pages?','Is Vellic a replacement for a deep SEO crawler?','How is Vellic different from sitemap tools and SEO crawlers?','Does Vellic work with private or password-protected sites?','Does Vellic work on mobile?'] as const;
const machineNotices: Record<Exclude<LocaleCode, 'en'>, string> = {
  es: 'Traducción automática — revisión pendiente',
  de: 'Maschinelle Übersetzung — Prüfung ausstehend',
  fr: 'Traduction automatique — révision en attente',
  ja: '機械翻訳 — レビュー待ち',
};

function setCookie(name: string, value: string) {
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${COOKIE_YEAR}; Path=/; SameSite=Lax${secure}`;
}

function getCookie(name: string) {
  if (typeof document === 'undefined') return '';
  return document.cookie.split('; ').find((entry) => entry.startsWith(`${name}=`))?.split('=').slice(1).join('=') || '';
}

function Seo({ locale }: { locale: LocaleEntry }) {
  const canonical = `${MARKETING_ORIGIN}${locale.path}`;
  const robots = IS_STAGING || !locale.indexable ? 'noindex, nofollow' : 'index, follow';
  const faq = faqQuestions.map((question, index) => ({ question: translate(locale, question), answer: locale.faqAnswers[index] }));
  const schema = [
    {'@context':'https://schema.org','@type':'Organization','@id':`${MARKETING_ORIGIN}/#organization`,name:'Vellic',url:MARKETING_ORIGIN},
    {'@context':'https://schema.org','@type':'WebSite','@id':`${MARKETING_ORIGIN}/#website`,name:'Vellic',url:canonical,inLanguage:locale.htmlLang},
    {'@context':'https://schema.org','@type':'SoftwareApplication','@id':`${MARKETING_ORIGIN}/#software`,name:'Vellic',applicationCategory:'BusinessApplication',operatingSystem:'Web',url:canonical,inLanguage:locale.htmlLang,description:locale.description},
    {'@context':'https://schema.org','@type':'FAQPage',url:`${canonical}#faq`,inLanguage:locale.htmlLang,mainEntity:faq.map((item)=>({'@type':'Question',name:item.question,acceptedAnswer:{'@type':'Answer',text:item.answer}}))},
  ];
  return <Head>
    <title>{locale.title}</title><meta name="description" content={locale.description}/><meta name="robots" content={robots}/>
    <link rel="canonical" href={canonical}/>
    {localeCodes.map((code)=><link key={code} rel="alternate" hrefLang={code} href={`${MARKETING_ORIGIN}${localeRegistry[code].path}`}/>) }
    <link rel="alternate" hrefLang="x-default" href={`${MARKETING_ORIGIN}/`}/>
    <meta property="og:type" content="website"/><meta property="og:site_name" content="Vellic"/><meta property="og:locale" content={locale.htmlLang}/><meta property="og:title" content={locale.socialTitle}/><meta property="og:description" content={locale.socialDescription}/><meta property="og:url" content={canonical}/><meta property="og:image" content={`${MARKETING_ORIGIN}/vellic-logo.svg`}/><meta property="og:image:alt" content={translate(locale,'Vellic canvas preview')}/>
    <meta name="twitter:card" content="summary"/><meta name="twitter:title" content={locale.socialTitle}/><meta name="twitter:description" content={locale.socialDescription}/><meta name="twitter:image" content={`${MARKETING_ORIGIN}/vellic-logo.svg`}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(schema)}}/>
  </Head>;
}

function LanguageControl({ locale }: { locale: LocaleEntry }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return <div className="marketing-language-control" ref={ref}>
    {open ? <MenuPanel className="marketing-language-menu" role="menu" aria-label="Language selector">
      <MenuSectionHeader className="">Language</MenuSectionHeader>
      {localeCodes.map((code) => <MenuItem
        key={code}
        as="a"
        role="menuitemradio"
        aria-checked={locale.code === code}
        selected={locale.code === code}
        href={localeRegistry[code].path}
        label={localeRegistry[code].nativeLabel}
        endSlot={locale.code === code ? <Check size={16} aria-hidden="true"/> : <span className="marketing-language-check-space"/>}
        onClick={() => setCookie('vellic_marketing_locale', code)}
      />)}
    </MenuPanel> : null}
    <IconButton
      className="marketing-language-tab"
      type="button"
      variant="secondary"
      buttonStyle="mono"
      size="sm"
      icon={<Languages/>}
      label={translate(locale, 'Choose language')}
      aria-expanded={open}
      onClick={() => setOpen((value) => !value)}
    />
  </div>;
}

function MarketingExperience({ locale }: { locale: LocaleEntry }) {
  const t = useMemo(() => (source: string) => translate(locale, source), [locale]);
  const [translationNotice, setTranslationNotice] = useState(locale.code !== 'en');
  const [suggestedLocale, setSuggestedLocale] = useState<LocaleCode | null>(null);
  useEffect(() => {
    if (locale.code !== 'en' || getCookie('vellic_marketing_locale') || getCookie('vellic_locale_suggestion_dismissed')) return;
    const preferred = (navigator.languages || [])
      .map((value) => value.split('-')[0] as LocaleCode)
      .find((value) => localeCodes.includes(value) && value !== 'en');
    if (preferred) setSuggestedLocale(preferred);
  }, [locale.code]);
  const dismissSuggestion = () => {
    setCookie('vellic_locale_suggestion_dismissed', '1');
    setSuggestedLocale(null);
  };
  const selectSuggestedLocale = () => {
    if (!suggestedLocale) return;
    setCookie('vellic_marketing_locale', suggestedLocale);
    window.location.assign(localeRegistry[suggestedLocale].path);
  };
  const buildSectionHref = (sectionId: string) => sectionId === 'home'
    ? locale.path
    : `${locale.path}#marketing-v2-${sectionId}`;
  return <>
    <Seo locale={locale}/>
    <LocalizedMarketingPreview
      route={{ marketingPageId: 'home', section: 'home' }}
      localeCode={locale.code}
      translateText={t}
      localizedFaqAnswers={locale.faqAnswers}
      buildSectionHref={buildSectionHref}
      manageMetadata={false}
      onOpenApp={(url: string, options: { target?: string } = {}) => {
        const targetUrl = url.replace(/^https:\/\/app\.vellic\.io/, APP_ORIGIN);
        if (options.target) window.open(targetUrl, options.target, 'noopener,noreferrer');
        else window.location.assign(targetUrl);
      }}
    />
    <LanguageControl locale={locale}/>
    {translationNotice && locale.code !== 'en' ? <LocalizedToast
      className="marketing-translation-toast"
      type="info"
      message={machineNotices[locale.code]}
      dismissLabel={t('Dismiss notification')}
      onDismiss={() => setTranslationNotice(false)}
    /> : null}
    {suggestedLocale ? <LocalizedToast
      className="marketing-translation-toast"
      type="info"
      message={`View this page in ${localeRegistry[suggestedLocale].nativeLabel}?`}
      dismissLabel="Dismiss language suggestion"
      action={<LocalizedButton type="secondary" size="sm" onClick={selectSuggestedLocale}>View</LocalizedButton>}
      onDismiss={dismissSuggestion}
    /> : null}
    <LocalizedConsentDrawer translateText={t}/>
    <LocalizedConsentSettingsModal translateText={t}/>
  </>;
}

export default function MarketingPage({ locale }: { locale: LocaleEntry }) {
  return <ConsentProvider><MarketingExperience locale={locale}/></ConsentProvider>;
}
