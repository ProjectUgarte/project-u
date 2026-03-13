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

  // Brush settings — tweak these to taste
  const BRUSH_HEAD = 70;        // radius at the cursor (big)
  const BRUSH_TAIL = 8;         // radius at the end of the trail (small)
  const SPLATTER_COUNT = 5;     // random splatters per stroke
  const SPLATTER_RANGE = 1.8;   // how far splatters fly (multiplier of brush radius)
  const TRAIL_FADE = 0.045;     // how fast the trail fades back per frame (higher = faster)
  const TRAIL_SNAP_AFTER = 80;  // frames of fade before snapping to full white

  // State
  let lastX = null;
  let lastY = null;
  let isMouseInHero = false;
  let animFrame = null;
  let fadeFrameCount = 0;

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

  // Solid dab — hard edge circle
  function dab(x, y, radius) {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(radius, 1), 0, Math.PI * 2);
    ctx.fill();
  }

  function reveal(x, y) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0, 0, 0, 1)';

    // Big dab at cursor position
    dab(x, y, BRUSH_HEAD);

    // Interpolate from cursor back to last point with tapering trail
    if (lastX !== null) {
      const dx = x - lastX;
      const dy = y - lastY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const step = Math.max(BRUSH_TAIL, 4);
      const steps = Math.ceil(dist / step);

      for (let i = 1; i <= steps; i++) {
        const frac = i / steps; // 0 = cursor, 1 = tail (last point)
        const ix = x - dx * frac;
        const iy = y - dy * frac;

        // Taper: big at cursor, small at tail
        const t = frac;
        const r = BRUSH_HEAD * (1 - t) + BRUSH_TAIL * t;
        dab(ix, iy, r);
      }

      // Splatters — flung out from the stroke direction
      const strokeAngle = Math.atan2(dy, dx);
      for (let i = 0; i < SPLATTER_COUNT; i++) {
        // Splatters fly perpendicular-ish to the stroke
        const spreadAngle = strokeAngle + (Math.PI / 2) * (Math.random() * 2 - 1);
        const spreadDist = BRUSH_HEAD * (0.5 + Math.random() * SPLATTER_RANGE);
        const sx = x + Math.cos(spreadAngle) * spreadDist;
        const sy = y + Math.sin(spreadAngle) * spreadDist;
        const sr = 2 + Math.random() * (BRUSH_HEAD * 0.2);
        dab(sx, sy, sr);
      }

      // Extra drip splatters scattered along the stroke
      for (let i = 0; i < 3; i++) {
        const frac = Math.random();
        const ix = x - dx * frac;
        const iy = y - dy * frac;
        const angle = Math.random() * Math.PI * 2;
        const d = BRUSH_HEAD * (0.6 + Math.random() * 0.8);
        dab(ix + Math.cos(angle) * d, iy + Math.sin(angle) * d, 1 + Math.random() * 4);
      }
    }

    lastX = x;
    lastY = y;
  }

  // Continuous fade-back loop — always running, creates the "comet tail" effect
  function fadeLoop() {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(250, 250, 250, ${TRAIL_FADE})`;
    ctx.fillRect(0, 0, width, height);

    // If mouse is gone, count frames and eventually snap to full white
    if (!isMouseInHero) {
      fadeFrameCount++;
      if (fadeFrameCount >= TRAIL_SNAP_AFTER) {
        fillWhite();
        // Stop the loop when fully white and mouse is gone
        animFrame = null;
        return;
      }
    } else {
      fadeFrameCount = 0;
    }

    animFrame = requestAnimationFrame(fadeLoop);
  }

  function ensureFadeLoop() {
    if (!animFrame) {
      animFrame = requestAnimationFrame(fadeLoop);
    }
  }

  // Mouse events
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    reveal(x, y);
    ensureFadeLoop();
  });

  canvas.addEventListener('mouseenter', () => {
    isMouseInHero = true;
    lastX = null;
    lastY = null;
    fadeFrameCount = 0;
    ensureFadeLoop();
  });

  canvas.addEventListener('mouseleave', () => {
    isMouseInHero = false;
    lastX = null;
    lastY = null;
    ensureFadeLoop();
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
