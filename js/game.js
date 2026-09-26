// Game layer: starfield, companion ship + crosshair cursor, enemy waves (desktop only),
// scroll bar / stage HUD, achievements and a Konami-code easter egg.
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

  function sget(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function sset(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function lget(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lset(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function rand(a, b) { return a + Math.random() * (b - a); }

  // ---------- Colors & sprites (rebuilt when the theme changes) ----------
  var colors = {};
  var sprites = {};

  var ART = {
    player: ['....#....', '...###...', '...#c#...', '..##c##..', '..#####..', '.##w#w##.', '##.###.##', '#..#.#..#'],
    drone: ['.#.....#.', '..#...#..', '.#######.', '##.###.##', '#########', '#.#...#.#', '...#.#...'],
    heavy: ['...#####...', '.#########.', '##..###..##', '###########', '.##.###.##.', '..#.....#..', '.#.#...#.#.', '#.........#'],
    heart: ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...']
  };

  function makeSprite(rows, map, px) {
    var c = document.createElement('canvas');
    c.width = rows[0].length * px;
    c.height = rows.length * px;
    var g = c.getContext('2d');
    rows.forEach(function (row, y) {
      for (var x = 0; x < row.length; x++) {
        var col = map[row[x]];
        if (col) { g.fillStyle = col; g.fillRect(x * px, y * px, px, px); }
      }
    });
    return c;
  }

  function readColors() {
    var cs = getComputedStyle(root);
    ['accent', 'accent-2', 'gold', 'star', 'text', 'success', 'muted'].forEach(function (k) {
      colors[k] = cs.getPropertyValue('--color-' + k).trim();
    });
    var white = '#ffffff';
    sprites.player = makeSprite(ART.player, { '#': colors.accent, c: colors['accent-2'], w: colors.gold }, 3);
    sprites.playerHit = makeSprite(ART.player, { '#': white, c: white, w: white }, 3);
    sprites.drone = makeSprite(ART.drone, { '#': '#ff4d6d' }, 3);
    sprites.heavy = makeSprite(ART.heavy, { '#': '#ff9f1c' }, 3);
    sprites.flashDrone = makeSprite(ART.drone, { '#': white }, 3);
    sprites.flashHeavy = makeSprite(ART.heavy, { '#': white }, 3);
    sprites.heart = makeSprite(ART.heart, { '#': '#ff4d6d' }, 2);
    sprites.heartEmpty = makeSprite(ART.heart, { '#': 'rgba(150,160,190,0.35)' }, 2);
    if (reduceMotion) drawStars(0);
  }
  new MutationObserver(readColors).observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  // ---------- Canvas sizing ----------
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    [bg, fx].forEach(function (c) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); });
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fctx.imageSmoothingEnabled = false;
    makeStars();
    if (reduceMotion) drawStars(0);
  }

  // ---------- Starfield ----------
  var stars = [];
  function makeStars() {
    var count = Math.min(200, Math.round((W * H) / 8000));
    stars = [];
    for (var i = 0; i < count; i++) stars.push({ x: Math.random() * W, y: Math.random() * H, z: 1 + Math.floor(Math.random() * 3), tw: Math.random() * 6.283 });
  }
  function drawStars(t) {
    bctx.clearRect(0, 0, W, H);
    var sy = reduceMotion ? 0 : window.scrollY;
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var y = (s.y + t * 0.008 * s.z - sy * 0.04 * s.z) % H;
      if (y < 0) y += H;
      bctx.globalAlpha = reduceMotion ? 0.5 : 0.25 + 0.3 * (1 + Math.sin(t * 0.002 + s.tw)) / 2 + s.z * 0.08;
      bctx.fillStyle = colors.star;
      bctx.fillRect(Math.round(s.x), Math.round(y), s.z === 3 ? 2 : 1, s.z === 3 ? 2 : 1);
    }
    bctx.globalAlpha = 1;
  }

  // ---------- Effects ----------
  var particles = [];
  var shots = [];
  var texts = [];

  function burst(x, y, n, palette, speed) {
    if (reduceMotion) return;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var v = (0.5 + Math.random()) * (speed || 3);
      particles.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(28, 55), max: 55, size: Math.random() < 0.3 ? 3 : 2, color: palette[Math.floor(Math.random() * palette.length)], g: 0.05 });
    }
  }
  function floatText(x, y, text, color) {
    if (!reduceMotion) texts.push({ x: x, y: y, text: text, color: color, life: 50, max: 50 });
  }

  // ---------- Player ship ----------
  var mouse = { x: -999, y: -999, seen: false, inside: false, since: 0 };
  var ship = { x: -999, y: -999, vx: 0, vy: 0, angle: -Math.PI / 2, hp: 3, inv: 0, dead: 0 };

  function thrust() {
    var back = ship.angle + Math.PI;
    var bx = ship.x + Math.cos(back) * 12, by = ship.y + Math.sin(back) * 12;
    for (var i = 0; i < 2; i++) {
      var a = back + (Math.random() - 0.5) * 0.9, v = rand(1, 2.5);
      particles.push({ x: bx, y: by, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(14, 24), max: 24, size: 2, color: Math.random() < 0.5 ? colors.gold : colors['accent-2'], g: 0 });
    }
  }

  function updateShip(dt) {
    if (ship.dead > 0) {
      ship.dead -= dt;
      if (ship.dead <= 0) { ship.hp = 3; ship.inv = 90; ship.x = mouse.x - 40; ship.y = mouse.y + 40; ship.vx = ship.vy = 0; }
      return;
    }
    var dx = mouse.x - ship.x, dy = mouse.y - ship.y;
    var dist = Math.hypot(dx, dy) || 1;
    var pull = (dist - 38) * 0.012;
    ship.vx = (ship.vx + (dx / dist) * pull * dt) * Math.pow(0.86, dt);
    ship.vy = (ship.vy + (dy / dist) * pull * dt) * Math.pow(0.86, dt);
    ship.x += ship.vx * dt;
    ship.y += ship.vy * dt;
    var diff = Math.atan2(Math.sin(Math.atan2(dy, dx) - ship.angle), Math.cos(Math.atan2(dy, dx) - ship.angle));
    ship.angle += diff * Math.min(1, 0.2 * dt);
    if (ship.inv > 0) ship.inv -= dt;
    if (Math.hypot(ship.vx, ship.vy) > 1.2) thrust();
  }

  function drawShip() {
    if (ship.dead > 0 || !mouse.inside) return;
    if (ship.inv > 0 && Math.floor(ship.inv / 4) % 2 === 0) return; // blink while invulnerable
    fctx.save();
    fctx.translate(Math.round(ship.x), Math.round(ship.y));
    fctx.rotate(ship.angle + Math.PI / 2);
    var img = sprites.player;
    fctx.drawImage(img, -img.width / 2, -img.height / 2);
    fctx.restore();
  }

  function hitShip() {
    if (ship.inv > 0 || ship.dead > 0) return;
    ship.hp -= 1;
    ship.inv = 70;
    burst(ship.x, ship.y, 14, ['#ff4d6d', colors.gold, '#ffffff'], 2.5);
    if (ship.hp <= 0) {
      burst(ship.x, ship.y, 60, ['#ff4d6d', colors.gold, colors.accent, '#ffffff'], 5);
      floatText(ship.x - 30, ship.y - 16, 'GAME OVER', '#ff4d6d');
      ship.dead = 150;
      if (score > best) { best = score; lset('best', String(best)); }
      score = 0;
      enemyBullets.length = 0;
      unlock('shot-down');
    }
  }

  // ---------- Enemies (desktop only) ----------
  var enemies = [];
  var enemyBullets = [];
  var spawnIn = 0;
  var score = 0;
  var best = Number(lget('best')) || 0;
  var kills = 0;
  var gameOn = lget('game') !== 'off';
  var START_DELAY = 3500; // ms after the mouse first appears

  function gameActive() {
    return useShip && gameOn && mouse.seen && performance.now() - mouse.since > START_DELAY;
  }

  function spawnEnemy() {
    var heavy = score >= 600 && Math.random() < 0.3;
    var side = Math.floor(Math.random() * 3); // 0 left, 1 right, 2 top
    var x = side === 0 ? -30 : side === 1 ? W + 30 : rand(40, W - 40);
    var y = side === 2 ? -30 : rand(60, H * 0.6);
    enemies.push({
      heavy: heavy, x: x, y: y, vx: 0, vy: 0,
      hp: heavy ? 3 : 1, r: heavy ? 17 : 13, flash: 0,
      orbit: Math.random() * Math.PI * 2, radius: rand(170, 260), t: Math.random() * 10,
      fireIn: rand(90, 160)
    });
  }

  function updateEnemies(dt) {
    if (!gameActive()) return;
    var maxEnemies = score >= 1500 ? 5 : score >= 500 ? 4 : 3;
    spawnIn -= dt;
    if (spawnIn <= 0 && enemies.length < maxEnemies) { spawnEnemy(); spawnIn = rand(150, 260); }

    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      e.t += 0.016 * dt;
      e.orbit += (e.heavy ? 0.004 : 0.007) * dt;
      var tx = ship.x + Math.cos(e.orbit) * e.radius;
      var ty = ship.y + Math.sin(e.orbit) * e.radius * 0.7;
      tx = Math.max(30, Math.min(W - 30, tx));
      ty = Math.max(80, Math.min(H - 30, ty));
      var accel = e.heavy ? 0.0016 : 0.0026;
      e.vx = (e.vx + (tx - e.x) * accel * dt) * Math.pow(0.965, dt);
      e.vy = (e.vy + (ty - e.y) * accel * dt) * Math.pow(0.965, dt);
      e.x += e.vx * dt + Math.sin(e.t * 3) * 0.4 * dt;
      e.y += e.vy * dt;
      if (e.flash > 0) e.flash -= dt;

      e.fireIn -= dt;
      var onScreen = e.x > 0 && e.x < W && e.y > 0 && e.y < H;
      if (e.fireIn <= 0 && onScreen && ship.dead <= 0 && mouse.inside) {
        var a = Math.atan2(ship.y - e.y, ship.x - e.x);
        var spread = e.heavy ? [-0.22, 0, 0.22] : [0];
        spread.forEach(function (s) {
          enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(a + s) * 3.4, vy: Math.sin(a + s) * 3.4 });
        });
        e.fireIn = e.heavy ? rand(170, 230) : rand(140, 240);
      }
    }

    for (var b = enemyBullets.length - 1; b >= 0; b--) {
      var eb = enemyBullets[b];
      eb.x += eb.vx * dt;
      eb.y += eb.vy * dt;
      if (eb.x < -20 || eb.x > W + 20 || eb.y < -20 || eb.y > H + 20) { enemyBullets.splice(b, 1); continue; }
      if (ship.dead <= 0 && Math.hypot(eb.x - ship.x, eb.y - ship.y) < 11) {
        enemyBullets.splice(b, 1);
        hitShip();
        if (ship.dead > 0) break; // hitShip cleared the bullet list
      }
    }
  }

  function damageEnemy(e, idx) {
    e.hp -= 1;
    e.flash = 6;
    burst(e.x, e.y, 6, ['#ffffff', colors.gold], 2);
    if (e.hp > 0) return;
    enemies.splice(idx, 1);
    var points = e.heavy ? 300 : 100;
    score += points;
    kills += 1;
    burst(e.x, e.y, e.heavy ? 50 : 30, [e.heavy ? '#ff9f1c' : '#ff4d6d', colors.gold, '#ffffff', colors.accent], e.heavy ? 4.5 : 3.5);
    floatText(e.x + 12, e.y - 12, '+' + points, colors.gold);
    if (kills === 1) unlock('first-kill');
    if (kills === 10) unlock('ace');
  }

  function drawEnemies() {
    enemies.forEach(function (e) {
      var img = e.flash > 0 ? (e.heavy ? sprites.flashHeavy : sprites.flashDrone) : (e.heavy ? sprites.heavy : sprites.drone);
      fctx.drawImage(img, Math.round(e.x - img.width / 2), Math.round(e.y - img.height / 2));
    });
    fctx.fillStyle = '#ff4d6d';
    enemyBullets.forEach(function (b) { fctx.fillRect(Math.round(b.x) - 2, Math.round(b.y) - 2, 4, 4); });
  }

  function pad6(n) { return ('000000' + n).slice(-6); }

  function drawHud() {
    if (!gameActive()) return;
    var x = W - 20, y = H - 20;
    fctx.font = '10px "Press Start 2P", monospace';
    fctx.textAlign = 'right';
    fctx.fillStyle = 'rgba(0,0,0,0.6)';
    fctx.fillRect(x - 140, y - 58, 152, 66);
    for (var i = 0; i < 3; i++) {
      var heart = i < ship.hp && ship.dead <= 0 ? sprites.heart : sprites.heartEmpty;
      fctx.drawImage(heart, x - 50 + i * 18, y - 50);
    }
    fctx.fillStyle = colors.gold;
    fctx.fillText('SCORE ' + pad6(score), x, y - 20);
    fctx.fillStyle = '#c7d0ff';
    fctx.fillText('HI ' + pad6(Math.max(best, score)), x, y - 4);
    fctx.textAlign = 'start';
  }

  function clearEnemies() {
    enemies.length = 0;
    enemyBullets.length = 0;
  }

  // ---------- Main loop ----------
  var last = performance.now();
  var starClock = 0;
  function frame(now) {
    requestAnimationFrame(frame); // schedule first so one bad frame can't stop the game
    var dt = Math.min(3, (now - last) / 16.67);
    last = now;

    starClock += dt;
    if (starClock >= 2) { starClock = 0; drawStars(now); }

    fctx.clearRect(0, 0, W, H);
    if (useShip && mouse.seen) updateShip(dt);
    updateEnemies(dt);

    // Player lasers
    for (var i = shots.length - 1; i >= 0; i--) {
      var s = shots[i];
      var sx = s.tx - s.x, sy = s.ty - s.y, sd = Math.hypot(sx, sy);
      var step = 26 * dt;
      var nx = sd <= step ? s.tx : s.x + (sx / sd) * step;
      var ny = sd <= step ? s.ty : s.y + (sy / sd) * step;
      var hit = -1;
      for (var j = 0; j < enemies.length; j++) {
        if (distToSegment(enemies[j].x, enemies[j].y, s.x, s.y, nx, ny) < enemies[j].r) { hit = j; break; }
      }
      if (hit >= 0) { damageEnemy(enemies[hit], hit); shots.splice(i, 1); continue; }
      if (sd <= step) {
        shots.splice(i, 1);
        burst(s.tx, s.ty, 10, [colors.accent, colors['accent-2'], colors.gold], 2.2);
        continue;
      }
      s.x = nx; s.y = ny;
      fctx.strokeStyle = colors['accent-2'];
      fctx.lineWidth = 3;
      fctx.beginPath();
      fctx.moveTo(s.x - (sx / sd) * 16, s.y - (sy / sd) * 16);
      fctx.lineTo(s.x, s.y);
      fctx.stroke();
    }

    for (var k = particles.length - 1; k >= 0; k--) {
      var p = particles[k];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(k, 1); continue; }
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

    drawEnemies();
    if (useShip && mouse.seen) drawShip();

    fctx.font = '10px "Press Start 2P", monospace';
    for (var t = texts.length - 1; t >= 0; t--) {
      var tx = texts[t];
      tx.life -= dt;
      if (tx.life <= 0) { texts.splice(t, 1); continue; }
      tx.y -= 0.6 * dt;
      fctx.globalAlpha = Math.max(0, tx.life / tx.max);
      fctx.fillStyle = '#000';
      fctx.fillText(tx.text, tx.x + 2, tx.y + 2);
      fctx.fillStyle = tx.color;
      fctx.fillText(tx.text, tx.x, tx.y);
    }
    fctx.globalAlpha = 1;

    drawHud();
  }

  function distToSegment(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var len = dx * dx + dy * dy;
    var t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  // ---------- Pointer ----------
  var INTERACTIVE = 'a, button, summary, label, [role="button"], input, select, textarea';
  function setupPointer() {
    if (useShip) {
      root.classList.add('game-cursor', 'cursor-out'); // crosshair hidden until the first mousemove
      document.addEventListener('mousemove', function (e) {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
        if (!mouse.seen) { ship.x = mouse.x - 40; ship.y = mouse.y + 40; mouse.seen = true; mouse.since = performance.now(); }
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
        if (ship.dead > 0) return;
        shots.push({ x: ship.x + Math.cos(ship.angle) * 14, y: ship.y + Math.sin(ship.angle) * 14, tx: e.clientX, ty: e.clientY });
      } else {
        burst(e.clientX, e.clientY, 12, [colors.accent, colors['accent-2'], colors.gold], 2.2);
      }
    }, { passive: true });
  }

  function setupGameToggle() {
    var btn = document.querySelector('.game-toggle');
    if (!useShip || !btn) return;
    btn.hidden = false;
    function label() {
      btn.textContent = gameOn ? 'Game on' : 'Game off';
      btn.setAttribute('aria-pressed', String(gameOn));
      btn.setAttribute('aria-label', gameOn ? 'Turn off enemy ships' : 'Turn on enemy ships');
    }
    btn.addEventListener('click', function () {
      gameOn = !gameOn;
      lset('game', gameOn ? 'on' : 'off');
      if (!gameOn) clearEnemies();
      label();
    });
    label();
  }

  // ---------- Scroll bar + stage HUD ----------
  var xpFill = document.querySelector('.xp-fill');
  var hud = document.querySelector('.hud-stage');
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
    hud.textContent = level ? 'Stage 1-' + level : 'Start';
    if (progress > 0.97) unlock('explorer');
  }
  function onScroll() {
    if (!hudTicking) { hudTicking = true; requestAnimationFrame(updateHud); }
  }

  // ---------- Achievements ----------
  var ACHIEVEMENTS = {
    'first-kill': ['First Blood', 'Destroyed your first enemy ship.'],
    'ace': ['Ace Pilot', 'Ten enemy ships down.'],
    'shot-down': ['Shot Down', 'Your ship respawns in a few seconds.'],
    'explorer': ['Explorer', 'Scrolled to the very end.'],
    'konami': ['Cheat Code', 'You know the code.']
  };
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
    var box = document.createElement('div');
    box.className = 'window achievement';
    var text = document.createElement('div');
    var title = document.createElement('strong');
    title.textContent = a[0];
    var desc = document.createElement('small');
    desc.textContent = a[1];
    text.append(title, desc);
    if (window.pixelTrophy) box.append(window.pixelTrophy());
    box.append(text);
    tray.appendChild(box);
    setTimeout(function () {
      box.classList.add('is-leaving');
      setTimeout(function () { box.remove(); nextAchievement(); }, reduceMotion ? 0 : 250);
    }, 3000);
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
      enemies.forEach(function (en) { burst(en.x, en.y, 30, ['#ff4d6d', colors.gold, '#ffffff'], 4); });
      score += enemies.length * 100;
      clearEnemies();
      ship.hp = 3;
    }
  });

  // ---------- Boot ----------
  readColors();
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('portfolio:rendered', updateHud);
  setupPointer();
  setupGameToggle();
  updateHud();
  if (reduceMotion) drawStars(0);
  else requestAnimationFrame(frame);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(readColors);
})();
