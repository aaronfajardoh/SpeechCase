import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  IconHighlighter, 
  IconTimeline, 
  IconUsers, 
  IconSpeaker,
  IconSparkle,
  IconRobot,
  IconSearch,
  IconPalette,
  IconCloud
} from '../components/Icons.jsx';
import './LandingPage.css';

const LandingPage = () => {
  const { loginWithGoogle } = useAuth();
  const [activeSection, setActiveSection] = useState('overview');
  const [contactForm, setContactForm] = useState({ name: '', email: '', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null);

  const handleGetStarted = async () => {
    try {
      await loginWithGoogle();
    } catch (error) {
      console.error('Error logging in with Google:', error);
    }
  };

  const handleContactSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus(null);

    try {
      const mailtoLink = `mailto:aaronfajardoh@hotmail.com?subject=Contact from SpeechCase&body=Name: ${encodeURIComponent(contactForm.name)}%0AEmail: ${encodeURIComponent(contactForm.email)}%0A%0AMessage:%0A${encodeURIComponent(contactForm.message)}`;
      window.location.href = mailtoLink;
      setSubmitStatus('success');
      setContactForm({ name: '', email: '', message: '' });
    } catch (error) {
      console.error('Error sending email:', error);
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const scrollToSection = (sectionId) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setActiveSection(sectionId);
  };

  return (
    <div className="landing-page">
      {/* Navbar */}
      <nav className="landing-navbar">
        <div className="navbar-container">
          <div className="navbar-logo">
            <img src="/logo.png" alt="SpeechCase Logo" className="logo-img" />
            <span className="logo-text">Casedive</span>
          </div>
          <div className="navbar-links">
            <button 
              className={`nav-link ${activeSection === 'overview' ? 'active' : ''}`}
              onClick={() => scrollToSection('overview')}
            >
              Overview
            </button>
            <button 
              className={`nav-link ${activeSection === 'features' ? 'active' : ''}`}
              onClick={() => scrollToSection('features')}
            >
              Features & Technology
            </button>
            <button 
              className={`nav-link ${activeSection === 'contact' ? 'active' : ''}`}
              onClick={() => scrollToSection('contact')}
            >
              Contact Us
            </button>
            <button className="nav-link login-btn" onClick={handleGetStarted}>
              Log In
            </button>
          </div>
          <button className="mobile-menu-btn" onClick={() => {
            const menu = document.querySelector('.navbar-links');
            menu?.classList.toggle('mobile-open');
          }}>
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section id="overview" className="hero-section">
        <div className="hero-container">
          <div className="hero-content">
            <div className="hero-badge">
              <span className="badge-text">
                100% FREE
              </span>
            </div>
            <h1 className="hero-title">
              Dive deep into PDFs with <span className="gradient-text">AI</span>
            </h1>
            <p className="hero-subtitle">
              Transform your PDF reading experience with smart highlighting, instant AI- powered summaries of your highlights, 
            interactive timelines, character extraction, and 
              text-to-speech. All completely free.
            </p>
            <div className="hero-cta">
              <button className="cta-primary" onClick={handleGetStarted}>
                Get Started
              </button>
              <p className="cta-note">No credit card required • Free forever</p>
            </div>
          </div>
          <div className="hero-image">
            <img 
              src="/Mobile.png" 
              alt="SpeechCase Mobile Interface" 
              className="hero-mobile-img"
            />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="features-section">
        <div className="features-container">
          <div className="features-header">
            <h2 className="section-title">Powerful Features</h2>
            <p className="section-subtitle">
              Everything you need to master your PDFs, powered by advanced AI
            </p>
          </div>

          <div className="features-grid">
            {/* Feature 1: Smart Highlights */}
            <div className="feature-card feature-large">
              <div className="feature-content">
                <div className="feature-icon">
                  <IconHighlighter size={48} />
                </div>
                <h3 className="feature-title">Smart Highlights</h3>
                <p className="feature-description">
                  Intelligently highlight and connect key concepts across your document. 
                  Create visual connections between related ideas and build a comprehensive 
                  understanding of your content.
                </p>
              </div>
              <div className="feature-image">
                <img src="/Highlights.png" alt="Smart Highlights Feature" />
              </div>
            </div>

            {/* Feature 2: Interactive Timelines */}
            <div className="feature-card feature-large feature-reverse">
              <div className="feature-content">
                <div className="feature-icon">
                  <IconTimeline size={48} />
                </div>
                <h3 className="feature-title">Interactive Timelines</h3>
                <p className="feature-description">
                  Automatically extract and visualize chronological events from your documents. 
                  Navigate through time-based information with an intuitive, proportional timeline 
                  that makes complex narratives easy to understand.
                </p>
              </div>
              <div className="feature-image">
                <img src="/Timeline.png" alt="Interactive Timeline Feature" />
              </div>
            </div>

            {/* Feature 3: Character Extraction */}
            <div className="feature-card feature-large">
              <div className="feature-content">
                <div className="feature-icon">
                  <IconUsers size={48} />
                </div>
                <h3 className="feature-title">Character Extraction</h3>
                <p className="feature-description">
                  Automatically identify and extract all characters, people, and entities from 
                  your documents. Build comprehensive character lists with relationships and 
                  context, perfect for novels, scripts, or research papers.
                </p>
              </div>
              <div className="feature-image">
                <img src="/Characters.png" alt="Character Extraction Feature" />
              </div>
            </div>

            {/* Feature 4: Text-to-Speech */}
            <div className="feature-card feature-large feature-reverse">
              <div className="feature-content">
                <div className="feature-icon">
                  <IconSpeaker size={48} />
                </div>
                <h3 className="feature-title">Text-to-Speech</h3>
                <p className="feature-description">
                  Listen to your documents with high-quality AI-powered voice synthesis. 
                  Adjust playback speed, pause, and resume at any point. Perfect for 
                  multitasking or accessibility needs.
                </p>
              </div>
              <div className="feature-image">
                <img src="/TTS.png" alt="Text-to-Speech Feature" />
              </div>
            </div>
          </div>

          {/* Technology Stack */}
          <div className="technology-section">
            <h3 className="tech-title">Built with Cutting-Edge Technology</h3>
            <div className="tech-grid">
              <div className="tech-item">
                <div className="tech-icon">
                  <IconRobot size={40} />
                </div>
                <h4>Advanced AI</h4>
                <p>AI-powered document analysis using the latest models</p>
              </div>
              <div className="tech-item">
                <div className="tech-icon">
                  <IconSearch size={40} />
                </div>
                <h4>Vector Search</h4>
                <p>Semantic search with embeddings for precise content retrieval</p>
              </div>
              <div className="tech-item">
                <div className="tech-icon">
                  <IconPalette size={40} />
                </div>
                <h4>Modern UI</h4>
                <p>React-based interface with smooth interactions</p>
              </div>
              <div className="tech-item">
                <div className="tech-icon">
                  <IconCloud size={40} />
                </div>
                <h4>Cloud-Powered</h4>
                <p>Firebase integration for secure, scalable infrastructure</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="contact-section">
        <div className="contact-container">
          <div className="contact-header">
            <h2 className="section-title">Get in Touch</h2>
            <p className="section-subtitle">
              Have questions or feedback? We'd love to hear from you.
            </p>
          </div>
          <form className="contact-form" onSubmit={handleContactSubmit}>
            <div className="form-group">
              <label htmlFor="name">Name</label>
              <input
                type="text"
                id="name"
                value={contactForm.name}
                onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                required
                placeholder="Your name"
              />
            </div>
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                value={contactForm.email}
                onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                required
                placeholder="your.email@example.com"
              />
            </div>
            <div className="form-group">
              <label htmlFor="message">Message</label>
              <textarea
                id="message"
                value={contactForm.message}
                onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                required
                rows="5"
                placeholder="Your message..."
              />
            </div>
            {submitStatus === 'success' && (
              <div className="form-status success">
                ✓ Email client opened. Please send your message.
              </div>
            )}
            {submitStatus === 'error' && (
              <div className="form-status error">
                ✗ Error opening email client. Please try again.
              </div>
            )}
            <button type="submit" className="submit-btn" disabled={isSubmitting}>
              {isSubmitting ? 'Sending...' : 'Send Message'}
            </button>
          </form>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="final-cta-section">
        <div className="final-cta-container">
          <h2 className="final-cta-title">Ready to Transform Your PDF Experience?</h2>
          <p className="final-cta-subtitle">
            Join thousands of users who are already mastering their documents with AI
          </p>
          <button className="cta-primary cta-large" onClick={handleGetStarted}>
            Get Started Now
          </button>
          <p className="final-cta-note">Free forever • No credit card • Start in seconds</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-container">
          <p>&copy; 2026 Casedive. All rights reserved.</p>
          <p className="footer-tagline">Mastering PDFs with AI</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;

