
// Initialize Typed.js for animated tagline
const typed = new Typed('#typed', {
  strings: [
    'AI Integrations',
    'Smart Contracts',
    'World-class Websites',
    'Data Hosting & Infrastructure'
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
      number: { value: 80, density: { enable: true, area: 800 } },
      color: { value: "#00ffaa" },
      links: {
        enable: true,
        distance: 150,
        color: "#00ffaa",
        opacity: 0.4,
        width: 1
      },
      move: {
        enable: true,
        speed: 2,
        direction: "none",
        random: false,
        straight: false,
        outMode: "out"
      },
      shape: { type: "circle" },
      opacity: { value: 0.4 },
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