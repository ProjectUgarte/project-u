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
  let fadeTimer = null;
  let animFrame = null;
  let fadeFrameCount = 0;

  // Brush settings
  const BRUSH_MAX = 60;       // max brush radius
  const BRUSH_MIN = 12;       // min brush radius (tapered tail)
  const BRISTLE_COUNT = 6;    // extra bristle dabs per stroke
  const BRISTLE_SPREAD = 0.7; // how far bristles spread (fraction of radius)
  const FADE_DELAY = 200;     // ms after mouse stops before fade begins
  const FADE_SPEED = 0.04;    // alpha per frame for fade-back
  const FADE_FULL_AFTER = 120; // frames before snapping to full white

  // Mouse tracking for speed-based tapering
  let lastX = null;
  let lastY = null;
  let lastTime = 0;
  let velocity = 0;

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
    ctx.fillStyle = 'rgba(250, 250, 250, 1)';
    ctx.fillRect(0, 0, width, height);
  }

  // Paint a single solid bristle dab (hard edge, no gradient)
  function dab(x, y, radius) {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(radius, 2), 0, Math.PI * 2);
    ctx.fill();
  }

  function reveal(x, y) {
    const now = performance.now();
    const dt = lastTime ? now - lastTime : 16;
    lastTime = now;

    // Calculate velocity (pixels per frame)
    if (lastX !== null) {
      const dx = x - lastX;
      const dy = y - lastY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      velocity = velocity * 0.5 + (dist / Math.max(dt, 1)) * 16 * 0.5; // smoothed
    }

    // Brush radius: faster = bigger, slower = smaller (taper)
    const speed = Math.min(velocity, 40);
    const t = speed / 40; // 0 to 1
    const brushRadius = BRUSH_MIN + (BRUSH_MAX - BRUSH_MIN) * t;

    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0, 0, 0, 1)'; // solid, hard edge

    // Main dab
    dab(x, y, brushRadius);

    // Bristle dabs — scattered around main point for paintery feel
    for (let i = 0; i < BRISTLE_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * brushRadius * BRISTLE_SPREAD;
      const bx = x + Math.cos(angle) * dist;
      const by = y + Math.sin(angle) * dist;
      const bristleR = brushRadius * (0.2 + Math.random() * 0.4);
      dab(bx, by, bristleR);
    }

    // Interpolate between last point and current to fill gaps
    if (lastX !== null) {
      const dx = x - lastX;
      const dy = y - lastY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const step = Math.max(brushRadius * 0.3, 4);
      const steps = Math.floor(dist / step);
      for (let i = 1; i < steps; i++) {
        const frac = i / steps;
        const ix = lastX + dx * frac;
        const iy = lastY + dy * frac;
        // Taper along the interpolated stroke
        const interpR = brushRadius * (1 - frac * 0.3);
        dab(ix, iy, interpR);
        // A couple bristles along the stroke
        for (let b = 0; b < 2; b++) {
          const angle = Math.random() * Math.PI * 2;
          const bd = Math.random() * interpR * BRISTLE_SPREAD;
          dab(ix + Math.cos(angle) * bd, iy + Math.sin(angle) * bd, interpR * 0.3);
        }
      }
    }

    lastX = x;
    lastY = y;
  }

  function startFadeBack() {
    if (animFrame) return;
    fadeFrameCount = 0;

    function fade() {
      fadeFrameCount++;

      // Accelerate fade over time — starts gentle, gets stronger
      const progress = fadeFrameCount / FADE_FULL_AFTER;
      const alpha = FADE_SPEED + progress * progress * 0.15;

      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgba(250, 250, 250, ${Math.min(alpha, 1)})`;
      ctx.fillRect(0, 0, width, height);

      // By this point the alpha is so high the snap is invisible
      if (fadeFrameCount >= FADE_FULL_AFTER) {
        fillWhite();
        cancelAnimationFrame(animFrame);
        animFrame = null;
        return;
      }

      animFrame = requestAnimationFrame(fade);
    }
    animFrame = requestAnimationFrame(fade);
  }

  function stopFadeBack() {
    if (animFrame) {
      cancelAnimationFrame(animFrame);
      animFrame = null;
    }
    fadeFrameCount = 0;
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
    stopFadeBack();
    lastX = null;
    lastY = null;
    velocity = 0;
  });

  canvas.addEventListener('mouseleave', () => {
    lastX = null;
    lastY = null;
    velocity = 0;
    clearTimeout(fadeTimer);
    startFadeBack();
  });

  // Click to scroll to artwork
  canvas.addEventListener('click', () => {
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
