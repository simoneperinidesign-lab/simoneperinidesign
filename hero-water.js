/* =====================================================================
   HERO PARAMETRICO — "superficie d'acqua"
   ---------------------------------------------------------------------
   Sfondo animato dell'hero: una griglia di puntini che si allungano in
   lineette vicino al cursore (attrattore, stile Grasshopper), appoggiata
   su una simulazione d'onda 2D (algoritmo di Hugo Elias).
   · mouse = dito che sfiora l'acqua (attrattore + scia)
   · click / tap = goccia
   · respiro: moto ondoso lento su tutto lo sfondo
   · pioggia: gocce casuali ogni 1–2 s
   · pulsanti: passando sui CTA parte un anello
   Nessuna libreria. Si mette in pausa quando l'hero non è visibile e
   rispetta "riduci movimento" del sistema operativo.
   Tutti i valori da ritoccare sono nel blocco CFG qui sotto.
   ===================================================================== */
(() => {
  // ---- parametri da tarare --------------------------------------------
  const CFG = {
    style: 'hybrid',    // 'dots' | 'lines' | 'hybrid' (puntini che diventano lineette vicino al cursore)
    spacing: 16,        // passo della griglia (px) — mobile: +2
    cell: 6,            // risoluzione della simulazione (px per cella)
    damping: 0.985,     // smorzamento per step
    stepsPerSec: 80,    // velocità di propagazione
    sponge: 14,         // celle di bordo che assorbono l'onda (niente rimbalzi)
    trailAmp: 0.045,    // intensità della scia del mouse
    dropAmp: 1.1,       // goccia al click
    dropRadius: 22,     // larghezza della goccia (px): più grande = onda più morbida
    introAmp: 1.4,      // goccia d'apertura
    base: 0.2,          // luminosità minima dei puntini ovunque (0 = spenti)
    // — idee v3 (tutte disattivabili) —
    breath: true,       // RESPIRO: moto ondoso lento su tutto lo sfondo
    breathAmp: 0.16,    //   intensità del respiro
    breathScale: 0.0022,//   ampiezza delle "onde lunghe" (più piccolo = onde più larghe)
    rain: true,         // PIOGGIA: gocce casuali su tutto lo sfondo
    rainAmp: 0.6,       //   intensità (a riposo; ridotta mentre usi il mouse)
    rainEvery: [0.9, 2.2], // secondi tra una goccia e l'altra
    rainDouble: 0.35,   //   probabilità di una doppia goccia (crea interferenze)
    buttons: true,      // PULSANTI: passando sui CTA parte un anello dal pulsante
    buttonAmp: 0.7,
    heightGain: 7,      // quanto la cresta illumina/ingrandisce i segni
    shift: 3,           // spostamento max dei segni lungo la pendenza (px)
  };

  const hero = document.getElementById('hero');
  if (!hero) return;
  const cv = document.createElement('canvas');                        // il canvas lo crea lo script:
  cv.className = 'hero-fx'; cv.setAttribute('aria-hidden', 'true');   // nell'HTML non serve toccare nulla
  hero.prepend(cv);
  hero.classList.add('hero--live');                                   // spegne la texture statica (vedi style.css)
  const ctx = cv.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = 0, H = 0, dpr = 1, running = true, readyFired = false;
  let t0 = performance.now(), last = t0, acc = 0, nextIdle = 0;

  // ---- superficie d'acqua ---------------------------------------------
  let cols = 0, rows = 0, cur, prv, damp;
  function initWater() {
    cols = Math.ceil(W / CFG.cell) + 2; rows = Math.ceil(H / CFG.cell) + 2;
    cur = new Float32Array(cols * rows); prv = new Float32Array(cols * rows); damp = new Float32Array(cols * rows);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {   // smorzamento extra verso i bordi
      const e = Math.min(i, j, cols - 1 - i, rows - 1 - j) / CFG.sponge;
      damp[j * cols + i] = CFG.damping * (e >= 1 ? 1 : 0.75 + 0.25 * e);
    }
  }
  function stepWater() {
    const c = cols;
    for (let j = 1; j < rows - 1; j++) {
      let k = j * c + 1;
      for (let i = 1; i < c - 1; i++, k++)
        prv[k] = ((cur[k - 1] + cur[k + 1] + cur[k - c] + cur[k + c]) * 0.5 - prv[k]) * damp[k];
    }
    const tmp = cur; cur = prv; prv = tmp;
  }
  function disturb(px, py, amp, radiusPx) {
    const cx = px / CFG.cell, cy = py / CFG.cell, r = radiusPx / CFG.cell, R = Math.ceil(r * 2.5);
    for (let j = Math.max(1, (cy | 0) - R); j <= Math.min(rows - 2, (cy | 0) + R); j++)
      for (let i = Math.max(1, (cx | 0) - R); i <= Math.min(cols - 2, (cx | 0) + R); i++) {
        const dd = ((i - cx) ** 2 + (j - cy) ** 2) / (r * r);
        if (dd < 6) { const v = amp * Math.exp(-dd); cur[j * cols + i] += v; prv[j * cols + i] += v; } // goccia "morbida"
      }
  }
  function height(x, y) {
    const fx = clamp(x / CFG.cell, 0, cols - 1.001), fy = clamp(y / CFG.cell, 0, rows - 1.001);
    const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, k = j * cols + i;
    return (cur[k] * (1 - u) + cur[k + 1] * u) * (1 - v) + (cur[k + cols] * (1 - u) + cur[k + cols + 1] * u) * v;
  }

  // ---- puntatore: attrattore + scia -----------------------------------
  const att = { x: 0, y: 0, tx: 0, ty: 0, lastMove: -1e9 };
  const ptr = { x: 0, y: 0, px: null, py: null };
  const local = e => { const r = hero.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  hero.addEventListener('pointermove', e => {
    const [x, y] = local(e);
    att.tx = x; att.ty = y; att.lastMove = performance.now();
    ptr.x = x; ptr.y = y; if (ptr.px === null) { ptr.px = x; ptr.py = y; }
  });
  hero.addEventListener('pointerleave', () => { ptr.px = null; });
  hero.addEventListener('pointerdown', e => {
    const [x, y] = local(e); disturb(x, y, CFG.dropAmp, CFG.dropRadius);
    att.tx = x; att.ty = y; att.lastMove = performance.now();
  });
  function applyTrail() {
    if (ptr.px === null) return;
    const dx = ptr.x - ptr.px, dy = ptr.y - ptr.py, dist = Math.hypot(dx, dy);
    if (dist < 0.5) return;
    const amp = CFG.trailAmp * clamp(dist / 30, 0.1, 1), n = Math.ceil(dist / CFG.cell);
    for (let s = 1; s <= n; s++) disturb(ptr.px + dx * s / n, ptr.py + dy * s / n, -amp / n * 2, 14);
    ptr.px = ptr.x; ptr.py = ptr.y;
  }
  function updateAttractor(now) {
    if (now - att.lastMove > 3000) {
      const s = now * 0.00012;
      att.tx = W * (0.64 + 0.2 * Math.sin(s * 1.3));
      att.ty = H * (0.5 + 0.25 * Math.sin(s * 2.1 + 1));
    }
    att.x += (att.tx - att.x) * 0.06; att.y += (att.ty - att.y) * 0.06;
  }

  // ---- helper ---------------------------------------------------------
  const perm = new Uint8Array(512); { const p = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) perm[i] = p[i & 255]; }
  const G = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
  function noise(x, y) {            // simplex 2D
    const F = 0.3660254, Gk = 0.2113249, s = (x + y) * F, i = Math.floor(x + s), j = Math.floor(y + s), t = (i + j) * Gk;
    const x0 = x - i + t, y0 = y - j + t, i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
    const x1 = x0 - i1 + Gk, y1 = y0 - j1 + Gk, x2 = x0 - 1 + 2 * Gk, y2 = y0 - 1 + 2 * Gk, ii = i & 255, jj = j & 255;
    const c = (g, dx, dy) => { let tt = 0.5 - dx * dx - dy * dy; if (tt < 0) return 0; tt *= tt; return tt * tt * (g[0] * dx + g[1] * dy); };
    return 70 * (c(G[perm[ii + perm[jj]] & 7], x0, y0) + c(G[perm[ii + i1 + perm[jj + j1]] & 7], x1, y1) + c(G[perm[ii + 1 + perm[jj + 1]] & 7], x2, y2));
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  const easeOut = x => 1 - Math.pow(1 - x, 3);
  const rand = (a, b) => a + Math.random() * (b - a);
  const LV = 14;                                  // livelli di intensità (disegno a lotti → veloce)
  const COL = Array.from({ length: LV }, (_, i) => { const k = i / (LV - 1);
    return `hsla(${253 - k * 6}, ${95 - k * 10}%, ${57 + k * 25}%, ${0.18 + 0.77 * k})`; }); // #5729fc → lavanda
  const buckets = Array.from({ length: LV }, () => []);

  // ---- disegno --------------------------------------------------------
  function draw(intro, t = 0) {
    const sp = CFG.spacing + (W < 700 ? 2 : 0), R = Math.hypot(W, H), cx = W * 0.62, cy = H * 0.5, e = CFG.cell;
    const style = CFG.style;
    ctx.clearRect(0, 0, W, H);
    for (const b of buckets) b.length = 0;

    for (let y = sp / 2; y < H; y += sp) for (let x = sp / 2; x < W; x += sp) {
      const dc = Math.hypot(x - cx, y - cy) / (R * 0.6);
      const vis = clamp((intro * 1.25 - dc) * 3, 0, 1);
      if (vis <= 0) continue;

      const h = height(x, y);
      const gx = (height(x + e, y) - height(x - e, y)) * 0.5, gy = (height(x, y + e) - height(x, y - e)) * 0.5;

      const dx = att.x - x, dy = att.y - y, d = Math.hypot(dx, dy);
      let f = 1 - clamp(d / (R * 0.4), 0, 1); f *= f;

      const br = CFG.breath ? noise(x * CFG.breathScale + t * 0.045, y * CFG.breathScale - t * 0.03) * CFG.breathAmp : 0;
      const k = clamp(CFG.base + br + f * 0.75 + h * CFG.heightGain, 0, 1) * easeOut(vis);
      const sx = x - clamp(gx * 60, -CFG.shift, CFG.shift), sy = y - clamp(gy * 60, -CFG.shift, CFG.shift);
      const a = Math.atan2(dy, dx) + Math.PI / 2;
      buckets[Math.round(k * (LV - 1))].push(sx, sy, a, f);
    }

    ctx.lineCap = 'round';
    for (let b = 0; b < LV; b++) {
      const P = buckets[b]; if (!P.length) continue;
      const k = b / (LV - 1);
      ctx.fillStyle = ctx.strokeStyle = COL[b];
      ctx.lineWidth = 0.7 + k * 0.9;
      const r = 0.7 + k * 1.5;                      // raggio del puntino
      const dots = new Path2D(), lines = new Path2D();
      for (let i = 0; i < P.length; i += 4) {
        const x = P[i], y = P[i + 1], a = P[i + 2], f = P[i + 3];
        // lunghezza: 'lines' sempre lineette; 'hybrid' solo vicino all'attrattore
        const len = style === 'dots' ? 0 : style === 'lines' ? (1.5 + k * sp * 0.55) / 2 : (f * sp * 0.75) / 2;
        if (len < 1.2) { dots.moveTo(x + r, y); dots.arc(x, y, r, 0, 6.2832); }
        else { const ux = Math.cos(a) * len, uy = Math.sin(a) * len; lines.moveTo(x - ux, y - uy); lines.lineTo(x + ux, y + uy); }
      }
      ctx.fill(dots); ctx.stroke(lines);
    }
  }

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    const t = (now - t0) / 1000, intro = clamp(t / 1.8, 0, 1.2);
    if (!readyFired && intro > 0.35) { hero.classList.add('is-ready'); readyFired = true; }

    updateAttractor(now);
    applyTrail();
    if (CFG.rain && t > nextIdle) {                                   // pioggia su tutto lo sfondo
      const amp = CFG.rainAmp * (now - att.lastMove > 3000 ? 1 : 0.5), x = rand(W * 0.05, W * 0.95), y = rand(H * 0.1, H * 0.9);
      disturb(x, y, amp, CFG.dropRadius * rand(0.8, 1.3));
      if (Math.random() < CFG.rainDouble) {                           // seconda goccia vicina → interferenza
        const a = rand(0, 6.28), d = rand(60, 140);
        setTimeout(() => disturb(x + Math.cos(a) * d, y + Math.sin(a) * d, amp * 0.8, CFG.dropRadius), rand(80, 260));
      }
      nextIdle = t + rand(...CFG.rainEvery);
    }
    acc += dt * CFG.stepsPerSec;
    let n = 0; while (acc >= 1 && n < 4) { stepWater(); acc -= 1; n++; } if (n === 4) acc = 0;

    draw(intro, t);
    if (running) requestAnimationFrame(frame);
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = hero.getBoundingClientRect();
    if (Math.abs(r.width - W) < 1 && Math.abs(r.height - H) < 1 && cur) return;
    W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!att.x) { att.x = att.tx = W * 0.64; att.y = att.ty = H * 0.5; }
    initWater();
  }
  function start() {
    t0 = last = performance.now(); acc = 0; nextIdle = 2.2; readyFired = false;
    hero.classList.remove('is-ready');
    initWater(); disturb(W * 0.62, H * 0.5, CFG.introAmp, CFG.dropRadius * 1.2);
  }

  resize();
  if (reduced) {
    hero.classList.add('is-ready'); initWater(); draw(1.2);
    addEventListener('resize', () => { resize(); draw(1.2); });
    return;
  }
  new ResizeObserver(resize).observe(hero);                           // anche quando cambia lingua IT/EN
  new IntersectionObserver(([en]) => {
    const was = running; running = en.isIntersecting;
    if (running && !was) { last = performance.now(); requestAnimationFrame(frame); }
  }).observe(hero);
  hero.querySelectorAll('.btn').forEach(b => b.addEventListener('pointerenter', () => {
    if (!CFG.buttons) return;
    const r = b.getBoundingClientRect(), hr = hero.getBoundingClientRect();
    disturb(r.left + r.width / 2 - hr.left, r.top + r.height / 2 - hr.top, CFG.buttonAmp, 26);
  }));
  start();
  requestAnimationFrame(frame);

})();
