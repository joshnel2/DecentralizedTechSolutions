
// Initialize Typed.js for animated tagline
const typed = new Typed('#typed', {
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

// ---- GSAP Animations (dynamic loader) ----
(function () {
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

  function initAnimations() {
    const { gsap } = window;
    if (!gsap) return;
    if (window.ScrollTrigger && gsap.registerPlugin) {
      gsap.registerPlugin(window.ScrollTrigger);
    }

    // Hero heading entrance
    gsap.from('.company-name', { y: 60, opacity: 0, duration: 1, ease: 'power3.out' });

    // Staggered card reveal animation
    gsap.utils.toArray('.service-card, .reason-card').forEach((card, i) => {
      gsap.from(card, {
        y: 40,
        opacity: 0,
        delay: i * 0.05,
        duration: 0.8,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: card,
          start: 'top 85%'
        }
      });
    });

    // Optional 3D tilt interaction if VanillaTilt is present
    if (window.VanillaTilt) {
      VanillaTilt.init(document.querySelectorAll('.service-card, .reason-card'), {
        max: 15,
        speed: 400,
        glare: true,
        'max-glare': 0.2
      });
    }
  }

  (async () => {
    try {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js');
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/ScrollTrigger.min.js');
      initAnimations();
    } catch (err) {
      console.warn('GSAP failed to load', err);
    }
  })();
})();