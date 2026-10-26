// ===== SpeedBreaker page =====
// Page-only (speedbreaker/index.html, and speedbreaker/carbon/index.html,
// which tools/build_carbon_page.py generates from it). Three parts:
// 1. each hero layer's background gameplay loop;
// 2. the download count, per game;
// 3. the switch between the two games (2026-10-26): the hero's corner blade,
//    the address, the page's accent.
// <html data-game="mw|carbon"> is the game shown. Part 3 changes it and
// tells the others with an "sb:game" event on document:
// detail.phase "start" as a switch begins, "end" once it has settled.

// ===== 1. The hero's background gameplay loop =====
// Each game's hero layer holds a still (its picture) and a <video> with no
// source. This adds one, while that game is the one shown, unless the
// visitor prefers reduced motion or is saving data, and fades the video in
// only once it is really playing. Autoplay being blocked, a file that won't
// play, or reduced motion all leave the still. The video pauses while the
// hero is off screen and resumes when it's back, unless the visitor paused
// it with the toggle, and pauses when a switch to the other game settles.
// A <video> without data-src-* (Carbon's, until its loop is recorded) is
// left alone.
(() => {
  'use strict';

  const root = document.documentElement;
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

  document.querySelectorAll('#sb-hero .sb-hero__layer').forEach((layer) => {
    const box = layer.querySelector('.sb-hero__media');
    const video = box && box.querySelector('.sb-hero__video');
    const toggle = layer.querySelector('.sb-hero__toggle');
    if (!video || !toggle || typeof video.play !== 'function') return;
    if (!video.dataset.srcSmall) return; // no loop for this game yet

    const game = layer.dataset.gameLayer;
    let shown = root.dataset.game === game; // this game is the one on screen
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
      if (!shown || failed || saveData || reduced()) return;
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
      if (reduced() || !shown) {
        video.pause();
        if (reduced()) showStill();
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

    // A switch to this game starts the loop as the sweep begins, so it is
    // already running under the blade as it crosses; a switch away pauses it
    // once the other game covers it (its last frame stays in the corner).
    document.addEventListener('sb:game', (e) => {
      const d = e.detail || {};
      if (d.phase === 'start' && d.game === game) {
        shown = true;
        start();
      } else if (d.phase === 'end' && d.game !== game) {
        shown = false;
        if (source && !video.paused) video.pause();
      }
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
      if (shown && inView && !userPaused && !reduced()) play();
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
      if (document.visibilityState === 'visible' && shown && !failed && hasPlayed && inView && !userPaused && !reduced() && video.paused) {
        play();
      }
    });
  });
})();

// ===== 2. The download count, per game =====
// Every release file on GitHub, checksum files left out, rounded down to the
// hundred ("Downloaded over 7,100 times"). Each game reads its own
// repository, and only once that game is shown, so a visit to one game's page
// spends one of GitHub's 60 hourly anonymous requests, not two. Most Wanted's
// page text stands if GitHub can't be reached (and below 1,000). Carbon's line
// is empty and hidden: it shows, with its band, only once its repository has
// releases with at least 100 downloads (a 404 before the repository is public,
// an empty list before the first release, or any failure keep it hidden).
(() => {
  'use strict';
  if (!window.fetch) return;
  const root = document.documentElement;
  const games = {
    mw: { repo: 'SpeedBreakerProject/speedbreaker', id: 'sb-downloads', min: 1000 },
    carbon: { repo: 'SpeedBreakerProject/speedbreaker-carbon', id: 'sb-downloads-carbon', min: 100 },
  };
  const asked = {};

  function count(game) {
    const g = games[game];
    const el = g && document.getElementById(g.id);
    if (!el || asked[game]) return;
    asked[game] = true;
    fetch(`https://api.github.com/repos/${g.repo}/releases?per_page=100`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((releases) => {
        let total = 0;
        for (const rel of releases) {
          for (const a of rel.assets || []) {
            if (!/\.sha256$/.test(a.name)) total += a.download_count || 0;
          }
        }
        if (total >= g.min) {
          const shown = Math.floor(total / 100) * 100;
          el.textContent = `Downloaded over ${shown.toLocaleString('en-US')} times`;
          el.hidden = false;
          const band = el.closest('.sb-downloads-band');
          if (band) band.classList.add('has-count');
        }
      })
      .catch(() => {});
  }

  count(root.dataset.game);
  document.addEventListener('sb:game', (e) => {
    if (e.detail && e.detail.phase === 'start') count(e.detail.game);
  });
})();

// ===== 3. The switch between the two games =====
// Each game's address is a real page (/speedbreaker/ and /speedbreaker/carbon/),
// and the blade and the bridge cards are plain links to the other one, so
// without this script, or opened in a new tab, they simply go there. Here a
// plain click (or Enter, or Space on the blade) switches in place instead:
// the blade sweeps across the hero (a 300 ms cross-fade under reduced
// motion), <html data-game> flips at the start so the accent cross-fades with
// it, and history.pushState moves the address; Back and Forward (popstate)
// run the same switch. Each switch is a page_view for Analytics.
(() => {
  'use strict';

  const root = document.documentElement;
  const hero = document.getElementById('sb-hero');
  const blade = document.getElementById('sb-blade');
  if (!hero || !blade || !window.history || typeof history.pushState !== 'function') return;
  const layers = {
    mw: hero.querySelector('[data-game-layer="mw"]'),
    carbon: hero.querySelector('[data-game-layer="carbon"]'),
  };
  const label = blade.querySelector('.sb-blade__name');
  if (!layers.mw || !layers.carbon || !label) return;

  const paths = { mw: '/speedbreaker/', carbon: '/speedbreaker/carbon/' };
  const titles = { mw: 'SpeedBreaker — project(u)', carbon: 'SpeedBreaker: Carbon — project(u)' };
  const names = { mw: 'SpeedBreaker', carbon: 'SpeedBreaker:\nCarbon' }; // the blade's label (pre-line: Carbon stacks under)
  const full = { mw: 'SpeedBreaker', carbon: 'SpeedBreaker: Carbon' }; // its accessible name
  const reduceMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduced = () => !!(reduceMotion && reduceMotion.matches);
  const other = (g) => (g === 'mw' ? 'carbon' : 'mw');
  const gameAt = (path) => (/\/speedbreaker\/carbon(\/(index\.html)?)?$/.test(path) ? 'carbon' : 'mw');

  let game = root.dataset.game === 'carbon' ? 'carbon' : 'mw';
  let busy = false;
  let pending = null; // a Back/Forward that arrived mid-sweep

  const emit = (g, phase) => document.dispatchEvent(new CustomEvent('sb:game', { detail: { game: g, phase } }));

  // Only the game shown is reachable: the other layer is inert and hidden
  // from screen readers (the blade's own link names it instead).
  function setReachable(layer, on) {
    layer.toggleAttribute('inert', !on);
    if (on) layer.removeAttribute('aria-hidden');
    else layer.setAttribute('aria-hidden', 'true');
  }

  function setShown(layer, isShown) {
    layer.classList.toggle('is-base', isShown);
    layer.classList.toggle('is-blade', !isShown);
    setReachable(layer, isShown);
  }

  // g is shown; the other waits in the corner, and the blade points at it.
  function settle(g) {
    game = g;
    hero.dataset.blade = other(g);
    setShown(layers[g], true);
    setShown(layers[other(g)], false);
    label.textContent = names[other(g)];
    blade.setAttribute('href', paths[other(g)]);
    blade.setAttribute('aria-label', `Switch to ${full[other(g)]}`);
  }

  // The blade's picture starts small (sizes="400px": only its corner shows);
  // its real sizes come back here, on hover or focus, or once the page is
  // idle, so the full picture is in by the time it sweeps across.
  function upgrade(layer) {
    layer.querySelectorAll('[data-sizes]').forEach((el) => {
      el.setAttribute('sizes', el.dataset.sizes);
      el.removeAttribute('data-sizes');
    });
  }

  function pageView() {
    if (typeof window.gtag !== 'function') return;
    window.gtag('event', 'page_view', {
      page_title: document.title,
      page_location: location.href,
      page_path: location.pathname,
    });
  }

  function go(g, push, focusTitle) {
    if (busy) {
      pending = g;
      return;
    }
    if (g === game) return;
    busy = true;
    upgrade(layers[g]);
    // The sweep's legs: long enough that the triangle, at the blade's own
    // angle (0.7), clears the hero's lower left corner 64% of the way
    // through, as the prototype's 4200px did on the operator's 1512px screen.
    const rect = hero.getBoundingClientRect();
    const nav = parseFloat(getComputedStyle(root).getPropertyValue('--nav-height')) || 72;
    const legs = 1.56 * (rect.width + Math.max(0, rect.height - nav) / 0.7);
    hero.style.setProperty('--sb-sweep-w', `${Math.ceil(legs)}px`);
    hero.classList.remove('is-peek');
    hero.classList.add('is-sweeping');
    root.classList.add('sb-switched');
    root.dataset.game = g; // the accent starts its cross-fade with the sweep
    setReachable(layers[game], false);
    setReachable(layers[g], true);
    if (push) history.pushState({ sbGame: g }, '', paths[g] + location.search);
    document.title = titles[g];
    pageView();
    emit(g, 'start');

    setTimeout(() => {
      // Swap roles without animating, the new blade closed into the corner
      // (is-arriving); then let it grow out of the corner and its label fade in.
      hero.classList.add('sb-noanim', 'is-arriving');
      hero.classList.remove('is-sweeping');
      settle(g);
      void hero.offsetWidth;
      hero.classList.remove('sb-noanim');
      requestAnimationFrame(() => requestAnimationFrame(() => hero.classList.remove('is-arriving')));
      hero.style.removeProperty('--sb-sweep-w');
      busy = false;
      emit(g, 'end');
      // The blade that was pressed now points the other way; put focus where
      // the new game's page starts.
      if (focusTitle) {
        const title = layers[g].querySelector('.sb-hero__title');
        if (title) title.focus({ preventScroll: true });
      }
      if (pending) {
        const next = pending;
        pending = null;
        go(next, false, false);
      }
    }, reduced() ? 320 : 950);
  }

  // A plain left click only: a modified click (new tab or window) or a middle
  // click keeps the link's own behaviour.
  const plain = (e) => !(e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey);

  blade.addEventListener('click', (e) => {
    if (!plain(e)) return;
    e.preventDefault();
    go(other(game), true, true);
  });
  // A link answers Enter by itself (a click); Space is a button's key, and
  // the blade acts like one.
  blade.addEventListener('keydown', (e) => {
    if (e.key !== ' ' && e.key !== 'Spacebar') return;
    e.preventDefault();
    go(other(game), true, true);
  });

  // Hover (a mouse, not a tap) and keyboard focus open the blade a little
  // and fetch its full picture.
  blade.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return;
    upgrade(layers[other(game)]);
    if (!busy) hero.classList.add('is-peek');
  });
  blade.addEventListener('pointerleave', () => hero.classList.remove('is-peek'));
  blade.addEventListener('focus', () => {
    upgrade(layers[other(game)]);
    let keyboard = true;
    try { keyboard = blade.matches(':focus-visible'); } catch (err) { /* older browsers */ }
    if (!busy && keyboard) hero.classList.add('is-peek');
  });
  blade.addEventListener('blur', () => hero.classList.remove('is-peek'));

  // The bridge cards near the bottom: back to the top first, then the sweep,
  // so the switch is seen.
  function toTop(then) {
    if (window.scrollY <= 1) {
      then();
      return;
    }
    let finished = false;
    let timer = 0;
    const onScroll = () => {
      if (window.scrollY <= 1) finish();
    };
    function finish() {
      if (finished) return;
      finished = true;
      window.removeEventListener('scroll', onScroll);
      clearTimeout(timer);
      then();
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    // A long page (a phone's) can take longer than this to scroll smoothly, and
    // a visitor can scroll against it: then snap the rest of the way, and sweep
    // only once the hero is on screen (two frames after the jump), so the
    // sweep is always seen.
    timer = setTimeout(() => {
      if (window.scrollY > 1) window.scrollTo({ top: 0, behavior: 'auto' });
      requestAnimationFrame(() => requestAnimationFrame(finish));
    }, 1200);
    window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' });
  }

  document.querySelectorAll('a[data-switch]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const g = link.dataset.switch;
      if (!plain(e) || !paths[g]) return;
      e.preventDefault();
      if (g === game) return;
      toTop(() => go(g, true, true));
    });
  });

  window.addEventListener('popstate', () => go(gameAt(location.pathname), false, false));

  // This entry's game, for Back and Forward later; and the blade's full
  // picture once the page has settled (not under data saving: hover still
  // fetches it).
  history.replaceState({ sbGame: game }, '');
  settle(game);
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  const idle = window.requestIdleCallback
    ? (fn) => window.requestIdleCallback(fn, { timeout: 4000 })
    : (fn) => setTimeout(fn, 2500);
  const whenIdle = () => idle(() => upgrade(layers[other(game)]));
  if (!saveData) {
    if (document.readyState === 'complete') whenIdle();
    else window.addEventListener('load', whenIdle, { once: true });
  }
})();
