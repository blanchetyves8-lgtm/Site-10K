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
     6. Réseau neuronal du hero
     Les nœuds proches du curseur s'écartent et s'activent, les signaux se
     propagent couche par couche, un clic déclenche une salve.
     --------------------------------------------------------------------- */
  function neuralNet(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const stage = canvas.parentElement;
    const hero = canvas.closest('.hero') || stage;
    const STEP = 1000 / 60;
    const RADIUS = 120;
    const LINE_LEVELS = 8;
    const NODE_LEVELS = 6;
    const ink = [83, 58, 253];
    const ramp = (from, k) => from.map((v, j) => Math.round(v + (ink[j] - v) * k));
    const lineColors = Array.from({ length: LINE_LEVELS }, (_, i) => {
      const k = i / (LINE_LEVELS - 1);
      const c = ramp([214, 217, 252], Math.pow(k, 0.7));
      return `rgba(${c[0]},${c[1]},${c[2]},${(0.7 + 0.3 * k).toFixed(2)})`;
    });
    const nodeFills = Array.from({ length: NODE_LEVELS }, (_, i) => {
      const c = ramp([255, 255, 255], i / (NODE_LEVELS - 1));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    });
    const nodeStrokes = Array.from({ length: NODE_LEVELS }, (_, i) => {
      const c = ramp([185, 185, 249], i / (NODE_LEVELS - 1));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    });
    const lineBuckets = Array.from({ length: LINE_LEVELS }, () => []);
    const nodeBuckets = Array.from({ length: NODE_LEVELS }, () => []);

    let w = 0;
    let h = 0;
    let nodes = [];
    let links = [];
    let inputs = [];
    let pulses = [];
    const rings = [];
    let raf = 0;
    let running = false;
    let visible = false;
    let booted = false;
    let last = 0;
    let acc = 0;
    let clock = 0;
    let idle = 600;
    const pointer = { x: -1e4, y: -1e4, s: 0, ts: 0, moving: 0 };
    const tilt = { x: 0, y: 0, tx: 0, ty: 0 };

    // Tirage à graine fixe : le réseau garde la même forme à chaque redimensionnement.
    function seeded(seed) {
      return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    function build() {
      const rand = seeded(7);
      const layers = w < 520 ? [4, 7, 10, 12, 10, 7, 4] : [5, 9, 13, 16, 13, 9, 5];
      const maxCount = Math.max(...layers);
      const padX = Math.max(14, w * 0.05);
      const padY = Math.max(14, h * 0.07);
      nodes = [];
      links = [];
      pulses = [];
      const byLayer = layers.map((count, li) => {
        const x = padX + ((w - 2 * padX) * li) / (layers.length - 1);
        const span = (h - 2 * padY) * (0.3 + 0.7 * (count / maxCount));
        return Array.from({ length: count }, (_, k) => {
          const y = h / 2 - span / 2 + (count > 1 ? (span * k) / (count - 1) : span / 2);
          const bx = x + (rand() - 0.5) * Math.min(16, w * 0.025);
          const by = y + (rand() - 0.5) * 6;
          const node = {
            bx,
            by,
            x: bx,
            y: by,
            vx: 0,
            vy: 0,
            a: 0,
            flash: 0,
            cool: 0,
            z: 0.35 + rand() * 0.65,
            phase: rand() * Math.PI * 2,
            out: [],
          };
          nodes.push(node);
          return node;
        });
      });
      for (let li = 0; li < byLayer.length - 1; li++) {
        const next = byLayer[li + 1];
        byLayer[li].forEach((from) => {
          next.forEach((to) => {
            if (rand() >= 0.6) return;
            const link = { from, to, wgt: 0.35 + rand() * 0.65, heat: 0 };
            links.push(link);
            from.out.push(link);
          });
          if (!from.out.length) {
            const link = { from, to: next[Math.floor(rand() * next.length)], wgt: 0.7, heat: 0 };
            links.push(link);
            from.out.push(link);
          }
        });
      }
      inputs = byLayer[0];
    }

    function fire(node) {
      node.cool = 420;
      node.flash = 1;
      node.a *= 0.5;
      const pool = node.out.slice();
      const count = Math.min(pool.length, 2 + Math.floor(Math.random() * 3));
      for (let i = 0; i < count; i++) {
        // Tirage pondéré : les connexions fortes portent plus souvent le signal.
        let total = 0;
        pool.forEach((l) => (total += l.wgt));
        let r = Math.random() * total;
        let idx = 0;
        while (idx < pool.length - 1 && (r -= pool[idx].wgt) > 0) idx++;
        const link = pool.splice(idx, 1)[0];
        link.heat = Math.max(link.heat, 0.45);
        pulses.push({ link, t: 0, speed: STEP / (300 + (1 - link.wgt) * 360) });
      }
      if (pulses.length > 320) pulses.splice(0, pulses.length - 320);
    }

    function burst(x, y) {
      rings.push({ x, y, age: 0 });
      if (rings.length > 4) rings.shift();
      nodes.forEach((n) => {
        const dx = n.x - x;
        const dy = n.y - y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        if (d > 150) return;
        n.a = 1;
        n.cool = 0;
        n.vx += (dx / d) * 7 * (1 - d / 150);
        n.vy += (dy / d) * 7 * (1 - d / 150);
      });
    }

    function step() {
      clock += STEP;
      pointer.s += (pointer.ts - pointer.s) * 0.1;
      tilt.x += (tilt.tx - tilt.x) * 0.05;
      tilt.y += (tilt.ty - tilt.y) * 0.05;
      if (pointer.moving > 0) pointer.moving -= STEP;
      const excite = pointer.moving > 0 ? 0.08 : 0.025;

      for (const n of nodes) {
        let tx = n.bx + Math.sin(clock * 0.0007 + n.phase) * 2.5 * n.z + tilt.x * 18 * n.z;
        let ty = n.by + Math.cos(clock * 0.0006 + n.phase * 1.7) * 3 * n.z + tilt.y * 12 * n.z;
        if (pointer.s > 0.01) {
          const dx = n.x - pointer.x;
          const dy = n.y - pointer.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          if (d < RADIUS) {
            const f = 1 - d / RADIUS;
            tx += (dx / d) * f * f * 32 * pointer.s;
            ty += (dy / d) * f * f * 32 * pointer.s;
            n.a = Math.min(1, n.a + f * excite * pointer.s);
          }
        }
        n.vx = (n.vx + (tx - n.x) * 0.075) * 0.8;
        n.vy = (n.vy + (ty - n.y) * 0.075) * 0.8;
        n.x += n.vx;
        n.y += n.vy;
        n.a *= 0.968;
        n.flash *= 0.9;
        if (n.cool > 0) n.cool -= STEP;
        else if (n.a > 0.6) fire(n);
      }

      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i];
        p.t += p.speed;
        if (p.t < 1) continue;
        p.link.to.a = Math.min(1, p.link.to.a + p.link.wgt * 0.7);
        p.link.heat = 1;
        pulses.splice(i, 1);
      }
      for (const l of links) l.heat *= 0.95;
      for (let i = rings.length - 1; i >= 0; i--) {
        rings[i].age += STEP;
        if (rings[i].age > 900) rings.splice(i, 1);
      }

      // Même sans souris, la couche d'entrée reçoit des signaux.
      idle -= STEP;
      if (idle <= 0) {
        const n = inputs[Math.floor(Math.random() * inputs.length)];
        n.a = 1;
        n.cool = 0;
        idle = 420 + Math.random() * 640;
      }
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);

      lineBuckets.forEach((b) => (b.length = 0));
      const lens = pointer.s > 0.01;
      for (const l of links) {
        let v = 0.04 + l.wgt * 0.1 + l.heat * 0.75 + (l.from.a + l.to.a) * 0.2;
        if (lens) {
          // Les connexions sous le curseur s'allument.
          const mx = (l.from.x + l.to.x) / 2 - pointer.x;
          const my = (l.from.y + l.to.y) / 2 - pointer.y;
          const near = 1 - Math.sqrt(mx * mx + my * my) / (RADIUS * 1.1);
          if (near > 0) v += near * 0.45 * pointer.s;
        }
        lineBuckets[Math.floor(Math.min(0.999, v) * LINE_LEVELS)].push(l.from.x, l.from.y, l.to.x, l.to.y);
      }
      for (let i = 0; i < LINE_LEVELS; i++) {
        const b = lineBuckets[i];
        if (!b.length) continue;
        ctx.strokeStyle = lineColors[i];
        ctx.lineWidth = i >= LINE_LEVELS - 2 ? 1.4 : 1;
        ctx.beginPath();
        for (let j = 0; j < b.length; j += 4) {
          ctx.moveTo(b[j], b[j + 1]);
          ctx.lineTo(b[j + 2], b[j + 3]);
        }
        ctx.stroke();
      }

      if (pulses.length) {
        ctx.strokeStyle = 'rgba(83, 58, 253, 0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (const p of pulses) {
          const { from, to } = p.link;
          const t0 = Math.max(0, p.t - 0.16);
          ctx.moveTo(from.x + (to.x - from.x) * t0, from.y + (to.y - from.y) * t0);
          ctx.lineTo(from.x + (to.x - from.x) * p.t, from.y + (to.y - from.y) * p.t);
        }
        ctx.stroke();
        ctx.fillStyle = '#533afd';
        for (const p of pulses) {
          const { from, to } = p.link;
          ctx.fillRect(from.x + (to.x - from.x) * p.t - 1.5, from.y + (to.y - from.y) * p.t - 1.5, 3, 3);
        }
      }

      if (lens) {
        ctx.strokeStyle = `rgba(185, 185, 249, ${(0.7 * pointer.s).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(pointer.x, pointer.y, RADIUS, 0, Math.PI * 2);
        ctx.stroke();
      }

      for (const r of rings) {
        const k = r.age / 900;
        ctx.strokeStyle = `rgba(83, 58, 253, ${(0.6 * (1 - k)).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(r.x, r.y, 12 + k * 150, 0, Math.PI * 2);
        ctx.stroke();
      }

      nodeBuckets.forEach((b) => (b.length = 0));
      for (const n of nodes) nodeBuckets[Math.min(NODE_LEVELS - 1, Math.floor(n.a * NODE_LEVELS))].push(n);
      ctx.lineWidth = 1;
      for (let i = 0; i < NODE_LEVELS; i++) {
        const b = nodeBuckets[i];
        if (!b.length) continue;
        ctx.fillStyle = nodeFills[i];
        ctx.strokeStyle = nodeStrokes[i];
        ctx.beginPath();
        for (const n of b) {
          const size = Math.round(5 + n.a * 4 + n.flash * 3);
          ctx.rect(Math.round(n.x - size / 2) + 0.5, Math.round(n.y - size / 2) + 0.5, size, size);
        }
        ctx.fill();
        ctx.stroke();
      }
    }

    // Image fixe pour le mouvement réduit : un chemin allumé de l'entrée à la sortie.
    function paintStill() {
      let node = inputs[Math.floor(inputs.length / 2)];
      while (node) {
        node.a = 0.9;
        const link = node.out.reduce((best, l) => (!best || l.wgt > best.wgt ? l : best), null);
        if (!link) break;
        link.heat = 1;
        node = link.to;
      }
      draw();
    }

    function resize() {
      const rect = stage.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
      if (reduceMotion) paintStill();
      else draw();
    }

    function frame(now) {
      const dt = last ? Math.min(now - last, 100) : STEP;
      last = now;
      acc += dt;
      let steps = 0;
      while (acc >= STEP && steps < 6) {
        step();
        acc -= STEP;
        steps++;
      }
      if (steps === 6) acc = 0;
      draw();
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (running || reduceMotion || !visible || document.hidden) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(frame);
      if (!booted) {
        booted = true;
        // Première vague : toute la couche d'entrée s'allume.
        window.setTimeout(() => inputs.forEach((n) => ((n.a = 1), (n.cool = 0))), 500);
      }
    }
    function stop() {
      running = false;
      cancelAnimationFrame(raf);
    }

    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(stage);
    else window.addEventListener('resize', resize);
    resize();

    watch(stage, (isVisible) => {
      visible = isVisible;
      if (isVisible) start();
      else stop();
    });
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

    if (reduceMotion) return;
    hero.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const hr = hero.getBoundingClientRect();
      tilt.tx = clamp(((e.clientX - hr.left) / hr.width - 0.5) * 2, -1, 1);
      tilt.ty = clamp(((e.clientY - hr.top) / hr.height - 0.5) * 2, -1, 1);
      const cr = canvas.getBoundingClientRect();
      pointer.x = e.clientX - cr.left;
      pointer.y = e.clientY - cr.top;
      const inside = pointer.x > -40 && pointer.y > -40 && pointer.x < cr.width + 40 && pointer.y < cr.height + 40;
      pointer.ts = inside ? 1 : 0;
      pointer.moving = 160;
    });
    hero.addEventListener('pointerleave', () => {
      pointer.ts = 0;
      tilt.tx = 0;
      tilt.ty = 0;
    });
    stage.addEventListener('pointerdown', (e) => {
      const cr = canvas.getBoundingClientRect();
      burst(e.clientX - cr.left, e.clientY - cr.top);
    });
  }
  const netCanvas = $('[data-net]');
  if (netCanvas) neuralNet(netCanvas);

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
     8. Calendrier du contact : un curseur choisit une date, une heure, confirme
     --------------------------------------------------------------------- */
  function calendarDemo(card) {
    const daysEl = $('[data-cal-days]', card);
    const monthEl = $('[data-cal-month]', card);
    const labelEl = $('[data-cal-label]', card);
    const slotsBox = $('.cal-slots', card);
    const slots = $$('.cal-slot', card);
    const summaryEl = $('[data-cal-summary]', card);
    const confirmEl = $('[data-cal-confirm]', card);
    const confirmText = $('[data-cal-confirm-text]', card);
    const cursor = $('[data-cal-cursor]', card);
    const ring = $('[data-cal-ring]', card);
    const TIP_X = 3.7; // pointe de la flèche dans le SVG de 22px
    const TIP_Y = 1.8;
    const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
    const dayFormat = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    const shortFormat = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

    // Mois affiché : le mois en cours, ou le suivant s'il reste trop peu de jours ouvrés.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const openDays = (first) => {
      const list = [];
      const total = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
      for (let d = 1; d <= total; d++) {
        const date = new Date(first.getFullYear(), first.getMonth(), d);
        const weekday = date.getDay();
        if (date > today && weekday !== 0 && weekday !== 6) list.push(d);
      }
      return list;
    };
    let view = new Date(today.getFullYear(), today.getMonth(), 1);
    if (openDays(view).length < 6) view = new Date(view.getFullYear(), view.getMonth() + 1, 1);
    const open = openDays(view);
    const dateOf = (d) => new Date(view.getFullYear(), view.getMonth(), d);
    monthEl.textContent = capitalize(new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(view));

    const cells = {};
    const offset = (view.getDay() + 6) % 7; // semaine commençant le lundi
    const total = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    daysEl.textContent = '';
    for (let i = 0; i < offset; i++) {
      const blank = document.createElement('span');
      blank.className = 'cal-day is-blank';
      daysEl.appendChild(blank);
    }
    for (let d = 1; d <= total; d++) {
      const cell = document.createElement('span');
      cell.className = 'cal-day';
      cell.textContent = String(d);
      if (dateOf(d).getTime() === today.getTime()) cell.classList.add('is-today');
      if (open.includes(d)) cell.classList.add('is-open');
      daysEl.appendChild(cell);
      cells[d] = cell;
    }
    slots.forEach((slot, k) => slot.style.setProperty('--k', k));

    let timers = [];
    let round = 0;
    let running = false;
    let cardVisible = false;
    const later = (ms, fn) => timers.push(window.setTimeout(fn, ms));
    const clearTimers = () => {
      timers.forEach((t) => window.clearTimeout(t));
      timers = [];
    };

    // Coordonnées d'un élément dans la carte (sous la bordure).
    function point(el, fx = 0.55, fy = 0.6) {
      const r = el.getBoundingClientRect();
      const c = card.getBoundingClientRect();
      return {
        x: r.left - c.left - card.clientLeft + r.width * fx,
        y: r.top - c.top - card.clientTop + r.height * fy,
      };
    }
    function moveTo(p, instant = false) {
      cursor.classList.toggle('is-instant', instant);
      cursor.style.setProperty('--cx', `${(p.x - TIP_X).toFixed(1)}px`);
      cursor.style.setProperty('--cy', `${(p.y - TIP_Y).toFixed(1)}px`);
      if (instant) void cursor.getBoundingClientRect();
    }
    function click(p) {
      cursor.classList.add('is-press');
      later(150, () => cursor.classList.remove('is-press'));
      ring.style.setProperty('--rx', `${p.x.toFixed(1)}px`);
      ring.style.setProperty('--ry', `${p.y.toFixed(1)}px`);
      ring.classList.remove('is-on');
      void ring.offsetWidth;
      ring.classList.add('is-on');
    }
    const rest = () => ({ x: card.clientWidth * 0.5, y: card.clientHeight - 22 });

    function reset() {
      Object.values(cells).forEach((c) => c.classList.remove('is-selected', 'is-hover'));
      slots.forEach((slot) => slot.classList.remove('is-selected', 'is-hover', 'is-taken'));
      slotsBox.classList.remove('is-on');
      labelEl.textContent = 'Choisissez une date';
      labelEl.classList.remove('is-set');
      summaryEl.textContent = 'Aucun créneau choisi';
      summaryEl.classList.remove('is-set');
      confirmEl.classList.remove('is-ready', 'is-hover', 'is-done', 'is-press');
      confirmText.textContent = 'Confirmer';
    }

    function pickDate(day, takenIndex) {
      cells[day].classList.remove('is-hover');
      cells[day].classList.add('is-selected');
      labelEl.textContent = capitalize(dayFormat.format(dateOf(day)));
      labelEl.classList.add('is-set');
      slots[takenIndex].classList.add('is-taken');
      slotsBox.classList.add('is-on');
    }
    function pickSlot(day, slot) {
      slot.classList.remove('is-hover');
      slot.classList.add('is-selected');
      summaryEl.textContent = `${shortFormat.format(dateOf(day))} · ${slot.textContent}`;
      summaryEl.classList.add('is-set');
      confirmEl.classList.add('is-ready');
    }
    function confirm() {
      confirmEl.classList.remove('is-hover', 'is-ready');
      confirmEl.classList.add('is-done');
      confirmText.textContent = 'Appel réservé';
    }

    function play() {
      clearTimers();
      reset();
      const day = open[(2 + round * 3) % open.length];
      const slot = slots[[1, 3, 0, 4, 2][round % 5]];
      const takenIndex = [2, 0, 4, 1, 5][round % 5];
      round++;
      const cell = cells[day];

      later(400, () => moveTo(point(cell)));
      later(1350, () => cell.classList.add('is-hover'));
      later(1550, () => {
        click(point(cell));
        pickDate(day, takenIndex);
      });
      later(2300, () => moveTo(point(slot)));
      later(3250, () => slot.classList.add('is-hover'));
      later(3450, () => {
        click(point(slot));
        pickSlot(day, slot);
      });
      later(4200, () => moveTo(point(confirmEl, 0.5, 0.55)));
      later(5150, () => confirmEl.classList.add('is-hover'));
      later(5350, () => {
        click(point(confirmEl, 0.5, 0.55));
        confirmEl.classList.add('is-press');
        later(160, () => confirmEl.classList.remove('is-press'));
        confirm();
      });
      later(6300, () => moveTo(rest()));
      later(8600, play);
    }

    function start() {
      if (running || document.hidden || !cardVisible) return;
      running = true;
      moveTo(rest(), true);
      play();
    }
    function stop() {
      running = false;
      clearTimers();
    }

    if (reduceMotion) {
      // État final immobile : date, heure et confirmation déjà choisies.
      const day = open[Math.min(2, open.length - 1)];
      pickDate(day, 2);
      pickSlot(day, slots[1]);
      confirm();
      moveTo(point(confirmEl, 0.5, 0.55), true);
      return;
    }
    watch(card, (isVisible) => {
      cardVisible = isVisible;
      if (isVisible) start();
      else stop();
    }, { threshold: 0.3 });
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  }
  const calendar = $('[data-cal]');
  if (calendar) calendarDemo(calendar);

  /* ---------------------------------------------------------------------
     9. Section exemples : scroll horizontal épinglé (desktop)
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
     10. Méthode : étape active, rail de progression, panneau visuel
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
     11. Série : texte qui s'allume au scroll, panneau qui s'ouvre, terminal
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
     12. Boucle de scroll unique
     --------------------------------------------------------------------- */
  const nav = $('[data-nav]');
  const progressEl = $('[data-progress]');
  const darkBands = $$('.section--dark');
  const heroCopy = $('[data-hero-copy]');
  const heroVisual = $('[data-hero-visual]');
  // Parallaxe seulement quand texte et réseau sont côte à côte : empilés, ils se chevaucheraient.
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
    const navLine = nav.offsetHeight / 2;
    const overDark = darkBands.some((band) => {
      const r = band.getBoundingClientRect();
      return r.top <= navLine && r.bottom >= navLine;
    });
    nav.classList.toggle('is-dark', overDark);
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
     13. Survols : halo qui suit le curseur, boutons aimantés
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
     14. Navigation : pastille glissante, lien actif, menu mobile
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
     15. FAQ en accordéon
     --------------------------------------------------------------------- */
  $$('.faq-q').forEach((button) => {
    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(open));
      button.closest('.faq-item').classList.toggle('is-open', open);
    });
  });

  /* ---------------------------------------------------------------------
     16. Formulaire de contact
     Sans service d'envoi branché (data-endpoint vide), le visiteur récupère
     son message prêt à copier, avec l'adresse email. On n'affiche jamais
     « envoyé » sans confirmation réelle du serveur.
     --------------------------------------------------------------------- */
  const form = $('[data-form]');
  if (form) {
    const statusBox = $('[data-form-status]', form);
    const email = form.dataset.email || '';
    const endpoint = (form.dataset.endpoint || '').trim();

    const composeMessage = (data) => {
      const lines = [`Nom : ${data.get('nom')}`, `Email : ${data.get('email')}`];
      if (data.get('entreprise')) lines.push(`Entreprise : ${data.get('entreprise')}`);
      if (data.get('pays')) lines.push(`Pays : ${data.get('pays')}`);
      lines.push(`Activité : ${data.get('activite')}`, '', data.get('message'));
      return lines.join('\n');
    };

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
