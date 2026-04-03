import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  Download,
  Eye,
  FolderOpen,
  Globe,
  Layers,
  Mail,
  MapIcon,
  Menu,
  MessageSquare,
  Share2,
  X,
} from 'lucide-react';

import mapmatLogo from './assets/MM-Logo.svg';
import './LandingPage.css';

const audienceCards = [
  {
    title: 'Agencies and consultants',
    description: 'Audit an existing site quickly, walk clients through the structure, and keep review artifacts in one place.',
  },
  {
    title: 'UX, IA, and content teams',
    description: 'Use a live crawl as the starting point for restructuring, page moves, and content cleanup.',
  },
  {
    title: 'SEO and site-ops teams',
    description: 'Review broken links, orphan pages, duplicate URLs, files, and subdomains without losing the site-map context.',
  },
];

const problemCards = [
  {
    title: 'Understand the current site before changing it',
    description: 'Stop rebuilding structure from spreadsheets, browser tabs, and half-finished diagrams before every redesign or audit.',
  },
  {
    title: 'Review site shape with visual context',
    description: 'Hierarchy, depth, files, orphan pages, and subdomains are easier to discuss when the map is visible instead of buried in lists.',
  },
  {
    title: 'Keep review and delivery in the same workflow',
    description: 'Comments, share links, screenshots, exports, and saved maps stay connected to the sitemap instead of scattering across tools.',
  },
];

const useCaseCards = [
  {
    title: 'Pre-redesign audits',
    description: 'Crawl the current site, surface issue layers, and capture the structure before planning changes.',
  },
  {
    title: 'Stakeholder review',
    description: 'Share a live map with permissions and comments so clients or teammates can review the same artifact.',
  },
  {
    title: 'Testing prep',
    description: 'Keep screenshots, issue reporting, and exports close to the sitemap when moving toward real testing.',
  },
];

const featureCards = [
  {
    icon: Globe,
    title: 'Crawl a live site from a URL',
    description: 'Start from a public website URL and generate a map you can inspect immediately.',
  },
  {
    icon: MapIcon,
    title: 'Review the structure visually',
    description: 'Use the sitemap canvas to read hierarchy, page depth, branches, and layout at a glance.',
  },
  {
    icon: Layers,
    title: 'Surface issue layers and reports',
    description: 'Review broken links, orphan pages, duplicates, inactive pages, files, and subdomains in visual context.',
  },
  {
    icon: Eye,
    title: 'Capture thumbnails and screenshots',
    description: 'Generate page thumbnails and full screenshots for visual QA, audits, and stakeholder review.',
  },
  {
    icon: Share2,
    title: 'Share maps with permissions and comments',
    description: 'Send review links, control access levels, and keep comments attached to the map.',
  },
  {
    icon: FolderOpen,
    title: 'Save, reopen, import, and export',
    description: 'Organize work into projects, revisit scan history, import common sitemap formats, and export deliverables.',
  },
];

const workflowSteps = [
  {
    step: '1',
    title: 'Scan the current site',
    description: 'Start with a live URL and bring the existing structure into the app.',
  },
  {
    step: '2',
    title: 'Review issues in context',
    description: 'Inspect the map, turn on relevant layers, and capture screenshots where visual context matters.',
  },
  {
    step: '3',
    title: 'Share and deliver',
    description: 'Comment, save the work, and export the outputs needed for clients, teammates, or testing prep.',
  },
];

const comparisonColumns = [
  { key: 'mapmat', label: 'Map Mat', highlight: true },
  { key: 'flowmapp', label: 'FlowMapp' },
  { key: 'slickplan', label: 'Slickplan' },
  { key: 'octopus', label: 'Octopus.do' },
  { key: 'visualsitemaps', label: 'VisualSitemaps' },
  { key: 'screamingfrog', label: 'Screaming Frog' },
  { key: 'dynomapper', label: 'DYNO Mapper' },
];

const comparisonRows = [
  {
    feature: 'Crawl from live URL',
    values: {
      mapmat: 'Yes',
      flowmapp: 'Yes',
      slickplan: 'Yes',
      octopus: 'Yes',
      visualsitemaps: 'Yes',
      screamingfrog: 'Yes',
      dynomapper: 'Yes',
    },
  },
  {
    feature: 'Visual sitemap canvas',
    values: {
      mapmat: 'Yes',
      flowmapp: 'Yes',
      slickplan: 'Yes',
      octopus: 'Yes',
      visualsitemaps: 'Yes',
      screamingfrog: 'Partial',
      dynomapper: 'Yes',
    },
  },
  {
    feature: 'Issue-focused auditing / reporting',
    values: {
      mapmat: 'Yes',
      flowmapp: 'Not core',
      slickplan: 'Partial',
      octopus: 'Partial',
      visualsitemaps: 'Yes',
      screamingfrog: 'Yes',
      dynomapper: 'Yes',
    },
  },
  {
    feature: 'Thumbnails or screenshots',
    values: {
      mapmat: 'Yes',
      flowmapp: 'Not core',
      slickplan: 'Not core',
      octopus: 'Not core',
      visualsitemaps: 'Yes',
      screamingfrog: 'Not core',
      dynomapper: 'Partial',
    },
  },
  {
    feature: 'Shareable review links',
    values: {
      mapmat: 'Yes',
      flowmapp: 'Yes',
      slickplan: 'Yes',
      octopus: 'Yes',
      visualsitemaps: 'Yes',
      screamingfrog: 'Not core',
      dynomapper: 'Yes',
    },
  },
  {
    feature: 'Comments / collaboration',
    values: {
      mapmat: 'Yes',
      flowmapp: 'Yes',
      slickplan: 'Yes',
      octopus: 'Yes',
      visualsitemaps: 'Yes',
      screamingfrog: 'Not core',
      dynomapper: 'Yes',
    },
  },
  {
    feature: 'Project organization / history',
    values: {
      mapmat: 'Yes',
      flowmapp: 'Yes',
      slickplan: 'Yes',
      octopus: 'Yes',
      visualsitemaps: 'Partial',
      screamingfrog: 'Partial',
      dynomapper: 'Partial',
    },
  },
  {
    feature: 'Export options',
    values: {
      mapmat: 'Yes',
      flowmapp: 'Yes',
      slickplan: 'Yes',
      octopus: 'Yes',
      visualsitemaps: 'Yes',
      screamingfrog: 'Yes',
      dynomapper: 'Yes',
    },
  },
];

const faqs = [
  {
    question: 'Who is Map Mat for?',
    answer: 'It is built first for agencies, consultants, and internal web teams that need to understand site structure quickly and review it with other people.',
  },
  {
    question: 'What is it best at compared with SEO crawlers or sitemap planning tools?',
    answer: 'Map Mat is strongest when you want a live crawl, a visual sitemap canvas, screenshots, and review workflows in one place. It is not trying to be the deepest SEO spider or the broadest planning suite.',
  },
  {
    question: 'What can it scan today?',
    answer: 'Today the safest promise is public, reachable websites scanned from a URL, with controls for map depth and issue layers such as subdomains, orphan pages, broken links, duplicates, files, and inactive pages.',
  },
  {
    question: 'What can I share with clients or teammates?',
    answer: 'You can share saved maps with permissioned access, comments, and review-friendly links so people can see the same structure without recreating it elsewhere.',
  },
  {
    question: 'What can I export?',
    answer: 'Map exports currently include PNG, PDF, CSV, JSON, and site-index style outputs. Captured thumbnails and full screenshots can also be downloaded.',
  },
  {
    question: 'Does it work on mobile?',
    answer: 'The marketing site works on mobile, but the mapping workflow is best on desktop or tablet where the sitemap canvas has enough room to be useful.',
  },
  {
    question: 'Does it support password-protected or authenticated sites?',
    answer: 'That is not a broad production promise right now. The current landing-page positioning stays focused on public-site mapping and controlled testing workflows.',
  },
];

const legalContent = {
  terms: {
    title: 'Terms of Service',
    content: `Last updated: January 2025

1. Acceptance of Terms
By accessing and using Map Mat ("the Service"), you agree to be bound by these Terms of Service.

2. Description of Service
Map Mat is a visual sitemap generator that crawls websites and creates interactive tree diagrams of site structure.

3. User Accounts
You are responsible for maintaining the confidentiality of your account credentials and for all activities under your account.

4. Acceptable Use
You agree not to:
- Use the Service to crawl sites without permission
- Attempt to overwhelm or damage target websites
- Use the Service for any illegal purpose
- Resell or redistribute the Service without permission

5. Intellectual Property
The Service and its original content are owned by Map Mat and protected by copyright laws.

6. Limitation of Liability
Map Mat shall not be liable for any indirect, incidental, special, or consequential damages.

7. Changes to Terms
We reserve the right to modify these terms at any time. Continued use constitutes acceptance of new terms.

8. Contact
Questions about these terms should be directed to hello@mapmat.com`,
  },
  privacy: {
    title: 'Privacy Policy',
    content: `Last updated: January 2025

1. Information We Collect
- Account information (email, name)
- Usage data (pages crawled, maps created)
- Technical data (browser type, IP address)

2. How We Use Your Information
- To provide and maintain the Service
- To notify you about changes
- To provide customer support
- To improve the Service

3. Data Storage
Your data is stored securely using industry-standard encryption. Maps and account data are stored in secure databases.

4. Data Sharing
We do not sell your personal information. We may share data with:
- Service providers who assist our operations
- Law enforcement when legally required

5. Your Rights
You have the right to:
- Access your personal data
- Correct inaccurate data
- Delete your account and data
- Download your data

6. Cookies
We use essential cookies for authentication and preferences. No third-party tracking cookies are used.

7. Contact
Privacy questions should be directed to privacy@mapmat.com`,
  },
  legal: {
    title: 'Legal Notice',
    content: `Map Mat Legal Notice

Copyright
All content on this site is copyright Map Mat unless otherwise noted.

Trademarks
"Map Mat" and the Map Mat logo are trademarks of Map Mat.

Disclaimer
The information provided by Map Mat is for general informational purposes only. We make no warranties about the completeness, reliability, or accuracy of this information.

Website Crawling
Map Mat is designed for legitimate use cases such as:
- Understanding your own website structure
- SEO auditing with permission
- Documentation and planning
- Client presentations

Users are responsible for ensuring they have permission to crawl any websites they scan.

DMCA
If you believe content infringes your copyright, please contact legal@mapmat.com with:
- Your contact information
- Description of the copyrighted work
- Location of the allegedly infringing content
- Statement of good faith belief

Contact
Legal inquiries: legal@mapmat.com`,
  },
};

function getVisibleEntryClass(visibleSections, id) {
  return `animate-on-scroll ${visibleSections[id] ? 'visible' : ''}`.trim();
}

function getComparisonTone(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
}

const LandingPage = ({ onLaunchApp }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeModal, setActiveModal] = useState(null);
  const [scrollY, setScrollY] = useState(0);
  const [visibleSections, setVisibleSections] = useState({});
  const [activeFaq, setActiveFaq] = useState(null);

  useEffect(() => {
    document.body.style.overflow = 'auto';
    document.body.style.height = 'auto';
    document.documentElement.style.overflow = 'auto';

    return () => {
      document.body.style.overflow = '';
      document.body.style.height = '';
      document.documentElement.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const elements = Array.from(document.querySelectorAll('.animate-on-scroll'));
    const revealAll = () => {
      setVisibleSections(
        elements.reduce((acc, element) => {
          if (element.id) acc[element.id] = true;
          return acc;
        }, {})
      );
    };

    if (typeof window.IntersectionObserver !== 'function') {
      revealAll();
      return undefined;
    }

    const observer = new window.IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.target.id) {
            setVisibleSections((prev) => ({ ...prev, [entry.target.id]: true }));
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -64px 0px' }
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  const handleLaunchApp = () => {
    setMobileMenuOpen(false);
    onLaunchApp?.();
  };

  const scrollToSection = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setMobileMenuOpen(false);
  };

  return (
    <div className="landing">
      <nav className={`landing-nav ${scrollY > 24 ? 'scrolled' : ''}`}>
        <div className="nav-container">
          <button type="button" className="nav-brand" onClick={() => scrollToSection('hero')} aria-label="Map Mat home">
            <img src={mapmatLogo} alt="Map Mat" />
          </button>

          <div className={`nav-links ${mobileMenuOpen ? 'open' : ''}`}>
            <button type="button" onClick={() => scrollToSection('audience')}>Who It&apos;s For</button>
            <button type="button" onClick={() => scrollToSection('features')}>Features</button>
            <button type="button" onClick={() => scrollToSection('compare')}>Compare</button>
            <button type="button" onClick={() => scrollToSection('faq')}>FAQ</button>
            <button type="button" onClick={() => scrollToSection('contact')}>Contact</button>
            <button type="button" className="nav-cta" onClick={handleLaunchApp}>
              Launch App
              <ArrowRight size={16} />
            </button>
          </div>

          <button
            type="button"
            className="mobile-menu-toggle"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          >
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </nav>

      <main>
        <section id="hero" className="hero">
          <div className="hero-background" aria-hidden="true" />
          <div className="section-container hero-grid">
            <div className="hero-copy">
              <div className="section-eyebrow">Visual site mapping for audits, redesigns, and stakeholder review</div>
              <h1>Map site structure fast enough to use in real client work.</h1>
              <p className="hero-subtitle">
                Map Mat crawls a live website, lays it out on a visual sitemap canvas, and gives teams
                a clearer way to review hierarchy, issues, screenshots, and shareable feedback before testing starts.
              </p>
              <div className="hero-actions">
                <button type="button" className="btn-primary" onClick={handleLaunchApp}>
                  Launch App
                  <ArrowRight size={18} />
                </button>
                <button type="button" className="btn-secondary" onClick={() => scrollToSection('compare')}>
                  See Comparison
                </button>
              </div>
              <div className="hero-proof-list" aria-label="Core proof points">
                <span><Check size={16} /> Live URL crawl</span>
                <span><Check size={16} /> Visual sitemap canvas</span>
                <span><Check size={16} /> Share links and comments</span>
                <span><Check size={16} /> Projects, history, and exports</span>
              </div>
            </div>

            <div className="hero-product" aria-hidden="true">
              <div className="product-shell">
                <div className="product-shell-bar">
                  <div className="product-dots">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="product-url">https://example.com</div>
                  <div className="product-bar-pill">Scan</div>
                </div>

                <div className="product-shell-body">
                  <div className="product-canvas-card">
                    <div className="product-card-header">
                      <span className="product-card-label"><Globe size={14} /> Current site</span>
                      <span className="product-card-label"><Layers size={14} /> Review layers</span>
                    </div>

                    <div className="product-map">
                      <div className="product-node product-node-root">
                        <span>Home</span>
                        <small>Primary tree</small>
                      </div>
                      <div className="product-branches">
                        <div className="product-node">
                          <span>Services</span>
                          <small>Client-facing branch</small>
                        </div>
                        <div className="product-node">
                          <span>Work</span>
                          <small>Share-ready section</small>
                        </div>
                        <div className="product-node">
                          <span>Resources</span>
                          <small>Needs review</small>
                        </div>
                      </div>
                      <div className="product-tag-row">
                        <span>Broken links</span>
                        <span>Orphan pages</span>
                        <span>Files</span>
                        <span>Subdomains</span>
                      </div>
                    </div>
                  </div>

                  <div className="product-sidebar">
                    <div className="product-sidebar-card">
                      <div className="product-sidebar-title">Review outputs</div>
                      <ul>
                        <li><Eye size={14} /> Thumbnails and full screenshots</li>
                        <li><MessageSquare size={14} /> Comments on the map</li>
                        <li><Share2 size={14} /> Permissioned share links</li>
                      </ul>
                    </div>

                    <div className="product-sidebar-card">
                      <div className="product-sidebar-title">Delivery</div>
                      <ul>
                        <li><FolderOpen size={14} /> Saved projects and history</li>
                        <li><Download size={14} /> PNG, PDF, CSV, JSON</li>
                        <li><Layers size={14} /> Issue-focused reporting</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="audience" className={`landing-section ${getVisibleEntryClass(visibleSections, 'audience')}`}>
          <div className="section-container">
            <div className="section-header">
              <div className="section-eyebrow">Who it&apos;s for</div>
              <h2>Built for teams that need structure, review context, and client-ready outputs.</h2>
              <p>
                The page is positioned for agencies and consultants first, but the workflow is still useful
                for internal web teams preparing audits, planning restructures, and getting closer to testing.
              </p>
            </div>

            <div className="card-grid card-grid-three">
              {audienceCards.map((card) => (
                <article key={card.title} className="info-card">
                  <h3>{card.title}</h3>
                  <p>{card.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="problems" className={`landing-section landing-section-alt ${getVisibleEntryClass(visibleSections, 'problems')}`}>
          <div className="section-container">
            <div className="section-header">
              <div className="section-eyebrow">What it solves</div>
              <h2>Map Mat is useful when a crawler alone is not enough and a diagram alone is too manual.</h2>
              <p>
                The product is most compelling when you need to understand the existing site, review it visually,
                and keep the review loop connected to exports, comments, and saved work.
              </p>
            </div>

            <div className="card-grid card-grid-three">
              {problemCards.map((card) => (
                <article key={card.title} className="info-card info-card-emphasis">
                  <h3>{card.title}</h3>
                  <p>{card.description}</p>
                </article>
              ))}
            </div>

            <div className="section-subgroup">
              <div className="section-eyebrow">Why teams use it</div>
              <div className="card-grid card-grid-three">
                {useCaseCards.map((card) => (
                  <article key={card.title} className="info-card">
                    <h3>{card.title}</h3>
                    <p>{card.description}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="features" className={`landing-section ${getVisibleEntryClass(visibleSections, 'features')}`}>
          <div className="section-container">
            <div className="section-header">
              <div className="section-eyebrow">Core features</div>
              <h2>Practical capabilities the app supports today.</h2>
              <p>
                The copy below stays close to the product: live crawling, a visual sitemap canvas,
                issue review, screenshots, collaboration, and delivery outputs.
              </p>
            </div>

            <div className="card-grid card-grid-three">
              {featureCards.map((feature) => {
                const Icon = feature.icon;
                return (
                  <article key={feature.title} className="feature-card">
                    <div className="feature-icon">
                      <Icon size={20} />
                    </div>
                    <h3>{feature.title}</h3>
                    <p>{feature.description}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="workflow" className={`landing-section landing-section-alt ${getVisibleEntryClass(visibleSections, 'workflow')}`}>
          <div className="section-container">
            <div className="section-header">
              <div className="section-eyebrow">How teams use it</div>
              <h2>Start with the live site, review it visually, then hand off cleaner outputs.</h2>
              <p>
                This is the simple workflow the page is selling right now: crawl, review, then share or export.
              </p>
            </div>

            <div className="workflow-grid">
              {workflowSteps.map((item) => (
                <article key={item.step} className="workflow-card">
                  <div className="workflow-step">{item.step}</div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="compare" className={`landing-section ${getVisibleEntryClass(visibleSections, 'compare')}`}>
          <div className="section-container">
            <div className="section-header">
              <div className="section-eyebrow">How Map Mat compares</div>
              <h2>A conservative feature matrix for adjacent tools.</h2>
              <p>
                The goal is not to flatten every tool into the same category. This matrix focuses on whether each product
                appears to cover the specific workflow pieces this page is emphasizing.
              </p>
            </div>

            <div className="compare-table-shell">
              <div className="compare-table-wrap">
                <table className="compare-table">
                  <thead>
                    <tr>
                      <th scope="col">Workflow area</th>
                      {comparisonColumns.map((column) => (
                        <th
                          key={column.key}
                          scope="col"
                          className={column.highlight ? 'compare-highlight' : undefined}
                        >
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.map((row) => (
                      <tr key={row.feature}>
                        <th scope="row">{row.feature}</th>
                        {comparisonColumns.map((column) => {
                          const value = row.values[column.key];
                          return (
                            <td key={column.key} className={column.highlight ? 'compare-highlight' : undefined}>
                              <span className={`compare-chip compare-chip-${getComparisonTone(value)}`}>
                                {value}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="compare-note">
                Based on public product pages reviewed on April 2, 2026. When product pages were broad or plan-gated,
                labels were kept intentionally conservative.
              </p>
            </div>
          </div>
        </section>

        <section id="faq" className={`landing-section landing-section-alt ${getVisibleEntryClass(visibleSections, 'faq')}`}>
          <div className="section-container">
            <div className="section-header">
              <div className="section-eyebrow">FAQ</div>
              <h2>Short answers to the questions likely to block adoption.</h2>
              <p>
                The FAQ stays tight and product-truthful. It avoids pricing tiers, fake roadmap certainty,
                and broad claims the app should not be making yet.
              </p>
            </div>

            <div className="faq-list">
              {faqs.map((faq, index) => {
                const isOpen = activeFaq === index;
                const buttonId = `faq-button-${index}`;
                const panelId = `faq-panel-${index}`;

                return (
                  <article key={faq.question} className={`faq-item ${isOpen ? 'active' : ''}`}>
                    <button
                      id={buttonId}
                      type="button"
                      className="faq-question"
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      onClick={() => setActiveFaq(isOpen ? null : index)}
                    >
                      <span>{faq.question}</span>
                      <ChevronDown size={18} />
                    </button>
                    {isOpen ? (
                      <div id={panelId} className="faq-answer" role="region" aria-labelledby={buttonId}>
                        <p>{faq.answer}</p>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="contact" className={`landing-section ${getVisibleEntryClass(visibleSections, 'contact')}`}>
          <div className="section-container">
            <div className="section-header">
              <div className="section-eyebrow">Launch or contact</div>
              <h2>Use the app directly, or email if you want a walkthrough before broader testing.</h2>
              <p>
                There is no fake contact form here. If you need to talk through fit for a client audit or a stakeholder review flow,
                use the email path instead.
              </p>
            </div>

            <div className="contact-grid">
              <article className="contact-card contact-card-primary">
                <div className="contact-card-label">Self-serve</div>
                <h3>Launch the app</h3>
                <p>
                  Best if you are ready to crawl a public site, review the structure visually,
                  and test the workflow on a real project.
                </p>
                <button type="button" className="btn-primary btn-primary-large" onClick={handleLaunchApp}>
                  Launch App
                  <ArrowRight size={18} />
                </button>
              </article>

              <article className="contact-card">
                <div className="contact-card-label">Direct contact</div>
                <h3>Email for a walkthrough</h3>
                <p>
                  Useful if you want to sanity-check fit for audits, redesign planning, or stakeholder review before sending people into the product.
                </p>
                <a className="contact-link" href="mailto:hello@mapmat.com">
                  <Mail size={18} />
                  hello@mapmat.com
                </a>
                <p className="contact-footnote">
                  Current focus: public-site mapping, review workflows, and controlled testing readiness.
                </p>
              </article>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="footer-container">
          <div className="footer-brand">
            <img src={mapmatLogo} alt="Map Mat" />
            <p>Visual site mapping for audits, redesigns, and review.</p>
          </div>

          <div className="footer-links">
            <div className="footer-column">
              <h4>Product</h4>
              <button type="button" onClick={() => scrollToSection('features')}>Features</button>
              <button type="button" onClick={() => scrollToSection('compare')}>Compare</button>
              <button type="button" onClick={() => scrollToSection('faq')}>FAQ</button>
            </div>

            <div className="footer-column">
              <h4>Legal</h4>
              <button type="button" onClick={() => setActiveModal('terms')}>Terms of Service</button>
              <button type="button" onClick={() => setActiveModal('privacy')}>Privacy Policy</button>
              <button type="button" onClick={() => setActiveModal('legal')}>Legal Notice</button>
            </div>

            <div className="footer-column">
              <h4>Contact</h4>
              <a href="mailto:hello@mapmat.com">hello@mapmat.com</a>
              <button type="button" onClick={handleLaunchApp}>Launch App</button>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; {new Date().getFullYear()} Map Mat. All rights reserved.</p>
        </div>
      </footer>

      {activeModal ? (
        <div className="legal-overlay" onClick={() => setActiveModal(null)}>
          <div className="legal-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="legal-close" onClick={() => setActiveModal(null)} aria-label="Close legal dialog">
              <X size={20} />
            </button>
            <h2>{legalContent[activeModal].title}</h2>
            <div className="legal-content">
              <pre>{legalContent[activeModal].content}</pre>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default LandingPage;
