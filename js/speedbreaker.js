// ===== SpeedBreaker page: the hero's background gameplay loop =====
// Page-only (speedbreaker/index.html). The still behind the hero's text is the
// page's picture; the <video> over it ships with no source. This script adds
// one, unless the visitor prefers reduced motion or is saving data, and fades
// the video in only once it is really playing. Autoplay being blocked, a file
// that won't play, or reduced motion all leave the still. The video pauses
// while the hero is off screen and resumes when it's back, unless the visitor
// paused it with the toggle.
(() => {
  'use strict';

  const hero = document.getElementById('sb-hero');
  const box = document.getElementById('sb-hero-media');
  if (!hero || !box) return;
  const video = box.querySelector('.sb-hero__video');
  const toggle = hero.querySelector('.sb-hero__toggle');
  if (!video || !toggle || typeof video.play !== 'function') return;

  const media = (query) => (window.matchMedia ? window.matchMedia(query) : null);
  const listen = (mq, fn) => {
    if (!mq) return;
    if (mq.addEventListener) mq.addEventListener('change', fn);
    else if (mq.addListener) mq.addListener(fn);
  };
  const reduceMotion = media('(prefers-reduced-motion: reduce)');
  const reduceData = media('(prefers-reduced-data: reduce)');
  const saveData = !!(navigator.connection && navigator.connection.saveData) ||
    !!(reduceData && reduceData.matches);
  const reduced = () => !!(reduceMotion && reduceMotion.matches);
  // Portrait or narrow screens get the portrait file. The same query as the
  // <picture>'s portrait <source>, the preload and the first query of the
  // scrim's rule in css/speedbreaker.css (which also covers phones held
  // sideways; they keep the 21:9 file), so the video always matches the
  // still under it.
  const portrait = media('(orientation: portrait), (max-width: 600px)');

  let source = null;       // the <source> this script added
  let failed = false;      // blocked or unplayable: the still stays for good
  let hasPlayed = false;   // the current file has shown at least one playing frame
  let userPaused = false;  // the visitor pressed pause
  let inView = false;

  // Which file. Portrait: the portrait file (720x960). Otherwise the 21:9
  // 1280 file when the picture it draws is up to 1440 device pixels wide, or
  // on a phone-sized screen (short side up to 600 CSS px, so phones in
  // landscape too); anything bigger gets the 2400 file. The picture covers
  // the hero box, so it is as wide as the box or, on a box narrower than
  // 21:9, as wide as the box's height at 21:9 (a 1366x788 box draws it 1840
  // px wide). That is the same width the <img>'s sizes asks for, so the
  // video is as sharp as the still it fades in over.
  function pickFile() {
    if (portrait && portrait.matches) return video.dataset.srcPortrait;
    const rect = box.getBoundingClientRect();
    const drawn = Math.max(rect.width, rect.height * 2400 / 1028) * (window.devicePixelRatio || 1);
    const shortSide = Math.min(window.screen.width || Infinity, window.screen.height || Infinity);
    return (drawn <= 1440 || shortSide <= 600) ? video.dataset.srcSmall : video.dataset.srcLarge;
  }

  function setToggle(paused) {
    toggle.classList.toggle('is-paused', paused);
    toggle.setAttribute('aria-label', paused ? 'Play video' : 'Pause video');
  }

  function showStill() {
    box.classList.remove('is-video');
    toggle.hidden = true;
  }

  function showVideo() {
    box.classList.add('is-video');
    toggle.hidden = false;
  }

  // Leave the still and stop any download in progress.
  function giveUp() {
    failed = true;
    showStill();
    video.pause();
    if (source) {
      source.remove();
      source = null;
      video.load();
    }
  }

  function play() {
    const attempt = video.play();
    if (attempt && typeof attempt.catch === 'function') {
      attempt.catch((err) => {
        // A pause() or a new load() interrupting play() is not a failure.
        if (err && err.name === 'AbortError') return;
        giveUp(); // NotAllowedError (autoplay blocked), NotSupportedError...
      });
    }
  }

  function start() {
    if (failed || saveData || reduced()) return;
    if (!source) {
      // No poster: the video stays invisible until it plays, so the still
      // underneath is all anyone sees before then.
      video.muted = true;
      source = document.createElement('source');
      source.type = 'video/mp4';
      source.src = pickFile();
      // With <source> children, a file that can't load reports here, not on the video.
      source.addEventListener('error', giveUp);
      video.appendChild(source);
      video.load();
    }
    if (inView && !userPaused && video.paused) play();
  }

  video.addEventListener('playing', () => {
    if (failed) return;
    if (reduced()) {
      video.pause();
      showStill();
      return;
    }
    hasPlayed = true;
    setToggle(false);
    showVideo();
  });

  video.addEventListener('error', giveUp);

  // Pausing keeps the paused frame on screen (not the still).
  toggle.addEventListener('click', () => {
    userPaused = !userPaused;
    setToggle(userPaused);
    if (userPaused) video.pause();
    else play();
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      inView = entries[entries.length - 1].isIntersecting;
      if (inView) start();
      else if (source && !video.paused) video.pause();
    }).observe(box);
  } else {
    inView = true;
    start();
  }

  // A phone turned sideways (or a window dragged across the line) swaps the
  // still by itself; swap the video's file to match. The matching still shows
  // until the new file plays. A visitor's pause holds: the toggle stays, and
  // pressing play starts the new file.
  listen(portrait, () => {
    if (!source || failed) return;
    const next = pickFile();
    if (source.getAttribute('src') === next) return;
    hasPlayed = false;
    box.classList.remove('is-video');
    source.src = next;
    video.load();
    if (inView && !userPaused && !reduced()) play();
  });

  // Reduced motion switched on mid-play: pause and go back to the still.
  // Switched off again: carry on as before (a visitor's pause still holds).
  listen(reduceMotion, () => {
    if (reduced()) {
      if (source) video.pause();
      showStill();
      return;
    }
    if (failed) return; // gave up earlier: the still stays for good
    if (userPaused && source) {
      toggle.hidden = false;
      if (hasPlayed) box.classList.add('is-video');
    } else {
      start();
    }
  });

  // Some browsers pause inline video in a background tab and don't resume it.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !failed && hasPlayed && inView && !userPaused && !reduced() && video.paused) {
      play();
    }
  });
})();
