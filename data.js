/* =========================================================
   Floodlit — demo data layer
   Fictional turfs, seeded availability, pricing rules,
   and a tiny event bus shared by the player and owner views.
   ========================================================= */
window.FL = window.FL || {};

(function (FL) {
  'use strict';

  /* ---------- tiny event bus ---------- */
  FL._handlers = {};
  FL.on = function (evt, fn) { (FL._handlers[evt] = FL._handlers[evt] || []).push(fn); };
  FL.emit = function (evt, detail) { (FL._handlers[evt] || []).forEach(function (fn) { fn(detail); }); };

  /* ---------- seeded random (same numbers every visit) ---------- */
  function hashStr(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  FL.rng = function (seed) { return mulberry32(hashStr(String(seed))); };
  FL.pick = function (arr, r) { return arr[Math.floor((r || Math.random)() * arr.length)]; };

  /* ---------- opening hours (minutes from midnight) ---------- */
  FL.OPEN = 6 * 60;    // 6:00 AM
  FL.CLOSE = 26 * 60;  // 2:00 AM next day

  /* ---------- fictional turfs ---------- */
  FL.turfs = [
    {
      id: 'skydeck', name: 'Sky Deck Arena', area: 'Bashundhara',
      blurb: 'Rooftop pitches with a city view, open till 2 AM',
      base: 2400, rating: 4.8, reviews: 412, busy: 0.62,
      rooftop: true, indoor: false,
      features: ['Floodlit', 'Rooftop', 'Changing rooms', 'Café'],
      stripes: ['#1E774B', '#238656'], apron: '#0E1E36',
      pitches: [{ id: 'A', name: 'Pitch A', size: 5 }, { id: 'B', name: 'Pitch B', size: 7 }]
    },
    {
      id: 'lakeside', name: 'Lakeside Five', area: 'Dhanmondi',
      blurb: 'Two caged 5-a-side pitches a short walk from the lake',
      base: 2000, rating: 4.6, reviews: 288, busy: 0.7,
      rooftop: false, indoor: false,
      features: ['Floodlit', 'Showers', 'Prayer room'],
      stripes: ['#1B6E45', '#207C4F'], apron: '#0F2034',
      pitches: [{ id: 'A', name: 'Pitch A', size: 5 }, { id: 'B', name: 'Pitch B', size: 5 }]
    },
    {
      id: 'glasshouse', name: 'Glasshouse Gulshan', area: 'Gulshan',
      blurb: 'Air-conditioned indoor pitch with pro-grade turf',
      base: 3500, rating: 4.9, reviews: 167, busy: 0.55,
      rooftop: false, indoor: true,
      features: ['Indoor AC', 'Changing rooms', 'Showers', 'Parking'],
      stripes: ['#26845A', '#2B9364'], apron: '#13243F',
      pitches: [{ id: 'A', name: 'Main pitch', size: 5 }]
    },
    {
      id: 'pallabi', name: 'Pallabi Night Ground', area: 'Mirpur',
      blurb: 'Three pitches, cheapest late slots in Mirpur',
      base: 1600, rating: 4.4, reviews: 531, busy: 0.78,
      rooftop: false, indoor: false,
      features: ['Floodlit', 'Parking', 'Prayer room'],
      stripes: ['#1A6842', '#1F764C'], apron: '#0E1C32',
      pitches: [{ id: 'A', name: 'Pitch A', size: 5 }, { id: 'B', name: 'Pitch B', size: 5 }, { id: 'C', name: 'Pitch C', size: 7 }]
    },
    {
      id: 'cage', name: 'The Cage', area: 'Mohammadpur',
      blurb: 'Tight, fast 5-a-side cage plus a 7-a-side ground',
      base: 1800, rating: 4.5, reviews: 309, busy: 0.66,
      rooftop: false, indoor: false,
      features: ['Floodlit', 'Café'],
      stripes: ['#1C7047', '#217E51'], apron: '#0F1F36',
      pitches: [{ id: 'A', name: 'Cage', size: 5 }, { id: 'B', name: 'Ground', size: 7 }]
    },
    {
      id: 'northgate', name: 'North Gate Turf', area: 'Uttara',
      blurb: 'Rooftop 7-a-side above a shopping centre',
      base: 2200, rating: 4.7, reviews: 224, busy: 0.6,
      rooftop: true, indoor: false,
      features: ['Floodlit', 'Rooftop', 'Parking', 'Changing rooms'],
      stripes: ['#1D734A', '#228155'], apron: '#0E1E36',
      pitches: [{ id: 'A', name: 'Pitch A', size: 7 }, { id: 'B', name: 'Pitch B', size: 5 }]
    }
  ];
  FL.AREAS = ['Bashundhara', 'Dhanmondi', 'Gulshan', 'Mirpur', 'Mohammadpur', 'Uttara'];
  FL.turfById = function (id) { return FL.turfs.find(function (t) { return t.id === id; }); };
  FL.pitchOf = function (turf, pid) { return turf.pitches.find(function (p) { return p.id === pid; }); };

  FL.TEAMS = ['Night Owls FC', 'Late Shift FC', 'Office XI', 'Block C Ballers', 'Uttara United', 'Friday Five',
    'Rooftop Rangers', 'Mirpur Mavericks', 'Code & Kick', 'Dhanmondi Dynamos', 'Lakeside Legends',
    'Bashundhara Blues', 'Gulshan Galacticos', 'Sunday League Saints', 'Back Post Boys', 'The Overlappers'];

  /* ---------- pricing rules (owners can edit these live) ---------- */
  function defaultRules(t) {
    return { base: t.base, peak: 1.3, late: 1.1, weekend: 15, morningDeal: t.id === 'pallabi' };
  }
  FL.defaultPricing = {};
  FL.pricing = {};
  FL.turfs.forEach(function (t) { FL.defaultPricing[t.id] = defaultRules(t); FL.pricing[t.id] = defaultRules(t); });

  /* ---------- dates ---------- */
  FL.dateFor = function (off) { var d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + off); return d; };
  FL.keyOf = function (d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  FL.dateKey = function (off) { return FL.keyOf(FL.dateFor(off)); };
  FL.fromKey = function (k) { var p = k.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2], 12); };
  FL.offsetOf = function (k) { return Math.round((FL.fromKey(k) - FL.dateFor(0)) / 864e5); };
  // Bangladesh weekend: Friday and Saturday
  FL.isWeekend = function (k) { var g = FL.fromKey(k).getDay(); return g === 5 || g === 6; };
  FL.nowMin = function () { var n = new Date(); return n.getHours() * 60 + n.getMinutes(); };

  /* ---------- formatting ---------- */
  FL.money = function (n) { return '৳' + Math.round(n).toLocaleString('en-IN'); };
  FL.clock = function (m) {
    var h = Math.floor(m / 60) % 24, mm = m % 60;
    return { t: (h % 12 || 12) + ':' + String(mm).padStart(2, '0'), ap: h >= 12 ? 'PM' : 'AM' };
  };
  FL.time = function (m) { var c = FL.clock(m); return c.t + ' ' + c.ap; };
  FL.range = function (s, e) {
    var a = FL.clock(s), b = FL.clock(e);
    return a.ap === b.ap ? a.t + '–' + b.t + ' ' + b.ap : a.t + ' ' + a.ap + '–' + b.t + ' ' + b.ap;
  };
  FL.dayLabel = function (off) {
    if (off === 0) return 'Today';
    if (off === 1) return 'Tomorrow';
    return FL.dateFor(off).toLocaleDateString('en-GB', { weekday: 'long' });
  };
  FL.dateShort = function (k) { return FL.fromKey(k).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); };
  FL.durLabel = function (d) { return d === 60 ? '1 hour' : d === 90 ? '90 min' : (d / 60) + ' hours'; };

  /* ---------- price for a slot ---------- */
  FL.priceInfo = function (turfId, pitch, key, start, dur, rules) {
    var r = rules || FL.pricing[turfId];
    var h = Math.floor(start / 60);
    var m = 1, peak = false, late = false, deal = false;
    if (h >= 17 && h < 23) { m *= r.peak; peak = r.peak > 1; }
    else if (h >= 23) { m *= r.late; late = r.late > 1; }
    if (r.morningDeal && h < 12) { m *= 0.8; deal = true; }
    var wknd = FL.isWeekend(key);
    if (wknd) m *= 1 + r.weekend / 100;
    var sizeF = pitch.size === 7 ? 1.5 : 1;
    var price = Math.round((r.base * sizeF * (dur / 60) * m) / 50) * 50;
    return { price: price, peak: peak, late: late, deal: deal, weekend: wknd && r.weekend > 0 };
  };

  /* ---------- availability ---------- */
  var seedCache = {};
  FL.extra = {};   // bookings added during this visit: live activity, walk-ins, your bookings
  FL.holds = [];   // slots held during checkout
  FL.slotKey = function (turfId, pitchId, key) { return turfId + '|' + pitchId + '|' + key; };

  FL.seeded = function (turf, pitch, key) {
    var k = FL.slotKey(turf.id, pitch.id, key);
    if (seedCache[k]) return seedCache[k];
    var rng = FL.rng(k);
    var wk = FL.isWeekend(key) ? 1.2 : 1;
    var out = [], t = FL.OPEN;
    while (t < FL.CLOSE) {
      var h = t / 60;
      var base = h < 9 ? 0.45 : h < 12 ? 0.25 : h < 16 ? 0.18 : h < 17 ? 0.4 : h < 23 ? 0.74 : 0.6;
      var p = Math.min(0.9, base * turf.busy * wk);
      if (rng() < p) {
        var roll = rng();
        var dur = roll < 0.5 ? 60 : roll < 0.8 ? 90 : 120;
        if (t + dur > FL.CLOSE) dur = FL.CLOSE - t;
        if (dur < 60) break;
        var b = {
          id: 'S' + Math.floor(rng() * 1e6).toString(36).toUpperCase(),
          start: t, end: t + dur, team: FL.pick(FL.TEAMS, rng),
          source: rng() < 0.76 ? 'online' : 'walkin', status: 'confirmed'
        };
        b.price = FL.priceInfo(turf.id, pitch, key, t, dur, FL.defaultPricing[turf.id]).price;
        b.paid = b.source === 'online' ? (rng() < 0.6 ? 'deposit' : 'full') : 'cash';
        out.push(b);
        t += dur;
        // after a 90-minute game the next one usually waits for the hour
        if (t % 60 === 30 && rng() < 0.6) t += 30;
      } else {
        t += t % 60 === 30 ? 30 : 60;
      }
    }
    seedCache[k] = out;
    return out;
  };

  FL.busy = function (turfId, pitchId, key) {
    var turf = FL.turfById(turfId), pitch = FL.pitchOf(turf, pitchId);
    var extra = (FL.extra[FL.slotKey(turfId, pitchId, key)] || []).filter(function (b) { return b.status !== 'cancelled'; });
    return FL.seeded(turf, pitch, key).concat(extra);
  };

  FL.addBooking = function (turfId, pitchId, key, b) {
    var k = FL.slotKey(turfId, pitchId, key);
    (FL.extra[k] = FL.extra[k] || []).push(b);
    return b;
  };

  function overlaps(aS, aE, bS, bE) { return aS < bE && bS < aE; }

  // 'free' | 'taken' | 'past' | 'closed' | 'held'
  FL.slotState = function (turfId, pitchId, key, start, dur, ignoreHoldId) {
    var end = start + dur;
    if (end > FL.CLOSE) return 'closed';
    if (key === FL.dateKey(0) && start < FL.nowMin() + 10) return 'past';
    var busy = FL.busy(turfId, pitchId, key);
    for (var i = 0; i < busy.length; i++) if (overlaps(start, end, busy[i].start, busy[i].end)) return 'taken';
    for (var j = 0; j < FL.holds.length; j++) {
      var h = FL.holds[j];
      if (h.id !== ignoreHoldId && h.turfId === turfId && h.pitchId === pitchId && h.key === key && overlaps(start, end, h.start, h.end)) return 'held';
    }
    return 'free';
  };
  FL.isFree = function (turfId, pitchId, key, start, dur) { return FL.slotState(turfId, pitchId, key, start, dur) === 'free'; };

  /* ---------- squad board (teams short on players) ---------- */
  FL.squadSeed = [
    { team: 'Late Shift FC', turfId: 'pallabi', start: 21 * 60 + 30, need: 2, joined: 0, level: 'Casual', note: 'One defender and anyone who can run.' },
    { team: 'Code & Kick', turfId: 'skydeck', start: 20 * 60, need: 3, joined: 1, level: 'Intermediate', note: 'Office team. Friendly, but we keep score.' },
    { team: 'Dhanmondi Dynamos', turfId: 'lakeside', start: 22 * 60, need: 1, joined: 0, level: 'Competitive', note: 'Looking for a keeper. Gloves provided.' },
    { team: 'Uttara United', turfId: 'northgate', start: 19 * 60, need: 4, joined: 2, level: 'Casual', note: '7-a-side, rolling subs welcome.' },
    { team: 'Glasshouse Regulars', turfId: 'glasshouse', start: 23 * 60, need: 2, joined: 0, level: 'Intermediate', note: 'Late game after work, AC pitch.' }
  ];

  FL.PLAYERS = ['You', 'Rafi', 'Tanvir', 'Sakib', 'Nayeem', 'Arif', 'Shuvo', 'Imran', 'Fahim', 'Rakib',
    'Mahin', 'Zubair', 'Ashik', 'Tamim'];
})(window.FL);
