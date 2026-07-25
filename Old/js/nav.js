// ============================================================
// nav.js — Dhaka Kacchi Berlin
// Shared navigation, footer & scroll effects
// 
// TO CHANGE THE LOGO IMAGE:
//   Edit the logoSrc variable below — point it to your new image file.
//   The logo is used in the nav bar and footer automatically.
// ============================================================

(function () {
  const isSubPage = window.location.pathname.includes('/pages/');
  const base = isSubPage ? '../' : '';

  // ---- LOGO CONFIGURATION ----
  // Change this path to update the logo across ALL pages at once
  const logoSrc = base + 'images/logo-nav.png';
  const logoAlt = 'Dhaka Kacchi Berlin';

  const logoHTML = `<img src="${logoSrc}" alt="${logoAlt}" class="logo-img">`;

  // ---- FLOATING SOCIAL BUTTONS ----
  const floatHTML = `
  <div class="social-float">
    <a class="soc-btn soc-ig" href="https://www.instagram.com/dhakakacchi" target="_blank" rel="noopener" title="Follow on Instagram">
      <div class="soc-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="2" width="20" height="20" rx="5" stroke="white" stroke-width="2"/>
          <circle cx="12" cy="12" r="4" stroke="white" stroke-width="2"/>
          <circle cx="17.5" cy="6.5" r="1" fill="white"/>
        </svg>
      </div>
      <span class="soc-label">Instagram</span>
    </a>
    <a class="soc-btn soc-fb" href="https://www.facebook.com/DhakaKacchi/" target="_blank" rel="noopener" title="Like on Facebook">
      <div class="soc-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
          <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
        </svg>
      </div>
      <span class="soc-label">Facebook</span>
    </a>
  </div>`;

  // ---- NAV HTML ----
  const navHTML = `
  <nav id="nav" role="navigation" aria-label="Main navigation">
    <a class="nav-logo" href="${base}index.html" aria-label="Dhaka Kacchi Berlin - Home">${logoHTML}</a>

    <ul class="nav-links" id="navLinks" role="list">
      <li><a href="${base}index.html">Home</a></li>
      <li><a href="${base}pages/about.html">About</a></li>
      <li><a href="${base}pages/history.html">History</a></li>
      <li><a href="${base}pages/subscribe.html">Subscribe</a></li>
      <li><a href="${base}pages/order.html" class="nav-cta">Order Now</a></li>
    </ul>

    <button class="nav-toggle" id="navToggle" aria-label="Open menu" aria-expanded="false" aria-controls="navLinks">
      <span class="bar"></span>
      <span class="bar"></span>
      <span class="bar"></span>
    </button>
  </nav>

  <div class="nav-overlay" id="navOverlay"></div>`;

  // ---- FOOTER HTML ----
  const footerHTML = `
  <section class="social-section">
    <div class="social-section-inner reveal">
      <span class="sec-eye" style="display:block;margin-bottom:18px;">Stay Connected</span>
      <h2>Follow our <em>journey</em></h2>
      <p>Behind every plate is a story. See the cooking, the chaos, the joy.<br>Follow Dhaka Kacchi and never miss a batch.</p>
      <div class="social-cards">
        <a class="social-card sc-fb" href="https://www.facebook.com/DhakaKacchi/" target="_blank" rel="noopener">
          <div class="social-card-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="#1877F2" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
            </svg>
          </div>
          <div class="social-card-text"><strong>Facebook</strong><span>Like our page →</span></div>
          <div class="social-card-arrow">→</div>
        </a>
        <a class="social-card sc-ig" href="https://www.instagram.com/dhakakacchi" target="_blank" rel="noopener">
          <div class="social-card-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="2" y="2" width="20" height="20" rx="5" stroke="url(#ig)" stroke-width="2.2"/>
              <circle cx="12" cy="12" r="4" stroke="url(#ig)" stroke-width="2.2"/>
              <circle cx="17.5" cy="6.5" r="1.2" fill="url(#ig2)"/>
              <defs>
                <linearGradient id="ig" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stop-color="#833ab4"/><stop offset="50%" stop-color="#fd1d1d"/><stop offset="100%" stop-color="#fcb045"/>
                </linearGradient>
                <linearGradient id="ig2" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">
                  <stop offset="0%" stop-color="#833ab4"/><stop offset="100%" stop-color="#fcb045"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div class="social-card-text"><strong>Instagram</strong><span>Follow us →</span></div>
          <div class="social-card-arrow">→</div>
        </a>
      </div>
    </div>
  </section>

  <footer>
    <div class="flogo">
      <a href="${base}index.html" aria-label="Dhaka Kacchi Berlin - Home">
        <img src="${logoSrc}" alt="${logoAlt}" class="footer-logo-img">
      </a>
    </div>
    <div class="fcopy">
      Authentic Kacchi &amp; Borhani — Berlin, Germany<br>
      <span style="color:#2d2820;">© ${new Date().getFullYear()} Dhaka Kacchi Berlin · All rights reserved</span>
    </div>
    <div class="fcon">
      <a href="mailto:hello@dhakakacchi.com">hello@dhakakacchi.com</a><br>
      <span>www.dhakakacchi.com · Berlin</span>
    </div>
  </footer>`;

  // ---- INJECT ----
  document.body.insertAdjacentHTML('afterbegin', floatHTML + navHTML);
  document.body.insertAdjacentHTML('beforeend', footerHTML);

  // ---- ACTIVE LINK ----
  document.querySelectorAll('.nav-links a').forEach(a => {
    if (a.href === window.location.href) a.classList.add('active');
  });

  // ---- SCROLL: nav background ----
  const navEl = document.getElementById('nav');
  window.addEventListener('scroll', () => {
    navEl.classList.toggle('scrolled', window.scrollY > 60);
  }, { passive: true });

  // ---- HAMBURGER MENU ----
  const toggle = document.getElementById('navToggle');
  const links  = document.getElementById('navLinks');
  const overlay = document.getElementById('navOverlay');

  function openMenu() {
    links.classList.add('open');
    overlay.classList.add('open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close menu');
    toggle.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeMenu() {
    links.classList.remove('open');
    overlay.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
    toggle.classList.remove('active');
    document.body.style.overflow = '';
  }

  toggle.addEventListener('click', () => {
    links.classList.contains('open') ? closeMenu() : openMenu();
  });

  // Close on overlay click
  overlay.addEventListener('click', closeMenu);

  // Close on nav link click
  links.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));

  // Close on Escape key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeMenu();
  });

  // ---- SCROLL REVEAL ----
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const cards = [...document.querySelectorAll('.card')];
        const delay = entry.target.classList.contains('card') ? cards.indexOf(entry.target) * 90 : 0;
        setTimeout(() => entry.target.classList.add('vis'), delay);
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08 });

  document.querySelectorAll('.reveal, .card').forEach(el => io.observe(el));

})();
