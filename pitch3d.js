/* =========================================================
   Floodlit — hero pitch
   A five-a-side pitch drawn in pseudo-3D on a canvas.
   On load the four floodlights flicker on, the chalk lines draw
   themselves, then a small match plays out. Move the mouse to tilt.
   ========================================================= */
(function (FL) {
  'use strict';

  var canvas = document.getElementById('pitch3d');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  var stage = document.getElementById('hero-stage');
  var hero = document.getElementById('play');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* world units are metres; pitch is 40 x 25 */
  var HL = 20, HW = 12.5;
  var TOWER_H = 14;
  var towers = [[-23.5, -16], [23.5, -16], [-23.5, 16], [23.5, 16]].map(function (p, i) {
    return { x: p[0], z: p[1], on: 0.45 + i * 0.32, level: 0 };
  });

  var W = 0, H = 0, DPR = 1, focal = 600, DIST = 64, cx0 = 0, cy0 = 0;
  var BASE_YAW = -0.5, BASE_EL = 0.62;
  var cam = { yaw: BASE_YAW, el: BASE_EL, ty: BASE_YAW, te: BASE_EL };
  var cyw, syw, cel, sel;

  function resize() {
    var r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    var narrow = W < 560;
    focal = Math.min(W * (narrow ? 1.1 : 1.08), H * 1.5);
    cx0 = W * (narrow ? 0.5 : 0.52);
    cy0 = H * 0.55;
    if (reduce || !running) draw(lastT);
  }

  function setCam() { cyw = Math.cos(cam.yaw); syw = Math.sin(cam.yaw); cel = Math.cos(cam.el); sel = Math.sin(cam.el); }

  // project world (x, y up, z) to screen [sx, sy, scale, depth]
  function P(x, y, z) {
    var rx = x * cyw - z * syw, rz = x * syw + z * cyw;
    var ry = y * cel + rz * sel, rz2 = rz * cel - y * sel;
    var d = rz2 + DIST, s = focal / d;
    return [cx0 + rx * s, cy0 - ry * s, s, d];
  }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function mix(c1, c2, t) {
    var a = parseInt(c1.slice(1), 16), b = parseInt(c2.slice(1), 16);
    var r = Math.round(lerp(a >> 16, b >> 16, t)), g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t)), bl = Math.round(lerp(a & 255, b & 255, t));
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  function poly(pts, fill, stroke, lw) {
    ctx.beginPath();
    for (var i = 0; i < pts.length; i++) {
      var p = P(pts[i][0], pts[i][1], pts[i][2]);
      if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]);
    }
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
  }

  /* ---------- chalk lines as one long path (for the draw-on effect) ---------- */
  var segs = [];
  (function buildLines() {
    function add(a, b) { segs.push([a, b]); }
    var corners = [[-HL, -HW], [HL, -HW], [HL, HW], [-HL, HW]];
    for (var i = 0; i < 4; i++) add(corners[i], corners[(i + 1) % 4]);
    add([0, -HW], [0, HW]);
    var N = 40, k, a0, a1;
    for (k = 0; k < N; k++) {
      a0 = k / N * Math.PI * 2; a1 = (k + 1) / N * Math.PI * 2;
      add([Math.cos(a0) * 3.5, Math.sin(a0) * 3.5], [Math.cos(a1) * 3.5, Math.sin(a1) * 3.5]);
    }
    [-1, 1].forEach(function (side) {
      for (k = 0; k < 24; k++) {
        a0 = -Math.PI / 2 + k / 24 * Math.PI; a1 = -Math.PI / 2 + (k + 1) / 24 * Math.PI;
        add([side * (HL - Math.cos(a0) * 6), Math.sin(a0) * 6], [side * (HL - Math.cos(a1) * 6), Math.sin(a1) * 6]);
      }
    });
  })();
  var segLen = segs.map(function (s) { return Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]); });
  var totalLen = segLen.reduce(function (a, b) { return a + b; }, 0);

  /* ---------- players and ball ---------- */
  var TEAM = [
    { color: '#FFC24B', dark: '#B9821F', dir: 1 },
    { color: '#8CCBFF', dark: '#4C86BC', dir: -1 }
  ];
  var FORM = [[-17.5, 0], [-10, -5.5], [-10, 5.5], [-2, -4.5], [2.5, 4]];
  var players = [];
  [0, 1].forEach(function (team) {
    FORM.forEach(function (f, i) {
      var x = team === 0 ? f[0] : -f[0], z = team === 0 ? f[1] : -f[1];
      players.push({ team: team, gk: i === 0, bx: x, bz: z, x: x, z: z, vx: 0, vz: 0, tx: x, tz: z, phase: Math.random() * 6 });
    });
  });
  var rnd = FL && FL.rng ? FL.rng('hero-match') : Math.random;
  var ball = { x: 0, y: 0, z: 0, owner: players[3], flying: false, u: 0, dur: 1, from: null, to: null, target: null, shot: false, hold: 1.4, pause: 0 };
  var score = [0, 0];
  var sbEl = document.getElementById('scoreboard');
  var scoreEl = document.getElementById('sb-score');

  function teammates(p) { return players.filter(function (q) { return q.team === p.team && q !== p; }); }
  function nearest(list, x, z) {
    var best = null, bd = 1e9;
    list.forEach(function (q) { var d = (q.x - x) * (q.x - x) + (q.z - z) * (q.z - z); if (d < bd) { bd = d; best = q; } });
    return best;
  }

  function kick(toX, toZ, target, shot) {
    ball.flying = true; ball.u = 0; ball.shot = shot; ball.target = target;
    ball.from = { x: ball.x, z: ball.z }; ball.to = { x: toX, z: toZ };
    var d = Math.hypot(toX - ball.x, toZ - ball.z);
    ball.dur = Math.max(0.35, d / (shot ? 22 : 13));
    ball.lift = shot ? Math.min(1.6, d * 0.08) : (d > 12 ? Math.min(3, d * 0.16) : 0.25);
    ball.owner = null;
    if (target) { target.tx = toX; target.tz = toZ; }
  }

  function decide() {
    var o = ball.owner, dir = TEAM[o.team].dir;
    if (!o.gk && o.x * dir > 8 && rnd() < 0.5) {
      kick(dir * (HL + 0.8), (rnd() - 0.5) * 4, null, true);
      return;
    }
    var mates = teammates(o).filter(function (q) { return !q.gk || rnd() < 0.15; });
    var t = mates[Math.floor(rnd() * mates.length)];
    var tx = t.x + dir * (1 + rnd() * 3), tz = t.z + (rnd() - 0.5) * 3;
    if (rnd() < 0.2) {
      var opp = players.filter(function (q) { return q.team !== o.team && !q.gk; });
      t = nearest(opp, tx, tz);
    }
    kick(Math.max(-HL + 1, Math.min(HL - 1, tx)), Math.max(-HW + 1, Math.min(HW - 1, tz)), t, false);
  }

  function goal(team) {
    score[team]++;
    if (scoreEl) scoreEl.textContent = score[0] + '–' + score[1];
    if (sbEl) { sbEl.classList.remove('is-goal'); void sbEl.offsetWidth; sbEl.classList.add('is-goal'); }
    flash = 1;
  }
  var flash = 0;

  function update(dt) {
    // ball
    if (ball.pause > 0) {
      ball.pause -= dt;
      if (ball.pause <= 0) {
        ball.x = 0; ball.z = 0; ball.y = 0;
        var kickoffTeam = ball.nextTeam;
        ball.owner = players.filter(function (q) { return q.team === kickoffTeam && !q.gk; })[2];
        ball.hold = 1.2;
      }
    } else if (ball.flying) {
      ball.u += dt / ball.dur;
      var u = Math.min(1, ball.u);
      var e = 1 - Math.pow(1 - u, 1.6);
      ball.x = lerp(ball.from.x, ball.to.x, e);
      ball.z = lerp(ball.from.z, ball.to.z, e);
      ball.y = Math.sin(Math.PI * u) * ball.lift + 0.11;
      if (u >= 1) {
        ball.flying = false; ball.y = 0.11;
        if (ball.shot) {
          var attacking = ball.to.x > 0 ? 0 : 1;
          var keeper = players.find(function (q) { return q.gk && q.team !== attacking; });
          if (Math.abs(ball.to.z) < 2.4 && rnd() < 0.42) {
            goal(attacking);
            ball.pause = 1.6; ball.nextTeam = 1 - attacking; ball.owner = null;
          } else {
            ball.owner = keeper; ball.x = keeper.x; ball.z = keeper.z; ball.hold = 1.1;
          }
        } else {
          ball.owner = ball.target || nearest(players, ball.x, ball.z);
          ball.hold = 0.5 + rnd() * 0.9;
        }
      }
    } else if (ball.owner) {
      var o = ball.owner;
      ball.x = o.x + TEAM[o.team].dir * 0.55; ball.z = o.z; ball.y = 0.11;
      ball.hold -= dt;
      if (ball.hold <= 0) decide();
    }

    // players
    var poss = ball.owner ? ball.owner.team : -1;
    var chasers = [0, 1].map(function (team) {
      if (team === poss) return null;
      return nearest(players.filter(function (q) { return q.team === team && !q.gk; }), ball.x, ball.z);
    });
    players.forEach(function (p) {
      var dir = TEAM[p.team].dir;
      if (p.gk) {
        p.tx = p.bx; p.tz = Math.max(-2.2, Math.min(2.2, ball.z * 0.35));
      } else if (p === ball.owner) {
        p.tx = p.x + dir * 2.2; p.tz = p.z + Math.sin(p.phase) * 1.2;
      } else if (p === chasers[p.team] || (ball.flying && p === ball.target)) {
        if (!(ball.flying && p === ball.target)) { p.tx = ball.x; p.tz = ball.z; }
      } else {
        var shift = ball.x * 0.55 + (poss === p.team ? dir * 3 : -dir * 2);
        p.tx = p.bx + shift + Math.sin(p.phase * 0.7) * 1.5;
        p.tz = p.bz + (ball.z - p.bz) * 0.22 + Math.cos(p.phase * 0.9) * 1.2;
      }
      p.phase += dt;
      var dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz);
      var speed = p === ball.owner ? 3.2 : 5.2;
      var vx = d > 0.05 ? dx / d * Math.min(speed, d * 2.2) : 0, vz = d > 0.05 ? dz / d * Math.min(speed, d * 2.2) : 0;
      p.vx = lerp(p.vx, vx, Math.min(1, dt * 4)); p.vz = lerp(p.vz, vz, Math.min(1, dt * 4));
      p.x = Math.max(-HL + 0.6, Math.min(HL - 0.6, p.x + p.vx * dt));
      p.z = Math.max(-HW + 0.6, Math.min(HW - 0.6, p.z + p.vz * dt));
    });
    flash = Math.max(0, flash - dt * 1.2);
  }

  /* ---------- timeline of the opening sequence ---------- */
  var t0 = performance.now();
  var lastT = 0;
  function levels(t) {
    towers.forEach(function (tw) {
      if (reduce) { tw.level = 1; return; }
      var k = t - tw.on;
      if (k < 0) tw.level = 0;
      else if (k < 0.55) {
        var f = Math.sin(k * 61) + Math.sin(k * 23.7);
        tw.level = f > 0.3 ? 0.9 : 0.12;
      } else tw.level = 1;
    });
  }

  /* ---------- draw ---------- */
  function draw(t) {
    if (!W) return;
    setCam();
    levels(t);
    var L = towers.reduce(function (a, tw) { return a + tw.level; }, 0) / 4;
    var lineP = reduce ? 1 : Math.max(0, Math.min(1, (t - 1.25) / 1.4));
    var playersA = reduce ? 1 : Math.max(0, Math.min(1, (t - 2.3) / 0.6));
    var lw = Math.max(1, 0.13 * focal / DIST);

    ctx.clearRect(0, 0, W, H);

    // apron (concrete around the pitch)
    poly([[-27, 0, -19], [27, 0, -19], [27, 0, 19], [-27, 0, 19]], mix('#0B1630', '#18263F', L));

    // turf stripes
    for (var i = 0; i < 8; i++) {
      var x0 = -HL - 1.5 + i * ((2 * HL + 3) / 8), x1 = x0 + (2 * HL + 3) / 8;
      var c = i % 2 ? mix('#0D2A22', '#1E7C50', L) : mix('#0C261F', '#1B6F48', L);
      poly([[x0, 0, -HW - 1.5], [x1, 0, -HW - 1.5], [x1, 0, HW + 1.5], [x0, 0, HW + 1.5]], c);
    }

    // light pools on the grass
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    towers.forEach(function (tw) {
      if (tw.level <= 0) return;
      var g = P(tw.x * 0.42, 0, tw.z * 0.42);
      var r = 19 * g[2];
      ctx.save();
      ctx.translate(g[0], g[1]);
      ctx.scale(1, Math.max(0.35, sel * 0.95));
      var grd = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      grd.addColorStop(0, 'rgba(255,214,140,' + (0.2 * tw.level) + ')');
      grd.addColorStop(0.55, 'rgba(255,200,120,' + (0.08 * tw.level) + ')');
      grd.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
    ctx.restore();

    // chalk lines (drawn on progressively)
    if (lineP > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(241,244,234,' + (0.55 + 0.35 * L) + ')';
      ctx.lineWidth = lw; ctx.lineCap = 'round';
      ctx.shadowColor = 'rgba(241,244,234,.35)'; ctx.shadowBlur = 4 * L;
      var budget = lineP * totalLen;
      ctx.beginPath();
      for (var s = 0; s < segs.length && budget > 0; s++) {
        var a = segs[s][0], b = segs[s][1], f = Math.min(1, budget / segLen[s]);
        var pa = P(a[0], 0, a[1]), pb = P(lerp(a[0], b[0], f), 0, lerp(a[1], b[1], f));
        ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]);
        budget -= segLen[s];
      }
      ctx.stroke();
      if (lineP >= 1) { var cs = P(0, 0, 0); ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(cs[0], cs[1], lw * 1.4, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }

    // goals
    [-1, 1].forEach(function (side) {
      var gx = side * HL, bx = side * (HL + 1.3);
      ctx.save();
      ctx.globalAlpha = 0.3 + 0.7 * Math.max(lineP, 0.2);
      poly([[gx, 0, -2.5], [bx, 0, -2.5], [bx, 1.2, -2.5], [gx, 2.1, -2.5]], 'rgba(220,230,255,.06)', 'rgba(220,230,255,.25)', 1);
      poly([[gx, 0, 2.5], [bx, 0, 2.5], [bx, 1.2, 2.5], [gx, 2.1, 2.5]], 'rgba(220,230,255,.06)', 'rgba(220,230,255,.25)', 1);
      poly([[bx, 0, -2.5], [bx, 0, 2.5], [bx, 1.2, 2.5], [bx, 1.2, -2.5]], 'rgba(220,230,255,.07)', 'rgba(220,230,255,.22)', 1);
      poly([[gx, 2.1, -2.5], [gx, 2.1, 2.5], [bx, 1.2, 2.5], [bx, 1.2, -2.5]], 'rgba(220,230,255,.05)', null);
      var p1 = P(gx, 0, -2.5), p2 = P(gx, 2.1, -2.5), p3 = P(gx, 2.1, 2.5), p4 = P(gx, 0, 2.5);
      ctx.strokeStyle = '#F1F4EA'; ctx.lineWidth = Math.max(1.4, lw * 1.3); ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.lineTo(p4[0], p4[1]); ctx.stroke();
      ctx.restore();
    });

    // cage walls: far walls before players, near walls after
    var walls = [
      [[-22.5, -15], [22.5, -15]], [[22.5, -15], [22.5, 15]], [[22.5, 15], [-22.5, 15]], [[-22.5, 15], [-22.5, -15]]
    ].map(function (w) {
      var mx = (w[0][0] + w[1][0]) / 2, mz = (w[0][1] + w[1][1]) / 2;
      return { w: w, d: P(mx, 2, mz)[3] };
    });
    function drawWall(wall) {
      var a = wall.w[0], b = wall.w[1], hgt = 5;
      poly([[a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], hgt, b[1]], [a[0], hgt, a[1]]], 'rgba(150,180,255,' + (0.025 + 0.02 * L) + ')', null);
      var len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.round(len / 5);
      ctx.strokeStyle = 'rgba(190,210,255,' + (0.14 + 0.12 * L) + ')'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (var k = 0; k <= n; k++) {
        var x = lerp(a[0], b[0], k / n), z = lerp(a[1], b[1], k / n);
        var g1 = P(x, 0, z), g2 = P(x, hgt, z);
        ctx.moveTo(g1[0], g1[1]); ctx.lineTo(g2[0], g2[1]);
      }
      var t1 = P(a[0], hgt, a[1]), t2 = P(b[0], hgt, b[1]);
      ctx.moveTo(t1[0], t1[1]); ctx.lineTo(t2[0], t2[1]);
      ctx.stroke();
    }
    walls.filter(function (w) { return w.d >= DIST; }).forEach(drawWall);

    // tower poles
    towers.forEach(function (tw) {
      var g = P(tw.x, 0, tw.z), top = P(tw.x, TOWER_H, tw.z);
      ctx.strokeStyle = mix('#2A3B63', '#53668F', L); ctx.lineWidth = Math.max(2, 0.35 * g[2]); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(g[0], g[1]); ctx.lineTo(top[0], top[1]); ctx.stroke();
    });

    // players and ball, far to near
    if (playersA > 0) {
      var items = players.map(function (p) { return { p: p, d: P(p.x, 0, p.z)[3] }; });
      items.push({ ball: true, d: P(ball.x, 0, ball.z)[3] - 0.01 });
      items.sort(function (a, b) { return b.d - a.d; });

      // shadows first (one per lit floodlight)
      ctx.save();
      ctx.lineCap = 'round';
      players.forEach(function (p) {
        towers.forEach(function (tw) {
          if (tw.level < 0.5) return;
          var dx = p.x - tw.x, dz = p.z - tw.z, dd = Math.hypot(dx, dz);
          var len = 1.9 * 30 / dd;
          var f = P(p.x, 0, p.z), e = P(p.x + dx / dd * len, 0, p.z + dz / dd * len);
          ctx.strokeStyle = 'rgba(2,8,20,' + (0.2 * tw.level * playersA) + ')';
          ctx.lineWidth = 0.42 * f[2];
          ctx.beginPath(); ctx.moveTo(f[0], f[1]); ctx.lineTo(e[0], e[1]); ctx.stroke();
        });
      });
      var bs = P(ball.x, 0, ball.z);
      ctx.fillStyle = 'rgba(2,8,20,' + (0.35 * playersA) + ')';
      ctx.beginPath(); ctx.ellipse(bs[0], bs[1], 0.28 * bs[2], 0.28 * bs[2] * sel, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = playersA;
      items.forEach(function (it) {
        if (it.ball) {
          var b = P(ball.x, ball.y + 0.11, ball.z);
          var r = Math.max(2.2, 0.24 * b[2]);
          ctx.fillStyle = '#FFFFFF';
          ctx.shadowColor = 'rgba(255,255,255,.8)'; ctx.shadowBlur = 8;
          ctx.beginPath(); ctx.arc(b[0], b[1], r, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
          return;
        }
        var p = it.p, team = TEAM[p.team];
        var bob = Math.abs(Math.sin(p.phase * 9)) * 0.06 * Math.min(1, Math.hypot(p.vx, p.vz));
        var foot = P(p.x, 0.2 + bob, p.z), hip = P(p.x, 0.95 + bob, p.z), sh = P(p.x, 1.45 + bob, p.z), head = P(p.x, 1.78 + bob, p.z);
        var w = 0.5 * foot[2];
        ctx.lineCap = 'round';
        ctx.strokeStyle = team.dark; ctx.lineWidth = w * 0.8;
        ctx.beginPath(); ctx.moveTo(foot[0], foot[1]); ctx.lineTo(hip[0], hip[1]); ctx.stroke();
        ctx.strokeStyle = p.gk ? '#3FBF7F' : team.color; ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(hip[0], hip[1]); ctx.lineTo(sh[0], sh[1]); ctx.stroke();
        ctx.fillStyle = '#E9D2B8';
        ctx.beginPath(); ctx.arc(head[0], head[1], 0.2 * head[2], 0, Math.PI * 2); ctx.fill();
      });
      ctx.restore();
    }

    walls.filter(function (w) { return w.d < DIST; }).forEach(drawWall);

    // floodlight beams, lamp heads and glow
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    towers.forEach(function (tw) {
      if (tw.level <= 0) return;
      var lamp = P(tw.x, TOWER_H, tw.z);
      var aim = P(tw.x * 0.42, 0, tw.z * 0.42);
      var ang = Math.atan2(aim[1] - lamp[1], aim[0] - lamp[0]);
      var spread = 14 * aim[2];
      var nx = Math.cos(ang + Math.PI / 2) * spread, ny = Math.sin(ang + Math.PI / 2) * spread;
      var beam = ctx.createLinearGradient(lamp[0], lamp[1], aim[0], aim[1]);
      beam.addColorStop(0, 'rgba(255,225,165,' + (0.16 * tw.level) + ')');
      beam.addColorStop(1, 'rgba(255,225,165,0)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(lamp[0], lamp[1]);
      ctx.lineTo(aim[0] + nx, aim[1] + ny);
      ctx.lineTo(aim[0] - nx, aim[1] - ny);
      ctx.closePath(); ctx.fill();

      var gr = 46 * lamp[2] / 9;
      var glow = ctx.createRadialGradient(lamp[0], lamp[1], 0, lamp[0], lamp[1], gr * 3);
      glow.addColorStop(0, 'rgba(255,240,205,' + (0.85 * tw.level) + ')');
      glow.addColorStop(0.18, 'rgba(255,210,130,' + (0.35 * tw.level) + ')');
      glow.addColorStop(1, 'rgba(255,190,90,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(lamp[0], lamp[1], gr * 3, 0, Math.PI * 2); ctx.fill();
    });
    ctx.restore();

    // lamp banks (2 x 3 lamps per tower)
    towers.forEach(function (tw) {
      var lamp = P(tw.x, TOWER_H, tw.z), sz = Math.max(1.6, 0.42 * lamp[2]);
      for (var r = 0; r < 2; r++) for (var cI = 0; cI < 3; cI++) {
        ctx.fillStyle = tw.level > 0.5 ? '#FFF6DF' : '#3A4A6E';
        ctx.fillRect(lamp[0] + (cI - 1.5) * sz * 1.25, lamp[1] + (r - 1) * sz * 1.25, sz, sz);
      }
    });

    // brief flash on a goal
    if (flash > 0) {
      ctx.fillStyle = 'rgba(255,220,150,' + (flash * 0.12) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }

  /* ---------- loop ---------- */
  var running = false, raf = 0, visible = true, paused = false, prev = 0;
  function frame(now) {
    raf = 0;
    if (!running) return;
    var t = (now - t0) / 1000;
    var dt = Math.min(0.05, (now - (prev || now)) / 1000);
    prev = now;
    lastT = t;
    cam.yaw = lerp(cam.yaw, cam.ty + Math.sin(t * 0.12) * 0.06, Math.min(1, dt * 2.5));
    cam.el = lerp(cam.el, cam.te, Math.min(1, dt * 2.5));
    if (t > 2.4) update(dt);
    draw(t);
    raf = requestAnimationFrame(frame);
  }
  function sync() {
    var should = !reduce && visible && !paused && !document.hidden;
    if (should && !running) { running = true; prev = 0; if (!raf) raf = requestAnimationFrame(frame); }
    else if (!should && running) { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
  }

  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
  else window.addEventListener('resize', resize);
  resize();

  if (window.IntersectionObserver) {
    new IntersectionObserver(function (entries) { visible = entries[0].isIntersecting; sync(); }, { threshold: 0.02 }).observe(canvas);
  }
  document.addEventListener('visibilitychange', sync);

  if (hero && !reduce) {
    hero.addEventListener('pointermove', function (e) {
      var r = stage.getBoundingClientRect();
      var nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5;
      cam.ty = BASE_YAW + Math.max(-0.6, Math.min(0.6, nx)) * 0.5;
      cam.te = BASE_EL + Math.max(-0.5, Math.min(0.5, ny)) * 0.22;
    });
    hero.addEventListener('pointerleave', function () { cam.ty = BASE_YAW; cam.te = BASE_EL; });
  }

  FL.heroPause = function (p) { paused = p; sync(); if (!p && (reduce || !running)) { resize(); } };
  if (reduce) { lastT = 10; draw(10); }
  sync();
})(window.FL);
