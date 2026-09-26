// Game layer: starfield, companion ship + crosshair cursor, click lasers,
// XP bar / level HUD, achievements, card tilt and a Konami-code easter egg.
(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(pointer: fine)').matches;
  var useShip = finePointer && !reduceMotion;

  var bg = document.getElementById('bg-canvas');
  var fx = document.getElementById('fx-canvas');
  var bctx = bg.getContext('2d');
  var fctx = fx.getContext('2d');
  var reticle = document.querySelector('.reticle');
  var W = 0, H = 0, dpr = 1;

  // ---------- Colors (follow the theme) ----------
  var colors = {};
  function readColors() {
    var cs = getComputedStyle(root);
    ['accent', 'accent-2', 'gold', 'star', 'text', 'success'].forEach(function (k) {
      colors[k] = cs.getPropertyValue('--color-' + k).trim();
    });
    buildShipSprite();
    if (reduceMotion) drawStars(0);
  }
  new MutationObserver(readColors).observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  // ---------- Storage (session only; failures are fine) ----------
  function sget(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function sset(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } }

  // ---------- Canvas sizing ----------
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    [bg, fx].forEach(function (c) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    });
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fctx.imageSmoothingEnabled = false;
    makeStars();
    if (reduceMotion) drawStars(0);
  }

  // ---------- Starfield (3 parallax layers) ----------
  var stars = [];
  function makeStars() {
    var count = Math.min(220, Math.round((W * H) / 7000));
    stars = [];
    for (var i = 0; i < count; i++) {
      stars.push({ x: Math.random() * W, y: Math.random() * H, z: 1 + Math.floor(Math.random() * 3), tw: Math.random() * 6.283 });
    }
  }
  function drawStars(t) {
    bctx.clearRect(0, 0, W, H);
    var sy = reduceMotion ? 0 : window.scrollY;
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var y = (s.y + t * 0.008 * s.z - sy * 0.04 * s.z) % H;
      if (y < 0) y += H;
      var size = s.z === 3 ? 2 : 1;
      bctx.globalAlpha = reduceMotion ? 0.5 : 0.3 + 0.35 * (1 + Math.sin(t * 0.002 + s.tw)) / 2 + s.z * 0.08;
      bctx.fillStyle = s.z === 3 && i % 7 === 0 ? colors.accent : colors.star;
      bctx.fillRect(Math.round(s.x), Math.round(y), size, size);
    }
    bctx.globalAlpha = 1;
  }

  // ---------- Pixel ship sprite ----------
  var SHIP = [
    '....#....',
    '...###...',
    '...#c#...',
    '..##c##..',
    '..#####..',
    '.##w#w##.',
    '##.###.##',
    '#..#.#..#'
  ];
  var PX = 3;
  var sprite = document.createElement('canvas');
  function buildShipSprite() {
    sprite.width = SHIP[0].length * PX;
    sprite.height = SHIP.length * PX;
    var c = sprite.getContext('2d');
    c.clearRect(0, 0, sprite.width, sprite.height);
    var map = { '#': colors.accent, c: colors['accent-2'], w: colors.gold };
    SHIP.forEach(function (row, y) {
      for (var x = 0; x < row.length; x++) {
        var col = map[row[x]];
        if (col) { c.fillStyle = col; c.fillRect(x * PX, y * PX, PX, PX); }
      }
    });
  }

  // ---------- Effects state ----------
  var particles = [];
  var shots = [];
  var texts = [];
  var mouse = { x: -999, y: -999, seen: false, inside: false };
  var ship = { x: -999, y: -999, vx: 0, vy: 0, angle: -Math.PI / 2 };

  function burst(x, y, n, palette, speed) {
    if (reduceMotion) return;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var v = (0.5 + Math.random()) * (speed || 3);
      particles.push({
        x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: 30 + Math.random() * 25, max: 55,
        size: Math.random() < 0.3 ? 3 : 2,
        color: palette[Math.floor(Math.random() * palette.length)], g: 0.06
      });
    }
  }

  function floatText(x, y, text, color) {
    if (reduceMotion) return;
    texts.push({ x: x, y: y, text: text, color: color, life: 50, max: 50 });
  }

  function thrust() {
    var back = ship.angle + Math.PI;
    var bx = ship.x + Math.cos(back) * 12;
    var by = ship.y + Math.sin(back) * 12;
    for (var i = 0; i < 2; i++) {
      var spread = (Math.random() - 0.5) * 0.9;
      var v = 1 + Math.random() * 1.5;
      particles.push({
        x: bx, y: by, vx: Math.cos(back + spread) * v, vy: Math.sin(back + spread) * v,
        life: 14 + Math.random() * 10, max: 24, size: 2,
        color: Math.random() < 0.5 ? colors.gold : colors['accent-2'], g: 0
      });
    }
  }

  // ---------- Main loop ----------
  var last = performance.now();
  var starClock = 0;
  function frame(now) {
    var dt = Math.min(3, (now - last) / 16.67);
    last = now;

    if (!reduceMotion) {
      starClock += dt;
      if (starClock >= 2) { starClock = 0; drawStars(now); } // ~30fps is plenty for stars
    }

    fctx.clearRect(0, 0, W, H);

    if (useShip && mouse.seen) {
      // Seek a point just short of the cursor, like a companion drone.
      var dx = mouse.x - ship.x, dy = mouse.y - ship.y;
      var dist = Math.hypot(dx, dy) || 1;
      var hold = 38;
      var pull = (dist - hold) * 0.012;
      ship.vx = (ship.vx + (dx / dist) * pull * dt) * Math.pow(0.86, dt);
      ship.vy = (ship.vy + (dy / dist) * pull * dt) * Math.pow(0.86, dt);
      ship.x += ship.vx * dt;
      ship.y += ship.vy * dt;
      var target = Math.atan2(dy, dx);
      var diff = Math.atan2(Math.sin(target - ship.angle), Math.cos(target - ship.angle));
      ship.angle += diff * Math.min(1, 0.2 * dt);
      if (Math.hypot(ship.vx, ship.vy) > 1.2) thrust();
    }

    for (var i = shots.length - 1; i >= 0; i--) {
      var s = shots[i];
      var sx = s.tx - s.x, sy = s.ty - s.y;
      var sd = Math.hypot(sx, sy);
      var step = 26 * dt;
      s.px = s.x; s.py = s.y;
      if (sd <= step) {
        shots.splice(i, 1);
        burst(s.tx, s.ty, 22, [colors.accent, colors['accent-2'], colors.gold, colors.text], 3.2);
        floatText(s.tx + 10, s.ty - 10, '+10 XP', colors.gold);
        continue;
      }
      s.x += (sx / sd) * step;
      s.y += (sy / sd) * step;
      fctx.strokeStyle = colors['accent-2'];
      fctx.lineWidth = 3;
      fctx.shadowColor = colors['accent-2'];
      fctx.shadowBlur = 8;
      fctx.beginPath();
      fctx.moveTo(s.x - (sx / sd) * 16, s.y - (sy / sd) * 16);
      fctx.lineTo(s.x, s.y);
      fctx.stroke();
      fctx.shadowBlur = 0;
    }

    for (var j = particles.length - 1; j >= 0; j--) {
      var p = particles[j];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(j, 1); continue; }
      p.vy += p.g * dt;
      p.vx *= Math.pow(0.97, dt);
      p.vy *= Math.pow(0.97, dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      fctx.globalAlpha = Math.max(0, p.life / p.max);
      fctx.fillStyle = p.color;
      fctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    fctx.globalAlpha = 1;

    if (useShip && mouse.seen && mouse.inside) {
      fctx.save();
      fctx.translate(Math.round(ship.x), Math.round(ship.y));
      fctx.rotate(ship.angle + Math.PI / 2);
      fctx.shadowColor = colors.accent;
      fctx.shadowBlur = 10;
      fctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
      fctx.restore();
    }

    fctx.font = '10px "Press Start 2P", monospace';
    for (var k = texts.length - 1; k >= 0; k--) {
      var t = texts[k];
      t.life -= dt;
      if (t.life <= 0) { texts.splice(k, 1); continue; }
      t.y -= 0.6 * dt;
      fctx.globalAlpha = Math.max(0, t.life / t.max);
      fctx.fillStyle = '#000';
      fctx.fillText(t.text, t.x + 2, t.y + 2);
      fctx.fillStyle = t.color;
      fctx.fillText(t.text, t.x, t.y);
    }
    fctx.globalAlpha = 1;

    requestAnimationFrame(frame);
  }

  // ---------- Pointer: crosshair + ship ----------
  var INTERACTIVE = 'a, button, summary, label, [role="button"], input, select, textarea';
  function setupPointer() {
    if (useShip) {
      root.classList.add('game-cursor', 'cursor-out'); // crosshair stays hidden until the first mousemove
      document.addEventListener('mousemove', function (e) {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
        if (!mouse.seen) { ship.x = mouse.x - 40; ship.y = mouse.y + 40; mouse.seen = true; }
        mouse.inside = true;
        root.classList.remove('cursor-out');
        reticle.style.transform = 'translate3d(' + e.clientX + 'px,' + e.clientY + 'px,0)';
      }, { passive: true });
      document.addEventListener('mouseover', function (e) {
        reticle.classList.toggle('is-locked', !!(e.target.closest && e.target.closest(INTERACTIVE)));
      });
      document.addEventListener('mouseout', function (e) {
        if (!e.relatedTarget) { mouse.inside = false; root.classList.add('cursor-out'); }
      });
      document.addEventListener('mousedown', function () { reticle.classList.add('is-firing'); });
      document.addEventListener('mouseup', function () { reticle.classList.remove('is-firing'); });
    }

    document.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      if (useShip && e.pointerType === 'mouse') {
        var nose = 14;
        shots.push({ x: ship.x + Math.cos(ship.angle) * nose, y: ship.y + Math.sin(ship.angle) * nose, tx: e.clientX, ty: e.clientY });
      } else {
        burst(e.clientX, e.clientY, 14, [colors.accent, colors['accent-2'], colors.gold], 2.4);
      }
      shotsFired += 1;
      if (shotsFired === 1) unlock('first-shot');
      if (shotsFired === 25) unlock('sharpshooter');
    }, { passive: true });
  }

  // ---------- XP bar + level HUD ----------
  var xpFill = document.querySelector('.xp-fill');
  var hud = document.querySelector('.hud-level');
  var hudTicking = false;
  function updateHud() {
    hudTicking = false;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    var progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    xpFill.style.transform = 'scaleX(' + progress + ')';

    var level = 0;
    var line = window.innerHeight * 0.35;
    document.querySelectorAll('main > section[data-level]').forEach(function (s) {
      if (s.getBoundingClientRect().top < line) level = Number(s.dataset.level);
    });
    hud.textContent = 'LVL ' + (level < 10 ? '0' : '') + level;
    if (progress > 0.97) unlock('explorer');
  }
  function onScroll() {
    if (!hudTicking) { hudTicking = true; requestAnimationFrame(updateHud); }
  }

  // ---------- Achievements ----------
  var ACHIEVEMENTS = {
    'first-shot': ['First Shot', 'You clicked. The ship fired. Welcome, player.'],
    'sharpshooter': ['Sharpshooter', '25 shots fired. Impressive aim.'],
    'explorer': ['Explorer', 'You reached the end of the map.'],
    'konami': ['Cheat Code', '↑↑↓↓←→←→BA · Infinite creativity unlocked.']
  };
  var shotsFired = 0;
  var queue = [];
  var showing = false;
  var tray = document.querySelector('.achievements');

  function unlock(id) {
    if (sget('ach-' + id)) return;
    sset('ach-' + id, '1');
    queue.push(ACHIEVEMENTS[id]);
    if (!showing) nextAchievement();
  }

  function nextAchievement() {
    var a = queue.shift();
    if (!a) { showing = false; return; }
    showing = true;
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('class', 'trophy');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('shape-rendering', 'crispEdges');
    var path = document.createElementNS(ns, 'path');
    path.setAttribute('fill', 'currentColor');
    path.setAttribute('fill-rule', 'evenodd');
    path.setAttribute('d', 'M4 1h8v2h3v4h-1v1h-2v1h-1v2h-1v1h2v3H4v-3h2v-1H5V9H4V8H2V7H1V3h3zM2 4h2v2H2zm10 0h2v2h-2z');
    svg.appendChild(path);

    var box = document.createElement('div');
    box.className = 'achievement';
    var text = document.createElement('div');
    var kicker = document.createElement('span');
    kicker.className = 'ach-kicker';
    kicker.textContent = 'Achievement unlocked';
    var title = document.createElement('strong');
    title.textContent = a[0];
    var desc = document.createElement('small');
    desc.textContent = a[1];
    text.append(kicker, title, desc);
    box.append(svg, text);
    tray.appendChild(box);

    setTimeout(function () {
      box.classList.add('is-leaving');
      setTimeout(function () { box.remove(); nextAchievement(); }, reduceMotion ? 0 : 300);
    }, 3200);
  }

  // ---------- Konami code ----------
  var KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];
  var kpos = 0;
  document.addEventListener('keydown', function (e) {
    var key = (e.key || '').toLowerCase();
    kpos = key === KONAMI[kpos] ? kpos + 1 : (key === KONAMI[0] ? 1 : 0);
    if (kpos === KONAMI.length) {
      kpos = 0;
      unlock('konami');
      for (var i = 0; i < 8; i++) {
        burst(W * (0.1 + 0.8 * Math.random()), H * (0.15 + 0.5 * Math.random()), 30,
          [colors.accent, colors['accent-2'], colors.gold, colors.success], 4.5);
      }
    }
  });

  // ---------- Quest-card tilt ----------
  function setupTilt() {
    if (!finePointer || reduceMotion) return;
    document.addEventListener('pointermove', function (e) {
      var card = e.target.closest && e.target.closest('.project-card');
      document.querySelectorAll('.project-card.is-tilting').forEach(function (c) {
        if (c !== card) { c.classList.remove('is-tilting'); c.style.transform = ''; c.style.transition = ''; }
      });
      if (!card) return;
      var r = card.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width - 0.5;
      var py = (e.clientY - r.top) / r.height - 0.5;
      card.classList.add('is-tilting');
      card.style.transition = 'transform 0.08s linear, box-shadow 0.2s ease';
      card.style.transform = 'perspective(800px) rotateX(' + (-py * 8).toFixed(2) + 'deg) rotateY(' + (px * 8).toFixed(2) + 'deg) translateY(-4px)';
    }, { passive: true });
  }

  // ---------- Boot ----------
  readColors();
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('portfolio:rendered', updateHud);
  setupPointer();
  setupTilt();
  updateHud();
  if (reduceMotion) drawStars(0);
  else requestAnimationFrame(frame);
  // Fonts load after first paint; refresh colors/sprite once they do.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(readColors);
})();
