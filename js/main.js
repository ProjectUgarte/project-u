// ===== Navigation Scroll Effect =====
const nav = document.getElementById('nav');
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');

window.addEventListener('scroll', () => {
  nav.classList.toggle('nav--scrolled', window.scrollY > 20);
});

// ===== Mobile Menu Toggle =====
navToggle.addEventListener('click', () => {
  navToggle.classList.toggle('nav__toggle--active');
  navLinks.classList.toggle('nav__links--open');
});

// Close mobile menu on link click
navLinks.querySelectorAll('.nav__link').forEach(link => {
  link.addEventListener('click', () => {
    navToggle.classList.remove('nav__toggle--active');
    navLinks.classList.remove('nav__links--open');
  });
});

// ===== Active Nav Link Tracking =====
const sections = document.querySelectorAll('section[id], footer[id]');
const navLinkEls = document.querySelectorAll('.nav__link');

const observerNav = new IntersectionObserver(
  (entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');
        navLinkEls.forEach(link => {
          link.classList.toggle(
            'nav__link--active',
            link.getAttribute('href') === `#${id}`
          );
        });
      }
    });
  },
  { rootMargin: '-40% 0px -60% 0px' }
);

sections.forEach(section => observerNav.observe(section));

// ===== Fade-in on Scroll =====
const fadeEls = document.querySelectorAll('.fade-in');

const observerFade = new IntersectionObserver(
  (entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('fade-in--visible');
        observerFade.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.15 }
);

fadeEls.forEach(el => observerFade.observe(el));

// ===== Hero Artwork Reveal =====
(() => {
  const canvas = document.getElementById('heroRevealCanvas');
  const hero = document.getElementById('hero');
  if (!canvas || !hero) return;

  const ctx = canvas.getContext('2d');
  let width, height;
  let isHovering = false;
  let fadeTimer = null;
  let animFrame = null;

  // Brush settings
  const BRUSH_RADIUS = 80;
  const FADE_DELAY = 300;    // ms after mouse stops before fade begins
  const FADE_SPEED = 0.02;   // alpha increment per frame (slower = gentler)

  // Track revealed spots for fade-back
  let revealAlpha = 0; // global canvas opacity for fade-back

  function resize() {
    const rect = hero.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    canvas.width = width;
    canvas.height = height;
    fillWhite();
  }

  function fillWhite() {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(250, 250, 250, 1)`;
    ctx.fillRect(0, 0, width, height);
  }

  function reveal(x, y) {
    ctx.globalCompositeOperation = 'destination-out';

    // Soft circular brush with radial gradient
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, BRUSH_RADIUS);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.6)');
    gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.3)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, BRUSH_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }

  function startFadeBack() {
    if (animFrame) return;

    function fade() {
      // Gradually paint white back over the canvas
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgba(250, 250, 250, ${FADE_SPEED})`;
      ctx.fillRect(0, 0, width, height);

      animFrame = requestAnimationFrame(fade);
    }
    animFrame = requestAnimationFrame(fade);
  }

  function stopFadeBack() {
    if (animFrame) {
      cancelAnimationFrame(animFrame);
      animFrame = null;
    }
  }

  // Mouse events
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    stopFadeBack();
    clearTimeout(fadeTimer);
    reveal(x, y);

    fadeTimer = setTimeout(() => {
      startFadeBack();
    }, FADE_DELAY);
  });

  canvas.addEventListener('mouseenter', () => {
    isHovering = true;
    stopFadeBack();
  });

  canvas.addEventListener('mouseleave', () => {
    isHovering = false;
    clearTimeout(fadeTimer);
    startFadeBack();
  });

  // Click to scroll to artwork
  canvas.addEventListener('click', (e) => {
    // Don't intercept clicks on hero content (buttons, links)
    const artwork = document.getElementById('artwork');
    if (artwork) {
      artwork.scrollIntoView({ behavior: 'smooth' });
    }
  });

  // Init
  resize();
  window.addEventListener('resize', resize);
})();

// ===== Lightbox =====
const lightbox = document.getElementById('lightbox');
const lightboxContent = document.getElementById('lightboxContent');
const lightboxClose = document.getElementById('lightboxClose');

document.querySelectorAll('[data-lightbox]').forEach(item => {
  item.addEventListener('click', () => {
    const img = item.querySelector('img');
    if (img) {
      lightboxContent.innerHTML = `<img src="${img.src}" alt="${img.alt || ''}">`;
      lightbox.classList.add('lightbox--open');
      document.body.style.overflow = 'hidden';
    }
  });
});

function closeLightbox() {
  lightbox.classList.remove('lightbox--open');
  document.body.style.overflow = '';
}

lightboxClose.addEventListener('click', closeLightbox);
lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) closeLightbox();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeLightbox();
});
