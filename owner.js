/* =========================================================
   Floodlit — owner dashboard
   Today's numbers, a live schedule, revenue and busy-hour charts,
   walk-in bookings and pricing rules that players see instantly.
   ========================================================= */
(function (FL) {
  'use strict';

  var $ = (s, r) => (r || document).querySelector(s);
  var $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  var esc = FL.esc;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var ownerTurf = 'skydeck';
  var ownerOff = new Date().getHours() >= 20 ? 1 : 0;   // which day the schedule shows
  var seen = null;      // booking ids already drawn on the timeline
  var lastKPI = [];
  function turf() { return FL.turfById(ownerTurf); }
  function visible() { return !$('#owner-view').hidden; }

  /* ---------- numbers for one day ---------- */
  function dayStats(t, key) {
    var s = { rev: 0, online: 0, walkin: 0, count: 0, walkins: 0, occ: 0 }, cap = 0;
    t.pitches.forEach(p => {
      FL.busy(t.id, p.id, key).forEach(b => {
        s.count++; s.rev += b.price;
        if (b.source === 'walkin') { s.walkin += b.price; s.walkins++; } else s.online += b.price;
        var a = Math.max(b.start, 1020), e = Math.min(b.end, FL.CLOSE);
        if (e > a) s.occ += e - a;
      });
      cap += FL.CLOSE - 1020;
    });
    s.occ = cap ? s.occ / cap : 0;
    return s;
  }

  function delta(a, b, label, points) {
    if (!b && !points) return 'No data for ' + label;
    var v = points ? Math.round((a - b) * 100) : Math.round((a - b) / b * 100);
    var up = v >= 0;
    return '<span class="' + (up ? 'up' : 'down') + '">' + (up ? '▲' : '▼') + ' ' + Math.abs(v) + (points ? ' pts' : '%') + '</span> vs ' + label;
  }

  function renderHead() {
    $('#owner-date').textContent = 'Today, ' + FL.dateFor(0).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) + '. Numbers update as bookings come in.';
    var sel = $('#owner-turf');
    if (!sel.options.length) {
      FL.turfs.forEach(t => { var o = document.createElement('option'); o.value = t.id; o.textContent = t.name + ', ' + t.area; sel.appendChild(o); });
      sel.addEventListener('change', () => { ownerTurf = sel.value; seen = null; lastKPI = []; renderAll(); });
    }
    sel.value = ownerTurf;
  }
  $('#tl-day').addEventListener('click', e => {
    var b = e.target.closest('[data-off]'); if (!b) return;
    ownerOff = +b.dataset.off; seen = null; renderTimeline(); renderWalkin(true);
  });

  function renderKPIs() {
    var t = turf(), k = FL.dateKey(0), lk = FL.dateKey(-7);
    var a = dayStats(t, k), b = dayStats(t, lk);
    var label = 'last ' + FL.fromKey(lk).toLocaleDateString('en-GB', { weekday: 'long' });
    var items = [
      ['Revenue today', FL.money(a.rev), delta(a.rev, b.rev, label)],
      ['Bookings today', String(a.count), a.walkins + ' walk-in' + (a.walkins === 1 ? '' : 's') + ', ' + (a.count - a.walkins) + ' online'],
      ['Evening booked, 5 PM to 2 AM', Math.round(a.occ * 100) + '%', delta(a.occ, b.occ, label, true)],
      ['Player rating', t.rating.toFixed(1), t.reviews + ' reviews']
    ];
    $('#kpis').innerHTML = items.map((it, i) =>
      '<div class="kpi"><p class="kpi-l">' + it[0] + '</p><p class="kpi-v' + (lastKPI[i] && lastKPI[i] !== it[1] && !reduce ? ' tick' : '') + '">' + it[1] + '</p><p class="kpi-d">' + it[2] + '</p></div>').join('');
    lastKPI = items.map(it => it[1]);
  }

  /* ---------- today's schedule ---------- */
  var blocks = [];
  function paidText(b) {
    if (b.mine) return b.payMode === 'split' ? 'Split between players' : b.payMode === 'full' ? 'Paid in full' : 'Deposit paid';
    return b.paid === 'full' ? 'Paid in full' : b.paid === 'deposit' ? 'Deposit paid' : 'Pays cash at the turf';
  }
  function renderTimeline() {
    var t = turf(), k = FL.dateKey(ownerOff), span = FL.CLOSE - FL.OPEN;
    $$('#tl-day button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.off === ownerOff)));
    var pct = m => ((m - FL.OPEN) / span * 100).toFixed(3) + '%';
    blocks = [];
    var first = seen === null;
    var nextSeen = new Set();

    var hours = '';
    for (var m = FL.OPEN; m <= FL.CLOSE; m += 120) {
      var c = FL.clock(m);
      var style = m === FL.CLOSE ? 'right:0;left:auto;transform:none' : 'left:' + pct(m);
      hours += '<span style="' + style + '">' + c.t.replace(':00', '') + ' ' + c.ap + '</span>';
    }
    var tracks = t.pitches.map(p => {
      var list = FL.busy(t.id, p.id, k).slice().sort((a, b) => a.start - b.start);
      var bl = list.map(b => {
        var i = blocks.push({ b: b, p: p }) - 1;
        nextSeen.add(b.id);
        var fresh = !first && !seen.has(b.id) && !reduce;
        return '<button type="button" class="tl-b ' + (b.source === 'walkin' ? 'walkin' : 'online') + (b.mine ? ' mine' : '') + (fresh ? ' fresh' : '') + '"' +
          ' style="left:' + pct(b.start) + ';width:calc(' + ((b.end - b.start) / span * 100).toFixed(3) + '% - 3px)" data-i="' + i + '"' +
          ' aria-label="' + esc(b.team) + ', ' + FL.range(b.start, b.end) + ', ' + (b.source === 'walkin' ? 'walk-in' : 'online') + '">' +
          '<b>' + esc(b.team) + '</b><span>' + FL.range(b.start, b.end) + '</span></button>';
      }).join('');
      return '<div class="tl-track"><span class="peak-zone" style="left:' + pct(1020) + ';width:' + ((1380 - 1020) / span * 100) + '%"></span>' + bl + '</div>';
    }).join('');
    var nm = FL.nowMin();
    var now = ownerOff === 0 && nm >= FL.OPEN ? '<span class="tl-now" style="left:' + pct(nm) + '"></span>' : '';
    $('#timeline').innerHTML =
      '<div class="tl-labels">' + t.pitches.map(p => '<div>' + esc(p.name) + '<small>' + p.size + '-a-side</small></div>').join('') + '</div>' +
      '<div class="tl-right"><div class="tl-hours">' + hours + '</div><div class="tl-tracks">' + tracks + '</div>' + now + '</div>';
    seen = nextSeen;
  }
  function blockTip(el) {
    var d = blocks[+el.dataset.i]; if (!d) return;
    var b = d.b;
    var src = b.source === 'walkin' ? 'Walk-in' : b.mine ? 'Booked during this demo' : 'Booked online';
    return '<b>' + esc(b.team) + '</b><span>' + FL.range(b.start, b.end) + ', ' + esc(d.p.name) + '</span><br><span>' + src + '</span>' +
      '<div class="tip-row"><span>' + paidText(b) + '</span><span>' + FL.money(b.price) + '</span></div>';
  }

  /* ---------- revenue, last 14 days ---------- */
  var days = [];
  function niceMax(v) {
    if (v <= 0) return 1000;
    var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }
  function kfmt(v) { return v === 0 ? '৳0' : v >= 1000 ? '৳' + (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'k' : '৳' + v; }
  function topRounded(x, y, w, h, r) {
    r = Math.min(r, w / 2, h);
    return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z';
  }
  function renderRevenue() {
    var el = $('#rev-chart');
    var W = Math.max(280, Math.floor(el.clientWidth || 600)), H = 250, m = { t: 14, r: 6, b: 30, l: 46 };
    var t = turf();
    days = [];
    for (var i = -13; i <= 0; i++) {
      var k = FL.dateKey(i), s = dayStats(t, k);
      days.push({ k: k, off: i, on: s.online, wk: s.walkin, tot: s.online + s.walkin });
    }
    var max = niceMax(Math.max.apply(null, days.map(d => d.tot)));
    var iw = W - m.l - m.r, ih = H - m.t - m.b, bw = iw / days.length;
    var gap = Math.max(4, bw * 0.3), barW = Math.max(4, bw - gap);
    var y = v => m.t + ih - v / max * ih;
    var svg = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Revenue for the last 14 days, split into online and walk-in">';
    svg += '<g class="grid">';
    for (var g = 0; g <= 4; g++) {
      var v = max / 4 * g, yy = Math.round(y(v)) + 0.5;
      svg += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + yy + '" y2="' + yy + '"/>';
      svg += '<text x="' + (m.l - 8) + '" y="' + (yy + 4) + '" text-anchor="end">' + kfmt(v) + '</text>';
    }
    svg += '</g>';
    var showEvery = bw < 26 ? 3 : 2;
    days.forEach((d, i) => {
      var x = m.l + i * bw + gap / 2, base = y(0);
      var yOn = y(d.on), yTot = y(d.tot);
      svg += '<g class="bar-g" data-i="' + i + '">';
      if (d.wk > 0) {
        svg += '<rect x="' + x.toFixed(1) + '" y="' + yOn.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + Math.max(0, base - yOn).toFixed(1) + '" fill="var(--s-online)"/>';
        var hW = Math.max(0, yOn - 2 - yTot);
        if (hW > 0.5) svg += '<path d="' + topRounded(+x.toFixed(1), +yTot.toFixed(1), +barW.toFixed(1), +hW.toFixed(1), 4) + '" fill="var(--s-walkin)"/>';
      } else if (d.on > 0) {
        svg += '<path d="' + topRounded(+x.toFixed(1), +yOn.toFixed(1), +barW.toFixed(1), +(base - yOn).toFixed(1), 4) + '" fill="var(--s-online)"/>';
      }
      svg += '</g>';
      var isToday = d.off === 0;
      if (isToday || (days.length - 1 - i) % showEvery === 0) {
        var lab = isToday ? 'Today' : String(FL.fromKey(d.k).getDate());
        if (!isToday && (days.length - 1 - i) === showEvery && bw < 40) lab = String(FL.fromKey(d.k).getDate());
        svg += '<text x="' + (x + barW / 2).toFixed(1) + '" y="' + (H - 10) + '" text-anchor="' + (isToday ? 'end' : 'middle') + '"' + (isToday ? ' class="today-l" dx="' + (barW / 2) + '"' : '') + '>' + lab + '</text>';
      }
      svg += '<rect class="hit" data-i="' + i + '" x="' + (m.l + i * bw).toFixed(1) + '" y="' + m.t + '" width="' + bw.toFixed(1) + '" height="' + ih + '" tabindex="0"' +
        ' aria-label="' + esc(FL.dateShort(d.k)) + ': ' + FL.money(d.tot) + ' total"/>';
    });
    svg += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + (y(0) + 0.5) + '" y2="' + (y(0) + 0.5) + '" stroke="var(--rule-strong)"/>';
    svg += '</svg>';
    el.innerHTML = svg;
  }
  function revTip(i) {
    var d = days[i]; if (!d) return '';
    return '<b>' + FL.dateShort(d.k) + (d.off === 0 ? ', today so far' : '') + '</b>' +
      '<div class="tip-row"><span><i style="background:var(--s-online)"></i>Online</span><span>' + FL.money(d.on) + '</span></div>' +
      '<div class="tip-row"><span><i style="background:var(--s-walkin)"></i>Walk-in</span><span>' + FL.money(d.wk) + '</span></div>' +
      '<div class="tip-row"><span>Total</span><span>' + FL.money(d.tot) + '</span></div>';
  }

  /* ---------- busiest hours heatmap (last 4 weeks) ---------- */
  var heat = [];
  var ORDER = [6, 0, 1, 2, 3, 4, 5]; // Bangladesh week starts Saturday
  var DNAME = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var DLONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function renderHeat() {
    var t = turf(), acc = {};
    ORDER.forEach(d => { acc[d] = []; for (var h = 0; h < 20; h++) acc[d].push([0, 0]); });
    for (var i = 1; i <= 28; i++) {
      var k = FL.dateKey(-i), dow = FL.fromKey(k).getDay();
      t.pitches.forEach(p => {
        var busy = FL.seeded(t, p, k);
        for (var h = 6; h < 26; h++) {
          var s = h * 60, e = s + 60, occ = 0;
          busy.forEach(b => { var o = Math.min(e, b.end) - Math.max(s, b.start); if (o > 0) occ += o; });
          acc[dow][h - 6][0] += occ / 60; acc[dow][h - 6][1]++;
        }
      });
    }
    heat = [];
    var html = '';
    ORDER.forEach(d => {
      html += '<span class="hl">' + DNAME[d] + '</span>';
      acc[d].forEach((c, hi) => {
        var v = c[1] ? c[0] / c[1] : 0, idx = heat.push({ d: d, h: hi + 6, v: v }) - 1;
        html += '<button type="button" class="hc" data-i="' + idx + '" style="background:rgba(255,194,75,' + (0.06 + 0.94 * v).toFixed(3) + ')"' +
          ' aria-label="' + DLONG[d] + ' ' + FL.time((hi + 6) * 60) + ', ' + Math.round(v * 100) + '% booked"></button>';
      });
    });
    html += '<span></span>';
    for (var h = 6; h < 26; h++) {
      var lab = (h - 6) % 3 === 0 ? FL.clock(h * 60) : null;
      html += '<span class="hx">' + (lab ? lab.t.replace(':00', '') + ' ' + lab.ap : '') + '</span>';
    }
    $('#heat').innerHTML = html;
  }

  /* ---------- walk-ins ---------- */
  function renderWalkin(keep) {
    var t = turf(), ps = $('#wi-pitch'), prevP = ps.value, prevS = $('#wi-start').value;
    ps.innerHTML = t.pitches.map(p => '<option value="' + p.id + '">' + esc(p.name) + ', ' + p.size + '-a-side</option>').join('');
    if (keep && t.pitches.some(p => p.id === prevP)) ps.value = prevP;
    renderStarts(keep ? prevS : null);
  }
  function renderStarts(prev) {
    var t = turf(), pid = $('#wi-pitch').value, dur = +$('#wi-dur').value, k = FL.dateKey(ownerOff), opts = '';
    $('#wi-start-l').textContent = ownerOff === 0 ? 'Kick-off today' : 'Kick-off tomorrow';
    for (var s = FL.OPEN; s + dur <= FL.CLOSE; s += 30) {
      if (FL.isFree(t.id, pid, k, s, dur)) opts += '<option value="' + s + '">' + FL.range(s, s + dur) + '</option>';
    }
    var sel = $('#wi-start');
    sel.innerHTML = opts || '<option value="">No free time left today for this length</option>';
    sel.disabled = !opts;
    if (prev && $('option[value="' + prev + '"]', sel)) sel.value = prev;
  }
  function bindWalkin() {
    $('#wi-pitch').addEventListener('change', () => renderStarts());
    $('#wi-dur').addEventListener('change', () => renderStarts($('#wi-start').value));
    $('#wi-team').addEventListener('input', () => { $('#wi-err').hidden = true; });
    $('#walkin').addEventListener('submit', e => {
      e.preventDefault();
      var err = $('#wi-err'), t = turf(), pid = $('#wi-pitch').value, p = FL.pitchOf(t, pid), dur = +$('#wi-dur').value;
      var start = $('#wi-start').value, team = $('#wi-team').value.trim(), phone = $('#wi-phone').value.trim();
      function fail(msg, el) { err.textContent = msg; err.hidden = false; if (el) el.focus(); }
      if (!start) return fail('Pick a kick-off time. If none are listed, try a shorter length or another pitch.', $('#wi-dur'));
      if (!team) return fail('Add a team name so you can find this booking later.', $('#wi-team'));
      if (phone && !/^01\d{9}$/.test(phone)) return fail('Phone numbers have 11 digits and start with 01.', $('#wi-phone'));
      start = +start;
      var k = FL.dateKey(ownerOff);
      if (!FL.isFree(t.id, pid, k, start, dur)) { renderStarts(); return fail('That time was just booked online. Pick another time.'); }
      err.hidden = true;
      FL.addBooking(t.id, pid, k, {
        id: 'W' + Date.now().toString(36).toUpperCase(), start: start, end: start + dur, team: team, source: 'walkin', status: 'confirmed',
        price: FL.priceInfo(t.id, p, k, start, dur).price, paid: 'cash', phone: phone
      });
      $('#wi-team').value = ''; $('#wi-phone').value = '';
      FL.toast('Walk-in added: <b>' + esc(team) + '</b>, ' + esc(p.name) + ', ' + FL.range(start, start + dur) + '.', 'ok');
      FL.emit('change');
    });
  }

  /* ---------- pricing rules ---------- */
  function nextDow(dow) { for (var i = 0; i < 7; i++) if (FL.dateFor(i).getDay() === dow) return FL.dateKey(i); return FL.dateKey(0); }
  function renderPricing() {
    var r = FL.pricing[ownerTurf];
    $('#pr-base').value = r.base; $('#pr-peak').value = r.peak; $('#pr-late').value = r.late; $('#pr-wknd').value = r.weekend;
    $('#pr-deal').setAttribute('aria-checked', String(!!r.morningDeal));
    renderPricingOut();
  }
  function renderPricingOut() {
    var r = FL.pricing[ownerTurf], d = FL.defaultPricing[ownerTurf], t = turf();
    $('#pr-base-o').textContent = FL.money(r.base);
    $('#pr-peak-o').textContent = '×' + r.peak.toFixed(2);
    $('#pr-late-o').textContent = '×' + r.late.toFixed(2);
    $('#pr-wknd-o').textContent = '+' + r.weekend + '%';
    var p = t.pitches.find(x => x.size === 5) || t.pitches[0];
    var tue = nextDow(2), fri = nextDow(5);
    var rows = [['Tuesday, 8 AM', tue, 480], ['Tuesday, 8 PM', tue, 1200], ['Friday, 8 PM', fri, 1200], ['Friday, midnight', fri, 1440]];
    $('#pr-preview').innerHTML = '<caption>What players pay for 1 hour on ' + esc(p.name) + '</caption><tbody>' + rows.map(row => {
      var now = FL.priceInfo(t.id, p, row[1], row[2], 60, r).price, was = FL.priceInfo(t.id, p, row[1], row[2], 60, d).price;
      return '<tr><td>' + row[0] + (now !== was ? ' <span class="muted">was ' + FL.money(was) + '</span>' : '') + '</td><td class="' + (now !== was ? 'chg' : '') + '">' + FL.money(now) + '</td></tr>';
    }).join('') + '</tbody>';
  }
  var emitT = 0;
  function bindPricing() {
    function upd(field, el, num) {
      el.addEventListener('input', () => {
        FL.pricing[ownerTurf][field] = num(el.value);
        renderPricingOut();
        clearTimeout(emitT); emitT = setTimeout(() => FL.emit('change', { pricing: true }), 150);
      });
    }
    upd('base', $('#pr-base'), v => +v);
    upd('peak', $('#pr-peak'), v => +v);
    upd('late', $('#pr-late'), v => +v);
    upd('weekend', $('#pr-wknd'), v => +v);
    $('#pr-deal').addEventListener('click', e => {
      var r = FL.pricing[ownerTurf];
      r.morningDeal = !r.morningDeal;
      e.currentTarget.setAttribute('aria-checked', String(r.morningDeal));
      renderPricingOut();
      FL.emit('change', { pricing: true });
      FL.toast(r.morningDeal ? 'Morning deal is on. Slots before noon show 20% off.' : 'Morning deal is off.', 'ok');
    });
  }

  /* ---------- tooltips for timeline, chart and heatmap ---------- */
  function bindTips() {
    var view = $('#owner-view');
    function tipFor(el) {
      if (el.classList.contains('tl-b')) return blockTip(el);
      if (el.classList.contains('hit')) return revTip(+el.dataset.i);
      if (el.classList.contains('hc')) {
        var c = heat[+el.dataset.i];
        return '<b>' + DLONG[c.d] + ', ' + FL.range(c.h * 60, c.h * 60 + 60) + '</b><span>' + Math.round(c.v * 100) + '% booked on average</span>';
      }
      return '';
    }
    function mark(el, on) {
      if (el.classList.contains('hit')) {
        var g = $('#rev-chart .bar-g[data-i="' + el.dataset.i + '"]');
        if (g) g.classList.toggle('is-hover', on);
      }
    }
    var cur = null;
    view.addEventListener('pointermove', e => {
      var el = e.target.closest('.tl-b, .hit, .hc');
      if (el !== cur) { if (cur) mark(cur, false); cur = el; if (el) mark(el, true); }
      if (!el) return FL.hideTip();
      FL.showTip(tipFor(el), e.clientX, e.clientY);
    });
    view.addEventListener('pointerleave', () => { if (cur) mark(cur, false); cur = null; FL.hideTip(); });
    view.addEventListener('focusin', e => {
      var el = e.target.closest('.tl-b, .hit, .hc'); if (!el) return;
      var r = el.getBoundingClientRect();
      mark(el, true);
      FL.showTip(tipFor(el), r.left + r.width / 2, r.top);
    });
    view.addEventListener('focusout', e => { var el = e.target.closest('.tl-b, .hit, .hc'); if (el) mark(el, false); FL.hideTip(); });
    window.addEventListener('scroll', FL.hideTip, { passive: true });
  }

  /* ---------- wiring ---------- */
  function renderAll() {
    // jump to the turf and day of a booking just made on the player side
    if (FL.lastBooked) {
      var lb = FL.lastBooked; FL.lastBooked = null;
      var o = FL.offsetOf(lb.key);
      if (o === 0 || o === 1) { ownerTurf = lb.turfId; ownerOff = o; seen = null; lastKPI = []; }
    }
    renderHead(); renderKPIs(); renderTimeline(); renderRevenue(); renderHeat(); renderWalkin(false); renderPricing();
  }
  FL.renderOwner = renderAll;

  FL.on('change', d => {
    if (!visible()) return;
    renderKPIs(); renderTimeline(); renderRevenue(); renderWalkin(true);
    if (d && d.live && d.live.turfId === ownerTurf && d.live.key === FL.dateKey(ownerOff)) {
      var t = turf(), p = FL.pitchOf(t, d.live.pitchId);
      FL.toast('New booking for your turf: ' + esc(p.name) + ', ' + FL.range(d.live.start, d.live.end) + '.', 'live');
    }
  });

  var rt = 0;
  window.addEventListener('resize', () => { if (!visible()) return; clearTimeout(rt); rt = setTimeout(renderRevenue, 150); });
  setInterval(() => { if (visible()) renderTimeline(); }, 60000);

  bindWalkin();
  bindPricing();
  bindTips();
  if (location.hash === '#owner') renderAll();
})(window.FL);
