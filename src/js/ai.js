import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { loadFull } from 'tsparticles';
import Swiper, { Navigation, Pagination } from 'swiper';

// Register GSAP plugin
gsap.registerPlugin(ScrollTrigger);

// --- Particles ---
loadFull().then(({ tsParticles }) => {
  tsParticles.load('tsparticles', {
    fpsLimit: 60,
    particles: {
      number: { value: 120, density: { enable: true, area: 800 } },
      color: { value: ['#14ff00', '#00ffff'] },
      shape: { type: 'polygon', polygon: { nb_sides: 6 } },
      opacity: { value: 0.6 },
      size: { value: 4 },
      links: { enable: false },
      move: { enable: true, speed: 2, outMode: 'out' }
    }
  });
});

// --- R&D Timeline animation ---
const steps = document.querySelectorAll('.timeline-step');
steps.forEach((step, index) => {
  gsap.fromTo(step, { opacity: 0, y: 50 }, {
    opacity: 1,
    y: 0,
    scrollTrigger: {
      trigger: step,
      start: 'top 80%',
      toggleActions: 'play none none reverse'
    },
    delay: index * 0.1
  });
});

// --- Swiper carousel ---
Swiper.use([Navigation, Pagination]);
new Swiper('.model-swiper', {
  slidesPerView: 1,
  spaceBetween: 20,
  loop: true,
  pagination: { el: '.swiper-pagination', clickable: true },
  navigation: {
    nextEl: '.swiper-button-next',
    prevEl: '.swiper-button-prev'
  }
});