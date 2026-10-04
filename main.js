/* =========================================================================
   aube studio — interactions
   Aucune dépendance. Tout ce qui bouge respecte prefers-reduced-motion.
   ========================================================================= */
(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const hasIO = 'IntersectionObserver' in window;

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const pad = (n) => String(n).padStart(2, '0');
  const fmtTime = (s) => `${pad(Math.floor(s / 60))}:${pad(Math.floor(s % 60))}`;

  /* Observe un élément et appelle cb(visible) à chaque changement. */
  function watch(el, cb, options = {}) {
    if (!el) return;
    if (!hasIO) {
      cb(true);
      return;
    }
    new IntersectionObserver(([entry]) => cb(entry.isIntersecting), options).observe(el);
  }

  /* ---------------------------------------------------------------------
     1. Titres découpés en mots masqués
     --------------------------------------------------------------------- */
  function splitWords(el) {
    let index = 0;
    const makeWord = () => {
      const outer = document.createElement('span');
      outer.className = 'w';
      const inner = document.createElement('span');
      inner.style.setProperty('--wi', index++);
      outer.appendChild(inner);
      return outer;
    };
    const walk = (node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          const frag = document.createDocumentFragment();
          // On ne coupe que sur les espaces ordinaires : les insécables restent dans le mot.
          child.textContent.split(/([ \t\n\r]+)/).forEach((part) => {
            if (!part) return;
            if (/^[ \t\n\r]+$/.test(part)) {
              frag.appendChild(document.createTextNode(' '));
              return;
            }
            const word = makeWord();
            word.firstChild.textContent = part;
            frag.appendChild(word);
          });
          node.replaceChild(frag, child);
        } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName !== 'BR') {
          if (child.hasAttribute('data-nosplit')) {
            const word = makeWord();
            node.replaceChild(word, child);
            word.firstChild.appendChild(child);
          } else {
            walk(child);
          }
        }
      });
    };
    walk(el);
  }
  $$('[data-split]').forEach(splitWords);

  /* ---------------------------------------------------------------------
     2. Compteurs à rouleaux
     --------------------------------------------------------------------- */
  function buildOdometer(el) {
    const text = el.textContent.trim();
    const sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = text;
    const visual = document.createElement('span');
    visual.className = 'odo';
    visual.setAttribute('aria-hidden', 'true');
    let column = 0;
    for (const ch of text) {
      if (!/\d/.test(ch)) {
        visual.appendChild(document.createTextNode(ch));
        continue;
      }
      const col = document.createElement('span');
      col.className = 'odo-col';
      const ghost = document.createElement('span');
      ghost.className = 'odo-ghost';
      ghost.textContent = ch;
      const strip = document.createElement('span');
      strip.className = 'odo-strip';
      strip.style.setProperty('--to', 10 + Number(ch));
      strip.style.setProperty('--ci', column++);
      for (let k = 0; k < 20; k++) {
        const digit = document.createElement('span');
        digit.textContent = String(k % 10);
        strip.appendChild(digit);
      }
      col.append(ghost, strip);
      visual.appendChild(col);
    }
    el.textContent = '';
    el.append(sr, visual);
  }
  $$('[data-odometer]').forEach(buildOdometer);

  /* ---------------------------------------------------------------------
     3. Apparitions au scroll
     --------------------------------------------------------------------- */
  $$('[data-stagger]').forEach((group) => {
    Array.from(group.children).forEach((child, i) => child.style.setProperty('--i', i));
  });

  const revealEls = $$('[data-reveal], [data-split]');
  if (reduceMotion || !hasIO) {
    revealEls.forEach((el) => el.classList.add('is-in'));
  } else {
    const revealer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-in');
          revealer.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0.1 }
    );
    revealEls.forEach((el) => revealer.observe(el));
  }

  /* ---------------------------------------------------------------------
     4. Mot tournant du titre
     --------------------------------------------------------------------- */
  const rotator = $('[data-rotator]');
  if (rotator && !reduceMotion) {
    const words = $$('.rotator-word', rotator);
    let current = 0;
    window.setInterval(() => {
      if (document.hidden || words.length < 2) return;
      const prev = words[current];
      current = (current + 1) % words.length;
      const next = words[current];
      prev.classList.remove('is-active');
      prev.classList.add('is-leaving');
      next.classList.remove('is-leaving');
      next.classList.add('is-active');
      window.setTimeout(() => prev.classList.remove('is-leaving'), 900);
    }, 2400);
  }

  /* ---------------------------------------------------------------------
     5. Grille de points du hero (réagit au curseur et aux clics)
     --------------------------------------------------------------------- */
  function heroGrid(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const host = canvas.parentElement;
    const GAP = 22;
    const RADIUS = 210;
    const LEVELS = 9;
    const from = [214, 217, 252]; // lilas
    const to = [83, 58, 253]; // indigo
    const fills = Array.from({ length: LEVELS }, (_, i) => {
      const k = i / (LEVELS - 1);
      const c = from.map((v, j) => Math.round(v + (to[j] - v) * k));
      return `rgba(${c[0]},${c[1]},${c[2]},${(0.5 + 0.5 * k).toFixed(2)})`;
    });
    const buckets = Array.from({ length: LEVELS }, () => []);
    const pointer = { x: 0, y: 0, tx: 0, ty: 0, s: 0, ts: 0 };
    const ripples = [];
    let w = 0;
    let h = 0;
    let dots = [];
    let raf = 0;
    let running = false;
    let visible = false;

    function resize() {
      const rect = host.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dots = [];
      const ox = (w % GAP) / 2;
      const oy = (h % GAP) / 2;
      for (let y = oy; y <= h; y += GAP) {
        for (let x = ox; x <= w; x += GAP) dots.push(x, y);
      }
      if (!running) draw(performance.now());
    }

    function draw(t) {
      pointer.x += (pointer.tx - pointer.x) * 0.16;
      pointer.y += (pointer.ty - pointer.y) * 0.16;
      pointer.s += (pointer.ts - pointer.s) * 0.08;
      while (ripples.length && t - ripples[0].t > 1800) ripples.shift();

      ctx.clearRect(0, 0, w, h);
      buckets.forEach((b) => (b.length = 0));

      for (let i = 0; i < dots.length; i += 2) {
        const x = dots[i];
        const y = dots[i + 1];
        const dx = x - pointer.x;
        const dy = y - pointer.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        let near = Math.max(0, 1 - dist / RADIUS) * pointer.s;
        near *= near;

        // Bandes diagonales qui balaient lentement la grille
        const wave = reduceMotion ? 0 : Math.pow(Math.max(0, Math.sin(x * 0.006 - y * 0.004 - t * 0.0008)), 8) * 0.45;

        let ring = 0;
        for (let r = 0; r < ripples.length; r++) {
          const rp = ripples[r];
          const age = t - rp.t;
          const rx = x - rp.x;
          const ry = y - rp.y;
          const d = Math.sqrt(rx * rx + ry * ry);
          const band = Math.max(0, 1 - Math.abs(d - age * 0.55) / 34) * (1 - age / 1800);
          if (band > ring) ring = band;
        }

        const k = Math.max(near, wave, ring);
        let px = x;
        let py = y;
        if (near > 0.001) {
          const push = near * 7;
          px += (dx / dist) * push;
          py += (dy / dist) * push;
        }
        const level = Math.min(LEVELS - 1, Math.round(k * (LEVELS - 1)));
        buckets[level].push(px, py, 1.1 + k * 1.9);
      }

      for (let l = 0; l < LEVELS; l++) {
        const b = buckets[l];
        if (!b.length) continue;
        ctx.fillStyle = fills[l];
        for (let i = 0; i < b.length; i += 3) {
          const s = b[i + 2];
          ctx.fillRect(b[i] - s / 2, b[i + 1] - s / 2, s, s);
        }
      }
    }

    function frame(t) {
      draw(t);
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (running || reduceMotion || document.hidden || !visible) return;
      running = true;
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      cancelAnimationFrame(raf);
    }

    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(host);
    else window.addEventListener('resize', resize);
    resize();

    watch(host, (isVisible) => {
      visible = isVisible;
      if (isVisible) start();
      else stop();
    });
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

    if (!reduceMotion) {
      host.addEventListener('pointermove', (e) => {
        const rect = canvas.getBoundingClientRect();
        pointer.tx = e.clientX - rect.left;
        pointer.ty = e.clientY - rect.top;
        if (pointer.s < 0.02) {
          pointer.x = pointer.tx;
          pointer.y = pointer.ty;
        }
        pointer.ts = 1;
      });
      host.addEventListener('pointerleave', () => {
        pointer.ts = 0;
      });
      host.addEventListener('pointerdown', (e) => {
        const rect = canvas.getBoundingClientRect();
        ripples.push({ x: e.clientX - rect.left, y: e.clientY - rect.top, t: performance.now() });
        if (ripples.length > 4) ripples.shift();
      });
    }
  }
  const heroCanvas = $('[data-hero-canvas]');
  if (heroCanvas) heroGrid(heroCanvas);

  /* ---------------------------------------------------------------------
     6. Console de rendu du hero
     --------------------------------------------------------------------- */
  function consoleDemo(el) {
    const spots = [
      {
        file: 'spot_boulangerie_15s',
        meta: '1080 × 1920 · 15 s',
        prompt: 'Gros plan, croissant doré qui sort du four, vapeur, lumière chaude du matin',
        shots: [
          ['00:00', 'Sortie du four'],
          ['00:04', 'Vapeur et dorure'],
          ['00:08', 'Client en vitrine'],
          ['00:12', 'Adresse et horaires'],
        ],
      },
      {
        file: 'spot_restaurant_20s',
        meta: '1080 × 1920 · 20 s',
        prompt: 'Flamme sous la poêle, cuisine ouverte, plan serré, ambiance de service du soir',
        shots: [
          ['00:00', 'Flamme en cuisine'],
          ['00:05', 'Dressage vu du dessus'],
          ['00:10', 'Salle pleine'],
          ['00:15', 'Réservation'],
        ],
      },
      {
        file: 'spot_champagne_30s',
        meta: '1920 × 1080 · 30 s',
        prompt: 'Vue aérienne des vignes de la Côte des Bar au lever du soleil, brume légère',
        shots: [
          ['00:00', 'Vignes au lever du jour'],
          ['00:08', 'Vendange à la main'],
          ['00:16', 'Bulles au ralenti'],
          ['00:24', 'Visite du domaine'],
        ],
      },
    ];

    const fileEl = $('[data-c-file]', el);
    const metaEl = $('[data-c-meta]', el);
    const typedEl = $('[data-c-typed]', el);
    const barEl = $('[data-c-bar]', el);
    const pctEl = $('[data-c-pct]', el);
    const statusEl = $('[data-c-status]', el);
    const statusText = $('[data-c-status-text]', el);
    const frames = $$('[data-c-frame]', el);
    const shots = $$('[data-c-shot]', el);
    const formats = $$('[data-c-format]', el);

    const T_TYPE = 1700;
    const T_GEN = 5200;
    const T_HOLD = 3000;
    const TOTAL = T_TYPE + T_GEN + T_HOLD;
    let spot = 0;
    let elapsed = -900; // laisse la console apparaître avant de taper
    let last = 0;
    let raf = 0;
    let running = false;
    let cache = {};

    const set = (key, value, apply) => {
      if (cache[key] === value) return;
      cache[key] = value;
      apply(value);
    };

    function load(i) {
      const s = spots[i];
      fileEl.textContent = s.file;
      metaEl.textContent = s.meta;
      shots.forEach((li, k) => {
        $('.tc', li).textContent = s.shots[k][0];
        $('.shot-name', li).textContent = s.shots[k][1];
      });
      frames.forEach((f, k) => {
        $('.frame-tc', f).textContent = s.shots[k][0];
      });
      cache = {};
    }

    function render(t) {
      const s = spots[spot];
      const chars = Math.round(clamp(t / T_TYPE, 0, 1) * s.prompt.length);
      set('chars', chars, (n) => (typedEl.textContent = s.prompt.slice(0, n)));

      const p = clamp((t - T_TYPE) / T_GEN, 0, 1);
      barEl.style.transform = `scaleX(${p.toFixed(4)})`;
      set('pct', Math.round(p * 100), (n) => (pctEl.textContent = `${n} %`));

      frames.forEach((f, k) => {
        const local = clamp(p * frames.length - k, 0, 1);
        f.style.setProperty('--fill', local.toFixed(3));
        const state = local >= 1 ? 2 : local > 0 ? 1 : 0;
        set(`f${k}`, state, (st) => {
          f.classList.toggle('is-rendering', st === 1);
          f.classList.toggle('is-done', st === 2);
          shots[k].classList.toggle('is-active', st === 1);
          shots[k].classList.toggle('is-done', st === 2);
        });
      });

      const phase = t < T_TYPE ? 0 : p < 1 ? 1 : 2;
      set('phase', phase, (ph) => {
        statusEl.classList.toggle('is-ready', ph === 2);
        statusText.textContent = ['Écriture', 'Génération', 'Prêt'][ph];
      });

      formats.forEach((fm, k) => {
        set(`fm${k}`, t > T_TYPE + T_GEN + 250 + k * 220, (on) => fm.classList.toggle('is-on', on));
      });
    }

    function tick(now) {
      const dt = last ? Math.min(now - last, 64) : 16;
      last = now;
      elapsed += dt;
      if (elapsed > TOTAL) {
        elapsed = 0;
        spot = (spot + 1) % spots.length;
        load(spot);
      }
      render(elapsed);
      raf = requestAnimationFrame(tick);
    }
    function start() {
      if (running || document.hidden) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(tick);
    }
    function stop() {
      running = false;
      cancelAnimationFrame(raf);
    }

    if (reduceMotion) return; // état final statique, déjà dans le HTML
    load(0);
    render(0);
    let visible = false;
    watch(el, (isVisible) => {
      visible = isVisible;
      if (isVisible) start();
      else stop();
    }, { threshold: 0.15 });
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : visible && start()));
  }
  const consoleEl = $('[data-console]');
  if (consoleEl) consoleDemo(consoleEl);

  /* ---------------------------------------------------------------------
     7. Cartes de scripts : lecture simulée au survol (ou à l'écran sur mobile)
     --------------------------------------------------------------------- */
  function storyCard(card) {
    const duration = Number(card.dataset.duration);
    const items = $$('li[data-at]', card);
    const starts = items.map((li) => Number(li.dataset.at));
    const timeline = $('[data-timeline]', card);
    const nowEl = $('[data-now]', card);
    const fills = starts.map((s, i) => {
      const seg = document.createElement('span');
      seg.className = 'seg';
      seg.style.flexGrow = String((starts[i + 1] ?? duration) - s);
      const fill = document.createElement('i');
      seg.appendChild(fill);
      timeline.appendChild(seg);
      return fill;
    });

    const RATE = 3; // une vidéo de 15 s se lit en 5 s
    let raf = 0;
    let t0 = 0;
    let playing = false;
    let lastIdx = -2;

    function render(sec) {
      nowEl.textContent = fmtTime(sec);
      let idx = -1;
      if (playing) starts.forEach((s, i) => sec >= s && (idx = i));
      fills.forEach((f, i) => {
        const s = starts[i];
        const e = starts[i + 1] ?? duration;
        f.style.transform = `scaleX(${clamp((sec - s) / (e - s), 0, 1).toFixed(4)})`;
      });
      if (idx !== lastIdx) {
        items.forEach((li, i) => li.classList.toggle('is-active', i === idx));
        lastIdx = idx;
      }
    }
    function loop(now) {
      if (!t0) t0 = now;
      let sec = ((now - t0) / 1000) * RATE;
      if (sec > duration + RATE * 1.2) {
        t0 = now;
        sec = 0;
      }
      render(Math.min(sec, duration));
      raf = requestAnimationFrame(loop);
    }
    function play() {
      if (playing) return;
      playing = true;
      t0 = 0;
      card.classList.add('is-playing');
      raf = requestAnimationFrame(loop);
    }
    function stop() {
      if (!playing) return;
      playing = false;
      cancelAnimationFrame(raf);
      card.classList.remove('is-playing');
      render(0);
    }

    render(0);
    if (reduceMotion) return;
    if (finePointer) {
      card.addEventListener('pointerenter', play);
      card.addEventListener('pointerleave', stop);
    } else {
      watch(card, (isVisible) => (isVisible ? play() : stop()), { threshold: 0.7 });
    }
  }
  $$('[data-story]').forEach(storyCard);

  /* ---------------------------------------------------------------------
     8. Section exemples : scroll horizontal épinglé (desktop)
     --------------------------------------------------------------------- */
  const hscroll = (() => {
    const section = $('[data-hscroll]');
    if (!section) return null;
    const viewport = $('[data-hs-viewport]', section);
    const track = $('[data-hs-track]', section);
    const cards = $$('[data-story]', track);
    const countEl = $('[data-hs-count]', section);
    const barEl = $('[data-hs-bar]', section);
    let pinned = false;
    let distance = 0;
    let lastIndex = -1;

    function setProgress(p) {
      const n = cards.length;
      const index = clamp(Math.round(p * (n - 1)), 0, n - 1);
      if (index === lastIndex) return;
      lastIndex = index;
      countEl.textContent = `${pad(index + 1)} / ${pad(n)}`;
      barEl.style.transform = `scaleX(${(index + 1) / n})`;
    }

    function layout() {
      pinned = !reduceMotion && window.innerWidth >= 1024 && window.innerHeight >= 700;
      section.classList.toggle('is-pinned', pinned);
      if (pinned) {
        distance = Math.max(0, track.offsetWidth - viewport.clientWidth);
        section.style.height = `${window.innerHeight + distance}px`;
      } else {
        section.style.height = '';
        track.style.transform = '';
      }
    }

    function update(vh) {
      if (!pinned) return;
      const rect = section.getBoundingClientRect();
      const total = rect.height - vh;
      const p = total > 0 ? clamp(-rect.top / total, 0, 1) : 0;
      track.style.transform = `translate3d(${(-p * distance).toFixed(1)}px, 0, 0)`;
      setProgress(p);
    }

    viewport.addEventListener(
      'scroll',
      () => {
        if (pinned) return;
        const max = viewport.scrollWidth - viewport.clientWidth;
        setProgress(max > 0 ? viewport.scrollLeft / max : 0);
      },
      { passive: true }
    );

    setProgress(0);
    layout();
    return { layout, update };
  })();

  /* ---------------------------------------------------------------------
     9. Méthode : étape active, rail de progression, panneau visuel
     --------------------------------------------------------------------- */
  const method = (() => {
    const wrap = $('[data-steps]');
    if (!wrap) return null;
    const steps = $$('[data-step]', wrap);
    const fill = $('[data-steps-fill]', wrap);
    const panels = $$('[data-panel]');
    const dayEl = $('[data-mv-day]');
    const track = $('[data-mv-progress]');
    const days = ['Jour 0', 'Jour 1', 'Jour 1 à 2', 'Jour 3'];
    let active = -1;

    return function update(vh) {
      const anchor = vh * 0.55;
      const rect = wrap.getBoundingClientRect();
      const p = clamp((anchor - rect.top) / rect.height, 0, 1);
      fill.style.transform = `scaleY(${p.toFixed(4)})`;
      let idx = 0;
      steps.forEach((s, i) => {
        if (s.getBoundingClientRect().top < anchor) idx = i;
      });
      if (track) track.style.transform = `scaleX(${((idx + clamp(p * steps.length - idx, 0, 1)) / steps.length).toFixed(4)})`;
      if (idx === active) return;
      active = idx;
      steps.forEach((s, i) => {
        s.classList.toggle('is-active', i === idx);
        s.classList.toggle('is-past', i < idx);
      });
      panels.forEach((panel, i) => panel.classList.toggle('is-active', i === idx));
      if (dayEl) dayEl.textContent = days[idx] || '';
    };
  })();

  /* ---------------------------------------------------------------------
     10. Série : texte qui s'allume au scroll, panneau qui s'ouvre, terminal
     --------------------------------------------------------------------- */
  const scrub = (() => {
    const el = $('[data-scrub]');
    if (!el || reduceMotion) return null;
    const words = el.textContent.trim().split(/[ \t\n\r]+/);
    el.textContent = '';
    const spans = words.map((word, i) => {
      const span = document.createElement('span');
      span.className = 'sw';
      span.textContent = word;
      el.appendChild(span);
      if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
      return span;
    });
    let lastKey = -1;
    return function update(vh) {
      const rect = el.getBoundingClientRect();
      const p = clamp((vh * 0.85 - rect.top) / (rect.height + vh * 0.3), 0, 1);
      const lit = p * spans.length;
      const key = Math.round(lit * 4);
      if (key === lastKey) return;
      lastKey = key;
      spans.forEach((span, i) => {
        span.style.opacity = (0.28 + 0.72 * clamp(lit - i, 0, 1)).toFixed(2);
      });
    };
  })();

  const feature = $('[data-feature]');
  function updateFeature(vh) {
    if (!feature || reduceMotion) return;
    const rect = feature.parentElement.getBoundingClientRect();
    const p = clamp((vh - rect.top) / (vh * 0.75), 0, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    feature.style.transform = `scale(${(0.92 + 0.08 * eased).toFixed(4)})`;
  }

  const terminal = $('[data-terminal]');
  if (terminal) {
    const lines = $$('.t-line', terminal);
    if (reduceMotion) {
      lines.forEach((line) => line.classList.add('is-on'));
    } else {
      let done = false;
      watch(terminal, (isVisible) => {
        if (!isVisible || done) return;
        done = true;
        lines.forEach((line, i) => window.setTimeout(() => line.classList.add('is-on'), 400 + i * 480));
      }, { threshold: 0.4 });
    }
  }

  /* ---------------------------------------------------------------------
     11. Boucle de scroll unique
     --------------------------------------------------------------------- */
  const nav = $('[data-nav]');
  const progressEl = $('[data-progress]');
  const heroCopy = $('[data-hero-copy]');
  const heroVisual = $('[data-hero-visual]');
  // Parallaxe seulement quand texte et console sont côte à côte : empilés, ils se chevaucheraient.
  const sideBySide = window.matchMedia('(min-width: 1040px)');
  sideBySide.addEventListener('change', () => {
    heroCopy.style.transform = '';
    heroCopy.style.opacity = '';
    heroVisual.style.transform = '';
  });
  let lastY = window.scrollY;
  let ticking = false;
  let menuOpen = false;

  function update() {
    ticking = false;
    const y = window.scrollY;
    const vh = window.innerHeight;
    const max = document.documentElement.scrollHeight - vh;
    progressEl.style.transform = `scaleX(${max > 0 ? (y / max).toFixed(4) : 0})`;

    nav.classList.toggle('is-scrolled', y > 8);
    if (!menuOpen) {
      if (y > lastY + 4 && y > 320) nav.classList.add('is-hidden');
      else if (y < lastY - 4 || y < 320) nav.classList.remove('is-hidden');
    }
    lastY = y;

    if (!reduceMotion && sideBySide.matches && y < vh * 1.3) {
      heroCopy.style.transform = `translate3d(0, ${(y * 0.16).toFixed(1)}px, 0)`;
      heroCopy.style.opacity = (1 - 0.6 * clamp(y / (vh * 0.8), 0, 1)).toFixed(3);
      heroVisual.style.transform = `translate3d(0, ${(y * 0.06).toFixed(1)}px, 0)`;
    }

    if (method) method(vh);
    if (hscroll) hscroll.update(vh);
    if (scrub) scrub(vh);
    updateFeature(vh);
  }
  function requestUpdate() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }
  window.addEventListener('scroll', requestUpdate, { passive: true });

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (hscroll) hscroll.layout();
      update();
    }, 120);
  });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      if (hscroll) hscroll.layout();
      update();
    });
  }
  window.addEventListener('load', () => {
    if (hscroll) hscroll.layout();
    update();
  });
  update();

  /* ---------------------------------------------------------------------
     12. Survols : halo qui suit le curseur, boutons aimantés
     --------------------------------------------------------------------- */
  if (finePointer) {
    $$('[data-spot]').forEach((el) => {
      const light = document.createElement('span');
      light.className = 'spot-light';
      light.setAttribute('aria-hidden', 'true');
      el.prepend(light);
      el.addEventListener('pointermove', (e) => {
        const rect = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
        el.style.setProperty('--my', `${e.clientY - rect.top}px`);
      });
    });
  }

  if (finePointer && !reduceMotion) {
    $$('[data-magnetic]').forEach((el) => {
      let rect = null;
      el.addEventListener('pointerenter', () => {
        el.style.transform = '';
        rect = el.getBoundingClientRect();
      });
      el.addEventListener('pointermove', (e) => {
        if (!rect) return;
        const x = (e.clientX - rect.left - rect.width / 2) * 0.22;
        const y = (e.clientY - rect.top - rect.height / 2) * 0.35;
        el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      });
      el.addEventListener('pointerleave', () => {
        rect = null;
        el.style.transform = '';
      });
    });
  }

  /* ---------------------------------------------------------------------
     13. Navigation : pastille glissante, lien actif, menu mobile
     --------------------------------------------------------------------- */
  const navLinks = $('[data-nav-links]');
  const pill = $('[data-nav-pill]');
  if (navLinks && pill && finePointer) {
    navLinks.addEventListener('pointerover', (e) => {
      const link = e.target.closest('a');
      if (!link) return;
      const place = () => {
        pill.style.width = `${link.offsetWidth}px`;
        pill.style.transform = `translateX(${link.offsetLeft}px)`;
      };
      if (!pill.classList.contains('is-on')) {
        // Première apparition : on place la pastille sans glissement.
        pill.style.transition = 'opacity .2s';
        place();
        void pill.offsetWidth;
        pill.style.transition = '';
      } else {
        place();
      }
      pill.classList.add('is-on');
    });
    navLinks.addEventListener('pointerleave', () => pill.classList.remove('is-on'));
  }

  const linkFor = new Map();
  $$('.nav-links a[href^="#"]').forEach((a) => {
    const target = document.getElementById(a.getAttribute('href').slice(1));
    if (target) linkFor.set(target, a);
  });
  if (hasIO && linkFor.size) {
    const inBand = new Set();
    const spy = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) inBand.add(entry.target);
          else inBand.delete(entry.target);
        });
        const current = Array.from(inBand).pop();
        linkFor.forEach((a, section) => a.classList.toggle('is-active', section === current));
      },
      { rootMargin: '-45% 0px -50% 0px' }
    );
    linkFor.forEach((_, section) => spy.observe(section));
  }

  const toggle = $('[data-nav-toggle]');
  const menu = $('#mobile-menu');
  function setMenu(open) {
    menuOpen = open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
    menu.hidden = !open;
    nav.classList.toggle('is-open', open);
    if (open) nav.classList.remove('is-hidden');
  }
  if (toggle && menu) {
    toggle.addEventListener('click', () => setMenu(!menuOpen));
    $$('a', menu).forEach((a) => a.addEventListener('click', () => setMenu(false)));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menuOpen) {
        setMenu(false);
        toggle.focus();
      }
    });
  }

  /* ---------------------------------------------------------------------
     14. FAQ en accordéon
     --------------------------------------------------------------------- */
  $$('.faq-q').forEach((button) => {
    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(open));
      button.closest('.faq-item').classList.toggle('is-open', open);
    });
  });

  /* ---------------------------------------------------------------------
     15. Formulaire de contact
     Sans service d'envoi branché (data-endpoint vide), le visiteur récupère
     son message prêt à copier, avec l'adresse email. On n'affiche jamais
     « envoyé » sans confirmation réelle du serveur.
     --------------------------------------------------------------------- */
  const form = $('[data-form]');
  if (form) {
    const statusBox = $('[data-form-status]', form);
    const email = form.dataset.email || '';
    const endpoint = (form.dataset.endpoint || '').trim();

    const composeMessage = (data) =>
      [
        `Nom : ${data.get('nom')}`,
        `Email : ${data.get('email')}`,
        `Activité : ${data.get('activite')}`,
        '',
        data.get('message'),
      ].join('\n');

    function showSent() {
      statusBox.innerHTML = '';
      const strong = document.createElement('strong');
      strong.textContent = 'Demande envoyée.';
      const p = document.createElement('p');
      p.textContent = 'Vous recevrez une réponse sous 24 heures ouvrées.';
      statusBox.append(strong, p);
      statusBox.hidden = false;
      form.reset();
    }

    function showManual(text) {
      statusBox.innerHTML = '';
      const strong = document.createElement('strong');
      strong.textContent = 'Votre message est prêt.';
      const p = document.createElement('p');
      p.textContent = `Copiez-le et envoyez-le à ${email} depuis votre messagerie.`;
      const area = document.createElement('textarea');
      area.className = 'input';
      area.id = 'f-copy';
      area.readOnly = true;
      area.value = text;
      area.setAttribute('aria-label', 'Message à envoyer');
      const row = document.createElement('div');
      row.className = 'cta-row';
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'btn btn-primary';
      copy.textContent = 'Copier le message';
      copy.addEventListener('click', () => {
        const fallback = () => {
          area.focus();
          area.select();
          copy.textContent = 'Texte sélectionné';
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(`${email}\n\n${text}`).then(() => (copy.textContent = 'Copié'), fallback);
        } else {
          fallback();
        }
      });
      const mail = document.createElement('a');
      mail.className = 'btn btn-ghost';
      mail.href = `mailto:${email}?subject=${encodeURIComponent('Demande de devis vidéo')}&body=${encodeURIComponent(text)}`;
      mail.textContent = 'Ouvrir ma messagerie';
      row.append(copy, mail);
      statusBox.append(strong, p, area, row);
      statusBox.hidden = false;
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      const data = new FormData(form);
      const text = composeMessage(data);
      const button = $('[type="submit"]', form);

      if (!endpoint) {
        showManual(text);
        return;
      }

      button.disabled = true;
      let sent = false;
      try {
        const isNetlify = endpoint === '/';
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: isNetlify
            ? { 'Content-Type': 'application/x-www-form-urlencoded' }
            : { Accept: 'application/json' },
          body: isNetlify ? new URLSearchParams(data).toString() : data,
        });
        sent = res.ok;
      } catch (err) {
        sent = false;
      }
      button.disabled = false;
      if (sent) showSent();
      else showManual(text);
    });
  }
})();
