
// Initialize Typed.js only if library and target element are available
if (window.Typed && document.querySelector('#typed')) {
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
if (window.tsParticles) {
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
}

// Initialize AOS if available
if (window.AOS) {
  AOS.init({ once: true });
}

// Smooth scroll for nav links
const links = document.querySelectorAll('nav a[href^="#"]');
links.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelector(link.getAttribute('href')).scrollIntoView({ behavior: 'smooth' });
  });
});

// Mobile nav toggle
const menuToggle = document.querySelector('.menu-toggle');
const navLinksContainer = document.querySelector('.nav-links');
if (menuToggle && navLinksContainer) {
  menuToggle.addEventListener('click', () => {
    navLinksContainer.classList.toggle('open');
    menuToggle.classList.toggle('active');
  });
}

// Update footer year
document.getElementById('year').textContent = new Date().getFullYear();

// Utility to lazy-load external scripts
function loadScript(url) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// Enhance interactions & reveal animations
(async () => {
  // Respect reduced-motion user preference
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;

  // Dynamically load GSAP + ScrollTrigger if not already present
  if (!window.gsap) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js');
  }
  if (!window.ScrollTrigger) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/ScrollTrigger.min.js');
  }
  if (!window.gsap) return; // bail safely

  gsap.registerPlugin(window.ScrollTrigger ?? {});

  // Hero parallax entrance
  const heroHeading = document.querySelector('.company-name');
  if (heroHeading) {
    gsap.from(heroHeading, { y: 80, opacity: 0, duration: 1.1, ease: 'power3.out' });
  }

  // Generic reveal for section titles
  gsap.utils.toArray('.section-title').forEach((title) => {
    gsap.from(title, {
      y: 40,
      opacity: 0,
      duration: 0.8,
      ease: 'power3.out',
      scrollTrigger: { trigger: title, start: 'top 85%' }
    });
  });

  // Staggered cards animation
  gsap.utils.toArray('.service-card, .reason-card').forEach((card) => {
    gsap.from(card, {
      y: 30,
      opacity: 0,
      duration: 0.6,
      ease: 'power2.out',
      scrollTrigger: { trigger: card, start: 'top 90%' }
    });
  });

  // Button ripple via GSAP scale effect (collaborates with existing ::after)
  gsap.utils.toArray('.btn-primary').forEach((btn) => {
    btn.addEventListener('mouseenter', () => gsap.to(btn, { scale: 1.03, duration: 0.2, ease: 'power1.out' }));
    btn.addEventListener('mouseleave', () => gsap.to(btn, { scale: 1, duration: 0.2, ease: 'power1.out' }));
  });

  // Success metrics counting animation
  const counters = document.querySelectorAll('.metric-number');
  counters.forEach((counter) => {
    const updateCount = () => {
      const target = +counter.dataset.count;
      const current = +counter.innerText.replace(/[^0-9]/g, '') || 0;
      const increment = Math.ceil(target / 60);
      if (current < target) {
        counter.innerText = current + increment;
        requestAnimationFrame(updateCount);
      } else {
        counter.innerText = target;
      }
    };
    ScrollTrigger.create({
      trigger: counter,
      start: 'top 85%',
      once: true,
      onEnter: updateCount
    });
  });
})();