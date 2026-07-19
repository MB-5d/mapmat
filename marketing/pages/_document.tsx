import { Head, Html, Main, NextScript } from 'next/document';

export default function Document(props: { __NEXT_DATA__?: { props?: { pageProps?: { htmlLang?: string } } } }) {
  const lang = props.__NEXT_DATA__?.props?.pageProps?.htmlLang || 'en';
  return (
    <Html lang={lang}>
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&family=Sora:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>
      <body><Main /><NextScript /></body>
    </Html>
  );
}
