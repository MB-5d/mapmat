import Head from 'next/head';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, ChevronDown, Languages, ListChecks, Menu, Network, ScanLine, Workflow, X } from 'lucide-react';
import { localeCodes, localeRegistry, translate, type LocaleCode, type LocaleEntry } from '../content/locale-registry';

const APP_ORIGIN = String(process.env.NEXT_PUBLIC_APP_ORIGIN || 'https://app-staging.vellic.io').replace(/\/+$/, '');
const API_ORIGIN = String(process.env.NEXT_PUBLIC_API_ORIGIN || 'https://api-staging.vellic.io').replace(/\/+$/, '');
const MARKETING_ORIGIN = String(process.env.NEXT_PUBLIC_MARKETING_ORIGIN || 'https://staging.vellic.io').replace(/\/+$/, '');
const IS_STAGING = process.env.NEXT_PUBLIC_DEPLOY_ENV !== 'production';
const YEAR = 60 * 60 * 24 * 365;

const navKeys = ['Use cases','Features','Examples','Pricing','FAQ','Mission','Contact'] as const;
const navIds = ['use-cases','features','examples','pricing','faq','mission','contact'] as const;
const heroItems = [
  ['Map','Scan a URL, import a file, or build from scratch.',Network],
  ['Audit','Capture screenshots, trace flows, and mark findings.',ListChecks],
  ['Handoff','Invite reviewers and export useful deliverables.',Workflow],
] as const;
const useCases = [
  ['UX','Review hierarchy, navigation paths, and current-state structure before redesign work starts.'],
  ['Content strategy','Find gaps, duplicate pages, and content that is hard to reach.'],
  ['Dev and engineering','Turn audit decisions into exports, redirects, migration notes, and handoff data.'],
  ['SEO','Connect crawl context to depth, orphan pages, subdomains, and cleanup priority.'],
  ['Product','Keep scope, stakeholder feedback, priorities, and launch decisions tied to the map.'],
] as const;
const features = [
  ['Flexible inputs','Start from a public URL, imported structure, or a map from scratch'],
  ['Collaboration','Collect comments, decisions, and review context around the map'],
  ['Flows & crosslinks','Show journeys, related pages, and paths that do not fit a simple tree'],
  ['Bulk screenshots','Capture and download page screenshots for public web pages'],
  ['Audit findings','Surface missing, disabled, duplicate, inactive, subdomain, and orphan pages'],
  ['Exports and handoff','Download XML, JSON, CSV, PDF, PNG, text, and AI-ready packages'],
] as const;
const examples = [
  ['Large site audit','Nearly 5k page site scan, 7 levels deep with top-of-page screenshots.','wd5bpg'],
  ['Medium site audit','Over 1,100 page scan including subdomains, orphan pages, and full-page screenshots','amh6jd'],
] as const;
const plans = [
  {name:'Free',price:'$0',year:'($0/year)',summary:'For trying Vellic on a small site or one-off audit.',features:['1 active project','1,000 active pages total on account','100 pages per scan','25 screenshots incl.','5 downloads (XML and Index)','1 editor'],cta:'Get started',key:'free'},
  {name:'Pro',price:'$8',year:'($96/year)',summary:'For solo audits with screenshots and saved work.',features:['5 active projects','10,000 active pages total on account','300 screenshots incl.','Unlimited downloads (any format)','1 editor'],cta:'Subscribe',key:'pro'},
  {name:'Studio',price:'$18',year:'($216/year)',summary:'For small teams handling recurring site work.',features:['15 active projects','50,000 active pages total on account','1,000 screenshots incl.','Unlimited downloads (any format)','3 editors'],cta:'Subscribe',key:'studio'},
  {name:'Agency',price:'$88',year:'($1,056/year)',summary:'For heavier client audits and shared delivery.',features:['Unlimited projects','200,000 active pages total on account','5,000 screenshots incl.','Unlimited downloads (any format)','10 editors'],cta:'Subscribe',key:'agency'},
] as const;
const questions = ['What is Vellic?','Is Vellic only a website crawler?','Who is Vellic built for?','Can I import an existing sitemap or page list?','Can Vellic capture screenshots in bulk?','How does collaboration work?','What can I export from Vellic?','Can Vellic help with redesigns or migrations?','Does Vellic find orphan, disabled, duplicate, or hard-to-reach pages?','Is Vellic a replacement for a deep SEO crawler?','How is Vellic different from sitemap tools and SEO crawlers?','Does Vellic work with private or password-protected sites?','Does Vellic work on mobile?'] as const;
const mission = ['Bring information architecture back to the foreground of crafting better websites and software.','Save teams time and stress when auditing, updating, creating, planning, and maintaining site structure.','Improve constantly with and for the people doing the work, shipping small and large updates to make Vellic their own.'] as const;
const machineNotices: Record<Exclude<LocaleCode,'en'>,string> = {es:'Traducción automática — revisión pendiente',de:'Maschinelle Übersetzung — Prüfung ausstehend',fr:'Traduction automatique — révision en attente',ja:'機械翻訳 — レビュー待ち'};
const languageLabels: Record<LocaleCode,string> = {en:'Choose language',es:'Elegir idioma',de:'Sprache auswählen',fr:'Choisir la langue',ja:'言語を選択'};

function setCookie(name:string,value:string) {
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${YEAR}; Path=/; SameSite=Lax${secure}`;
}
function getCookie(name:string) {
  if (typeof document === 'undefined') return '';
  return document.cookie.split('; ').find((entry)=>entry.startsWith(`${name}=`))?.split('=').slice(1).join('=') || '';
}
function hrefFor(code:LocaleCode) { return localeRegistry[code].path; }

function Seo({locale}:{locale:LocaleEntry}) {
  const canonical = `${MARKETING_ORIGIN}${locale.path}`;
  const robots = IS_STAGING || !locale.indexable ? 'noindex, nofollow' : 'index, follow';
  const faq = questions.map((question,index)=>({question:translate(locale,question),answer:locale.faqAnswers[index]}));
  const schema = [
    {'@context':'https://schema.org','@type':'Organization','@id':`${MARKETING_ORIGIN}/#organization`,name:'Vellic',url:MARKETING_ORIGIN},
    {'@context':'https://schema.org','@type':'WebSite','@id':`${MARKETING_ORIGIN}/#website`,name:'Vellic',url:canonical,inLanguage:locale.htmlLang},
    {'@context':'https://schema.org','@type':'SoftwareApplication','@id':`${MARKETING_ORIGIN}/#software`,name:'Vellic',applicationCategory:'BusinessApplication',operatingSystem:'Web',url:canonical,inLanguage:locale.htmlLang,description:locale.description},
    {'@context':'https://schema.org','@type':'FAQPage',url:`${canonical}#faq`,inLanguage:locale.htmlLang,mainEntity:faq.map((item)=>({'@type':'Question',name:item.question,acceptedAnswer:{'@type':'Answer',text:item.answer}}))},
  ];
  return <Head>
    <title>{locale.title}</title><meta name="description" content={locale.description}/><meta name="robots" content={robots}/>
    <link rel="canonical" href={canonical}/>
    {localeCodes.map((code)=><link key={code} rel="alternate" hrefLang={code} href={`${MARKETING_ORIGIN}${localeRegistry[code].path}`}/>)}
    <link rel="alternate" hrefLang="x-default" href={`${MARKETING_ORIGIN}/`}/>
    <meta property="og:type" content="website"/><meta property="og:site_name" content="Vellic"/><meta property="og:locale" content={locale.htmlLang}/><meta property="og:title" content={locale.socialTitle}/><meta property="og:description" content={locale.socialDescription}/><meta property="og:url" content={canonical}/><meta property="og:image" content={`${MARKETING_ORIGIN}/vellic-logo.svg`}/><meta property="og:image:alt" content={translate(locale,'Vellic canvas preview')}/>
    <meta name="twitter:card" content="summary"/><meta name="twitter:title" content={locale.socialTitle}/><meta name="twitter:description" content={locale.socialDescription}/><meta name="twitter:image" content={`${MARKETING_ORIGIN}/vellic-logo.svg`}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(schema)}}/>
  </Head>;
}

function LanguageControl({locale}:{locale:LocaleEntry}) {
  const [open,setOpen] = useState(false);
  return <div className="language-control">
    {open && <div className="language-menu" role="menu" aria-label="Language selector">
      <div className="menu-heading">Language</div>
      {localeCodes.map((code)=><a key={code} role="menuitemradio" aria-checked={locale.code===code} className={locale.code===code?'selected':''} href={hrefFor(code)} onClick={()=>setCookie('vellic_marketing_locale',code)}><span>{localeRegistry[code].nativeLabel}</span>{locale.code===code&&<Check size={16}/>}</a>)}
    </div>}
    <button className="language-tab" aria-label={languageLabels[locale.code]} aria-expanded={open} onClick={()=>setOpen((value)=>!value)}><Languages size={18}/></button>
  </div>;
}

function ScanCta({locale,compact=false}:{locale:LocaleEntry;compact?:boolean}) {
  const t=(key:string)=>translate(locale,key); const [url,setUrl]=useState(''); const [error,setError]=useState('');
  const start=()=>{const value=url.trim(); if(!value){setError(t('Enter a public website URL, like example.com.'));return;} const normalized=/^https?:\/\//i.test(value)?value:`https://${value}`; location.assign(`${APP_ORIGIN}/app?intent=scan&url=${encodeURIComponent(normalized)}`);};
  return <div className={`scan-cta ${compact?'compact':''}`}><ScanLine size={18}/><input aria-label={t('Enter a URL to start')} placeholder={t('Enter a URL to start')} value={url} onChange={(e)=>{setUrl(e.target.value);setError('')}} onKeyDown={(e)=>e.key==='Enter'&&start()}/><button onClick={start}>{t('Scan')}</button>{error&&<span role="alert" className="field-error">{error}</span>}</div>;
}

export default function MarketingPage({locale}:{locale:LocaleEntry}) {
  const t=(key:string)=>translate(locale,key); const [navOpen,setNavOpen]=useState(false); const [openFaq,setOpenFaq]=useState<number|null>(null); const [showTranslation,setShowTranslation]=useState(locale.code!=='en'); const [suggestion,setSuggestion]=useState<LocaleCode|null>(null); const [mailOpen,setMailOpen]=useState(false); const [contactOpen,setContactOpen]=useState<'inquiries'|'support'|null>(null); const [consentOpen,setConsentOpen]=useState(false); const [consentBanner,setConsentBanner]=useState(false);
  useEffect(()=>{if(locale.code==='en'&&!getCookie('vellic_marketing_locale')&&!getCookie('vellic_locale_suggestion_dismissed')){const preferred=(navigator.languages||[]).map((v)=>v.split('-')[0] as LocaleCode).find((v)=>localeCodes.includes(v)&&v!=='en');if(preferred)setSuggestion(preferred);} if(!getCookie('vellic_consent'))setConsentBanner(true);},[locale.code]);
  const faq=useMemo(()=>questions.map((question,index)=>({question:t(question),answer:locale.faqAnswers[index]})),[locale]);
  const acceptConsent=()=>{setCookie('vellic_consent','necessary,analytics,research');setConsentBanner(false);setConsentOpen(false)};
  return <div className={locale.code==='ja'?'site japanese':'site'}><Seo locale={locale}/>
    <div className="bg-shapes" aria-hidden="true"/>
    <header className="site-header"><a className="brand" href={locale.path} aria-label={t('Vellic home')}><img src="/vellic-logo.svg" alt="Vellic"/></a><button className="nav-toggle" aria-label={navOpen?t('Close navigation'):t('Open navigation')} onClick={()=>setNavOpen(v=>!v)}>{navOpen?<X/>:<Menu/>}</button><nav className={navOpen?'open':''} aria-label={t('Marketing navigation')}>{navKeys.map((key,index)=><a key={key} href={`#${navIds[index]}`} onClick={()=>setNavOpen(false)}>{t(key)}</a>)}<a className="primary" href={`${APP_ORIGIN}/app?intent=signup`}>{t('Get started')}<ArrowRight size={18}/></a></nav></header>
    <main>
      <section className="hero"><div className="hero-copy"><p className="eyebrow">{t('Better Information Architecture')}</p><h1>{t('Be the architect of your next build.')}</h1><p className="lede">{t('Vellic brings audits, planning, screenshots, flows, comments, and exports into one workspace.')}</p><ScanCta locale={locale}/><div className="hero-items">{heroItems.map(([title,text,Icon])=><article key={title}><Icon/><div><strong>{t(title)}</strong><span>{t(text)}</span></div></article>)}</div></div><div className="product-preview"><img src="/vellic-canvas.png" alt={t('Vellic canvas showing a visual sitemap generator workspace with page screenshot cards connected across a large website audit map')}/></div></section>
      <Section id="use-cases" eyebrow={t('Use cases')} title={t('Designed for cross-functional teams.')} summary={t('UX, content, product, dev, and SEO can review the same structure instead of trading screenshots and spreadsheets.')}><div className="cards five">{useCases.map(([title,text])=><article key={title}><h3>{t(title)}</h3><p>{t(text)}</p></article>)}</div></Section>
      <Section id="features" eyebrow={t('Features')} title={t('The map is the workspace.')} summary={t('Capture evidence, trace flows, strategise, collaborate, and hand off in one place.')}><div className="cards three">{features.map(([title,text])=><article key={title}><h3>{t(title)}</h3><p>{t(text)}</p></article>)}</div><div className="update-cta"><div><h3>{t('This is just the start!')}</h3><p>{t('Vellic is moving rapidly, with improvements and implementations launching several times per week. Join our mailing list to stay updated.*')}</p><small>{t('*Emails sent only occasionally for bigger updates and major rollouts.')}</small></div><button onClick={()=>setMailOpen(true)}>{t('Join mailing list')}</button></div></Section>
      <Section id="examples" eyebrow={t('Examples')} title={t('See how decisions stay connected.')} summary={t('Example views show structure, screenshots, review context, flows, and handoff in one product-led surface.')}><div className="examples">{examples.map(([title,text,share],index)=><article key={title}><div className="example-map"><img src={index === 0 ? '/example-raycast.png' : '/example-anthropic.png'} alt={t(title)}/></div><h3>{t(title)}</h3><p>{t(text)}</p><a href={`${APP_ORIGIN}/share/${share}`}>{t('Show me')}<ArrowRight size={16}/></a></article>)}</div></Section>
      <Section id="pricing" eyebrow={t('Pricing')} title={t('Start with the map. Upgrade when the workflow grows.')} summary={t('Plans are shaped around saved maps, screenshots, exports, reports, and team review.')}><div className="billing"><span>{t('Billing cycle')}</span><button className="active">{t('Monthly')}</button><button>{t('Yearly')}</button></div><div className="pricing-grid">{plans.map((plan)=><article key={plan.key}><h3>{t(plan.name)}</h3><div className="price">{t(plan.price)}<small>{t('/mo')}</small></div><span>{t(plan.year)}</span><p>{t(plan.summary)}</p><ul>{plan.features.map((item)=><li key={item}><Check size={15}/>{t(item)}</li>)}</ul><a href={`${APP_ORIGIN}/app?intent=${plan.key==='free'?'signup':'checkout'}&billingPlan=${plan.key}&billingCycle=monthly`}>{t(plan.cta)}</a><small>{t('*additional screenshot credits can be purchased anytime')}</small></article>)}</div></Section>
      <Section id="faq" eyebrow={t('FAQ')} title={t('Short answers before the first map.')}><div className="faq">{faq.map((item,index)=><article key={item.question}><button aria-expanded={openFaq===index} onClick={()=>setOpenFaq(openFaq===index?null:index)}><span>{item.question}</span><ChevronDown className={openFaq===index?'rotated':''}/></button>{openFaq===index&&<p>{item.answer}</p>}</article>)}</div></Section>
      <Section id="mission" eyebrow={t('Mission')} title={t('Because foundations matter')} summary={t('Information architecture shapes how people find, understand, and act. Vellic helps to surface the foundations for the whole team.')}><div className="mission">{mission.map((item,index)=><article key={item}><span>0{index+1}</span><p>{t(item)}</p></article>)}</div></Section>
      <Section id="contact" eyebrow={t('Contact')} title={t('Need help? Want a demo? Have some feedback? Or just want to say Hello👋?')} summary={t('Send a note to the right inbox and we will follow up ASAP.')}><div className="contact-cards"><article><h3>{t('Inquiries and feedback')}</h3><p>{t('Questions, demo requests, ideas, partnerships, and early product feedback.')}</p><button onClick={()=>setContactOpen('inquiries')}>{t('Contact us')}</button></article><article><h3>{t('Product support')}</h3><p>{t('Help with maps, scans, screenshots, exports, account access, or product issues.')}</p><button onClick={()=>setContactOpen('support')}>{t('Get help')}</button></article></div></Section>
      <section className="final-cta"><h2>{t('Start planning your next site')}</h2><ScanCta locale={locale} compact/></section>
    </main>
    <footer><img src="/vellic-logo.svg" alt="Vellic"/><p>{t('Better UX starts with solid foundations.\nMake those foundations with Vellic.').split('\n').map((line)=><span key={line}>{line}<br/></span>)}</p><button onClick={()=>setConsentOpen(true)}>{t('Privacy settings')}</button></footer>
    <LanguageControl locale={locale}/>
    {showTranslation&&locale.code!=='en'&&<div className="toast translation-toast" role="status"><span>{machineNotices[locale.code]}</span><button aria-label={t('Close')} onClick={()=>setShowTranslation(false)}><X size={16}/></button></div>}
    {suggestion&&<div className="toast suggestion-toast" role="status"><span>{localeRegistry[suggestion].nativeLabel}?</span><a href={hrefFor(suggestion)} onClick={()=>setCookie('vellic_marketing_locale',suggestion)}>{localeRegistry[suggestion].nativeLabel}</a><button aria-label="Dismiss" onClick={()=>{setCookie('vellic_locale_suggestion_dismissed','1');setSuggestion(null)}}><X size={16}/></button></div>}
    {consentBanner&&<div className="consent-banner"><div><h2>{t('Help us improve Vellic')}</h2><p>{t('We use necessary storage to keep Vellic working. With your permission, we also use analytics and session feedback tools to understand what is useful, confusing, or broken to improve the site and app for you. We do not use these cookies for marketing, advertising, retargeting, or selling personal data.')}</p></div><button onClick={acceptConsent}>{t('Accept cookies')}</button><button className="secondary" onClick={()=>setConsentOpen(true)}>{t('Cookie settings')}</button></div>}
    {mailOpen&&<MailModal locale={locale} onClose={()=>setMailOpen(false)}/>} {contactOpen&&<ContactModal locale={locale} target={contactOpen} onClose={()=>setContactOpen(null)}/>} {consentOpen&&<ConsentModal locale={locale} onAccept={acceptConsent} onClose={()=>setConsentOpen(false)}/>}
  </div>;
}

function Section({id,eyebrow,title,summary,children}:{id:string;eyebrow:string;title:string;summary?:string;children:React.ReactNode}) {return <section id={id} className="section"><p className="eyebrow">{eyebrow}</p><h2>{title}</h2>{summary&&<p className="section-summary">{summary}</p>}{children}</section>}

function ModalShell({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}) {return <div className="modal-backdrop" role="presentation" onMouseDown={(e)=>e.target===e.currentTarget&&onClose()}><div className="modal" role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button aria-label="Close" onClick={onClose}><X/></button></header>{children}</div></div>}

function MailModal({locale,onClose}:{locale:LocaleEntry;onClose:()=>void}) {const t=(k:string)=>translate(locale,k);const[email,setEmail]=useState('');const[status,setStatus]=useState('');const submit=async(e:FormEvent)=>{e.preventDefault();setStatus(t('Joining'));try{const r=await fetch(`${API_ORIGIN}/api/marketing/mailing-list-signups`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,source:'multilingual-marketing',route_path:location.pathname})});if(!r.ok)throw new Error();setStatus(t('You are on the mailing list. We will only send bigger release or product updates.'));}catch{setStatus(t('Could not join the mailing list. Please try again.'))}};return <ModalShell title={t('Join Vellic updates')} onClose={onClose}><p>{t('A lightweight list for larger release notes and product updates.')}</p><form onSubmit={submit}><label>{t('Email')}<input type="email" required value={email} placeholder={t('you@example.com')} onChange={(e)=>setEmail(e.target.value)}/></label><button>{t('Join list')}</button></form>{status&&<p role="status">{status}</p>}<small>{t('We will keep it quiet and only send bigger release or product updates.')}</small></ModalShell>}

function ContactModal({locale,target,onClose}:{locale:LocaleEntry;target:'inquiries'|'support';onClose:()=>void}) {const t=(k:string)=>translate(locale,k);const[status,setStatus]=useState('');const submit=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();setStatus(t('Sending'));const data=new FormData(e.currentTarget);try{const r=await fetch(`${API_ORIGIN}/api/contact`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({targetKey:target,name:data.get('name'),email:data.get('email'),reason:data.get('reason'),reasonDetail:data.get('reasonDetail'),message:data.get('message'),sourceUrl:location.href})});if(!r.ok)throw new Error();setStatus(`${t('Message sent')} ${t('We will follow up soon.')}`);}catch{setStatus(t('Could not send your message. Try again or email us directly.'))}};return <ModalShell title={t('Contact Vellic')} onClose={onClose}><form onSubmit={submit} className="contact-form"><label>{t('Name')}<input name="name" required placeholder={t('Your name')}/></label><label>{t('Email')}<input name="email" type="email" required placeholder={t('you@example.com')}/></label><label>{t('Reason')}<select name="reason"><option>{t('General question')}</option><option>{t('Other')}</option></select></label><label>{t('Reason details')}<input name="reasonDetail" placeholder={t('Optional detail')}/></label><label className="full">{t('Message')}<textarea name="message" required placeholder={t('What should we know?')}/></label><button>{t('Send message')}</button></form>{status&&<p role="status">{status}</p>}</ModalShell>}

function ConsentModal({locale,onAccept,onClose}:{locale:LocaleEntry;onAccept:()=>void;onClose:()=>void}) {const t=(k:string)=>translate(locale,k);return <ModalShell title={t('Privacy settings')} onClose={onClose}><p>{t('Choose optional product research tools for Vellic.')}</p><div className="consent-list"><label><input type="checkbox" checked readOnly/>{t('Necessary storage')}</label><label><input type="checkbox" defaultChecked/>{t('Analytics')}</label><label><input type="checkbox" defaultChecked/>{t('Experience research')}</label></div><div className="modal-actions"><button onClick={onAccept}>{t('Save choices')}</button><button className="secondary" onClick={()=>{setCookie('vellic_consent','necessary');onClose()}}>{t('Reject all optional')}</button></div></ModalShell>}
