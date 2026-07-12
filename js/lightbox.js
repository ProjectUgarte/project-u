// ===== Shared Lightbox =====
// Used by the homepage artwork gallery ([data-lightbox]) and the app pages'
// screenshot rows ([data-lightbox-app]). One implementation, three pages.
(() => {
  const lightbox = document.getElementById('lightbox');
  const lightboxContent = document.getElementById('lightboxContent');
  const lightboxClose = document.getElementById('lightboxClose');
  const lightboxPrev = document.getElementById('lightboxPrev');
  const lightboxNext = document.getElementById('lightboxNext');
  if (!lightbox || !lightboxContent || !lightboxClose) return;

  const items = document.querySelectorAll('[data-lightbox], [data-lightbox-app]');
  if (!items.length) return;

  let currentIndex = 0;
  let opener = null; // element to restore focus to on close

  function showImage(index) {
    currentIndex = index;
    const img = items[index].querySelector('img');
    if (img) {
      lightboxContent.innerHTML = `<img src="${img.src}" alt="${img.alt || ''}">`;
      lightbox.classList.add('lightbox--open');
      document.body.style.overflow = 'hidden';
      lightboxClose.focus();
    }
  }

  function navigate(direction) {
    let newIndex = currentIndex + direction;
    if (newIndex < 0) newIndex = items.length - 1;
    if (newIndex >= items.length) newIndex = 0;
    showImage(newIndex);
  }

  function closeLightbox() {
    lightbox.classList.remove('lightbox--open');
    document.body.style.overflow = '';
    if (opener) {
      opener.focus();
      opener = null;
    }
  }

  items.forEach((item, index) => {
    // Keyboard semantics added via JS so role="button" only exists when
    // the lightbox actually works
    const alt = item.querySelector('img')?.alt || 'image';
    item.setAttribute('tabindex', '0');
    item.setAttribute('role', 'button');
    item.setAttribute('aria-label', `View ${alt} fullscreen`);

    item.addEventListener('click', () => {
      opener = item;
      showImage(index);
    });
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        opener = item;
        showImage(index);
      }
    });
  });

  lightboxClose.addEventListener('click', closeLightbox);
  lightboxPrev.addEventListener('click', (e) => {
    e.stopPropagation();
    navigate(-1);
  });
  lightboxNext.addEventListener('click', (e) => {
    e.stopPropagation();
    navigate(1);
  });
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
  });
  document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('lightbox--open')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') navigate(-1);
    if (e.key === 'ArrowRight') navigate(1);
  });
})();
