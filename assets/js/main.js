
// Initialize Typed.js for animated tagline if placeholder exists
if (document.getElementById('typed')) {
  new Typed('#typed', {
    strings: [
      'AI Integrations',
      'Smart Contracts',
      'Next-Gen Websites',
      'Scalable Data Hosting',
      'Complex Apps & Automations'
    ],
    typeSpeed: 80,
    backSpeed: 40,
    backDelay: 2000,
    loop: true
  });
}

// Initialize tsParticles for dynamic background
(async () => {
  await tsParticles.load("tsparticles", {
    fpsLimit: 60,
    fullScreen: { enable: false },
    particles: {
      number: { value: 120, density: { enable: true, area: 800 } },
      color: { value: ["#14ff00", "#00ffff", "#ff00ff"] },
      links: {
        enable: true,
        distance: 140,
        color: "#ffffff",
        opacity: 0.25,
        width: 1
      },
      move: {
        enable: true,
        speed: 3,
        direction: "none",
        random: false,
        straight: false,
        outMode: "out"
      },
      shape: { type: "circle" },
      opacity: { value: 0.5 },
      size: { value: 3 }
    },
    interactivity: {
      events: {
        onHover: { enable: true, mode: "repulse" },
        onClick: { enable: true, mode: "push" },
        resize: true
      },
      modes: {
        repulse: { distance: 100, duration: 0.4 },
        push: { quantity: 4 }
      }
    }
  });
})();

// Initialize AOS library
AOS.init({ once: true });

// Smooth scroll for nav links
const links = document.querySelectorAll('nav a[href^="#"]');
links.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelector(link.getAttribute('href')).scrollIntoView({ behavior: 'smooth' });
  });
});

// Update footer year
document.getElementById('year').textContent = new Date().getFullYear();

// Mobile nav toggle (auto-init if markup missing on legacy pages)
let navToggleBtn = document.getElementById('nav-toggle');
let navLinksList = document.getElementById('nav-links') || document.querySelector('.nav-links');

if (!navToggleBtn && navLinksList) {
  // Build toggle button on the fly (for pages without updated header)
  navToggleBtn = document.createElement('button');
  navToggleBtn.id = 'nav-toggle';
  navToggleBtn.className = 'nav-toggle';
  navToggleBtn.setAttribute('aria-label', 'Toggle navigation');
  navToggleBtn.innerHTML = '<i class="fas fa-bars"></i>';
  // Insert it before navLinksList’s parent (nav container)
  const navContainer = navLinksList.closest('.nav-container');
  if (navContainer) navContainer.insertBefore(navToggleBtn, navContainer.firstChild.nextSibling);
}

if (navToggleBtn && navLinksList) {
  // Remove residual 'open' class on fresh page load
  navLinksList.classList.remove('open');
  navToggleBtn.addEventListener('click', () => {
    navLinksList.classList.toggle('open');
  });
  // Close nav when a link is clicked (optional)
  navLinksList.querySelectorAll('a').forEach(link => link.addEventListener('click', () => navLinksList.classList.remove('open')));
}

// ----------------- Custom Animations & Interactions -----------------
if (typeof gsap !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
  // Reveal cards & tiles on scroll
  gsap.utils.toArray('.reason-card, .service-card, .portfolio-item, .testimonial-card').forEach((el, i) => {
    gsap.from(el, {
      y: 40,
      opacity: 0,
      duration: 0.6,
      delay: i * 0.05,
      scrollTrigger: {
        trigger: el,
        start: 'top 85%',
        toggleActions: 'play none none reverse'
      }
    });
  });
}

// Tilt hover effect
if (typeof VanillaTilt !== 'undefined') {
  VanillaTilt.init(document.querySelectorAll('.portfolio-item, .service-card, .reason-card'), {
    max: 15,
    speed: 450,
    glare: true,
    'max-glare': 0.25
  });
}

// Testimonials carousel
if (typeof Swiper !== 'undefined') {
  new Swiper('.testimonial-swiper', {
    loop: true,
    autoHeight: true,
    grabCursor: true,
    pagination: {
      el: '.swiper-pagination',
      clickable: true
    },
    autoplay: {
      delay: 5000,
      disableOnInteraction: false
    }
  });
}
// -------------------------------------------------------------------

// ----------- Utility: Lazy-load CDN assets if missing -----------
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}
function loadStyle(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  document.head.appendChild(l);
}

(async () => {
  // Ensure GSAP & ScrollTrigger
  if (typeof gsap === 'undefined') {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js');
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/ScrollTrigger.min.js');
  }
  // Ensure VanillaTilt
  if (typeof VanillaTilt === 'undefined') {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/vanilla-tilt/1.7.2/vanilla-tilt.min.js');
  }
  // Ensure Swiper
  if (typeof Swiper === 'undefined') {
    loadStyle('https://cdnjs.cloudflare.com/ajax/libs/Swiper/9.4.1/swiper-bundle.min.css');
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/Swiper/9.4.1/swiper-bundle.min.js');
  }
})();
// ----------------------------------------------------------------