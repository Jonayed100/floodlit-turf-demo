/* =========================================================
   Floodlit — player side
   Pitch finder with natural-language search, live slot board,
   10-minute slot holds, squad split payments, demo checkout,
   QR match pass, my bookings, squad board, live activity.
   ========================================================= */
(function (FL) {
  'use strict';

  var $ = (s, r) => (r || document).querySelector(s);
  var $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  var pad = n => String(n).padStart(2, '0');
  FL.esc = esc;

  var store = {
    get(k, f) { try { var v = localStorage.getItem('floodlit:' + k); return v ? JSON.parse(v) : f; } catch (e) { return f; } },
    set(k, v) { try { localStorage.setItem('floodlit:' + k, JSON.stringify(v)); } catch (e) { /* storage blocked: keep going in memory */ } }
  };

  /* =========================================================
     Toasts and tooltip (shared with the owner view)
     ========================================================= */
  function toast(html, kind) {
    var box = $('#toasts');
    var el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.innerHTML = '<i aria-hidden="true"></i><p>' + html + '</p>';
    box.appendChild(el);
    while (box.children.length > 3) box.firstElementChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 380); }, kind === 'live' ? 5200 : 4200);
  }
  FL.toast = toast;

  var tip = $('#tip');
  FL.showTip = function (html, x, y) {
    tip.innerHTML = html;
    tip.hidden = false;
    var r = tip.getBoundingClientRect();
    var left = Math.min(window.innerWidth - r.width - 12, x + 14);
    var top = y - r.height - 12;
    if (top < 8) top = y + 20;
    tip.style.left = Math.max(8, left) + 'px';
    tip.style.top = top + 'px';
  };
  FL.hideTip = function () { tip.hidden = true; };

  function copyText(text, okMsg, el) {
    function fallback() {
      if (el) { var range = document.createRange(); range.selectNodeContents(el); var sel = getSelection(); sel.removeAllRanges(); sel.addRange(range); }
      toast('Text selected. Press Ctrl+C to copy it.');
    }
    try {
      navigator.clipboard.writeText(text).then(() => toast(okMsg, 'ok'), fallback);
    } catch (e) { fallback(); }
  }

  /* =========================================================
     Your bookings, kept in this browser
     ========================================================= */
  FL.my = store.get('bookings', []).filter(b => b && b.key && FL.offsetOf(b.key) >= 0);
  FL.my.forEach(b => { if (b.status !== 'cancelled') FL.addBooking(b.turfId, b.pitchId, b.key, b); });
  function saveMy() { store.set('bookings', FL.my); }
  function updateBadge(bump) {
    var n = FL.my.filter(b => b.status !== 'cancelled').length;
    var el = $('#mine-count');
    el.hidden = !n; el.textContent = n;
    if (bump && !reduce) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  }

  /* =========================================================
     Finder: filters and results
     ========================================================= */
  var DEFAULT_OFF = new Date().getHours() >= 20 ? 1 : 0;
  var WIN = { any: [FL.OPEN, FL.CLOSE], morning: [360, 720], day: [720, 1020], evening: [1020, 1380], late: [1380, 1560] };
  var WIN_LABEL = { morning: 'Morning', day: 'Daytime', evening: 'Evening', late: 'Late night' };
  var MAX_PRICE = 6000;
  function defaults() { return { area: 'all', off: DEFAULT_OFF, win: 'evening', after: null, size: 'any', indoor: false, rooftop: false, max: MAX_PRICE, sort: 'soonest' }; }
  var F = defaults();
  function isDefault() { var d = defaults(); return Object.keys(d).every(k => d[k] === F[k]); }

  function dateChips(active) {
    var h = '';
    for (var i = 0; i < 7; i++) {
      var d = FL.dateFor(i), k = FL.keyOf(d), wk = FL.isWeekend(k);
      var small = i === 0 ? 'Today' : i === 1 ? 'Tmrw' : d.toLocaleDateString('en-GB', { weekday: 'short' });
      h += '<button type="button" class="date' + (wk ? ' wknd' : '') + '" data-off="' + i + '" aria-pressed="' + (i === active) + '"' +
        ' aria-label="' + esc(d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })) + (wk ? ', weekend rates' : '') + '"' +
        (wk ? ' title="Weekend rates apply"' : '') + '><small>' + small + '</small><b>' + d.getDate() + '</b></button>';
    }
    return h;
  }

  function syncControls() {
    $('#f-dates').innerHTML = dateChips(F.off);
    $('#f-area').value = F.area;
    $$('#f-win button').forEach(b => b.setAttribute('aria-pressed', String(F.after == null && b.dataset.win === F.win)));
    $$('#f-size button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.size === String(F.size))));
    $('#f-indoor').setAttribute('aria-pressed', String(F.indoor));
    $('#f-rooftop').setAttribute('aria-pressed', String(F.rooftop));
    $('#f-max').value = F.max;
    $('#f-max-out').textContent = FL.money(F.max);
    $('#f-sort').value = F.sort;
    var when = F.off === 0 ? (F.win === 'evening' || F.win === 'late' ? 'tonight' : 'today') : F.off === 1 ? 'tomorrow' : 'on ' + FL.dayLabel(F.off);
    $('#finder-title').textContent = 'Pitches ' + when;
  }

  function thumb(t) {
    var id = 'glow-' + t.id, s = '';
    for (var i = 0; i < 8; i++) s += '<rect x="' + (12 + i * 17) + '" y="12" width="17" height="86" fill="' + t.stripes[i % 2] + '"/>';
    var extra = '';
    if (t.indoor) {
      extra = '<g stroke="#BFD2FF" stroke-opacity=".22" stroke-width="2">' +
        [24, 52, 80, 108, 136].map(x => '<line x1="' + x + '" y1="0" x2="' + x + '" y2="110"/>').join('') + '</g>';
    }
    if (t.rooftop) {
      extra = '<g fill="#24396A"><rect x="0" y="0" width="160" height="6"/>' +
        [[6, 4], [16, 6], [30, 3], [44, 7], [60, 5], [76, 6], [92, 4], [108, 7], [124, 5], [140, 6], [152, 4]].map(p => '<rect x="' + p[0] + '" y="0" width="9" height="' + (p[1] + 3) + '"/>').join('') + '</g>' +
        '<g fill="#FFC24B" opacity=".8">' + [9, 33, 63, 95, 127, 155].map(x => '<rect x="' + x + '" y="2" width="2" height="2"/>').join('') + '</g>';
    }
    var lamps = [[8, 8], [152, 8], [8, 102], [152, 102]];
    return '<svg viewBox="0 0 160 110" role="img" aria-label="Top-down view of ' + esc(t.name) + '">' +
      '<defs><radialGradient id="' + id + '"><stop offset="0" stop-color="#FFE3A8" stop-opacity=".55"/><stop offset="1" stop-color="#FFE3A8" stop-opacity="0"/></radialGradient></defs>' +
      '<rect width="160" height="110" fill="' + t.apron + '"/>' + s +
      '<g fill="none" stroke="#F1F4EA" stroke-opacity=".85" stroke-width="1.3">' +
      '<rect x="12" y="12" width="136" height="86"/><line x1="80" y1="12" x2="80" y2="98"/><circle cx="80" cy="55" r="11"/>' +
      '<path d="M12 35 A20 20 0 0 1 12 75"/><path d="M148 35 A20 20 0 0 0 148 75"/></g>' +
      '<g fill="#F1F4EA"><rect x="9" y="49" width="3" height="12"/><rect x="148" y="49" width="3" height="12"/></g>' +
      extra +
      lamps.map(l => '<circle cx="' + l[0] + '" cy="' + l[1] + '" r="46" fill="url(#' + id + ')"/>').join('') +
      lamps.map(l => '<circle cx="' + l[0] + '" cy="' + l[1] + '" r="2.4" fill="#FFF6DF"/>').join('') +
      '</svg>';
  }

  function computeRows() {
    var key = FL.dateKey(F.off);
    var win = F.after != null ? [F.after, FL.CLOSE] : WIN[F.win];
    var pool = FL.turfs.filter(t => (F.area === 'all' || t.area === F.area) && (!F.indoor || t.indoor) && (!F.rooftop || t.rooftop) &&
      t.pitches.some(p => F.size === 'any' || p.size === F.size));
    return pool.map(t => {
      var slots = [], anyFree = 0;
      t.pitches.forEach(p => {
        if (F.size !== 'any' && p.size !== F.size) return;
        for (var s = FL.OPEN; s + 60 <= FL.CLOSE; s += 60) {
          if (s < win[0] || s >= win[1]) continue;
          if (!FL.isFree(t.id, p.id, key, s, 60)) continue;
          anyFree++;
          var pi = FL.priceInfo(t.id, p, key, s, 60);
          if (pi.price > F.max) continue;
          slots.push({ p: p, s: s, pi: pi });
        }
      });
      slots.sort((a, b) => a.s - b.s || a.pi.price - b.pi.price);
      return {
        t: t, slots: slots, anyFree: anyFree,
        min: slots.length ? Math.min.apply(null, slots.map(x => x.pi.price)) : Infinity,
        first: slots.length ? slots[0].s : Infinity
      };
    });
  }

  function sizesText(t) {
    var sizes = Array.from(new Set(t.pitches.map(p => p.size))).sort();
    return sizes.length > 1 ? sizes.join(' and ') + '-a-side' : sizes[0] + '-a-side';
  }

  function rowHead(t) {
    return '<div class="fx-thumb">' + thumb(t) + '</div>' +
      '<div class="fx-main"><h3 class="fx-name">' + esc(t.name) + '</h3>' +
      '<p class="fx-meta">' + esc(t.area) + ', ' + sizesText(t) + '. ' + esc(t.blurb) + '.</p>' +
      '<p class="fx-rate"><span class="star" aria-hidden="true">★</span>' + t.rating.toFixed(1) + ' <span>' + t.reviews + ' reviews</span></p>' +
      '<ul class="feats">' + t.features.map(f => '<li>' + esc(f) + '</li>').join('') + '</ul></div>';
  }

  var waitlist = {};
  function rowOpen(r) {
    var t = r.t;
    var multi = t.pitches.filter(p => F.size === 'any' || p.size === F.size).length > 1;
    var chips = r.slots.slice(0, 6).map(x => {
      var c = FL.clock(x.s);
      return '<button type="button" class="flip" data-book="' + t.id + '" data-pitch="' + x.p.id + '" data-start="' + x.s + '"' +
        ' aria-label="Book ' + esc(x.p.name) + ' at ' + FL.time(x.s) + ' for ' + FL.money(x.pi.price) + '">' +
        '<b>' + c.t + '</b><i>' + c.ap + '</i><small>' + (multi ? '<em>' + esc(x.p.id) + '</em>' : '') + FL.money(x.pi.price) + '</small></button>';
    }).join('');
    var more = r.slots.length > 6 ? '<span class="board-more">+' + (r.slots.length - 6) + ' more</span>' : '';
    return '<li class="fx" data-turf="' + t.id + '">' + rowHead(t) +
      '<div class="fx-slots"><p class="fx-slots-l">Next open, 1 hour' + (multi ? ', letter is the pitch' : '') + '</p><div class="board">' + chips + more + '</div></div>' +
      '<div class="fx-cta"><p class="fx-price"><small>From, per hour</small>' + FL.money(r.min) + '</p>' +
      '<button type="button" class="btn btn-primary" data-book="' + t.id + '">Book</button></div></li>';
  }
  function rowFull(r) {
    var t = r.t, on = !!waitlist[t.id];
    var note = r.anyFree ? 'No open slots under ' + FL.money(F.max) + ' at this time.' : 'Fully booked for this time.';
    return '<li class="fx is-full" data-turf="' + t.id + '">' + rowHead(t) +
      '<div class="fx-slots"><p class="fx-full-note">' + note + '</p></div>' +
      '<div class="fx-cta"><button type="button" class="btn btn-ghost" data-wait="' + t.id + '" aria-pressed="' + on + '">' + (on ? 'On the waitlist' : 'Join waitlist') + '</button></div></li>';
  }

  function renderResults(animate) {
    var rows = computeRows();
    var open = rows.filter(r => r.slots.length), full = rows.filter(r => !r.slots.length);
    var sorters = {
      soonest: (a, b) => a.first - b.first || a.min - b.min,
      price: (a, b) => a.min - b.min,
      rating: (a, b) => b.t.rating - a.t.rating
    };
    open.sort(sorters[F.sort]);
    var nSlots = open.reduce((a, r) => a + r.slots.length, 0);
    $('#results-count').innerHTML = open.length
      ? '<b>' + open.length + ' ' + (open.length === 1 ? 'turf' : 'turfs') + '</b> with ' + nSlots + ' open ' + (nSlots === 1 ? 'slot' : 'slots')
      : 'No open slots match these filters';
    $('#clear-filters').hidden = isDefault();
    var html = open.map(rowOpen).join('') + full.map(rowFull).join('');
    if (!rows.length) {
      html = '<li class="empty"><p>No turfs match these filters. Try another area or format.</p>' +
        '<button type="button" class="btn btn-ghost" data-clear>Clear filters</button></li>';
    }
    $('#fixtures').innerHTML = html;
    if (animate && !reduce) {
      $$('#fixtures .flip').forEach((el, i) => { el.style.setProperty('--i', Math.min(i, 24)); el.classList.add('in'); });
    }
  }

  /* ---------- natural-language search ---------- */
  function parseQuery(q) {
    var s = ' ' + q.toLowerCase().replace(/[,.!?]/g, ' ') + ' ';
    var out = {}, parts = [];
    var areaMap = { bashundhara: 'Bashundhara', dhanmondi: 'Dhanmondi', gulshan: 'Gulshan', mirpur: 'Mirpur', pallabi: 'Mirpur', mohammadpur: 'Mohammadpur', uttara: 'Uttara' };
    for (var k in areaMap) if (s.indexOf(k) > -1) { out.area = areaMap[k]; parts.push(out.area); break; }

    if (/\b(5|five)\s*-?\s*(a\s*-?\s*side|aside|v\s*5|vs\s*5)\b|\b5v5\b/.test(s)) { out.size = 5; parts.push('5-a-side'); }
    else if (/\b(7|seven)\s*-?\s*(a\s*-?\s*side|aside|v\s*7|vs\s*7)\b|\b7v7\b/.test(s)) { out.size = 7; parts.push('7-a-side'); }

    var days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    var todayDow = FL.dateFor(0).getDay();
    if (/\b(today|tonight)\b/.test(s)) out.off = 0;
    else if (/\b(tomorrow|tmrw|tmr|tomorow)\b/.test(s)) out.off = 1;
    else if (/\bweekend\b/.test(s)) out.off = (5 - todayDow + 7) % 7;
    else {
      for (var i = 0; i < 7; i++) {
        if (new RegExp('\\b(' + days[i] + '|' + days[i].slice(0, 3) + ')\\b').test(s)) { out.off = (i - todayDow + 7) % 7; break; }
      }
    }
    if (out.off != null) parts.push(FL.dayLabel(out.off));

    var m = s.match(/\b(after|from|at|around|by|past)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/) || s.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
    if (m) {
      var h, mm, ap;
      if (m.length === 5) { h = +m[2]; mm = +(m[3] || 0); ap = m[4]; } else { h = +m[1]; mm = +(m[2] || 0); ap = m[3]; }
      if (h >= 1 && h <= 12) {
        if (ap === 'pm' && h < 12) h += 12;
        else if (ap === 'am' && h === 12) h = 24;
        else if (ap === 'am' && h < 6) h += 24;
        else if (!ap && h < 12 && !/morning/.test(s)) h += 12;
        var mins = h * 60 + mm;
        if (mins >= FL.OPEN && mins < FL.CLOSE) { out.after = mins; parts.push('from ' + FL.time(mins)); }
      }
    }
    if (out.after == null) {
      if (/\b(late|midnight)\b/.test(s)) out.win = 'late';
      else if (/\b(tonight|evening|night)\b/.test(s)) out.win = 'evening';
      else if (/\bmorning\b/.test(s)) out.win = 'morning';
      else if (/\b(afternoon|daytime|lunch)\b/.test(s)) out.win = 'day';
      if (out.win) parts.push(WIN_LABEL[out.win]);
    }
    var b = s.match(/\b(under|below|max|less than|upto|up to|cheaper than)\s*(?:৳|tk\.?|bdt|taka)?\s*(\d[\d,]*)/);
    if (b) { var v = +b[2].replace(/,/g, ''); if (v >= 500) { out.max = Math.min(MAX_PRICE, Math.max(1500, Math.ceil(v / 250) * 250)); parts.push('under ' + FL.money(v)); } }
    if (/\b(indoor|ac|air\s*-?con\w*)\b/.test(s)) { out.indoor = true; parts.push('Indoor AC'); }
    if (/\b(rooftop|roof)\b/.test(s)) { out.rooftop = true; parts.push('Rooftop'); }
    if (/\b(cheap|cheapest|budget)\b/.test(s)) { out.sort = 'price'; parts.push('cheapest first'); }
    if (/\b(best|top rated|top-rated)\b/.test(s)) { out.sort = 'rating'; parts.push('top rated first'); }
    return { f: out, parts: parts };
  }

  function runAsk(q) {
    var read = $('#ask-read');
    q = q.trim();
    if (!q) return;
    var res = parseQuery(q);
    if (!res.parts.length) {
      read.hidden = false;
      read.innerHTML = '<span class="err">Couldn\'t pick out an area, day or time from that. Try something like “Uttara tomorrow evening”.</span>';
      return;
    }
    F = Object.assign(defaults(), res.f);
    read.hidden = false;
    read.innerHTML = '<span>Showing</span>' + res.parts.map((p, i) => '<span class="chip" style="--i:' + i + '">' + esc(p) + '</span>').join('') +
      '<button type="button" class="link-btn" data-clear>Clear</button>';
    syncControls();
    renderResults(true);
  }

  function clearAll() {
    F = defaults();
    $('#ask-input').value = '';
    $('#ask-read').hidden = true;
    syncControls();
    renderResults(true);
  }

  function filterChanged(animate) {
    $('#ask-read').hidden = true;
    syncControls();
    renderResults(animate !== false);
  }

  function bindFinder() {
    var sel = $('#f-area');
    FL.AREAS.forEach(a => { var o = document.createElement('option'); o.value = a; o.textContent = a; sel.appendChild(o); });

    $('#console').addEventListener('submit', e => { e.preventDefault(); runAsk($('#ask-input').value); });
    $('#ask-try').addEventListener('click', e => {
      var b = e.target.closest('.try'); if (!b) return;
      $('#ask-input').value = b.textContent; runAsk(b.textContent);
    });
    $('#ask-read').addEventListener('click', e => { if (e.target.closest('[data-clear]')) clearAll(); });
    $('#f-dates').addEventListener('click', e => { var b = e.target.closest('[data-off]'); if (!b) return; F.off = +b.dataset.off; filterChanged(); });
    sel.addEventListener('change', () => { F.area = sel.value; filterChanged(); });
    $('#f-win').addEventListener('click', e => { var b = e.target.closest('[data-win]'); if (!b) return; F.win = b.dataset.win; F.after = null; filterChanged(); });
    $('#f-size').addEventListener('click', e => { var b = e.target.closest('[data-size]'); if (!b) return; F.size = b.dataset.size === 'any' ? 'any' : +b.dataset.size; filterChanged(); });
    $('#f-indoor').addEventListener('click', () => { F.indoor = !F.indoor; filterChanged(); });
    $('#f-rooftop').addEventListener('click', () => { F.rooftop = !F.rooftop; filterChanged(); });
    var maxT = 0;
    $('#f-max').addEventListener('input', e => {
      F.max = +e.target.value; $('#f-max-out').textContent = FL.money(F.max);
      clearTimeout(maxT); maxT = setTimeout(() => filterChanged(false), 120);
    });
    $('#f-sort').addEventListener('change', e => { F.sort = e.target.value; filterChanged(); });
    $('#clear-filters').addEventListener('click', clearAll);

    $('#fixtures').addEventListener('click', e => {
      var b = e.target.closest('[data-book]');
      if (b) { openBooking(b.dataset.book, b.dataset.pitch, b.dataset.start != null ? +b.dataset.start : null, F.off); return; }
      var w = e.target.closest('[data-wait]');
      if (w) {
        var id = w.dataset.wait, t = FL.turfById(id);
        waitlist[id] = !waitlist[id];
        w.setAttribute('aria-pressed', String(waitlist[id]));
        w.textContent = waitlist[id] ? 'On the waitlist' : 'Join waitlist';
        toast(waitlist[id] ? 'You\'re on the waitlist for <b>' + esc(t.name) + '</b>. We\'ll text you if a slot opens.' : 'Left the waitlist for ' + esc(t.name) + '.', 'ok');
        return;
      }
      if (e.target.closest('[data-clear]')) clearAll();
    });

    // rotate example placeholders
    var examples = ['7-a-side in Mirpur tomorrow after 9pm', 'rooftop pitch tonight under 4000', 'cheapest 5-a-side on Friday evening', 'Gulshan indoor tomorrow at 8pm'];
    var ei = 0, input = $('#ask-input');
    setInterval(() => {
      if (document.activeElement === input || input.value) return;
      ei = (ei + 1) % examples.length; input.placeholder = examples[ei];
    }, 3200);
  }

  /* ---------- hero counters ---------- */
  var heroCounted = false;
  function updateHero() {
    var key = FL.dateKey(DEFAULT_OFF), n = 0, first = Infinity;
    FL.turfs.forEach(t => t.pitches.forEach(p => {
      for (var s = 1020; s + 60 <= FL.CLOSE; s += 60) {
        if (FL.isFree(t.id, p.id, key, s, 60)) { n++; if (s < first) first = s; }
      }
    }));
    $('#open-label').textContent = DEFAULT_OFF === 0 ? 'open slots tonight' : 'open slots tomorrow night';
    $('#open-next').textContent = first === Infinity ? 'Evenings are full' : (DEFAULT_OFF === 0 ? 'Next kick-off ' : 'First kick-off ') + FL.time(first);
    var el = $('#open-count');
    if (heroCounted || reduce) { el.textContent = n; return; }
    heroCounted = true;
    var t0 = 0;
    setTimeout(() => requestAnimationFrame(function step(now) {
      if (!t0) t0 = now;
      var k = Math.min(1, (now - t0) / 1100);
      el.textContent = Math.round(n * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    }), 2800);
  }

  /* =========================================================
     Booking drawer
     ========================================================= */
  var HOLD_MS = 10 * 60 * 1000;
  var ADDONS = [
    { id: 'ball', name: 'Match ball', desc: 'Size 5, pumped and ready', price: 150 },
    { id: 'bibs', name: 'Bibs, two sets', desc: 'Washed after every game', price: 200 },
    { id: 'water', name: 'Water crate', desc: '24 cold bottles at pitch side', price: 300 },
    { id: 'ref', name: 'Referee', desc: 'Certified ref for the full slot', price: 800 },
    { id: 'cam', name: 'Match recording', desc: 'A tracking camera films the game. Highlights arrive by morning.', price: 900 }
  ];
  var METHODS = { bkash: 'bKash', nagad: 'Nagad', card: 'card' };
  var PERIODS = [['Morning', 360, 720], ['Daytime', 720, 1020], ['Evening, peak rates', 1020, 1380], ['Late night', 1380, 1560]];

  var bk = null, holdTimer = null, matesTimer = null, justTaken = null;

  function code(n) { var a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = ''; for (var i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }
  function bkTurf() { return FL.turfById(bk.turfId); }
  function bkPitch() { return FL.pitchOf(bkTurf(), bk.pitchId); }
  function bkKey() { return FL.dateKey(bk.off); }
  function slotPrice() { return FL.priceInfo(bk.turfId, bkPitch(), bkKey(), bk.start, bk.dur).price; }
  function extrasTotal() { return ADDONS.reduce((a, x) => a + (bk.addons[x.id] ? x.price : 0), 0); }
  function total() { return slotPrice() + extrasTotal(); }
  function perHead() { return Math.ceil(total() / bk.players / 10) * 10; }
  function deposit() { return Math.round(total() * 0.3 / 10) * 10; }
  function dueNow() { return bk.split ? perHead() : bk.pay === 'deposit' ? deposit() : total(); }
  function mateName(i) { return FL.PLAYERS[i] || 'Player ' + (i + 1); }

  function openBooking(turfId, pitchId, start, off) {
    var t = FL.turfById(turfId);
    var pitch = pitchId ? FL.pitchOf(t, pitchId) : (t.pitches.find(p => F.size === 'any' || p.size === F.size) || t.pitches[0]);
    bk = {
      turfId: t.id, pitchId: pitch.id, off: off != null ? off : F.off, dur: 60, start: null, step: 1, hold: null,
      team: store.get('team', 'Friday Night FC'), players: pitch.size * 2, addons: {}, split: false, pay: 'deposit', method: 'bkash',
      paid: {}, code: code(5), notice: null, result: null
    };
    if (start != null && FL.isFree(t.id, pitch.id, bkKey(), start, 60)) bk.start = start;
    $('#book-title').textContent = t.name;
    $('#book-sub').textContent = t.area + '. Rated ' + t.rating.toFixed(1) + ' by ' + t.reviews + ' players.';
    renderBook();
    openDrawer($('#book'));
  }

  function renderBook() {
    if (!bk) return;
    $$('#steps li').forEach(li => {
      var n = +li.dataset.step;
      li.classList.toggle('is-on', n === bk.step);
      li.classList.toggle('is-done', n < bk.step);
      if (n === bk.step) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    var body = $('#book-body'), foot = $('#book-foot');
    var keepScroll = body.scrollTop, sameStep = body.dataset.step === String(bk.step);
    body.innerHTML = [null, step1, step2, step3, step4][bk.step]();
    foot.innerHTML = [null, foot1, foot2, foot3, foot4][bk.step]();
    if (sameStep) { body.scrollTop = keepScroll; $$('.dr-pane', body).forEach(p => p.style.animation = 'none'); }
    else body.scrollTop = 0;
    body.dataset.step = bk.step;
    if (justTaken != null) {
      var j = $('.slot[data-start="' + justTaken + '"]', body);
      if (j) j.classList.add('just-taken');
      justTaken = null;
    }
  }

  /* ---------- step 1: pick a slot ---------- */
  function step1() {
    var t = bkTurf(), pitch = bkPitch(), key = bkKey();
    var h = '<div class="dr-pane">';
    if (bk.notice) h += '<p class="notice notice-' + bk.notice.kind + '" role="status">' + esc(bk.notice.text) + '</p>';
    if (t.pitches.length > 1) {
      h += '<section><h3 class="bk-h">Pitch</h3><div class="seg">' + t.pitches.map(p =>
        '<button type="button" data-pitch="' + p.id + '" aria-pressed="' + (p.id === bk.pitchId) + '">' + esc(p.name) + ', ' + p.size + '-a-side</button>').join('') + '</div></section>';
    }
    h += '<section><h3 class="bk-h">Day</h3><div class="dates">' + dateChips(bk.off) + '</div></section>';
    h += '<section><h3 class="bk-h">How long</h3><div class="seg">' + [60, 90, 120].map(d =>
      '<button type="button" data-dur="' + d + '" aria-pressed="' + (d === bk.dur) + '">' + FL.durLabel(d) + '</button>').join('') + '</div></section>';

    var periods = '', any = false;
    PERIODS.forEach(pr => {
      var chips = '';
      for (var s = pr[1]; s < pr[2]; s += 60) {
        var st = FL.slotState(t.id, pitch.id, key, s, bk.dur, bk.hold && bk.hold.id);
        if (st === 'past' || st === 'closed') continue;
        var pi = FL.priceInfo(t.id, pitch, key, s, bk.dur), c = FL.clock(s), free = st === 'free';
        chips += '<button type="button" class="slot' + (pi.peak ? ' is-peak' : '') + '" data-start="' + s + '" aria-pressed="' + (s === bk.start) + '"' + (free ? '' : ' disabled') +
          ' aria-label="' + FL.time(s) + ', ' + (free ? FL.money(pi.price) : st === 'held' ? 'on hold' : 'booked') + '">' +
          '<b>' + c.t + '<i>' + c.ap + '</i></b><span>' + (free ? FL.money(pi.price) : st === 'held' ? 'On hold' : 'Booked') + '</span>' +
          (pi.deal && free ? '<em class="tag">−20%</em>' : '') + '</button>';
      }
      if (chips) { any = true; periods += '<div class="period"><h4>' + pr[0] + '</h4><div class="slot-grid">' + chips + '</div></div>'; }
    });
    h += '<section><h3 class="bk-h">Kick-off <small>' + FL.durLabel(bk.dur) + ' on ' + esc(pitch.name) + ', ' + FL.dateShort(key) + '</small></h3>' +
      '<p class="slot-legend"><span><i></i>Open</span><span><i class="lg-peak"></i>Peak rate</span><span><i class="lg-taken"></i>Booked</span></p>' +
      (any ? periods : '<p class="notice notice-info">No more slots this day. Pick another day above.</p>') + '</section>';
    return h + '</div>';
  }
  function foot1() {
    if (bk.start == null) return '<div class="foot-sum">Pick a kick-off time to see the price.</div><button type="button" class="btn btn-primary btn-lg" disabled>Hold this slot</button>';
    return '<div class="foot-sum"><b>' + FL.money(slotPrice()) + '</b>' + FL.dateShort(bkKey()) + ', ' + FL.range(bk.start, bk.start + bk.dur) + '</div>' +
      '<button type="button" class="btn btn-primary btn-lg" data-act="hold">Hold this slot</button>';
  }

  /* ---------- step 2: squad and extras ---------- */
  function step2() {
    var pitch = bkPitch();
    var h = '<div class="dr-pane">';
    h += '<p class="notice notice-ok">' + esc(pitch.name) + ', ' + FL.dateShort(bkKey()) + ', ' + FL.range(bk.start, bk.start + bk.dur) +
      ' is held for you. Finish before the timer runs out. <button type="button" class="link-btn" data-act="change">Change slot</button></p>';
    h += '<section><label for="bk-team">Team name<input type="text" id="bk-team" value="' + esc(bk.team) + '" maxlength="32"></label>' +
      '<p class="form-err" id="bk-team-err" hidden>Add a team name. It goes on your match pass.</p></section>';
    h += '<section class="row-between"><div><h3 class="bk-h" style="margin:0">Players</h3><p class="muted">' + pitch.size + '-a-side, subs included</p></div>' +
      '<div class="stepper"><button type="button" data-act="minus" aria-label="Fewer players">−</button><output id="bk-players" aria-live="polite">' + bk.players + '</output>' +
      '<button type="button" data-act="plus" aria-label="More players">+</button></div></section>';
    h += '<section><h3 class="bk-h">Extras</h3><div class="addons">' + ADDONS.map(a =>
      '<label class="addon"><input type="checkbox" data-addon="' + a.id + '"' + (bk.addons[a.id] ? ' checked' : '') + '>' +
      '<span class="box" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12l5 5L19 7"/></svg></span>' +
      '<span class="addon-t">' + a.name + '<span class="addon-d">' + a.desc + '</span></span><span class="addon-p">' + FL.money(a.price) + '</span></label>').join('') + '</div></section>';
    h += '<section class="split" id="split">' + splitInner() + '</section>';
    return h + '</div>';
  }
  function splitInner() {
    var h = '<div class="rule-switch"><span id="split-l"><b style="color:var(--chalk)">Split the cost with your squad</b><br>Everyone pays their share from one link</span>' +
      '<button type="button" class="switch" role="switch" aria-checked="' + bk.split + '" aria-labelledby="split-l" data-act="split"><i></i></button></div>';
    if (!bk.split) return h;
    var per = perHead(), paidN = paidCount();
    h += '<div class="row-between"><span class="muted">Each player pays</span><b class="split-per" style="font-family:var(--display);font-size:28px">' + FL.money(per) + '</b></div>';
    h += '<div class="share"><code id="share-link">pay.floodlit.demo/' + bk.code + '</code><button type="button" class="btn btn-ghost" data-act="copy-link">Copy link</button></div>';
    h += '<div><div class="row-between muted" style="margin-bottom:8px"><span id="mates-count">' + paidN + ' of ' + (bk.players - 1) + ' teammates paid</span><span id="mates-sum">' + FL.money(paidN * per) + ' collected</span></div>' +
      '<div class="bar"><i id="mates-bar" style="width:' + (paidN / Math.max(1, bk.players - 1) * 100) + '%"></i></div></div>';
    h += '<ul class="mates" id="mates">';
    for (var i = 0; i < bk.players; i++) {
      var nm = mateName(i);
      h += '<li data-i="' + i + '" class="' + (bk.paid[i] ? 'paid' : '') + '"><i>' + esc(nm[0]) + '</i><span>' + esc(nm) + (i === 0 ? ', pays at checkout' : '') + '</span></li>';
    }
    return h + '</ul>';
  }
  function paidCount() { var n = 0; for (var i = 1; i < bk.players; i++) if (bk.paid[i]) n++; return n; }
  function foot2() {
    return '<div class="foot-sum"><b>' + FL.money(total()) + '</b>Slot ' + FL.money(slotPrice()) + (extrasTotal() ? ' plus extras ' + FL.money(extrasTotal()) : '') + '</div>' +
      '<button type="button" class="btn btn-primary btn-lg" data-act="to-pay">Continue to payment</button>';
  }
  function refreshStep2Money() {
    var s = $('#split'); if (s) s.innerHTML = splitInner();
    $('#book-foot').innerHTML = foot2();
  }

  function startMates() {
    stopMates();
    matesTimer = setInterval(() => {
      if (!bk || !bk.split || bk.step > 3) return stopMates();
      var unpaid = [];
      for (var i = 1; i < bk.players; i++) if (!bk.paid[i]) unpaid.push(i);
      if (!unpaid.length) return stopMates();
      var k = unpaid[Math.floor(Math.random() * unpaid.length)];
      bk.paid[k] = true;
      var li = $('#mates [data-i="' + k + '"]');
      if (li) { li.classList.add('paid', 'just'); }
      var n = paidCount(), per = perHead();
      var c = $('#mates-count'); if (c) c.textContent = n + ' of ' + (bk.players - 1) + ' teammates paid';
      var sm = $('#mates-sum'); if (sm) sm.textContent = FL.money(n * per) + ' collected';
      var bar = $('#mates-bar'); if (bar) bar.style.width = (n / Math.max(1, bk.players - 1) * 100) + '%';
      var sq = $('#squad-paid'); if (sq) sq.textContent = n + ' of ' + (bk.players - 1) + ' teammates have paid ' + FL.money(n * per) + ' so far.';
    }, 2300);
  }
  function stopMates() { clearInterval(matesTimer); matesTimer = null; }

  /* ---------- step 3: pay ---------- */
  var ICONS = {
    bkash: '<svg viewBox="0 0 24 24"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10 18.5h4"/></svg>',
    nagad: '<svg viewBox="0 0 24 24"><path d="M3 7.5h15a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z"/><path d="M3 7.5 15 3.5v4"/><circle cx="16.5" cy="14" r="1.2"/></svg>',
    card: '<svg viewBox="0 0 24 24"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 9.5h19M6 15h4"/></svg>'
  };
  function step3() {
    var pitch = bkPitch(), t = bkTurf();
    var rows = [
      ['Pitch', esc(t.name) + ', ' + esc(pitch.name)],
      ['When', FL.dateShort(bkKey()) + ', ' + FL.range(bk.start, bk.start + bk.dur)],
      ['Team', esc(bk.team) + ', ' + bk.players + ' players'],
      ['Slot', FL.money(slotPrice())]
    ];
    ADDONS.forEach(a => { if (bk.addons[a.id]) rows.push([a.name, FL.money(a.price)]); });
    var h = '<div class="dr-pane"><section><h3 class="bk-h">Summary</h3><ul class="summary">' +
      rows.map(r => '<li><span>' + r[0] + '</span><span>' + r[1] + '</span></li>').join('') +
      '<li class="total"><span>Total</span><span>' + FL.money(total()) + '</span></li></ul></section>';
    if (bk.split) {
      h += '<p class="notice notice-info">You pay your share of ' + FL.money(perHead()) + ' now. <span id="squad-paid">' + paidCount() + ' of ' + (bk.players - 1) +
        ' teammates have paid ' + FL.money(paidCount() * perHead()) + ' so far.</span> Unpaid shares are settled at the gate.</p>';
    } else {
      h += '<section><h3 class="bk-h">Pay now</h3><div class="choices">' +
        choice('pay', 'deposit', bk.pay === 'deposit', '30% deposit', 'Pay the rest at the turf before kick-off', FL.money(deposit())) +
        choice('pay', 'full', bk.pay === 'full', 'Full amount', 'Nothing to pay at the gate', FL.money(total())) +
        '</div></section>';
    }
    h += '<section><h3 class="bk-h">Payment method</h3><div class="methods">' +
      Object.keys(METHODS).map(m => '<label class="method"><input type="radio" name="method" value="' + m + '"' + (bk.method === m ? ' checked' : '') + '>' +
        ICONS[m] + '<span>' + (m === 'card' ? 'Card' : METHODS[m]) + '</span><small>' + (m === 'card' ? 'Visa, Mastercard' : 'Mobile wallet') + '</small></label>').join('') + '</div></section>';
    h += '<p class="notice notice-info">Demo mode. No money moves and no payment details are collected.</p>';
    return h + '</div>';
  }
  function choice(name, val, checked, title, desc, price) {
    return '<label class="choice"><input type="radio" name="' + name + '" value="' + val + '"' + (checked ? ' checked' : '') + '><span class="dot" aria-hidden="true"></span>' +
      '<span><span class="choice-t">' + title + '</span><span class="choice-d">' + desc + '</span></span><span class="choice-p">' + price + '</span></label>';
  }
  function foot3() {
    return '<div class="foot-sum"><b>' + FL.money(dueNow()) + '</b>Due now by ' + (bk.method === 'card' ? 'card' : METHODS[bk.method]) + '</div>' +
      '<button type="button" class="btn btn-primary btn-lg" data-act="pay">Pay ' + FL.money(dueNow()) + '</button>';
  }

  /* ---------- step 4: match pass ---------- */
  function qrSVG(b) {
    try {
      if (window.qrcode) {
        var q = window.qrcode(0, 'M');
        q.addData('FLOODLIT:' + b.id + ':' + b.key + ':' + b.start);
        q.make();
        return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true, alt: 'QR code for booking ' + b.id });
      }
    } catch (e) { /* fall through */ }
    return '<div class="qr-fallback">' + esc(b.id) + '</div>';
  }
  function stamp(key, min) {
    var d = FL.fromKey(key); d.setHours(0, 0, 0, 0); d.setMinutes(min);
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + 'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00';
  }
  function gcal(b) {
    var t = FL.turfById(b.turfId), p = FL.pitchOf(t, b.pitchId), e = encodeURIComponent;
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + e('Football: ' + b.team) +
      '&dates=' + stamp(b.key, b.start) + '/' + stamp(b.key, b.end) + '&ctz=Asia/Dhaka' +
      '&location=' + e(t.name + ', ' + t.area + ', Dhaka') + '&details=' + e('Floodlit booking ' + b.id + ', ' + p.name);
  }
  function wa(b) {
    var t = FL.turfById(b.turfId);
    return 'https://wa.me/?text=' + encodeURIComponent('Game on! ' + b.team + ' at ' + t.name + ' (' + t.area + '), ' + FL.dateShort(b.key) + ' at ' + FL.time(b.start) + '. Booking ' + b.id);
  }
  function step4() {
    var b = bk.result, t = FL.turfById(b.turfId), p = FL.pitchOf(t, b.pitchId);
    var h = '<div class="dr-pane"><div class="pass-wrap"><article class="pass" aria-label="Match pass">' +
      '<div class="pass-top"><h3 class="pass-turf">' + esc(t.name) + '</h3><p class="pass-where">' + esc(t.area) + ', ' + esc(p.name) + ', ' + p.size + '-a-side</p>' +
      '<dl class="pass-grid">' +
      '<div><dt>Date</dt><dd>' + FL.dateShort(b.key) + '</dd></div>' +
      '<div><dt>Kick-off</dt><dd>' + FL.time(b.start) + '</dd></div>' +
      '<div><dt>Full time</dt><dd>' + FL.time(b.end) + '</dd></div>' +
      '<div><dt>Team</dt><dd>' + esc(b.team) + '</dd></div>' +
      '<div><dt>Players</dt><dd>' + b.players + '</dd></div>' +
      '<div><dt>Paid now</dt><dd>' + FL.money(b.paidNow) + '</dd></div></dl></div>' +
      '<div class="pass-tear" aria-hidden="true"></div>' +
      '<div class="pass-bot"><div class="qr">' + qrSVG(b) + '</div><div class="pass-id"><span>Booking ID</span><b id="pass-id">' + esc(b.id) + '</b>' +
      '<span>Show this at the gate. Arrive 10 minutes early to warm up.</span></div></div></article></div>';
    var rest = b.total - b.paidNow;
    if (rest > 0) {
      h += '<p class="notice notice-info">' + (b.payMode === 'split'
        ? 'Your squad link stays open until kick-off. Anything unpaid, ' + FL.money(rest) + ' at most, is settled at the gate.'
        : 'Pay the remaining ' + FL.money(rest) + ' at the turf before kick-off.') + '</p>';
    }
    h += '<div class="pass-actions"><a class="btn btn-ghost" target="_blank" rel="noopener" href="' + gcal(b) + '">Add to Google Calendar</a>' +
      '<a class="btn btn-ghost" target="_blank" rel="noopener" href="' + wa(b) + '">Share on WhatsApp</a>' +
      '<button type="button" class="btn btn-ghost" data-act="copy-id">Copy booking ID</button></div>';
    return h + '</div>';
  }
  function foot4() {
    return '<button type="button" class="btn btn-ghost" data-act="see-mine">View my bookings</button><button type="button" class="btn btn-primary btn-lg" data-act="done">Done</button>';
  }

  /* ---------- holds ---------- */
  function placeHold() {
    bk.hold = { id: 'H' + Date.now(), turfId: bk.turfId, pitchId: bk.pitchId, key: bkKey(), start: bk.start, end: bk.start + bk.dur, until: Date.now() + HOLD_MS };
    FL.holds.push(bk.hold);
    $('#hold').hidden = false;
    tickHold();
    holdTimer = setInterval(tickHold, 1000);
  }
  function releaseHold() {
    if (bk && bk.hold) { var h = bk.hold; FL.holds = FL.holds.filter(x => x !== h); bk.hold = null; }
    clearInterval(holdTimer); holdTimer = null;
    var el = $('#hold'); el.hidden = true; el.classList.remove('is-low');
  }
  function tickHold() {
    if (!bk || !bk.hold) return;
    var ms = bk.hold.until - Date.now();
    if (ms <= 0) {
      releaseHold(); stopMates();
      bk.step = 1; bk.start = null;
      bk.notice = { kind: 'warn', text: 'Your 10-minute hold ran out, so the slot went back on sale. Pick a time to hold it again.' };
      renderBook(); FL.emit('change');
      return;
    }
    var s = Math.ceil(ms / 1000);
    $('#hold-time').textContent = Math.floor(s / 60) + ':' + pad(s % 60);
    $('#hold-ring').style.strokeDashoffset = (94.25 * (1 - ms / HOLD_MS)).toFixed(2);
    $('#hold').classList.toggle('is-low', s <= 60);
  }

  function confirmBooking() {
    var t = bkTurf(), pitch = bkPitch();
    var b = {
      id: 'FL-' + code(5), turfId: t.id, pitchId: pitch.id, key: bkKey(), start: bk.start, end: bk.start + bk.dur,
      team: bk.team, players: bk.players, addons: ADDONS.filter(a => bk.addons[a.id]).map(a => a.name),
      total: total(), price: total(), paidNow: dueNow(), payMode: bk.split ? 'split' : bk.pay, method: bk.method,
      paid: bk.split ? 'split' : bk.pay, status: 'confirmed', source: 'online', mine: true, created: Date.now()
    };
    releaseHold(); stopMates();
    FL.addBooking(b.turfId, b.pitchId, b.key, b);
    FL.my.unshift(b);
    saveMy(); updateBadge(true);
    store.set('team', bk.team);
    bk.result = b; bk.step = 4;
    renderBook();
    confetti();
    FL.lastBooked = b;
    FL.emit('change', { booked: b });
  }

  function confetti() {
    if (reduce) return;
    var c = $('#confetti'), dr = $('#book'), r = dr.getBoundingClientRect();
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = r.width * dpr; c.height = r.height * dpr;
    var x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    var cols = ['#FFC24B', '#F1F4EA', '#3FBF7F', '#8CCBFF'], parts = [];
    for (var i = 0; i < 140; i++) {
      parts.push({ x: r.width / 2 + (Math.random() - 0.5) * 80, y: r.height * 0.3, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 12 - 4,
        w: 4 + Math.random() * 5, h: 7 + Math.random() * 8, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.35, c: cols[i % 4] });
    }
    var start = performance.now();
    (function frame(now) {
      x.clearRect(0, 0, r.width, r.height);
      var alive = false;
      parts.forEach(p => {
        p.vy += 0.38; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        if (p.y < r.height + 20) alive = true;
        x.save(); x.translate(p.x, p.y); x.rotate(p.rot); x.fillStyle = p.c;
        x.fillRect(-p.w / 2, -p.h / 2, p.w, Math.max(1, p.h * Math.abs(Math.cos(p.rot * 2))));
        x.restore();
      });
      if (alive && now - start < 3600) requestAnimationFrame(frame); else x.clearRect(0, 0, r.width, r.height);
    })(start);
  }

  function bindBooking() {
    var dr = $('#book');
    dr.addEventListener('click', e => {
      if (!bk) return;
      var el;
      if ((el = e.target.closest('[data-pitch]')) && bk.step === 1) {
        bk.pitchId = el.dataset.pitch; bk.players = bkPitch().size * 2; bk.notice = null;
        if (bk.start != null && !FL.isFree(bk.turfId, bk.pitchId, bkKey(), bk.start, bk.dur)) bk.start = null;
        return renderBook();
      }
      if ((el = e.target.closest('[data-off]')) && bk.step === 1) {
        bk.off = +el.dataset.off; bk.notice = null;
        if (bk.start != null && !FL.isFree(bk.turfId, bk.pitchId, bkKey(), bk.start, bk.dur)) bk.start = null;
        return renderBook();
      }
      if ((el = e.target.closest('[data-dur]')) && bk.step === 1) {
        bk.dur = +el.dataset.dur; bk.notice = null;
        if (bk.start != null && !FL.isFree(bk.turfId, bk.pitchId, bkKey(), bk.start, bk.dur)) bk.start = null;
        return renderBook();
      }
      if ((el = e.target.closest('.slot[data-start]')) && bk.step === 1 && !el.disabled) {
        var s = +el.dataset.start;
        bk.start = bk.start === s ? null : s; bk.notice = null;
        return renderBook();
      }
      el = e.target.closest('[data-act]');
      if (!el) { if (e.target.closest('[data-close]')) closeDrawer(); return; }
      var act = el.dataset.act;
      if (act === 'hold') {
        if (!FL.isFree(bk.turfId, bk.pitchId, bkKey(), bk.start, bk.dur)) {
          justTaken = bk.start; bk.start = null;
          bk.notice = { kind: 'warn', text: 'Someone else just took that slot. Pick another time.' };
          return renderBook();
        }
        placeHold(); bk.step = 2; bk.notice = null; renderBook(); FL.emit('change');
        if (bk.split) startMates();
      } else if (act === 'change') {
        releaseHold(); stopMates(); bk.step = 1; renderBook(); FL.emit('change');
      } else if (act === 'minus' || act === 'plus') {
        var max = bkPitch().size * 2 + 6;
        bk.players = Math.max(2, Math.min(max, bk.players + (act === 'plus' ? 1 : -1)));
        $('#bk-players').textContent = bk.players;
        refreshStep2Money();
      } else if (act === 'split') {
        bk.split = !bk.split;
        if (bk.split) startMates(); else stopMates();
        refreshStep2Money();
      } else if (act === 'copy-link') {
        copyText('https://pay.floodlit.demo/' + bk.code, 'Squad payment link copied.', $('#share-link'));
      } else if (act === 'to-pay') {
        var nm = $('#bk-team').value.trim();
        if (!nm) { $('#bk-team-err').hidden = false; $('#bk-team').focus(); return; }
        bk.team = nm; bk.step = 3; renderBook();
      } else if (act === 'pay') {
        el.disabled = true;
        el.innerHTML = '<span class="spinner" aria-hidden="true"></span>Confirming payment';
        setTimeout(confirmBooking, reduce ? 300 : 1700);
      } else if (act === 'copy-id') {
        copyText(bk.result.id, 'Booking ID copied.', $('#pass-id'));
      } else if (act === 'see-mine') {
        closeDrawer(); setTimeout(openMine, reduce ? 0 : 420);
      } else if (act === 'done') {
        closeDrawer();
      }
    });
    dr.addEventListener('change', e => {
      if (!bk) return;
      var t = e.target;
      if (t.dataset.addon) { bk.addons[t.dataset.addon] = t.checked; refreshStep2Money(); }
      else if (t.name === 'pay') { bk.pay = t.value; $('#book-foot').innerHTML = foot3(); }
      else if (t.name === 'method') { bk.method = t.value; $('#book-foot').innerHTML = foot3(); }
    });
    dr.addEventListener('input', e => {
      if (bk && e.target.id === 'bk-team') { bk.team = e.target.value; if (e.target.value.trim()) $('#bk-team-err').hidden = true; }
    });
  }

  /* =========================================================
     Drawer plumbing
     ========================================================= */
  var openDr = null, lastFocus = null, hideT = 0;
  function openDrawer(el) {
    clearTimeout(hideT);
    lastFocus = document.activeElement;
    var sc = $('#scrim');
    sc.hidden = false; el.hidden = false;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => requestAnimationFrame(() => { sc.classList.add('is-open'); el.classList.add('is-open'); }));
    openDr = el;
    setTimeout(() => { var f = $('[data-close]', el); if (f) f.focus({ preventScroll: true }); }, 80);
  }
  function closeDrawer() {
    if (!openDr) return;
    var el = openDr, sc = $('#scrim');
    if (el.id === 'book' && bk) {
      if (bk.hold) { releaseHold(); toast('Hold released. The slot is open again.'); FL.emit('change'); }
      stopMates();
      bk = null;
    }
    el.classList.remove('is-open'); sc.classList.remove('is-open');
    openDr = null;
    document.body.style.overflow = '';
    hideT = setTimeout(() => { el.hidden = true; if (!openDr) sc.hidden = true; }, reduce ? 0 : 500);
    if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }
  document.addEventListener('keydown', e => {
    if (!openDr) return;
    if (e.key === 'Escape') { e.preventDefault(); closeDrawer(); return; }
    if (e.key === 'Tab') {
      var f = $$('button:not([disabled]), a[href], input, select, [tabindex="0"]', openDr).filter(x => x.offsetParent !== null);
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  $('#scrim').addEventListener('click', closeDrawer);
  $$('#mine [data-close]').forEach(b => b.addEventListener('click', closeDrawer));

  /* =========================================================
     My bookings
     ========================================================= */
  var mineUI = { qr: {}, confirm: {} };
  function kickoffDate(b) { var d = FL.fromKey(b.key); d.setHours(0, 0, 0, 0); d.setMinutes(b.start); return d; }
  function refundText(b) {
    var hrs = (kickoffDate(b) - Date.now()) / 36e5;
    return hrs > 6
      ? 'Kick-off is more than 6 hours away, so your ' + FL.money(b.paidNow) + ' goes back to your ' + (b.method === 'card' ? 'card' : METHODS[b.method]) + ' account.'
      : 'Kick-off is less than 6 hours away, so the ' + FL.money(b.paidNow) + ' you paid is not refunded.';
  }
  function renderMine() {
    var body = $('#mine-body');
    if (!FL.my.length) {
      body.innerHTML = '<div class="empty"><p>No bookings yet. Book a pitch and your match pass shows up here.</p>' +
        '<button type="button" class="btn btn-primary" data-act="find">Find a pitch</button></div>';
      return;
    }
    body.innerHTML = FL.my.map(b => {
      var t = FL.turfById(b.turfId), p = FL.pitchOf(t, b.pitchId), cx = b.status === 'cancelled';
      var h = '<article class="mb' + (cx ? ' is-cancelled' : '') + '" data-id="' + esc(b.id) + '">' +
        '<div class="mb-top"><div><h3 class="mb-name">' + esc(t.name) + '</h3><p class="mb-when">' + FL.dateShort(b.key) + ', ' + FL.range(b.start, b.end) + ', ' + esc(p.name) + '</p></div>' +
        '<span class="pill ' + (cx ? 'st-x' : 'st-ok') + '">' + (cx ? 'Cancelled' : 'Confirmed') + '</span></div>' +
        '<p class="muted">' + esc(b.team) + '. Paid ' + FL.money(b.paidNow) + ' of ' + FL.money(b.total) + ' by ' + (b.method === 'card' ? 'card' : METHODS[b.method]) + '. Booking ID ' + esc(b.id) + '.</p>';
      if (!cx && mineUI.qr[b.id]) h += '<div class="mb-qr"><div class="qr">' + qrSVG(b) + '</div><p class="muted">Show this code at the gate.</p></div>';
      if (!cx && mineUI.confirm[b.id]) {
        h += '<div class="mb-confirm notice notice-warn"><p>Cancel this booking? ' + refundText(b) + '</p>' +
          '<div class="mb-actions"><button type="button" class="btn btn-ghost" data-act="keep">Keep booking</button><button type="button" class="btn btn-primary" data-act="do-cancel">Cancel booking</button></div></div>';
      } else if (!cx) {
        h += '<div class="mb-actions"><button type="button" class="btn btn-ghost" data-act="qr">' + (mineUI.qr[b.id] ? 'Hide match pass' : 'Show match pass') + '</button>' +
          '<button type="button" class="btn btn-ghost" data-act="cancel">Cancel booking</button></div>';
      }
      return h + '</article>';
    }).join('');
  }
  function openMine() { renderMine(); openDrawer($('#mine')); }
  $('#open-mine').addEventListener('click', openMine);
  $('#mine-body').addEventListener('click', e => {
    var a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'find') { closeDrawer(); location.hash = 'pitches'; return; }
    var card = a.closest('[data-id]'), id = card && card.dataset.id, b = FL.my.find(x => x.id === id);
    if (!b) return;
    if (a.dataset.act === 'qr') mineUI.qr[id] = !mineUI.qr[id];
    if (a.dataset.act === 'cancel') mineUI.confirm[id] = true;
    if (a.dataset.act === 'keep') mineUI.confirm[id] = false;
    if (a.dataset.act === 'do-cancel') {
      b.status = 'cancelled'; mineUI.confirm[id] = false;
      saveMy(); updateBadge(); FL.emit('change');
      toast('Booking cancelled. The slot is open for other teams again.', 'ok');
    }
    renderMine();
  });

  /* =========================================================
     Squad board
     ========================================================= */
  var squads = FL.squadSeed.map((s, i) => Object.assign({ id: 'q' + i, off: DEFAULT_OFF, mine: false, own: false }, s)).sort((a, b) => a.start - b.start);
  function sqRow(q) {
    var t = FL.turfById(q.turfId), c = FL.clock(q.start), left = q.need - q.joined;
    var dots = '';
    for (var i = 0; i < q.need; i++) dots += '<i class="' + (i < q.joined ? 'on' : '') + '"></i>';
    var when = q.off === 0 ? (q.start >= 1020 ? 'Tonight' : 'Today') : 'Tomorrow';
    var leftTxt = q.mine ? 'You\'re in. ' + (left > 0 ? left + ' more needed' : 'Squad complete') : left === 1 ? '1 spot left' : left > 0 ? left + ' of ' + q.need + ' spots left' : 'Squad complete';
    var btn;
    if (q.own) btn = '<span class="pill pill-demo">Your post</span>';
    else if (q.mine) btn = '<button type="button" class="btn btn-ghost" data-join="' + q.id + '" aria-pressed="true">Leave game</button>';
    else btn = '<button type="button" class="btn btn-ghost" data-join="' + q.id + '" aria-pressed="false"' + (left <= 0 ? ' disabled' : '') + '>' + (left <= 0 ? 'Full' : 'Join game') + '</button>';
    return '<li class="sq' + (q.isNew ? ' is-new' : '') + '" data-q="' + q.id + '">' +
      '<div class="sq-time"><b>' + c.t + '<i>' + c.ap + '</i></b><span>' + when + '</span></div>' +
      '<div class="sq-main"><h3 class="sq-team">' + esc(q.team) + '</h3><p class="sq-where">' + esc(t.name) + ', ' + esc(t.area) + '</p>' +
      (q.note ? '<p class="sq-note">' + esc(q.note) + '</p>' : '') + '</div>' +
      '<div class="sq-need"><span class="pill lvl lvl-' + q.level.toLowerCase() + '">' + q.level + '</span>' +
      '<div class="spots" aria-hidden="true">' + dots + '</div><p class="sq-left">' + leftTxt + '</p></div>' + btn + '</li>';
  }
  function renderSquads() { $('#squad-list').innerHTML = squads.map(sqRow).join(''); }
  function popDot(q, idx) {
    if (reduce) return;
    var row = $('#squad-list [data-q="' + q.id + '"]'); if (!row) return;
    var d = $$('.spots i', row)[idx]; if (!d) return;
    d.classList.add('pop'); setTimeout(() => d.classList.remove('pop'), 320);
  }
  function bindSquads() {
    $('#squad-list').addEventListener('click', e => {
      var b = e.target.closest('[data-join]'); if (!b) return;
      var q = squads.find(x => x.id === b.dataset.join), t = FL.turfById(q.turfId);
      q.isNew = false;
      if (q.mine) { q.mine = false; q.joined--; toast('You left ' + esc(q.team) + '\'s game.'); renderSquads(); }
      else if (q.joined < q.need) {
        q.mine = true; q.joined++;
        toast('You\'re in. <b>' + esc(q.team) + '</b>, ' + FL.time(q.start) + ' at ' + esc(t.name) + '.', 'ok');
        renderSquads(); popDot(q, q.joined - 1);
      }
    });
    var ts = $('#pf-turf');
    FL.turfs.forEach(t => { var o = document.createElement('option'); o.value = t.id; o.textContent = t.name + ', ' + t.area; ts.appendChild(o); });
    var tm = $('#pf-time');
    for (var m = 17 * 60; m <= 25 * 60; m += 30) { var o = document.createElement('option'); o.value = m; o.textContent = FL.time(m); if (m === 20 * 60) o.selected = true; tm.appendChild(o); }
    $('#pf-day').value = String(DEFAULT_OFF);

    $('#post-form').addEventListener('submit', e => {
      e.preventDefault();
      var team = $('#pf-team').value.trim(), err = $('#pf-err');
      if (!team) { err.textContent = 'Add a team name so players know who they\'re joining.'; err.hidden = false; $('#pf-team').focus(); return; }
      err.hidden = true;
      var q = {
        id: 'q' + Date.now(), team: team, turfId: $('#pf-turf').value, off: +$('#pf-day').value, start: +$('#pf-time').value,
        need: +$('#pf-need').value, joined: 0, level: $('#pf-level').value, note: $('#pf-note').value.trim(), own: true, mine: false, isNew: true
      };
      squads.forEach(s => s.isNew = false);
      squads.unshift(q);
      renderSquads();
      $('#pf-team').value = ''; $('#pf-note').value = '';
      toast('Posted. Players nearby can join <b>' + esc(team) + '</b> now.', 'ok');
      // a couple of players join your post, to show the live board
      var joins = Math.min(2, q.need);
      for (var j = 0; j < joins; j++) {
        setTimeout(() => {
          if (q.joined >= q.need) return;
          q.joined++; q.isNew = false;
          var who = FL.pick(FL.PLAYERS.slice(1));
          renderSquads(); popDot(q, q.joined - 1);
          toast('<b>' + esc(who) + '</b> joined ' + esc(q.team) + '. ' + (q.need - q.joined ? (q.need - q.joined) + ' spot' + (q.need - q.joined > 1 ? 's' : '') + ' left.' : 'Squad complete.'), 'live');
        }, 6000 + j * 7000);
      }
    });
    $('#pf-team').addEventListener('input', () => { $('#pf-err').hidden = true; });
  }

  /* =========================================================
     Live activity: other teams booking while you browse
     ========================================================= */
  var liveCount = 0;
  function liveTick() {
    setTimeout(liveTick, 17000 + Math.random() * 14000);
    if (document.hidden || liveCount >= 14) return;
    var t = FL.pick(FL.turfs), p = FL.pick(t.pitches);
    var off = DEFAULT_OFF + (Math.random() < 0.6 ? 0 : 1), key = FL.dateKey(off);
    var dur = Math.random() < 0.6 ? 60 : 90, starts = [];
    for (var s = 1020; s + dur <= FL.CLOSE && s <= 1440; s += 60) if (FL.isFree(t.id, p.id, key, s, dur)) starts.push(s);
    if (!starts.length) return;
    var st = FL.pick(starts), team = FL.pick(FL.TEAMS);
    FL.addBooking(t.id, p.id, key, {
      id: 'L' + Date.now().toString(36).toUpperCase(), start: st, end: st + dur, team: team, source: 'online', status: 'confirmed',
      price: FL.priceInfo(t.id, p, key, st, dur).price, paid: 'deposit', live: true
    });
    liveCount++;
    toast('<b>' + esc(team) + '</b> just booked ' + esc(p.name) + ' at ' + esc(t.name) + ', ' + (off === 0 ? 'today' : off === 1 ? 'tomorrow' : FL.dayLabel(off)) + ' ' + FL.time(st) + '.', 'live');
    FL.emit('change', { live: { turfId: t.id, pitchId: p.id, key: key, start: st, end: st + dur } });
  }

  FL.on('change', () => {
    renderResults(false);
    updateHero();
    if (bk && bk.step === 1) {
      if (bk.start != null && !FL.isFree(bk.turfId, bk.pitchId, bkKey(), bk.start, bk.dur)) {
        justTaken = bk.start;
        bk.notice = { kind: 'warn', text: 'Another team just booked ' + FL.time(bk.start) + '. Pick another time.' };
        bk.start = null;
      }
      renderBook();
    }
  });

  /* =========================================================
     Views: player vs owner, routed on the URL hash
     ========================================================= */
  var wasOwner = false;
  function route() {
    var owner = location.hash === '#owner';
    if (openDr && owner !== wasOwner) closeDrawer();
    $('#player-view').hidden = owner;
    $('#owner-view').hidden = !owner;
    var sw = $('#view-switch');
    $('#view-switch-l').textContent = owner ? 'Player' : 'Owner';
    sw.setAttribute('href', owner ? '#play' : '#owner');
    $$('[data-player-link]').forEach(a => { a.hidden = owner; });
    if (FL.heroPause) FL.heroPause(owner);
    if (owner) {
      if (FL.renderOwner) FL.renderOwner();
      window.scrollTo(0, 0);
    } else if (wasOwner) {
      var id = location.hash.slice(1), el = id && id !== 'play' ? document.getElementById(id) : null;
      if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }));
      else window.scrollTo(0, 0);
    }
    wasOwner = owner;
  }
  window.addEventListener('hashchange', route);

  /* =========================================================
     Start
     ========================================================= */
  bindFinder();
  bindBooking();
  bindSquads();
  syncControls();
  renderResults(true);
  renderSquads();
  updateHero();
  updateBadge();
  route();
  setTimeout(liveTick, 9000);

  FL.openBooking = openBooking;
})(window.FL);
