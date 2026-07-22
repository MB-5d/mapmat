import deDraft from './figma/de.json';
import esDraft from './figma/es.json';
import frDraft from './figma/fr.json';
import jaDraft from './figma/ja.json';

export const localeCodes = ['en', 'es', 'de', 'fr', 'ja'] as const;
export type LocaleCode = (typeof localeCodes)[number];
export type TranslationStatus = 'approved' | 'machine draft' | 'reviewed' | 'indexable';

type DraftRow = { source: string; localized: string; seoTerm: string; reviewer: string; status: string };
type DraftTable = { locale: string; translationStatus: string; indexable: boolean; rows: DraftRow[] };

export type LocaleEntry = {
  code: LocaleCode;
  htmlLang: string;
  nativeLabel: string;
  font: 'Sora' | 'Noto Sans JP';
  path: string;
  title: string;
  description: string;
  socialTitle: string;
  socialDescription: string;
  translationStatus: TranslationStatus;
  reviewer: string | null;
  indexable: boolean;
  translations: Readonly<Record<string, string>>;
  faqAnswers: readonly string[];
};

const tableToMap = (table: DraftTable) => Object.freeze(Object.fromEntries(table.rows.map((row) => [row.source, row.localized])));

const faqAnswers: Record<LocaleCode, readonly string[]> = {
  en: [
    'Vellic is a visual sitemap workspace for auditing, planning, updating, and maintaining website information architecture.',
    'No. Scanning a public URL is one fast starting point. You can also import a structure, create a map manually, edit the hierarchy, add review context, and export the result.',
    'Vellic is built for content strategists, UX and IA teams, SEO reviewers, agencies, engineers, product teams, and stakeholders who need a shared view of a site before making decisions.',
    'Yes. Vellic is designed to start from the structure you already have, including crawlable public URLs and common sitemap or list formats.',
    'Yes. Bulk screenshot capture is designed for public clear-web pages so teams can collect visual evidence without opening and saving every page manually.',
    'You can invite people to a map for review. Global team and project-level permissions are still evolving, but map-level sharing gives teams a practical way to work together now.',
    'Vellic supports practical handoff formats for maps, page data, screenshots, and planning work, including CSV, JSON, PNG, PDF, text, and AI-ready packages with assistant instructions.',
    'Yes. Vellic helps teams understand the current structure, mark what needs to change, plan a proposed structure, and hand off the decisions behind the work.',
    'Vellic is built to surface structural audit signals such as inactive, disabled, duplicate, subdomain, and orphan-page findings where the crawl and imported data support them.',
    'Vellic is not trying to be the deepest SEO spider. It is strongest when teams need crawl context, screenshots, IA review, collaboration, and handoff in one visual workspace.',
    'Sitemap tools are often strongest for planning, and SEO crawlers are often strongest for technical diagnostics. Vellic sits between them: a visual IA workspace that keeps crawl context, screenshots, comments, and exports connected.',
    'Vellic scanning is focused on public, reachable pages today. For private work, teams can still build or import structure without treating Vellic as an authenticated crawler.',
    'The marketing site works on mobile. The mapping app is best on desktop or tablet because visual sitemap work needs more canvas space.'
  ],
  es: [
    'Vellic es un espacio de trabajo de mapas de sitio visuales para auditar, planificar, actualizar y mantener la arquitectura de información de un sitio web.',
    'No. Escanear una URL pública es un punto de partida rápido. También puedes importar una estructura, crear un mapa manualmente, editar la jerarquía, añadir contexto de revisión y exportar el resultado.',
    'Vellic está diseñado para estrategas de contenido, equipos de UX e IA, especialistas en SEO, agencias, ingeniería, producto y otras personas que necesitan una vista compartida del sitio antes de tomar decisiones.',
    'Sí. Vellic puede partir de la estructura que ya tienes, incluidas URL públicas rastreables y formatos comunes de mapas de sitio o listas.',
    'Sí. La captura masiva de pantallas permite reunir evidencia visual de páginas web públicas sin abrir y guardar cada página manualmente.',
    'Puedes invitar a otras personas a revisar un mapa. Los permisos globales y de proyecto siguen evolucionando, pero compartir mapas ya ofrece una forma práctica de colaborar.',
    'Vellic admite formatos útiles para entregar mapas, datos de páginas, capturas y planificación, incluidos CSV, JSON, PNG, PDF, texto y paquetes preparados para IA.',
    'Sí. Vellic ayuda a entender la estructura actual, marcar cambios, planificar una estructura propuesta y entregar las decisiones del trabajo.',
    'Vellic muestra señales estructurales como páginas inactivas, deshabilitadas, duplicadas, de subdominios y huérfanas cuando los datos rastreados o importados lo permiten.',
    'Vellic no pretende ser el rastreador SEO más profundo. Destaca cuando un equipo necesita contexto de rastreo, capturas, revisión de IA, colaboración y entrega en un espacio visual.',
    'Las herramientas de sitemap suelen centrarse en la planificación y los rastreadores SEO en el diagnóstico técnico. Vellic conecta ambos mundos mediante un espacio visual de IA.',
    'Actualmente, el escaneo de Vellic se centra en páginas públicas y accesibles. Para trabajo privado, los equipos aún pueden crear o importar la estructura.',
    'El sitio de marketing funciona en móviles. La aplicación de mapas funciona mejor en ordenador o tableta porque el trabajo visual necesita más espacio.'
  ],
  de: [
    'Vellic ist ein visueller Sitemap-Arbeitsbereich zum Prüfen, Planen, Aktualisieren und Pflegen der Informationsarchitektur von Websites.',
    'Nein. Das Scannen einer öffentlichen URL ist ein schneller Einstieg. Sie können auch Strukturen importieren, Karten manuell erstellen, Hierarchien bearbeiten, Review-Kontext ergänzen und Ergebnisse exportieren.',
    'Vellic richtet sich an Content-Strategie, UX- und IA-Teams, SEO-Fachleute, Agenturen, Entwicklung, Produktteams und Stakeholder, die vor Entscheidungen eine gemeinsame Sicht auf eine Website benötigen.',
    'Ja. Vellic kann mit vorhandenen Strukturen beginnen, darunter crawlbare öffentliche URLs sowie gängige Sitemap- und Listenformate.',
    'Ja. Mit der Massenerfassung von Screenshots können Teams visuelle Belege öffentlicher Webseiten sammeln, ohne jede Seite einzeln zu öffnen und zu speichern.',
    'Sie können Personen zur Überprüfung einer Karte einladen. Globale Team- und Projektberechtigungen werden weiterentwickelt, aber die Freigabe auf Kartenebene ermöglicht bereits praktische Zusammenarbeit.',
    'Vellic unterstützt Übergabeformate für Karten, Seitendaten, Screenshots und Planung, darunter CSV, JSON, PNG, PDF, Text und KI-fertige Pakete.',
    'Ja. Vellic hilft Teams, die aktuelle Struktur zu verstehen, Änderungen zu markieren, eine Zielstruktur zu planen und Entscheidungen zu übergeben.',
    'Vellic zeigt strukturelle Audit-Signale wie inaktive, deaktivierte, doppelte, Subdomain- und verwaiste Seiten, sofern Crawl- oder Importdaten sie unterstützen.',
    'Vellic soll nicht der tiefste SEO-Crawler sein. Seine Stärke liegt in der Verbindung von Crawl-Kontext, Screenshots, IA-Review, Zusammenarbeit und Übergabe.',
    'Sitemap-Tools sind oft auf Planung und SEO-Crawler auf technische Diagnosen spezialisiert. Vellic verbindet beides in einem visuellen IA-Arbeitsbereich.',
    'Vellic scannt derzeit öffentliche, erreichbare Seiten. Für private Projekte können Teams Strukturen weiterhin erstellen oder importieren.',
    'Die Marketing-Website funktioniert mobil. Die Karten-App eignet sich am besten für Desktop oder Tablet, da visuelle Sitemap-Arbeit mehr Platz benötigt.'
  ],
  fr: [
    'Vellic est un espace de travail de sitemap visuel pour auditer, planifier, mettre à jour et maintenir l’architecture de l’information d’un site web.',
    'Non. L’analyse d’une URL publique est un point de départ rapide. Vous pouvez aussi importer une structure, créer une carte manuellement, modifier la hiérarchie, ajouter du contexte de revue et exporter le résultat.',
    'Vellic s’adresse aux spécialistes du contenu, équipes UX et IA, experts SEO, agences, ingénieurs, équipes produit et parties prenantes qui ont besoin d’une vue partagée avant de décider.',
    'Oui. Vellic peut partir de la structure existante, notamment des URL publiques explorables et des formats courants de sitemap ou de liste.',
    'Oui. La capture d’écran en masse permet de réunir des preuves visuelles de pages web publiques sans ouvrir et enregistrer chaque page manuellement.',
    'Vous pouvez inviter des personnes à relire une carte. Les autorisations globales et par projet évoluent encore, mais le partage d’une carte offre déjà une collaboration pratique.',
    'Vellic prend en charge des formats utiles pour transmettre cartes, données de pages, captures et planification, notamment CSV, JSON, PNG, PDF, texte et paquets prêts pour l’IA.',
    'Oui. Vellic aide à comprendre la structure actuelle, signaler les changements, planifier une structure cible et transmettre les décisions.',
    'Vellic fait ressortir des signaux structurels comme les pages inactives, désactivées, dupliquées, de sous-domaines ou orphelines lorsque les données le permettent.',
    'Vellic ne cherche pas à être le robot SEO le plus profond. Il excelle lorsqu’une équipe doit réunir contexte d’exploration, captures, revue IA, collaboration et transmission.',
    'Les outils de sitemap privilégient souvent la planification et les robots SEO le diagnostic technique. Vellic relie les deux dans un espace visuel d’architecture de l’information.',
    'L’analyse Vellic vise aujourd’hui les pages publiques accessibles. Pour les projets privés, les équipes peuvent toujours créer ou importer une structure.',
    'Le site marketing fonctionne sur mobile. L’application de cartographie est plus adaptée à un ordinateur ou une tablette, car le travail visuel nécessite davantage d’espace.'
  ],
  ja: [
    'Vellicは、Webサイトの情報アーキテクチャを監査、計画、更新、維持するためのビジュアルサイトマップ・ワークスペースです。',
    'いいえ。公開URLのスキャンは素早い開始方法の一つです。構造のインポート、手動でのマップ作成、階層編集、レビュー情報の追加、結果のエクスポートもできます。',
    'Vellicは、意思決定前にサイトの共通ビューを必要とするコンテンツ戦略、UX・IA、SEO、代理店、エンジニア、プロダクトチーム、関係者向けです。',
    'はい。公開URLや一般的なサイトマップ、リスト形式など、既存の構造から開始できます。',
    'はい。公開Webページのスクリーンショットを一括取得し、各ページを手動で開いて保存せずに視覚的な証拠を集められます。',
    'マップにレビュー担当者を招待できます。チームやプロジェクト単位の権限は改善中ですが、マップ単位の共有ですぐに共同作業を始められます。',
    'CSV、JSON、PNG、PDF、テキスト、AI対応パッケージなど、マップ、ページデータ、スクリーンショット、計画の引き継ぎに役立つ形式を利用できます。',
    'はい。現状構造の把握、変更点の記録、提案構造の計画、意思決定の引き継ぎを支援します。',
    'クロールまたはインポートデータに基づき、非アクティブ、無効、重複、サブドメイン、孤立ページなどの構造上の監査シグナルを表示します。',
    'Vellicは最も深いSEOクローラーを目指すものではありません。クロール情報、スクリーンショット、IAレビュー、共同作業、引き継ぎを一つの視覚的ワークスペースで扱うことに強みがあります。',
    'サイトマップツールは計画、SEOクローラーは技術診断に強い傾向があります。Vellicはその間をつなぎ、クロール情報、画像、コメント、エクスポートを結び付けます。',
    '現在のスキャン対象は公開され到達可能なページです。非公開の作業では、認証クローラーとしてではなく構造の作成やインポートを利用できます。',
    'マーケティングサイトはモバイルに対応しています。ビジュアルサイトマップ作業には広いキャンバスが必要なため、マップアプリはデスクトップまたはタブレットに最適です。'
  ]
};

const emptyTranslations = Object.freeze({}) as Readonly<Record<string, string>>;
export const localeRegistry: Record<LocaleCode, LocaleEntry> = {
  en: { code:'en', htmlLang:'en', nativeLabel:'English', font:'Sora', path:'/', title:'Vellic | Visual Sitemap Generator for Website Audits & Redesigns', description:'Create a visual sitemap from any URL. Vellic helps teams crawl websites, capture screenshots, audit structure, and export clean briefs for UX, SEO, content, and redesign planning.', socialTitle:'Vellic visual sitemap generator', socialDescription:'Map, audit, plan, and hand off website structure in one visual workspace.', translationStatus:'approved', reviewer:'Vellic', indexable:true, translations:emptyTranslations, faqAnswers:faqAnswers.en },
  es: { code:'es', htmlLang:'es', nativeLabel:'Español', font:'Sora', path:'/es/', title:'Vellic | Generador de mapas de sitio visuales para auditorías UX', description:'Crea un mapa de sitio visual desde cualquier URL. Audita la arquitectura de información, captura pantallas y planifica rediseños web con Vellic.', socialTitle:'Vellic: mapas de sitio visuales para UX e IA', socialDescription:'Mapea, audita, planifica y entrega la estructura de un sitio web en un espacio visual.', translationStatus:'machine draft', reviewer:null, indexable:false, translations:tableToMap(esDraft as DraftTable), faqAnswers:faqAnswers.es },
  de: { code:'de', htmlLang:'de', nativeLabel:'Deutsch', font:'Sora', path:'/de/', title:'Vellic | Visueller Sitemap-Generator für UX-Audits', description:'Erstellen Sie aus jeder URL eine visuelle Sitemap. Prüfen Sie Informationsarchitektur, Screenshots und Website-Struktur für Relaunches mit Vellic.', socialTitle:'Vellic: Visuelle Sitemaps für UX und IA', socialDescription:'Website-Strukturen in einem visuellen Arbeitsbereich abbilden, prüfen, planen und übergeben.', translationStatus:'machine draft', reviewer:null, indexable:false, translations:tableToMap(deDraft as DraftTable), faqAnswers:faqAnswers.de },
  fr: { code:'fr', htmlLang:'fr', nativeLabel:'Français', font:'Sora', path:'/fr/', title:'Vellic | Générateur de sitemap visuel pour audits UX', description:'Créez un sitemap visuel depuis n’importe quelle URL. Auditez l’architecture de l’information, capturez les pages et planifiez vos refontes avec Vellic.', socialTitle:'Vellic : sitemaps visuels pour l’UX et l’IA', socialDescription:'Cartographiez, auditez, planifiez et transmettez la structure d’un site dans un espace visuel.', translationStatus:'machine draft', reviewer:null, indexable:false, translations:tableToMap(frDraft as DraftTable), faqAnswers:faqAnswers.fr },
  ja: { code:'ja', htmlLang:'ja', nativeLabel:'日本語', font:'Noto Sans JP', path:'/ja/', title:'Vellic | UX監査・サイト再設計向けビジュアルサイトマップ', description:'URLからビジュアルサイトマップを作成。情報アーキテクチャ、サイト構造、スクリーンショットを監査し、Webサイト再設計を計画できます。', socialTitle:'Vellic：UX・IAのためのビジュアルサイトマップ', socialDescription:'サイト構造のマッピング、監査、計画、引き継ぎを一つのビジュアルワークスペースで。', translationStatus:'machine draft', reviewer:null, indexable:false, translations:tableToMap(jaDraft as DraftTable), faqAnswers:faqAnswers.ja }
};

export const getLocale = (code: string): LocaleEntry | null => localeRegistry[code as LocaleCode] || null;
export const translate = (locale: LocaleEntry, source: string) => locale.code === 'en' ? source : locale.translations[source] || source;

export const requiredTranslationKeys = [
  'Better Information Architecture','Be the architect of your next build.','Vellic brings audits, planning, screenshots, flows, comments, and exports into one workspace.','Use cases','Features','Examples','Pricing','FAQ','Mission','Contact','Start planning your next site','Enter a URL to start','Get started','What is Vellic?','Does Vellic work on mobile?','Vellic home','Open navigation','Close navigation','Marketing navigation','Privacy settings','Machine translation — review pending'
] as const;

for (const locale of Object.values(localeRegistry)) {
  if (!locale.title || !locale.description || !locale.socialTitle || !locale.socialDescription || !locale.path || !locale.htmlLang) throw new Error(`Locale ${locale.code} is missing required metadata`);
  if (locale.code !== 'en') {
    for (const key of requiredTranslationKeys.filter((value) => value !== 'Machine translation — review pending')) {
      if (!locale.translations[key]) throw new Error(`Locale ${locale.code} is missing required translation: ${key}`);
    }
  }
  if (locale.faqAnswers.length !== 13) throw new Error(`Locale ${locale.code} must include all FAQ answers`);
}
