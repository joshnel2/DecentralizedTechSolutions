
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