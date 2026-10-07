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
  const open = navLinks.classList.toggle('nav__links--open');
  navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
});

// Close mobile menu on link click
navLinks.querySelectorAll('.nav__link').forEach(link => {
  link.addEventListener('click', () => {
    navToggle.classList.remove('nav__toggle--active');
    navLinks.classList.remove('nav__links--open');
    navToggle.setAttribute('aria-expanded', 'false');
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
// A #fafafa cover over the hidden artwork grid that the pointer paints away.
// The brush grows with cursor speed; the painting stays while the pointer
// keeps moving, and once it has been still for FADE_DELAY the whole painting
// washes back to white together.
//
// Two renderers share the brush, the events and the fade timing:
//  - Liquid ink (WebGL, preferred): dabs land as soft ink that bleeds outward
//    for about a second while wet, with a see-through fringe that dries into
//    a scalloped, bristly edge (paint-lab variant A2, wetness 30, spread 200).
//  - Hard-edged dabs (canvas 2D): the original reveal. Used when hardware
//    WebGL is unavailable, and takes over if WebGL fails or loses its context
//    (after a lost context, liquid ink returns once the cover is white again).
(() => {
  let canvas = document.getElementById('heroRevealCanvas');
  const hero = document.getElementById('hero');
  if (!canvas || !hero) return;

  // Brush settings
  const BRUSH_MAX = 60;       // max brush radius
  const BRUSH_MIN = 12;       // min brush radius (tapered tail)
  const BRISTLE_COUNT = 6;    // extra bristle dabs per stroke
  const BRISTLE_SPREAD = 0.7; // how far bristles spread (fraction of radius)
  const MIN_DAB = 2;          // smallest dab radius

  // Fade-back settings
  const FADE_DELAY = 2200;     // ms after the pointer stops before fade begins
  const FADE_SPEED = 0.04;     // alpha per frame for fade-back
  const FADE_FULL_AFTER = 120; // frames before snapping to full white

  const motionQuery = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;
  const prefersReducedMotion = () => !!(motionQuery && motionQuery.matches);

  // Mouse tracking for speed-based tapering
  let lastX = null;
  let lastY = null;
  let lastTime = 0;
  let velocity = 0;

  // Start a new stroke (no gap fill from the last point, brush back to min)
  function liftBrush() {
    lastX = null;
    lastY = null;
    velocity = 0;
  }

  // One brush step at (x, y), in CSS px. Hands every dab to dab(x, y, radius).
  function brush(x, y, dab) {
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

  // ---- Hard-edged dabs (canvas 2D) -----------------------------------------
  // The original reveal, kept as the fallback: solid dabs erase the cover,
  // and the fade-back washes #fafafa over the whole canvas once per frame.
  // onClean() runs when a fade-back has washed the cover fully white again.
  function createHardEdgeRenderer(el, onClean) {
    const ctx = el.getContext('2d');
    let width, height;
    let animFrame = null;
    let fadeFrameCount = 0;
    let clean = true; // plain white: nothing painted since the last fill

    function resize() {
      const rect = hero.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      // Render at device resolution so brush edges stay crisp on Retina;
      // all drawing code keeps working in CSS pixels via the transform
      const dpr = window.devicePixelRatio || 1;
      el.width = Math.round(width * dpr);
      el.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fillWhite();
    }

    function fillWhite() {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(250, 250, 250, 1)';
      ctx.fillRect(0, 0, width, height);
      clean = true;
    }

    // Paint a single solid bristle dab (hard edge, no gradient)
    function dab(x, y, radius) {
      ctx.beginPath();
      ctx.arc(x, y, Math.max(radius, MIN_DAB), 0, Math.PI * 2);
      ctx.fill();
    }

    function paint(x, y) {
      clean = false;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0, 0, 0, 1)'; // solid, hard edge
      brush(x, y, dab);
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
          if (onClean) onClean();
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

    resize();
    return {
      paint,
      startFadeBack,
      stopFadeBack,
      resize,
      setReducedMotion() {}, // nothing animates here but the fade-back wash
      isClean: () => clean && !animFrame,
      destroy: stopFadeBack,
    };
  }

  // ---- Liquid ink (WebGL) --------------------------------------------------
  // Dabs are stamped as soft ink into a low-res field (at most half a texel
  // per CSS px, within a fixed texel budget). While the paper is wet, fixed
  // 60 Hz bleed steps let the ink creep outward and fill the gaps between
  // dabs, over the bounding box of still-wet stamps only. Every frame that
  // changed, one full-resolution pass draws the cover: the field's 0.5
  // iso-line becomes a crisp edge, pushed in and out by static noise
  // (scallops and bristle grain), with a see-through fringe while it is wet.
  // Per frame: O(new dabs) + O(wet box) + one composite; idle runs nothing.
  //
  // Field channels: R = ink, G = wetness, B/A = paint baked from an
  // interrupted fade (B = its field, A = its strength).

  // Tuning: paint-lab A2 at the operator's picks (2026-10-06): wetness 30,
  // spread 200, fade delay 2200 ms. wetHalo, rate and gain are the lab's
  // spread formulas at 200, written out in full so the port draws what the
  // lab draws: 1 + 0.6 * 2^0.3, 0.55 * 2^0.75, 1 + 0.11 * 2^1.1; the wet-edge
  // values are the lab's wetness map at 30.
  const INK = {
    // Ink field and bleed
    fieldBudget: 520000,    // field texels (constant cost across screen sizes)
    fieldMaxScale: 0.5,     // never more than 0.5 field texels per CSS px
    inkScale: 0.88,         // ink lands at this x the brush radius, then bleeds past it (1 under reduced motion)
    inkRamp: 0.25,          // soft ink profile spans r * (1 - ramp) .. r * (1 + ramp)
    wetHaloIn: 1.0,         // the paper is fully wet out to this x r ...
    wetHalo: 1.7386866480069498, // ... and dry from this x r (bounds the bleed)
    wetSteps: 64,           // 60 Hz steps until fresh paint is dry
    rate: 0.9249860567790861, // bleed rate per step at full wetness
    gain: 1.2357901617579847, // > 1 lets wet ink creep outward a little, not just fill gaps
    wetPow: 1,              // bleed rate ~ wetness^wetPow (the ease-out)
    tapCss: 2.5,            // blur tap distance per bleed step, CSS px
    noise: 0.775,           // +- variation of the bleed rate
    noiseCellCss: 10.35,    // bleed-noise feature size, CSS px (second octave at 2.7x)
    maxStepsPerFrame: 3,
    // Edge (static screen-space noise; sizes in CSS px)
    featherDry: 1.2,        // edge feather once dry
    featherWet: 2.5,        // edge feather while wet
    lobeCellCss: 6,         // small scallops (slow, narrow strokes): feature size
    lobeCss: 1.35,          // ... and how far they push the edge
    lobeBigCellCss: 15,     // big scallops (fast, wide strokes): feature size
    lobeBigCss: 2.7,        // ... and how far they push the edge
    brushSmallGrad: 4,      // 1/|grad ink| at or below which the small scallops are used (~r 12)
    brushBigGrad: 13,       // ... at or above which the big ones are (~r 50)
    fibreCellCss: 2.5,      // bristle/fibre grain feature size (across the edge)
    fibreStretch: 4,        // ... stretched this much along the edge
    fibreCss: 0.24,         // ... and how far it pushes the edge, peak to peak
    // Wet fringe: a see-through margin past the edge while the paint is wet
    fringeBlurCss: 9,       // measured on the paint mask blurred over this radius (its max reach)
    fringeDepth: 0.126,     // its reach, as a level below the edge's 0.5 on that blurred mask
    fringeAlpha: 0.186,     // how much art shows through it at its inner edge
    mottle: 0.165,          // +- variation of that
    reachCellCss: 14,       // how its reach varies along the edge
    mottleCellCss: 5,       // opacity mottling
    grainCellCss: 2.2,      // paper grain that frays its outer reach
    grain: 0.6,             // how much (fraction of the fringe depth)
  };

  const STEP_MS = 1000 / 60;
  const COVER = 250 / 255; // #fafafa

  const GL_ATTRIBUTES = {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    powerPreference: 'low-power',
    // A software (CPU-emulated) WebGL would be slower than the 2D reveal
    failIfMajorPerformanceCaveat: true,
  };

  // Shaders (GLSL ES 1.00 / WebGL1)

  const VS_FULL = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

  const VS_STAMP = `
attribute vec2 a_pos;   // CSS px
attribute vec2 a_s;     // position in units of the dab radius
uniform vec2 u_css;
varying vec2 v_s;
void main() {
  vec2 c = a_pos / u_css * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
  v_s = a_s;
}
`;

  // A dab: soft ink in R, wetness (wider than the ink) in G
  const FS_STAMP = `
precision mediump float;
varying vec2 v_s;
uniform float u_ramp;
uniform vec2 u_halo;    // wet: full until x, zero at y
uniform float u_wet;
void main() {
  float s = length(v_s);
  float ink = 1.0 - smoothstep(1.0 - u_ramp, 1.0 + u_ramp, s);
  float wet = u_wet * (1.0 - smoothstep(u_halo.x, u_halo.y, s));
  gl_FragColor = vec4(ink, wet, 0.0, 0.0);
}
`;

  const PRECISION = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;

  // One bleed step: wet ink moves toward a blur of its neighbourhood (never
  // receding), at a noisy rate that falls with the wetness; wetness decays.
  const FS_STEP = `${PRECISION}
uniform sampler2D u_state;
uniform sampler2D u_noise;
uniform vec2 u_texel;
uniform vec2 u_off;
uniform float u_rate;
uniform float u_gain;
uniform float u_decay;
uniform float u_noiseAmt;
uniform float u_pow;
uniform vec2 u_n1;
uniform vec2 u_n2;
uniform float u_seed;
float ink(vec2 uv) { return texture2D(u_state, uv).r; }
float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
void main() {
  vec2 uv = gl_FragCoord.xy * u_texel;
  vec4 c = texture2D(u_state, uv);
  if (c.g <= 0.0) { gl_FragColor = c; return; }
  vec2 ox = vec2(u_off.x, 0.0);
  vec2 oy = vec2(0.0, u_off.y);
  float b = 4.0 * c.r
    + 2.0 * (ink(uv + ox) + ink(uv - ox) + ink(uv + oy) + ink(uv - oy))
    + ink(uv + ox + oy) + ink(uv + ox - oy) + ink(uv - ox + oy) + ink(uv - ox - oy);
  b *= 0.0625;
  float target = max(c.r, min(1.0, b * u_gain));
  float n = 0.62 * texture2D(u_noise, gl_FragCoord.xy * u_n1).r
          + 0.38 * texture2D(u_noise, gl_FragCoord.xy * u_n2).g;
  n = 1.0 + u_noiseAmt * (2.0 * n - 1.0);
  float rate = clamp(u_rate * pow(c.g, u_pow) * n, 0.0, 1.0);
  // Stochastic rounding: the 8-bit target would swallow increments under
  // half a level (the slow leading edge), so dither before quantizing.
  // Unbiased on average; max() keeps paint from ever receding.
  float f = c.r + (target - c.r) * rate + (hash(gl_FragCoord.xy + u_seed) - 0.5) / 255.0;
  gl_FragColor = vec4(max(c.r, f), max(c.g - u_decay, 0.0), c.b, c.a);
}
`;

  // mode 0 = copy, 1 = dry (wetness -> 0), 2 = bake an interrupted fade into
  // B/A (keeping the wetness, so a fringe that was still wet keeps drying
  // instead of vanishing in one frame)
  const FS_UTIL = `${PRECISION}
uniform sampler2D u_state;
uniform vec2 u_texel;
uniform float u_mode;
uniform float u_m;
void main() {
  vec4 c = texture2D(u_state, gl_FragCoord.xy * u_texel);
  if (u_mode < 0.5) {
    gl_FragColor = c;
  } else if (u_mode < 1.5) {
    gl_FragColor = vec4(c.r, 0.0, c.b, c.a);
  } else {
    // Keep a FIELD (not a thresholded mask) so the composite can threshold
    // it at full resolution, as the union of both layers; the strength comes
    // from whichever layer shows more at this texel.
    float tF = smoothstep(0.45, 0.55, c.r);
    float tB = smoothstep(0.45, 0.55, c.b) * c.a;
    float strength = tF > tB ? 1.0 : c.a;
    gl_FragColor = vec4(0.0, c.g, max(c.r, c.b), strength * u_m);
  }
}
`;

  // Fringe helper: the paint masks (live, baked) blurred over a fixed CSS-px
  // disc, plus the wetness of the nearest paint. Recomputed only over the wet
  // box, once per frame that changed it. R/G fall from 0.5 at an edge to 0 at
  // fringeBlurCss outside it, whatever the brush size.
  const FS_AUX = `${PRECISION}
uniform sampler2D u_state;
uniform vec2 u_texel;
uniform vec3 u_taps[19]; // uv offset, weight (weights sum to 1)
void main() {
  vec2 uv = gl_FragCoord.xy * u_texel;
  vec2 m = vec2(0.0);
  float w = 0.0;
  for (int i = 0; i < 19; i++) {
    vec4 c = texture2D(u_state, uv + u_taps[i].xy);
    m += u_taps[i].z * vec2(smoothstep(0.3, 0.7, c.r), smoothstep(0.3, 0.7, c.b));
    w = max(w, c.g);
  }
  gl_FragColor = vec4(m, w, 1.0);
}
`;

  // The cover, at full resolution: opaque #fafafa wherever there is no paint
  function fsComposite(derivatives) {
    return `${derivatives ? '#extension GL_OES_standard_derivatives : enable\n#define HAS_DERIV 1' : ''}
${PRECISION}
uniform sampler2D u_state;
uniform sampler2D u_noise;
uniform vec2 u_canvas;    // drawing-buffer px
uniform vec2 u_field;     // field texels
uniform float u_m;        // fade multiplier (1 = full strength)
uniform vec2 u_feather;   // dry, wet feather width in device px
uniform vec3 u_cover;
uniform vec3 u_rough;     // small scallop, fibre, big scallop edge displacement (device px)
uniform vec4 u_ns;        // noise uv per device px: small scallop, fibre, reach, mottle
uniform float u_nsBig;    // noise uv per device px: big scallop
uniform vec2 u_brush;     // 1/|grad| (device px) mapped to small..big brush
uniform float u_band;     // device px around an edge where the noise can matter
uniform float u_nsGrain;  // noise uv per device px: fringe grain
uniform float u_grain;    // fringe grain strength
uniform float u_stretch;  // fibre grain stretch along the edge
uniform sampler2D u_aux;  // blurred masks + nearby wetness (FS_AUX)
uniform vec3 u_fringe;    // depth (mask level), alpha, mottle

vec4 cubicW(float v) {
  vec4 n = vec4(1.0, 2.0, 3.0, 4.0) - v;
  vec4 s = n * n * n;
  float x = s.x;
  float y = s.y - 4.0 * s.x;
  float z = s.z - 4.0 * s.y + 6.0 * s.x;
  float w = 6.0 - x - y - z;
  return vec4(x, y, z, w) * (1.0 / 6.0);
}

// Smooth B-spline sampling of a field-sized texture (4 bilinear taps)
vec4 sampleBicubic(sampler2D tx, vec2 uv) {
  vec2 inv = 1.0 / u_field;
  vec2 tc = uv * u_field - 0.5;
  vec2 f = fract(tc);
  tc -= f;
  vec4 xc = cubicW(f.x);
  vec4 yc = cubicW(f.y);
  vec4 c = tc.xxyy + vec2(-0.5, 1.5).xyxy;
  vec4 s = vec4(xc.xz + xc.yw, yc.xz + yc.yw);
  vec4 o = (c + vec4(xc.yw, yc.yw) / s) * inv.xxyy;
  vec4 s0 = texture2D(tx, o.xz);
  vec4 s1 = texture2D(tx, o.yz);
  vec4 s2 = texture2D(tx, o.xw);
  vec4 s3 = texture2D(tx, o.yw);
  float sx = s.x / (s.x + s.y);
  float sy = s.z / (s.z + s.w);
  return mix(mix(s3, s2, sx), mix(s1, s0, sx), sy);
}

vec4 field(vec2 uv) {
  return sampleBicubic(u_state, uv);
}

const float PI = 3.14159265;

// Value noise with a smooth (Hermite) cell interpolation: one tap, no
// bilinear diamonds.
vec4 snz(vec2 uv) {
  vec2 q = uv * 128.0 + 0.5;
  vec2 i = floor(q);
  vec2 f = q - i;
  f = f * f * (3.0 - 2.0 * f);
  return texture2D(u_noise, (i + f - 0.5) / 128.0);
}

// Bristle/fibre grain in fixed orientation k (0..5, 30 degrees apart),
// stretched along that direction.
float fibre(vec2 p, float k) {
  float th = k * (PI / 6.0);
  vec2 d = vec2(cos(th), sin(th));
  vec2 q = vec2(dot(p, d) / u_stretch, dot(p, vec2(-d.y, d.x))) * u_ns.y;
  return snz(q + vec2(0.137, 0.311) * (k + 1.0)).g;
}

void main() {
  vec2 p = gl_FragCoord.xy;
  vec2 uv = p / u_canvas;
  vec4 c = field(uv);
#ifdef HAS_DERIV
  vec2 gF = vec2(dFdx(c.r), dFdy(c.r));
  vec2 gB = vec2(dFdx(c.b), dFdy(c.b));
#else
  // No derivatives extension: finite differences of the field, one device px apart
  vec2 e = 1.0 / u_canvas;
  vec4 cx = field(uv + vec2(e.x, 0.0));
  vec4 cy = field(uv + vec2(0.0, e.y));
  vec2 gF = vec2(cx.r - c.r, cy.r - c.r);
  vec2 gB = vec2(cx.b - c.b, cy.b - c.b);
#endif
  float lF = length(gF);
  float lB = length(gB);

  // Signed distance (device px, + inside) to each layer's 0.5 iso-line
  float dF = (c.r - 0.5) / max(lF, 1e-5);
  float dB = (c.b - 0.5) / max(lB, 1e-5);

  // Static edge noise, only in the band where it can move the edge (most of
  // the canvas is bare paper or deep inside paint: no noise taps there).
  float big = 0.0;
  if (min(abs(dF), abs(dB)) < u_band) {
    // Scallops: the lobe noise is "billowy", |2n - 1| (softened a touch at
    // the crease), so the outline gets rounded outward bumps with notches
    // between them, like a chain of bristle dabs; 0.36 is its mean, so the
    // average width doesn't move. Like bristles they scale with the brush:
    // the ink field's edge gradient (shallower for bigger dabs) blends a
    // small and a big octave.
    float nS = 2.0 * snz(p * u_ns.x).r - 1.0;
    float nB = 2.0 * snz(p * u_nsBig + vec2(0.31, 0.67)).g - 1.0;
    big = smoothstep(u_brush.x, u_brush.y, 1.0 / max(lF > 1e-6 ? lF : lB, 1e-4));
    float rough = mix((sqrt(nS * nS + 0.004) - 0.36) * u_rough.x, (sqrt(nB * nB + 0.004) - 0.36) * u_rough.z, big);
    // Fibre grain, stretched along the edge so it reads as hairs running
    // with the stroke. A frame rotated per pixel would scramble on curves
    // (|p| x curvature), so the grain is drawn in 6 fixed orientations and
    // the two nearest the local edge direction are blended.
    if (u_rough.y > 0.0) {
      vec2 g = lF > 1e-6 ? gF : (lB > 1e-6 ? gB : vec2(0.0, 1.0));
      float a6 = mod(atan(g.x, -g.y), PI) * (6.0 / PI);
      float k0 = floor(a6);
      float fk = a6 - k0;
      float nF = ((fibre(p, k0) - 0.5) * (1.0 - fk) + (fibre(p, mod(k0 + 1.0, 6.0)) - 0.5) * fk)
               / sqrt(fk * fk + (1.0 - fk) * (1.0 - fk));
      rough += nF * u_rough.y;
    }
    dF += rough;
    dB += rough;
  }

  float W = clamp(c.g, 0.0, 1.0);
  float hwF = 0.5 * mix(u_feather.x, u_feather.y, W);
  float hwB = 0.5 * u_feather.x;
  float core = smoothstep(-hwF, hwF, dF);
  float old = smoothstep(-hwB, hwB, dB) * c.a;

  // Wet fringe: past the hard edge, partly see-through, its reach and
  // opacity varying along the edge and its outer boundary grainy. It shrinks
  // to nothing as the paint dries (and the bleeding edge moves into it).
  float fr = 0.0;
  float frB = 0.0;
  if (u_fringe.x > 0.0 && core < 1.0) {
    vec4 x = sampleBicubic(u_aux, uv);
    float Wn = clamp(x.b, 0.0, 1.0);
    if (Wn > 0.0 && max(x.r, x.g) > 0.002) {
      float Wf = sqrt(Wn);
      float nR = snz(p * u_ns.z + vec2(0.53, 0.19)).r;
      float nM = snz(p * u_ns.w + vec2(0.11, 0.83)).g;
      float nG = snz(p * u_nsGrain + vec2(0.71, 0.29)).r;
      float lo = max(0.5 - u_fringe.x * Wf * (0.25 + 1.5 * nR), 0.015);
      float op = u_fringe.y * smoothstep(0.0, 0.2, Wn) * clamp(1.0 + u_fringe.z * (2.0 * nM - 1.0), 0.0, 1.0);
      // Paper grain perturbs the level, so the reach frays into fibres; the
      // opacity falls smoothly to zero at the reach (no rim, no boundary).
      vec2 lv = x.rg + (nG - 0.5) * u_grain * (0.5 - lo);
      vec2 t = clamp((lv - lo) / (0.5 - lo), 0.0, 1.0);
      vec2 f2 = t * t * (3.0 - 2.0 * t);
      fr = f2.x * op;
      frB = f2.y * op * c.a;
    }
  }

  float rev = max(max(core, fr), max(old, frB)) * u_m;
  float a = 1.0 - rev;
  gl_FragColor = vec4(u_cover * a, a);
}
`;
  }

  // Deterministic smooth-noise texture source (value noise via LINEAR filtering)
  function noisePixels(size) {
    let s = 0x9e3779b9;
    const rnd = () => {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
    const px = new Uint8Array(size * size * 4);
    for (let i = 0; i < px.length; i += 4) {
      px[i] = (rnd() * 256) | 0;
      px[i + 1] = (rnd() * 256) | 0;
      px[i + 2] = 0;
      px[i + 3] = 255;
    }
    return px;
  }

  // Returns null when there is no hardware WebGL (the canvas is left
  // untouched). Throws if WebGL claimed the canvas but couldn't be set up
  // (err.contextLost when that was because the context was lost meanwhile).
  // Any later failure (lost context, an error while drawing) tears the
  // renderer down and calls onFail(contextLost).
  function createLiquidRenderer(el, onFail) {
    let gl = null;
    try {
      gl = el.getContext('webgl', GL_ATTRIBUTES) || el.getContext('experimental-webgl', GL_ATTRIBUTES);
    } catch (err) {
      gl = null;
    }
    if (!gl) return null;

    let destroyed = false;
    let reduced = prefersReducedMotion();

    // Geometry
    let cssW = 0;
    let cssH = 0;
    let fieldW = 0;
    let fieldH = 0;
    let sx = 1; // field texels per CSS px
    let sy = 1;

    // GL resources
    let R = null;
    const tex = [null, null]; // the ink field, ping-ponged
    const fbo = [null, null];
    let cur = 0;
    let auxTex = null; // blurred masks + nearby wetness, for the wet fringe
    let auxFbo = null;

    // Dabs waiting for the next frame: x, y, radius (CSS px)
    let pending = new Float32Array(3 * 512);
    let pendingN = 0;
    let verts = new Float32Array(24 * 512);

    // Timeline
    let raf = 0;
    let lastTs = 0;
    let acc = 0;
    let stepCount = 0;
    const wetBoxes = []; // { step, x0, y0, x1, y1 } in field texels, GL (y-up)
    let fading = false;
    let fadeFrame = 0;
    let fadeMul = 1;

    // ---- GL setup ----

    function compile(type, src) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
        const log = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        throw new Error(`hero reveal shader: ${log}`);
      }
      return sh;
    }

    function program(vsSrc, fsSrc, attribs) {
      const p = gl.createProgram();
      const vs = compile(gl.VERTEX_SHADER, vsSrc);
      const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
      gl.attachShader(p, vs);
      gl.attachShader(p, fs);
      attribs.forEach((name, i) => gl.bindAttribLocation(p, i, name));
      gl.linkProgram(p);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) {
        throw new Error(`hero reveal link: ${gl.getProgramInfoLog(p)}`);
      }
      const u = {};
      const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) || 0;
      for (let i = 0; i < n; i++) {
        const info = gl.getActiveUniform(p, i);
        u[info.name] = gl.getUniformLocation(p, info.name);
      }
      return { p, u };
    }

    function setupGL() {
      const deriv = !!gl.getExtension('OES_standard_derivatives');
      const res = {
        stamp: program(VS_STAMP, FS_STAMP, ['a_pos', 'a_s']),
        step: program(VS_FULL, FS_STEP, ['a_pos']),
        util: program(VS_FULL, FS_UTIL, ['a_pos']),
        comp: program(VS_FULL, fsComposite(deriv), ['a_pos']),
        aux: program(VS_FULL, FS_AUX, ['a_pos']),
        taps: new Float32Array(19 * 3),
        tri: gl.createBuffer(),
        quads: gl.createBuffer(),
        quadsCap: 0,
        noise: gl.createTexture(),
      };
      gl.bindBuffer(gl.ARRAY_BUFFER, res.tri);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

      gl.bindTexture(gl.TEXTURE_2D, res.noise);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 128, 128, 0, gl.RGBA, gl.UNSIGNED_BYTE, noisePixels(128));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.DITHER);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      return res;
    }

    function freeField() {
      for (let i = 0; i < 2; i++) {
        if (fbo[i]) gl.deleteFramebuffer(fbo[i]);
        if (tex[i]) gl.deleteTexture(tex[i]);
        fbo[i] = null;
        tex[i] = null;
      }
      if (auxFbo) gl.deleteFramebuffer(auxFbo);
      if (auxTex) gl.deleteTexture(auxTex);
      auxFbo = null;
      auxTex = null;
    }

    function makeTarget() {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fieldW, fieldH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE && !gl.isContextLost()) {
        throw new Error('hero reveal: the ink field is not renderable');
      }
      return [t, f];
    }

    function allocField() {
      freeField();
      for (let i = 0; i < 2; i++) [tex[i], fbo[i]] = makeTarget();
      [auxTex, auxFbo] = makeTarget();
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      cur = 0;
      clearField();
    }

    function clearField() {
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 1);
      for (let i = 0; i < 2; i++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[i]);
        gl.viewport(0, 0, fieldW, fieldH);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      clearAux();
      wetBoxes.length = 0;
      acc = 0;
    }

    function clearAux() {
      if (!auxFbo) return;
      gl.disable(gl.SCISSOR_TEST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, auxFbo);
      gl.viewport(0, 0, fieldW, fieldH);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    function drawTriangle() {
      gl.bindBuffer(gl.ARRAY_BUFFER, R.tri);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.disableVertexAttribArray(1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // Full-field utility pass cur -> other, then copy back so BOTH ping-pong
    // textures agree everywhere (the scissored bleed steps rely on that).
    function utilPass(mode, m = 1) {
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.BLEND);
      gl.useProgram(R.util.p);
      gl.uniform2f(R.util.u.u_texel, 1 / fieldW, 1 / fieldH);
      gl.uniform1i(R.util.u.u_state, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.viewport(0, 0, fieldW, fieldH);
      const other = 1 - cur;
      gl.uniform1f(R.util.u.u_mode, mode);
      gl.uniform1f(R.util.u.u_m, m);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[other]);
      gl.bindTexture(gl.TEXTURE_2D, tex[cur]);
      drawTriangle();
      cur = other;
      gl.uniform1f(R.util.u.u_mode, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[1 - cur]);
      gl.bindTexture(gl.TEXTURE_2D, tex[cur]);
      drawTriangle();
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    // ---- Size ----

    function resize(force) {
      const rect = hero.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const bw = Math.max(1, Math.round(rect.width * dpr));
      const bh = Math.max(1, Math.round(rect.height * dpr));
      if (!force && fieldW && bw === el.width && bh === el.height && rect.width === cssW && rect.height === cssH) return;
      cssW = Math.max(1, rect.width);
      cssH = Math.max(1, rect.height);
      // Render at device resolution so the edge stays crisp on Retina
      el.width = bw;
      el.height = bh;
      const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
      const scale = Math.min(INK.fieldMaxScale, Math.sqrt(INK.fieldBudget / (cssW * cssH)));
      fieldW = Math.max(2, Math.min(maxTex, Math.round(cssW * scale)));
      fieldH = Math.max(2, Math.min(maxTex, Math.round(cssH * scale)));
      sx = fieldW / cssW;
      sy = fieldH / cssH;
      allocField();
      // A real size change wipes the painting (and ends any fade), as in 2D
      fading = false;
      fadeFrame = 0;
      fadeMul = 1;
      composite(); // synchronously: the cleared buffer must never be shown
    }

    // ---- Painting ----

    function pushDab(x, y, r) {
      if (pendingN * 3 + 3 > pending.length) {
        const next = new Float32Array(pending.length * 2);
        next.set(pending);
        pending = next;
      }
      const i = pendingN * 3;
      pending[i] = x;
      pending[i + 1] = y;
      // Reduced motion never bleeds, so ink goes down at the brush's full size
      pending[i + 2] = Math.max(r, MIN_DAB) * (reduced ? 1 : INK.inkScale);
      pendingN++;
    }

    // Draw the frame's new dabs into the field (one draw call) and note the
    // box they wetted.
    function stampPending() {
      const n = pendingN;
      pendingN = 0;
      if (!n) return;
      const isWet = !reduced;
      const E = isWet ? Math.max(INK.wetHalo, 1 + INK.inkRamp) : 1 + INK.inkRamp;
      if (verts.length < n * 24) verts = new Float32Array(Math.max(n * 24, verts.length * 2));
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let v = 0;
      for (let i = 0; i < n; i++) {
        const x = pending[i * 3];
        const y = pending[i * 3 + 1];
        const e = pending[i * 3 + 2] * E;
        const x0 = x - e;
        const x1 = x + e;
        const y0 = y - e;
        const y1 = y + e;
        if (x0 < minX) minX = x0;
        if (y0 < minY) minY = y0;
        if (x1 > maxX) maxX = x1;
        if (y1 > maxY) maxY = y1;
        // two triangles: (x0,y0) (x1,y0) (x0,y1) | (x0,y1) (x1,y0) (x1,y1)
        verts[v++] = x0; verts[v++] = y0; verts[v++] = -E; verts[v++] = -E;
        verts[v++] = x1; verts[v++] = y0; verts[v++] = E; verts[v++] = -E;
        verts[v++] = x0; verts[v++] = y1; verts[v++] = -E; verts[v++] = E;
        verts[v++] = x0; verts[v++] = y1; verts[v++] = -E; verts[v++] = E;
        verts[v++] = x1; verts[v++] = y0; verts[v++] = E; verts[v++] = -E;
        verts[v++] = x1; verts[v++] = y1; verts[v++] = E; verts[v++] = E;
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[cur]);
      gl.viewport(0, 0, fieldW, fieldH);
      gl.disable(gl.SCISSOR_TEST);
      gl.enable(gl.BLEND);
      // "screen" union: out = src + dst * (1 - src) — never exceeds 1, and
      // overlapping soft tails reinforce each other into necks (the goo).
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
      gl.useProgram(R.stamp.p);
      gl.uniform2f(R.stamp.u.u_css, cssW, cssH);
      gl.uniform1f(R.stamp.u.u_ramp, INK.inkRamp);
      gl.uniform2f(R.stamp.u.u_halo, INK.wetHaloIn, INK.wetHalo);
      gl.uniform1f(R.stamp.u.u_wet, isWet ? 1 : 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, R.quads);
      const bytes = n * 24 * 4;
      if (bytes > R.quadsCap) {
        R.quadsCap = Math.max(bytes, R.quadsCap * 2, 24 * 4 * 512);
        gl.bufferData(gl.ARRAY_BUFFER, R.quadsCap, gl.DYNAMIC_DRAW);
      }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, verts.subarray(0, n * 24));
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
      gl.drawArrays(gl.TRIANGLES, 0, n * 6);
      gl.disableVertexAttribArray(1);
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      if (isWet) {
        const fx0 = Math.max(0, Math.floor(minX * sx) - 2);
        const fx1 = Math.min(fieldW, Math.ceil(maxX * sx) + 2);
        const fy0 = Math.max(0, Math.floor((cssH - maxY) * sy) - 2);
        const fy1 = Math.min(fieldH, Math.ceil((cssH - minY) * sy) + 2);
        if (fx1 > fx0 && fy1 > fy0) wetBoxes.push({ step: stepCount, x0: fx0, y0: fy0, x1: fx1, y1: fy1 });
      }
    }

    // The union of the still-wet stamps' boxes (+ margin), into `box`
    const box = { x0: 0, y0: 0, x1: 0, y1: 0 };
    function wetUnion(margin) {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const b of wetBoxes) {
        if (b.x0 < x0) x0 = b.x0;
        if (b.y0 < y0) y0 = b.y0;
        if (b.x1 > x1) x1 = b.x1;
        if (b.y1 > y1) y1 = b.y1;
      }
      box.x0 = Math.max(0, x0 - margin);
      box.y0 = Math.max(0, y0 - margin);
      box.x1 = Math.min(fieldW, x1 + margin);
      box.y1 = Math.min(fieldH, y1 + margin);
      return box.x1 > box.x0 && box.y1 > box.y0;
    }

    // Blurred masks + nearby wetness for the fringe, over the wet box
    function auxPass() {
      const rT = INK.fringeBlurCss * Math.max(sx, sy); // blur radius in field texels
      if (!wetUnion(Math.ceil(rT) + 2)) return;
      const taps = R.taps;
      let k = 0;
      let wsum = 0;
      const put = (ox, oy, w) => {
        taps[k++] = ox / fieldW;
        taps[k++] = oy / fieldH;
        taps[k++] = w;
        wsum += w;
      };
      // centre, 6 at r/2 and 12 at r: a soft disc (cone-ish weights)
      put(0, 0, 1);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.26;
        put(Math.cos(a) * rT * 0.5, Math.sin(a) * rT * 0.5, 0.75);
      }
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        put(Math.cos(a) * rT, Math.sin(a) * rT, 0.4);
      }
      for (let i = 2; i < taps.length; i += 3) taps[i] /= wsum;
      gl.bindFramebuffer(gl.FRAMEBUFFER, auxFbo);
      gl.viewport(0, 0, fieldW, fieldH);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
      gl.disable(gl.BLEND);
      const A = R.aux;
      gl.useProgram(A.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex[cur]);
      gl.uniform1i(A.u.u_state, 0);
      gl.uniform2f(A.u.u_texel, 1 / fieldW, 1 / fieldH);
      gl.uniform3fv(A.u['u_taps[0]'] || A.u.u_taps, taps);
      drawTriangle();
      gl.disable(gl.SCISSOR_TEST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    // One fixed 60 Hz bleed step over the box of still-wet stamps
    function spreadStep() {
      if (!wetUnion(0)) return;
      const { x0, y0, x1, y1 } = box;
      const next = 1 - cur;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[next]);
      gl.viewport(0, 0, fieldW, fieldH);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(x0, y0, x1 - x0, y1 - y0);
      gl.disable(gl.BLEND);
      const S = R.step;
      gl.useProgram(S.p);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, R.noise);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex[cur]);
      gl.uniform1i(S.u.u_state, 0);
      gl.uniform1i(S.u.u_noise, 1);
      gl.uniform2f(S.u.u_texel, 1 / fieldW, 1 / fieldH);
      gl.uniform2f(S.u.u_off, (INK.tapCss * sx) / fieldW, (INK.tapCss * sy) / fieldH);
      gl.uniform1f(S.u.u_rate, INK.rate);
      gl.uniform1f(S.u.u_gain, INK.gain);
      gl.uniform1f(S.u.u_decay, 1 / INK.wetSteps);
      gl.uniform1f(S.u.u_noiseAmt, INK.noise);
      gl.uniform1f(S.u.u_pow, INK.wetPow);
      gl.uniform1f(S.u.u_seed, (stepCount % 997) * 7.31);
      // field texel -> noise uv, noise cells sized in CSS px
      const cell = INK.noiseCellCss;
      gl.uniform2f(S.u.u_n1, 1 / (sx * cell * 128), 1 / (sy * cell * 128));
      gl.uniform2f(S.u.u_n2, 1 / (sx * cell * 2.7 * 128), 1 / (sy * cell * 2.7 * 128));
      drawTriangle();
      gl.disable(gl.SCISSOR_TEST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      cur = next;
      stepCount++;
      // A stamp's texels are dry after wetSteps; a few more steps let both
      // ping-pong copies converge before the box stops being processed.
      while (wetBoxes.length && stepCount - wetBoxes[0].step > INK.wetSteps + 3) wetBoxes.shift();
    }

    // Draw the cover into the drawing buffer
    function composite() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      gl.viewport(0, 0, w, h);
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.BLEND);
      const C = R.comp;
      gl.useProgram(C.p);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, auxTex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, R.noise);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex[cur]);
      gl.uniform1i(C.u.u_state, 0);
      gl.uniform1i(C.u.u_noise, 1);
      gl.uniform1i(C.u.u_aux, 2);
      gl.uniform2f(C.u.u_canvas, w, h);
      gl.uniform2f(C.u.u_field, fieldW, fieldH);
      gl.uniform1f(C.u.u_m, fadeMul);
      const px = w / cssW; // device px per CSS px actually in use
      gl.uniform2f(C.u.u_feather, INK.featherDry * px, INK.featherWet * px);
      gl.uniform3f(C.u.u_cover, COVER, COVER, COVER);
      gl.uniform3f(C.u.u_rough, INK.lobeCss * px, INK.fibreCss * px, INK.lobeBigCss * px);
      // widest outward/inward push of the noise + the wet feather, + slack
      gl.uniform1f(C.u.u_band, (0.66 * Math.max(INK.lobeCss, INK.lobeBigCss) + INK.fibreCss + INK.featherWet + 1) * px + 2);
      gl.uniform1f(C.u.u_nsBig, 1 / (INK.lobeBigCellCss * px * 128));
      gl.uniform2f(C.u.u_brush, INK.brushSmallGrad * px, INK.brushBigGrad * px);
      const ns = (cellCss) => 1 / (cellCss * px * 128);
      gl.uniform4f(C.u.u_ns, ns(INK.lobeCellCss), ns(INK.fibreCellCss), ns(INK.reachCellCss), ns(INK.mottleCellCss));
      gl.uniform1f(C.u.u_nsGrain, ns(INK.grainCellCss));
      gl.uniform1f(C.u.u_grain, INK.grain);
      gl.uniform1f(C.u.u_stretch, Math.max(1, INK.fibreStretch));
      // The fringe needs wet paint. Under reduced motion nothing is ever wet,
      // and once every stamp has dried the aux texture holds no wetness, so
      // depth 0 skips its 4 taps per pixel without changing a pixel (that
      // covers the whole fade, which starts after the paint has dried).
      gl.uniform3f(C.u.u_fringe, reduced || !wetBoxes.length ? 0 : INK.fringeDepth, INK.fringeAlpha, INK.mottle);
      drawTriangle();
    }

    // ---- Loop: runs only while there are new dabs, wet paint or a fade ----

    function ensureLoop() {
      if (!raf && !destroyed) raf = requestAnimationFrame(frame);
    }

    function drawFrame(ts) {
      raf = 0;
      const dt = lastTs ? Math.min(ts - lastTs, 100) : STEP_MS;
      lastTs = ts;
      let dirty = false;
      const stamped = pendingN > 0;
      if (stamped) {
        stampPending();
        dirty = true;
      }
      // Bleed in fixed 60 Hz steps, whatever the display rate
      let n = 0;
      if (wetBoxes.length && !reduced) {
        acc += dt;
        while (acc >= STEP_MS && n < INK.maxStepsPerFrame && wetBoxes.length) {
          spreadStep();
          acc -= STEP_MS;
          n++;
        }
        if (n >= INK.maxStepsPerFrame) acc = Math.min(acc, STEP_MS);
        if (n) dirty = true;
        if (!wetBoxes.length) acc = 0;
      }
      if (!reduced && wetBoxes.length && (n || stamped)) auxPass();
      if (fading) {
        // Accelerate fade over time — starts gentle, gets stronger (the same
        // frame-counted curve as the 2D wash, applied as one multiplier)
        fadeFrame++;
        const progress = fadeFrame / FADE_FULL_AFTER;
        const alpha = Math.min(FADE_SPEED + progress * progress * 0.15, 1);
        fadeMul *= 1 - alpha;
        // By this point the alpha is so high the snap is invisible
        if (fadeFrame >= FADE_FULL_AFTER) {
          clearField();
          fading = false;
          fadeFrame = 0;
          fadeMul = 1;
        }
        dirty = true;
      }
      if (dirty) composite();
      if (pendingN || (wetBoxes.length && !reduced) || fading) {
        raf = requestAnimationFrame(frame);
      } else {
        lastTs = 0;
      }
    }

    // ---- Fade-back ----

    function startFadeBack() {
      if (fading) return;
      fading = true;
      fadeFrame = 0;
      fadeMul = 1;
      ensureLoop();
    }

    // Movement mid-fade stops the wash where it is: the partly faded painting
    // is baked into B/A (it stays faded, never re-saturates) and new strokes
    // land at full strength on top. The bake keeps the wetness channel and
    // the wet boxes, so a fringe that was still wet keeps drying smoothly.
    function stopFadeBack() {
      if (!fading) return;
      fading = false;
      if (fadeFrame > 0 && fadeMul < 1) {
        utilPass(2, fadeMul);
        fadeMul = 1;
        composite();
      }
      fadeFrame = 0;
      fadeMul = 1;
    }

    // Reduced motion switched on: stop any bleed in place (everything already
    // on screen is final) and lay new paint down dry, at its final shape.
    function setReducedMotion(on) {
      if (on === reduced) return;
      reduced = on;
      if (on && fieldW) {
        wetBoxes.length = 0;
        acc = 0;
        utilPass(1);
        clearAux();
        composite();
      }
    }

    // ---- Teardown and failure ----

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      el.removeEventListener('webglcontextlost', onContextLost);
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      try {
        if (R && !gl.isContextLost()) {
          freeField();
          [R.stamp, R.step, R.util, R.comp, R.aux].forEach((prog) => gl.deleteProgram(prog.p));
          gl.deleteBuffer(R.tri);
          gl.deleteBuffer(R.quads);
          gl.deleteTexture(R.noise);
        }
        // Release the GPU memory now rather than at garbage collection
        const lose = gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
      } catch (err) {
        // never throw while tearing down
      }
      R = null;
    }

    // A lost context (or any error below) hands the hero to the 2D reveal.
    // The loss isn't preventDefault()ed: this context is never used again
    // (liquid ink comes back, if at all, on a fresh canvas and context).
    function fail(contextLost) {
      if (destroyed) return;
      destroy();
      onFail(contextLost);
    }

    function onContextLost() {
      fail(true);
    }

    function guard(fn) {
      return (...args) => {
        if (destroyed) return;
        try {
          fn(...args);
        } catch (err) {
          fail(gl.isContextLost());
        }
      };
    }

    const frame = guard(drawFrame);

    // ---- Init ----

    el.addEventListener('webglcontextlost', onContextLost);
    try {
      R = setupGL();
      resize(true);
      // A context lost during setup (say, while the GPU process restarts)
      // has drawn nothing: fail now rather than show an empty canvas
      if (gl.isContextLost()) throw new Error('hero reveal: WebGL context lost');
    } catch (err) {
      const lost = gl.isContextLost();
      destroy();
      if (lost) {
        const lostErr = new Error('hero reveal: WebGL context lost during setup');
        lostErr.contextLost = true;
        throw lostErr;
      }
      throw err;
    }

    return {
      paint: guard((x, y) => {
        brush(x, y, pushDab);
        ensureLoop();
      }),
      startFadeBack: guard(startFadeBack),
      stopFadeBack: guard(stopFadeBack),
      resize: guard(() => resize(false)),
      setReducedMotion: guard(setReducedMotion),
      destroy,
    };
  }

  // ---- Events, fade timer and fallback ------------------------------------
  let renderer = null;
  let fadeTimer = null;

  // After a lost WebGL context, liquid ink is restarted at most this many
  // times per page load, each no sooner than RECOVER_DELAY after the loss
  const GL_RECOVERIES = 3;
  const RECOVER_DELAY = 1000; // ms
  let recoveriesLeft = GL_RECOVERIES;
  let recoverTimer = null;
  let recoverDue = false;

  // (Re)arm the fade-back: it starts once the pointer has been still for
  // FADE_DELAY. Every move re-arms it; mouseleave and touchend arm it.
  function armFade() {
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => {
      fadeTimer = null;
      renderer.startFadeBack();
    }, FADE_DELAY);
  }

  function paintAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    renderer.paint(clientX - rect.left, clientY - rect.top);
  }

  // Mouse events
  function onMouseMove(e) {
    renderer.stopFadeBack();
    paintAt(e.clientX, e.clientY);
    armFade();
  }

  function onMouseEnter() {
    renderer.stopFadeBack();
    liftBrush();
  }

  function onMouseLeave() {
    liftBrush();
    armFade();
  }

  // Touch events — finger-painting on mobile. Listeners stay passive so
  // painting never hijacks page scrolling; you paint while you swipe.
  function onTouchStart(e) {
    renderer.stopFadeBack();
    liftBrush();
    const t = e.touches[0];
    if (t) paintAt(t.clientX, t.clientY);
  }

  function onTouchMove(e) {
    const t = e.touches[0];
    if (!t) return;
    renderer.stopFadeBack();
    paintAt(t.clientX, t.clientY);
    armFade();
  }

  function onTouchEnd() {
    liftBrush();
    armFade();
  }

  // Click to scroll to artwork (instant when reduced motion is preferred)
  function onClick() {
    const artwork = document.getElementById('artwork');
    if (artwork) {
      artwork.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
  }

  const canvasListeners = [
    ['mousemove', onMouseMove],
    ['mouseenter', onMouseEnter],
    ['mouseleave', onMouseLeave],
    ['touchstart', onTouchStart, { passive: true }],
    ['touchmove', onTouchMove, { passive: true }],
    ['touchend', onTouchEnd, { passive: true }],
    ['click', onClick],
  ];

  function listen(el) {
    canvasListeners.forEach(([type, fn, options]) => el.addEventListener(type, fn, options));
  }

  function unlisten(el) {
    canvasListeners.forEach(([type, fn, options]) => el.removeEventListener(type, fn, options));
  }

  // Replace the canvas with a fresh copy (same id, class and aria-hidden) and
  // move the listeners across: once a canvas has handed out a WebGL context
  // it can never give a 2D one.
  function swapCanvas() {
    const fresh = canvas.cloneNode(false);
    unlisten(canvas);
    canvas.parentNode.replaceChild(fresh, canvas);
    canvas = fresh;
    listen(canvas);
  }

  // A renderer for the current canvas: liquid ink when hardware WebGL is
  // available, else hard-edged dabs. Either one covers the canvas in white
  // before returning, so a canvas swapped in within the same task never
  // shows the art uncovered.
  function startRenderer() {
    try {
      const liquid = createLiquidRenderer(canvas, onLiquidFail);
      if (liquid) return liquid;
    } catch (err) {
      swapCanvas(); // WebGL claimed the canvas, then failed to set up
      if (err && err.contextLost) scheduleRecovery();
    }
    return createHardEdgeRenderer(canvas, tryRecovery);
  }

  // Tear down the current renderer and start `make()` on a fresh canvas,
  // from a white cover (the painting so far is lost)
  function replaceRenderer(make) {
    renderer.destroy();
    clearTimeout(fadeTimer);
    fadeTimer = null;
    liftBrush();
    swapCanvas();
    renderer = make();
  }

  // WebGL failed after it was running: carry on with hard-edged dabs. A lost
  // context (a GPU reset, or a browser reclaiming a background tab's GPU
  // memory) also schedules a return to liquid ink; any other error stays 2D.
  function onLiquidFail(contextLost) {
    replaceRenderer(() => createHardEdgeRenderer(canvas, tryRecovery));
    if (contextLost) scheduleRecovery();
  }

  function scheduleRecovery() {
    if (recoveriesLeft <= 0 || recoverTimer || recoverDue) return;
    recoverTimer = setTimeout(() => {
      recoverTimer = null;
      recoverDue = true;
      tryRecovery();
    }, RECOVER_DELAY);
  }

  // Back to liquid ink on a fresh canvas, but only while the tab is visible
  // and the 2D cover is plain white (nothing painted, no fade running), so
  // the swap is never seen. Runs when the delay ends, when a 2D fade has
  // washed the cover white and when the tab becomes visible.
  function tryRecovery() {
    if (!recoverDue || document.visibilityState === 'hidden') return;
    if (!renderer.isClean || !renderer.isClean()) return;
    recoverDue = false;
    recoveriesLeft--;
    replaceRenderer(startRenderer);
  }

  // Init
  listen(canvas);
  renderer = startRenderer();
  window.addEventListener('resize', () => renderer.resize());
  document.addEventListener('visibilitychange', tryRecovery);

  // MediaQueryList change listeners (older Safari only has addListener)
  function onMediaChange(query, fn) {
    if (typeof query.addEventListener === 'function') query.addEventListener('change', fn);
    else if (typeof query.addListener === 'function') query.addListener(fn);
  }

  function offMediaChange(query, fn) {
    if (typeof query.removeEventListener === 'function') query.removeEventListener('change', fn);
    else if (typeof query.removeListener === 'function') query.removeListener(fn);
  }

  // A devicePixelRatio change with no CSS size change (the window moved to a
  // screen with another scale) fires no resize event: re-size so edges stay
  // crisp, then watch for the next ratio
  function watchPixelRatio() {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    const onChange = () => {
      offMediaChange(query, onChange);
      renderer.resize();
      watchPixelRatio();
    };
    onMediaChange(query, onChange);
  }
  watchPixelRatio();

  // Live reduced-motion changes
  if (motionQuery) onMediaChange(motionQuery, () => renderer.setReducedMotion(motionQuery.matches));
})();

// Lightbox lives in js/lightbox.js (shared with the app pages)
