import React, { useState, useEffect } from 'react';
import {
  Map, Zap, Share2, FolderOpen, Download,
  ChevronDown, Menu, X, Check, ArrowRight, Mail, Send,
  Globe, Layers, Eye
} from 'lucide-react';
import './LandingPage.css';

const LandingPage = ({ onLaunchApp }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeModal, setActiveModal] = useState(null);
  const [scrollY, setScrollY] = useState(0);
  const [visibleSections, setVisibleSections] = useState({});
  const [contactForm, setContactForm] = useState({ name: '', email: '', message: '' });
  const [contactSubmitted, setContactSubmitted] = useState(false);
  const [activeFaq, setActiveFaq] = useState(null);

  // Track scroll for parallax
  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Intersection observer for scroll animations
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisibleSections((prev) => ({ ...prev, [entry.target.id]: true }));
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    );

    document.querySelectorAll('.animate-on-scroll').forEach((el) => {
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const scrollToSection = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    setMobileMenuOpen(false);
  };

  const handleContactSubmit = (e) => {
    e.preventDefault();
    // In production, this would send to a backend
    console.log('Contact form:', contactForm);
    setContactSubmitted(true);
    setTimeout(() => {
      setContactSubmitted(false);
      setContactForm({ name: '', email: '', message: '' });
    }, 3000);
  };

  const features = [
    {
      icon: <Zap size={28} />,
      title: 'Instant Crawling',
      description: 'Enter any URL and watch as Map Mat intelligently discovers and maps every page on the site in seconds.'
    },
    {
      icon: <Layers size={28} />,
      title: 'Visual Hierarchy',
      description: 'See your site structure as a beautiful tree diagram. Instantly understand page relationships and depth.'
    },
    {
      icon: <Eye size={28} />,
      title: 'Live Thumbnails',
      description: 'Preview each page with auto-generated thumbnails. No more guessing what\'s behind each link.'
    },
    {
      icon: <FolderOpen size={28} />,
      title: 'Projects & Organization',
      description: 'Save unlimited sitemaps, organize into projects, and access your maps from anywhere.'
    },
    {
      icon: <Share2 size={28} />,
      title: 'Share & Collaborate',
      description: 'Generate shareable links for clients and teammates. No account needed to view.'
    },
    {
      icon: <Download size={28} />,
      title: 'Export Anywhere',
      description: 'Download as PNG, PDF, or SVG. Perfect for presentations, documentation, and audits.'
    }
  ];

  const howItWorks = [
    { step: '1', title: 'Enter URL', description: 'Paste any website URL into the scan bar' },
    { step: '2', title: 'Watch it Map', description: 'Our crawler discovers pages and builds your tree' },
    { step: '3', title: 'Explore & Export', description: 'Navigate the map, customize colors, and export' }
  ];

  const faqs = [
    {
      q: 'How many pages can Map Mat crawl?',
      a: 'The free tier crawls up to 100 pages per scan. Pro accounts can crawl up to 500 pages, and Team accounts have unlimited crawling.'
    },
    {
      q: 'Does it work with password-protected sites?',
      a: 'Currently, Map Mat only crawls publicly accessible pages. We\'re working on authenticated crawling for a future release.'
    },
    {
      q: 'Can I import existing sitemaps?',
      a: 'Yes! You can import sitemaps from XML, HTML, RSS, CSV, Markdown, and other common formats.'
    },
    {
      q: 'How long are shared links valid?',
      a: 'Shared links are valid for 30 days by default. Pro users can create permanent links.'
    },
    {
      q: 'Is my data secure?',
      a: 'Absolutely. We use industry-standard encryption, and your maps are only visible to you unless you explicitly share them.'
    },
    {
      q: 'Can I use Map Mat on mobile?',
      a: 'The marketing site works great on mobile! However, the mapping app itself is designed for desktop and tablet screens to give you the best experience with large visual sitemaps.'
    }
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
Questions about these terms should be directed to hello@mapmat.com`
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
- Export your data

6. Cookies
We use essential cookies for authentication and preferences. No third-party tracking cookies are used.

7. Contact
Privacy questions should be directed to privacy@mapmat.com`
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
Legal inquiries: legal@mapmat.com`
    }
  };

  return (
    <div className="landing">
      {/* Navigation */}
      <nav className={`landing-nav ${scrollY > 50 ? 'scrolled' : ''}`}>
        <div className="nav-container">
          <div className="nav-brand" onClick={() => scrollToSection('hero')}>
            <Map size={24} />
            <span>Map Mat</span>
          </div>

          <div className={`nav-links ${mobileMenuOpen ? 'open' : ''}`}>
            <button onClick={() => scrollToSection('features')}>Features</button>
            <button onClick={() => scrollToSection('how-it-works')}>How It Works</button>
            <button onClick={() => scrollToSection('faq')}>FAQ</button>
            <button onClick={() => scrollToSection('contact')}>Contact</button>
            <button className="nav-cta" onClick={onLaunchApp}>
              Launch App <ArrowRight size={16} />
            </button>
          </div>

          <button className="mobile-menu-toggle" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section id="hero" className="hero">
        <div
          className="hero-bg"
          style={{ transform: `translateY(${scrollY * 0.3}px)` }}
        />
        <div className="hero-content">
          <h1 className="hero-title">
            Visualize Any Website's
            <span className="gradient-text"> Structure</span>
          </h1>
          <p className="hero-subtitle">
            Stop guessing. Start seeing. Map Mat crawls any site and transforms it into
            a beautiful, interactive sitemap in seconds.
          </p>
          <div className="hero-cta">
            <button className="btn-primary" onClick={onLaunchApp}>
              Try It Free <ArrowRight size={18} />
            </button>
            <button className="btn-secondary" onClick={() => scrollToSection('how-it-works')}>
              See How It Works
            </button>
          </div>
          <div className="hero-stats">
            <div className="stat">
              <span className="stat-number">10K+</span>
              <span className="stat-label">Sites Mapped</span>
            </div>
            <div className="stat">
              <span className="stat-number">500+</span>
              <span className="stat-label">Happy Users</span>
            </div>
            <div className="stat">
              <span className="stat-number">99%</span>
              <span className="stat-label">Uptime</span>
            </div>
          </div>
        </div>
        <div
          className="hero-visual"
          style={{ transform: `translateY(${scrollY * -0.15}px)` }}
        >
          <div className="mock-app">
            <div className="mock-topbar">
              <div className="mock-dots">
                <span /><span /><span />
              </div>
              <div className="mock-url">mapmat.app</div>
            </div>
            <div className="mock-content">
              <div className="mock-tree">
                <div className="mock-node root">
                  <Globe size={16} />
                  <span>Home</span>
                </div>
                <div className="mock-children">
                  <div className="mock-node"><span>About</span></div>
                  <div className="mock-node"><span>Products</span></div>
                  <div className="mock-node"><span>Blog</span></div>
                  <div className="mock-node"><span>Contact</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="scroll-indicator" onClick={() => scrollToSection('problem')}>
          <ChevronDown size={24} />
        </div>
      </section>

      {/* Problem Section */}
      <section id="problem" className={`problem animate-on-scroll ${visibleSections['problem'] ? 'visible' : ''}`}>
        <div className="section-container">
          <h2>The Problem with Website Planning</h2>
          <div className="problem-grid">
            <div className="problem-card">
              <div className="problem-icon">😵</div>
              <h3>Lost in the Maze</h3>
              <p>Large websites become impossible to visualize. Teams waste hours clicking through pages trying to understand structure.</p>
            </div>
            <div className="problem-card">
              <div className="problem-icon">📝</div>
              <h3>Manual Documentation</h3>
              <p>Creating sitemaps by hand is tedious, error-prone, and outdated the moment you finish.</p>
            </div>
            <div className="problem-card">
              <div className="problem-icon">🤷</div>
              <h3>Communication Gaps</h3>
              <p>Explaining site structure to clients, developers, or stakeholders without visuals leads to misunderstandings.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Solution Section */}
      <section id="solution" className={`solution animate-on-scroll ${visibleSections['solution'] ? 'visible' : ''}`}>
        <div className="section-container">
          <div className="solution-content">
            <h2>Map Mat Makes It Simple</h2>
            <p>
              Enter a URL. Get a complete visual sitemap. It's that easy. Map Mat automatically
              crawls websites, discovers every page, and presents the structure as an intuitive,
              interactive tree diagram.
            </p>
            <ul className="solution-list">
              <li><Check size={20} /> No more manual documentation</li>
              <li><Check size={20} /> Instant visual understanding</li>
              <li><Check size={20} /> Share with one click</li>
              <li><Check size={20} /> Export for any use case</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className={`features animate-on-scroll ${visibleSections['features'] ? 'visible' : ''}`}>
        <div className="section-container">
          <h2>Powerful Features</h2>
          <p className="section-subtitle">Everything you need to understand, document, and share website structure</p>
          <div className="features-grid">
            {features.map((feature, i) => (
              <div
                key={i}
                className="feature-card"
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                <div className="feature-icon">{feature.icon}</div>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className={`how-it-works animate-on-scroll ${visibleSections['how-it-works'] ? 'visible' : ''}`}>
        <div className="section-container">
          <h2>How It Works</h2>
          <p className="section-subtitle">Three simple steps to a complete sitemap</p>
          <div className="steps">
            {howItWorks.map((item, i) => (
              <div key={i} className="step">
                <div className="step-number">{item.step}</div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Mobile Notice */}
      <section className={`mobile-notice animate-on-scroll ${visibleSections['mobile-notice'] ? 'visible' : ''}`} id="mobile-notice">
        <div className="section-container">
          <div className="notice-card">
            <div className="notice-icon">💻</div>
            <h3>Designed for Bigger Screens</h3>
            <p>
              Map Mat's visual sitemap experience is optimized for desktop and tablet devices.
              For the best experience creating and exploring sitemaps, please visit us on a larger screen.
            </p>
            <p className="notice-sub">This marketing site works great on mobile though!</p>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className={`faq animate-on-scroll ${visibleSections['faq'] ? 'visible' : ''}`}>
        <div className="section-container">
          <h2>Frequently Asked Questions</h2>
          <div className="faq-list">
            {faqs.map((faq, i) => (
              <div
                key={i}
                className={`faq-item ${activeFaq === i ? 'active' : ''}`}
                onClick={() => setActiveFaq(activeFaq === i ? null : i)}
              >
                <div className="faq-question">
                  <span>{faq.q}</span>
                  <ChevronDown size={20} />
                </div>
                <div className="faq-answer">
                  <p>{faq.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className={`contact animate-on-scroll ${visibleSections['contact'] ? 'visible' : ''}`}>
        <div className="section-container">
          <h2>Get in Touch</h2>
          <p className="section-subtitle">Have questions? We'd love to hear from you.</p>
          <div className="contact-wrapper">
            <form className="contact-form" onSubmit={handleContactSubmit}>
              {contactSubmitted ? (
                <div className="contact-success">
                  <Check size={48} />
                  <h3>Message Sent!</h3>
                  <p>We'll get back to you soon.</p>
                </div>
              ) : (
                <>
                  <div className="form-group">
                    <label>Name</label>
                    <input
                      type="text"
                      value={contactForm.name}
                      onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                      placeholder="Your name"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Email</label>
                    <input
                      type="email"
                      value={contactForm.email}
                      onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                      placeholder="you@example.com"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Message</label>
                    <textarea
                      value={contactForm.message}
                      onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                      placeholder="How can we help?"
                      rows={4}
                      required
                    />
                  </div>
                  <button type="submit" className="btn-primary">
                    Send Message <Send size={18} />
                  </button>
                </>
              )}
            </form>
            <div className="contact-info">
              <div className="contact-item">
                <Mail size={20} />
                <span>hello@mapmat.com</span>
              </div>
              <div className="contact-social">
                <p>Follow us for updates</p>
                {/* Add social links here */}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="final-cta">
        <div className="section-container">
          <h2>Ready to Map Your First Site?</h2>
          <p>Join thousands of designers, developers, and marketers who trust Map Mat.</p>
          <button className="btn-primary large" onClick={onLaunchApp}>
            Launch App - It's Free <ArrowRight size={20} />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-container">
          <div className="footer-brand">
            <div className="nav-brand">
              <Map size={20} />
              <span>Map Mat</span>
            </div>
            <p>Visual sitemaps made simple.</p>
          </div>
          <div className="footer-links">
            <div className="footer-col">
              <h4>Product</h4>
              <button onClick={() => scrollToSection('features')}>Features</button>
              <button onClick={() => scrollToSection('how-it-works')}>How It Works</button>
              <button onClick={() => scrollToSection('faq')}>FAQ</button>
            </div>
            <div className="footer-col">
              <h4>Legal</h4>
              <button onClick={() => setActiveModal('terms')}>Terms of Service</button>
              <button onClick={() => setActiveModal('privacy')}>Privacy Policy</button>
              <button onClick={() => setActiveModal('legal')}>Legal Notice</button>
            </div>
            <div className="footer-col">
              <h4>Connect</h4>
              <button onClick={() => scrollToSection('contact')}>Contact Us</button>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; {new Date().getFullYear()} Map Mat. All rights reserved.</p>
        </div>
      </footer>

      {/* Legal Modals */}
      {activeModal && (
        <div className="legal-overlay" onClick={() => setActiveModal(null)}>
          <div className="legal-modal" onClick={(e) => e.stopPropagation()}>
            <button className="legal-close" onClick={() => setActiveModal(null)}>
              <X size={24} />
            </button>
            <h2>{legalContent[activeModal].title}</h2>
            <div className="legal-content">
              <pre>{legalContent[activeModal].content}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LandingPage;
