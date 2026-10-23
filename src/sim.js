/* ===== CMP Grand Prix shared race engine (identical in Garage and Race Control) ===== */
var SIM = (function () {
  var LAPS = 12, PIT_LOSS = 12, PIT_AT = 0.05, PEN = { spin: 4, lock: 2, kerb: 1 };
  var OB = [30, 25, 20, 15], NB = [7.84, 7.74, 10.73, 10.35], GAIN = [2.5, 2.2, 2.2, 2.0], NOISE = 0.125;
  /* realistic sector envelopes (dry): avg speed bounds per sector length -> soft limits in seconds.
     S1 600 m straight 200-275 km/h, S2 459 m fast esses 140-215, S3 328 m hairpin 80-125, S4 514 m chicane + run to the line 135-185 */
  var SBASE = [9.0, 9.6, 11.6, 11.3], SLO = [7.8, 7.7, 9.4, 10.1], SHI = [10.8, 11.8, 14.8, 13.7];
  function soft(x, b, lo, hi) { var A = hi - b, d = x - b; return d >= 0 ? b + A * Math.tanh(d / A) + 0.22 * Math.max(0, d - A) : b - (b - lo) * Math.tanh(-d / (b - lo)); }
  var SECTORS = [
    { id: 'straight', name: '長直道', en: 'Long Straight', base: 9 },
    { id: 'fast', name: '高速 S 彎', en: 'Fast Esses', base: 9.6 },
    { id: 'hairpin', name: '髮夾彎', en: 'Hairpin', base: 11.6 },
    { id: 'bumpy', name: '顛簸減速彎', en: 'Bumpy Chicane', base: 11.3 }
  ];
  var TIRES = {
    S: { name: '軟胎', grip: 1.05, opt: 22, wear: 0.11, color: '#e8443a' },
    M: { name: '中性胎', grip: 1.022, opt: 28, wear: 0.065, color: '#f2c230' },
    H: { name: '硬胎', grip: 1.0, opt: 38, wear: 0.04, color: '#e9e9e9' }
  };
  var PARAMS = [
    { k: 'rw', name: '下壓力（尾翼角度）', min: 1, max: 10, step: 1, lo: '低阻力', hi: '高下壓力',
      up: '彎道更快（S 彎、髮夾彎）、雨天更穩、較不易鎖死', down: '直道阻力變大、極速下降，輪胎磨耗稍增' },
    { k: 'eng', name: '引擎模式', min: 1, max: 5, step: 1, lo: '省油', hi: '全力輸出',
      up: '直道極速更高', down: '引擎溫度與故障風險上升、輪胎磨耗變快、髮夾彎較易鎖死' },
    { k: 'susp', name: '懸吊硬度', min: 1, max: 10, step: 1, lo: '軟', hi: '硬',
      up: '高速 S 彎反應更俐落', down: '顛簸減速彎與髮夾彎抓地下降、壓路肩風險增加；雨天宜偏軟' },
    { k: 'brk', name: '煞車點', min: 1, max: 5, step: 1, lo: '提早煞車', hi: '極限晚煞',
      up: '髮夾彎與減速彎更快（延後煞車、帶更多速度入彎）', down: '鎖死衝出風險大增，輪胎磨耗變快；雨天更危險' },
    { k: 'tire', name: '輪胎配方', options: ['S', 'M', 'H'],
      info: { S: ['抓地力最強', '磨耗最快、怕高溫，需要較多次進站'], M: ['抓地與耐用平衡', '兩者都不是最好'], H: ['最耐磨、高溫表現佳，進站最少', '抓地力最低'] } }
  ];
  var REASON = { 'Engine failure': '引擎故障', 'Tyre failure': '輪胎爆胎', 'Out of fuel': '燃油耗盡' };
  var DEFAULT = { rw: 5, eng: 3, susp: 5, brk: 3, tire: 'M' };

  function fill(v) { var a = []; for (var i = 0; i < LAPS; i++) a.push(v); return a; }
  var COND = {
    practice: { id: 'practice', name: '練習賽', desc: '乾地 25°C', temp: 25, wet: fill(0), burn: 1, laps: 1 },
    hot: { id: 'hot', name: '高溫測試', desc: '乾地 36°C', temp: 36, wet: fill(0), burn: 1.02, laps: 2 },
    wet: { id: 'wet', name: '雨天測試', desc: '雨天 18°C', temp: 18, wet: fill(0.5), burn: 1, laps: 2 }
  };
  var RACE = [
    { id: 'same', name: '完美晴天', desc: '乾地 25°C，與練習賽完全相同', temp: 25, wet: fill(0), burn: 1, icon: '☀️' },
    { id: 'storm', name: '午後雷陣雨', desc: '悶熱 31°C，乾地起跑，第 7 圈開始下雨。引擎油耗增加', temp: 31,
      wet: [0, 0, 0, 0, 0, 0, 0.2, 0.4, 0.55, 0.55, 0.45, 0.35], burn: 1.04, icon: '⛈️' },
    { id: 'heat', name: '熱浪', desc: '乾地 38°C。賽道滾燙，引擎更耗油', temp: 38, wet: fill(0), burn: 1.04, icon: '🔥' },
    { id: 'monsoon', name: '梅雨季', desc: '全程雨天 17°C', temp: 17, wet: fill(0.6), burn: 1, icon: '🌧️' }
  ];

  function hashStr(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function rng(seed) {
    var a = seed >>> 0;
    var f = function () {
      a = (a + 0x6D2B79F5) >>> 0; var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.gauss = function () { var u = f() || 1e-9, v = f(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    return f;
  }
  function sq(x) { return x * x; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  /* front wing follows the rear wing (best balance); fuel is auto-filled so nobody runs dry; pit stops are automatic */
  function autoFuel(q) {
    var drag = 0.4 * q.fw + 0.6 * q.rw;
    return Math.ceil(LAPS * 6.0 * (1 + 0.12 * (q.eng - 3)) * (1 + 0.015 * (drag - 5)) * 1.06) + 2;
  }
  function sanitize(p) {
    var q = {};
    q.rw = clamp(Math.round(+p.rw || 5), 1, 10);
    q.fw = Math.max(1, q.rw - 1);
    q.eng = clamp(Math.round(+p.eng || 3), 1, 5);
    q.susp = clamp(Math.round(+p.susp || 5), 1, 10);
    q.brk = clamp(Math.round(+p.brk || 3), 1, 5);
    q.tire = TIRES[p.tire] ? p.tire : 'M';
    q.fuel = autoFuel(q);
    return q;
  }

  function lockRisk(p, D, tc, w, temp) {
    var b = (p.brk || 3) - 3;
    return Math.max(0.006, 0.025 + 0.035 * Math.max(0, p.eng - 3) + 0.02 * Math.max(0, 5 - D) + 0.12 * w + (tc < 0.35 ? 0.08 : 0) + 0.004 * Math.max(0, temp - 30)
      + 0.09 * Math.max(0, b) + 0.12 * w * Math.max(0, b) - 0.009 * Math.max(0, -b));
  }
  function kerbRisk(p, w) { return 0.015 * Math.max(0, p.susp - 5) + 0.03 * w; }
  function engFailRisk(p, temp, w) { return 0.0035 * sq(Math.max(0, p.eng - 3)) * (1 + Math.max(0, temp - 25) * 0.14) * (1 - 0.5 * w); }
  /* what the engineers can see after a test: deterministic 12-lap projection + risk numbers */
  function project(p0, cond) {
    var p = sanitize(p0), r = simulate(p, cond, { noise: false, failures: false });
    var D = 0.45 * p.fw + 0.55 * p.rw, w = cond.wet[0] || 0;
    var pe = engFailRisk(p, cond.temp, w), pl = lockRisk(p, D, 1, w, cond.temp);
    return { laps: r.laps, finished: r.finished, dnf: r.dnf, engT: r.laps[0] ? r.laps[0].engT : 88,
      engRace: 1 - Math.pow(1 - pe, LAPS), lockLap: pl, kerbLap: kerbRisk(p, w) };
  }
  function pitLaps(n) { var a = []; for (var k = 1; k <= n; k++) a.push(Math.round(LAPS * k / (n + 1))); return a; }

  /* opts: {seed:number, noise:bool, failures:bool} */
  function simulate(p0, cond, opts) {
    var p = sanitize(p0); opts = opts || {};
    var noise = opts.noise !== false, failures = opts.failures !== false;
    var R = rng(opts.seed || 1);
    var T = TIRES[p.tire];
    var drag = 0.4 * p.fw + 0.6 * p.rw, D = 0.45 * p.fw + 0.55 * p.rw, B = p.fw - p.rw;
    var tc = 1, fuel = p.fuel, total = 0, laps = [], dnf = null, events = [];
    for (var i = 0; i < LAPS; i++) {
      var w = cond.wet[i] || 0, Teff = cond.temp - 12 * w;
      var ev = [];
      // fuel
      var burn = 6.0 * (1 + 0.12 * (p.eng - 3)) * (1 + 0.015 * (drag - 5)) * (1 - 0.15 * w) * cond.burn;
      if (noise) burn *= 1 + 0.015 * R.gauss();
      if (fuel < burn) { dnf = { lap: i + 1, reason: 'Out of fuel' }; break; }
      // grip
      var tw = Math.max(0.8, 1 - 0.00025 * sq(Teff - T.opt));
      var life = 0.92 + 0.08 * tc; if (tc < 0.3) life -= (0.3 - tc) * 1.0;
      var grip = T.grip * tw * life * (1 - 0.16 * w);
      var bk = (p.brk || 3) - 3;
      var dfK = 1 + 1.5 * w, pe = 3 + (p.eng - 3) * Math.max(0, 1 - 1.4 * w), dd = D - 5;
      var dfHS = 0.035 * dfK * dd - 0.004 * dd * dd, dfLS = 0.012 * dfK * dd - 0.0015 * dd * dd;
      var gHS = grip * (1 + dfHS) * (1 - 0.004 * sq(p.susp - 7 + 3 * w)) * (1 - 0.006 * sq(B + 1 + w));
      var gLS = grip * (1 + dfLS) * (1 - 0.004 * sq(p.susp - 4 + 2 * w)) * (1 - 0.004 * sq(B + 1 + w)) * (1 - 0.03 * w * (p.eng - 1));
      var gB = grip * (1 + 0.015 * (D - 5)) * (1 - 0.006 * sq(p.susp - 3 + w));
      var s = [
        30 * (1 + 0.025 * (drag - 5) - 0.02 * (pe - 3) + 0.004 * (pe - 3) * Math.abs(pe - 3)),
        25 * (1 - 0.6 * (gHS - 1)),
        20 * (1 - 0.6 * (gLS - 1)) * (1 - 0.012 * bk + 0.002 * bk * Math.abs(bk)),
        15 * (1 - 0.5 * (gB - 1)) * (1 - 0.005 * bk)
      ];
      var mult = (1 + 0.00033 * fuel) * (1 + 0.05 * w);
      for (var j = 0; j < 4; j++) { var wk = 1 + 0.32 * w + 0.004 * Math.max(0, cond.temp - 25); s[j] = soft(NB[j] + (s[j] * mult - OB[j]) * GAIN[j], SBASE[j] * wk, SLO[j] * wk, SHI[j] * wk); if (noise) s[j] += NOISE * R.gauss(); }
      var lt = s[0] + s[1] + s[2] + s[3];
      // spins in the wet
      if (failures && w > 0) {
        var pSpin = w * (0.02 + 0.05 * Math.max(0, p.eng - 3) + 0.015 * Math.max(0, p.susp - 5) + 0.04 * Math.max(0, 6 - D));
        if (R() < pSpin) { s[1] += PEN.spin; lt += PEN.spin; ev.push('spin'); }
      }
      // hairpin lock-up (braking zone)
      var pLock = lockRisk(p, D, tc, w, cond.temp);
      if (failures && R() < pLock) { s[2] += PEN.lock; lt += PEN.lock; ev.push('lock'); }
      // chicane kerb strike
      var pKerb = kerbRisk(p, w);
      if (failures && R() < pKerb) { s[3] += PEN.kerb; lt += PEN.kerb; ev.push('kerb'); }
      // engine reliability
      var engT = 88 + 6 * (p.eng - 3) + 0.6 * (cond.temp - 25) - 6 * w;
      if (failures) {
        var pFail = engFailRisk(p, cond.temp, w);
        if (R() < pFail) { dnf = { lap: i + 1, reason: 'Engine failure' }; laps.push({ lap: i + 1, t: null, s: s, tire: tc, fuel: fuel, engT: engT, wet: w, ev: ['engine'] }); break; }
      }
      // tyre wear
      var wear = T.wear * (1 + 0.04 * (cond.temp - 25)) * (1 + 0.05 * (D - 5)) * (1 + 0.04 * (p.susp - 5)) * (1 + 0.12 * (p.eng - 3)) * (1 + 0.05 * ((p.brk || 3) - 3)) * (1 - 0.35 * w);
      tc -= wear;
      if (tc < 0) { dnf = { lap: i + 1, reason: 'Tyre failure' }; laps.push({ lap: i + 1, t: null, s: s, tire: 0, fuel: fuel, engT: engT, wet: w, ev: ['puncture'] }); break; }
      fuel -= burn; var tireEnd = tc;
      if (i + 1 < LAPS && tc - wear < PIT_AT) { lt += PIT_LOSS; tc = 1; ev.push('pit'); }
      total += lt;
      laps.push({ lap: i + 1, t: lt, s: s, tire: tc, tireEnd: tireEnd, fuel: fuel, engT: engT, wet: w, ev: ev });
    }
    var lapsDone = laps.filter(function (l) { return l.t != null; }).length;
    return { laps: laps, total: total, dnf: dnf, lapsDone: lapsDone, finished: !dnf };
  }

  // sort key: finishers by time, then DNFs by laps completed
  function score(r) { return r.finished ? r.total : 1e6 - r.lapsDone * 1e4 + r.total * 0.001; }

  function qualify(p) { return simulate(p, COND.practice, { noise: false, failures: false }); }

  /* "AI race engineer": greedy optimiser trained only on practice-track lap time.
     It ignores reliability risk and unseen conditions on purpose (the debrief lesson). */
  function fuelNeeded(p, cond) {
    var drag = 0.4 * p.fw + 0.6 * p.rw, tot = 0;
    for (var i = 0; i < LAPS; i++) tot += 6.0 * (1 + 0.12 * (p.eng - 3)) * (1 + 0.015 * (drag - 5)) * (1 - 0.15 * (cond.wet[i] || 0)) * cond.burn;
    return tot;
  }
  function aiSuggest(p0, steps) {
    var p = sanitize(p0), best = score(qualify(p)), changes = [];
    for (var it = 0; it < (steps || 3); it++) {
      var cand = null, cs = best;
      PARAMS.forEach(function (d) {
        var vals = d.options ? d.options : [p[d.k] - 1, p[d.k] + 1];
        vals.forEach(function (v) {
          if (v === p[d.k]) return;
          var q = sanitize(Object.assign({}, p, (function () { var o = {}; o[d.k] = v; return o; })()));
          if (q[d.k] !== v) return;
          var sc = score(qualify(q));
          if (sc < cs - 0.05) { cs = sc; cand = { k: d.k, v: v, q: q }; }
        });
      });
      if (!cand) break;
      changes.push({ k: cand.k, from: p[cand.k], to: cand.v });
      p = cand.q; best = cs;
    }
    var merged = [];
    changes.forEach(function (c) { var m = merged.filter(function (x) { return x.k === c.k; })[0]; if (m) m.to = c.to; else merged.push({ k: c.k, from: c.from, to: c.to }); });
    merged = merged.filter(function (c) { return c.from !== c.to; });
    return { params: p, changes: merged, predicted: best };
  }

  function code(p) { p = sanitize(p); return ['W' + p.rw, 'E' + p.eng, 'S' + p.susp, 'B' + p.brk, 'T' + p.tire].join('-'); }
  function parseCode(c) {
    var m = String(c).toUpperCase().replace(/\s/g, '').match(/^W(\d+)-E(\d)-S(\d+)-B(\d)-T([SMH])$/);
    if (!m) return null;
    return sanitize({ rw: +m[1], eng: +m[2], susp: +m[3], brk: +m[4], tire: m[5] });
  }
  function checksum(obj) { return (hashStr('cmpgp|' + JSON.stringify(obj)) >>> 0).toString(36); }
  function fmt(t) { if (t == null || !isFinite(t)) return '—'; var m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2); }

  /* ---------- shared track geometry, speed profile + drawing (1040 x 680 design space) ---------- */
  var TRACK = (function () {
    var PTS = [[445,585],[560,585],[780,580],[900,560],[975,495],[985,400],[940,320],
      [860,285],[800,330],[735,370],[670,320],[610,250],[545,290],[485,350],[420,330],
      [385,265],[360,170],[315,110],[245,105],[215,160],[255,215],
      [255,290],[180,330],[230,395],[150,440],[120,510],[150,575],[330,585]];
    /* start/finish line sits mid-straight so the 20-car grid (8 m slots) fits on the straight behind it */
    var MARK = [0, 7, 15, 21], LAP_M = 1900;
    var pts = [], n = PTS.length, K = 40;
    for (var i = 0; i < n; i++) {
      var p0 = PTS[(i - 1 + n) % n], p1 = PTS[i], p2 = PTS[(i + 1) % n], p3 = PTS[(i + 2) % n];
      for (var k = 0; k < K; k++) {
        var t = k / K, t2 = t * t, t3 = t2 * t;
        pts.push([0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
                  0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]);
      }
    }
    var N = pts.length, L = [0];
    for (var j = 1; j <= N; j++) { var a = pts[j - 1], b = pts[j % N]; L.push(L[j - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
    var total = L[N];
    var SB = MARK.map(function (m) { return L[m * K] / total; }); SB.push(1);
    var SIDX = MARK.map(function (m) { return m * K; }); SIDX.push(N);
    var M = LAP_M / total; // metres per design px
    function at(f) {
      f = ((f % 1) + 1) % 1; var d = f * total, lo = 0, hi = L.length - 1;
      while (hi - lo > 1) { var m = (lo + hi) >> 1; if (L[m] <= d) lo = m; else hi = m; }
      var a = pts[lo % N], b = pts[(lo + 1) % N], u = (d - L[lo]) / ((L[lo + 1] - L[lo]) || 1);
      return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, Math.atan2(b[1] - a[1], b[0] - a[0])];
    }
    /* base speed shape from curvature: lateral-grip corner limit + accel/brake passes */
    var ds = [], vb = [], GL = [8, 11, 7, 15], WIN = [6, 22, 6, 16], DAMP = [0.55, 0.45, 1, 0.55];
    for (var q = 0; q < N; q++) ds.push((L[q + 1] - L[q]) * M);
    (function () {
      var cap = [];
      for (var q = 0; q < N; q++) {
        var sj0 = q < SIDX[1] ? 0 : q < SIDX[2] ? 1 : q < SIDX[3] ? 2 : 3, W = WIN[sj0];
        var A = pts[(q - W + N) % N], B = pts[q], C = pts[(q + W) % N];
        var a1 = Math.atan2(B[1] - A[1], B[0] - A[0]), a2 = Math.atan2(C[1] - B[1], C[0] - B[0]);
        var da = Math.abs(((a2 - a1 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
        var arc = (L[(q + W) % N] - L[(q - W + N) % N] + (q + W >= N || q - W < 0 ? total : 0)) * M;
        var R = da > 1e-4 ? arc / da : 1e9;
        var sj = q < SIDX[1] ? 0 : q < SIDX[2] ? 1 : q < SIDX[3] ? 2 : 3;
        cap.push(Math.min(92, Math.sqrt(GL[sj] * R)));
      }
      var v = cap.slice();
      for (var pass = 0; pass < 2; pass++) {
        for (var q = 1; q < 2 * N; q++) { var i1 = q % N, i0 = (q - 1) % N; v[i1] = Math.min(v[i1], Math.sqrt(v[i0] * v[i0] + 2 * 11 * ds[i0])); }
        for (var q = 2 * N - 2; q >= 0; q--) { var i1 = q % N, i2 = (q + 1) % N; v[i1] = Math.min(v[i1], Math.sqrt(v[i2] * v[i2] + 2 * 38 * ds[i1])); }
      }
      for (var j = 0; j < 4; j++) {
        var m = 0, c = 0; for (var q = SIDX[j]; q < SIDX[j + 1]; q++) { m += v[q]; c++; } m /= c;
        for (var q = SIDX[j]; q < SIDX[j + 1]; q++) v[q] = m + (v[q] - m) * DAMP[j];
      }
      vb = v;
    })();
    /* per-lap trace (physics): ~1000 micro-sectors, each with a lateral-grip corner limit from the real
       curvature, plus speed-dependent acceleration / braking passes. A grip/power factor per sector is solved
       so each sector takes exactly the simulated time -> continuous, realistic braking, apex and exit speeds. */
    var EVWIN = { spin: [SB[1] + 0.05, SB[1] + 0.09, 1], lock: [SB[2] + 0.004, SB[2] + 0.04, 2], kerb: [SB[3] + 0.05, SB[3] + 0.08, 3] };
    var RAD = (function () { var out = [], W = 7;
      for (var q = 0; q < N; q++) { var A = pts[(q - W + N) % N], B = pts[q], C = pts[(q + W) % N];
        var a = Math.hypot(B[0] - A[0], B[1] - A[1]), b = Math.hypot(C[0] - B[0], C[1] - B[1]), c = Math.hypot(C[0] - A[0], C[1] - A[1]);
        var cr = Math.abs((B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]));
        out.push(cr < 1e-6 ? 1e6 : a * b * c / (2 * cr) * M); }
      /* light smoothing so the apex is a short dip, not a spike */
      var sm = out.slice(); for (var k2 = 0; k2 < 3; k2++) { var nx = []; for (var q2 = 0; q2 < N; q2++) nx.push(Math.min(sm[(q2 - 1 + N) % N], sm[q2], sm[(q2 + 1) % N]) * 0.5 + sm[q2] * 0.5); sm = nx; }
      return sm; })();
    var SECOF = []; for (var q0 = 0; q0 < N; q0++) SECOF.push(q0 < SIDX[1] ? 0 : q0 < SIDX[2] ? 1 : q0 < SIDX[3] ? 2 : 3);
    var LAT = 32, VMAX = 92, ACC = 15, BRK = 38;
    function profile(k) {
      var v = new Array(N), cap = new Array(N);
      for (var q = 0; q < N; q++) { var kk = k[SECOF[q]]; cap[q] = Math.min(VMAX * kk, Math.sqrt(LAT * RAD[q]) * kk); v[q] = cap[q]; }
      for (var pass = 0; pass < 2; pass++) {
        for (var q1 = 1; q1 < 2 * N; q1++) { var i1 = q1 % N, i0 = (q1 - 1) % N, kk1 = k[SECOF[i0]], vm = VMAX * kk1, a = ACC * kk1 * kk1 * Math.max(0.12, 1 - Math.pow(v[i0] / vm, 2));
          v[i1] = Math.min(v[i1], Math.sqrt(v[i0] * v[i0] + 2 * a * ds[i0])); }
        for (var q3 = 2 * N - 2; q3 >= 0; q3--) { var j1 = q3 % N, j2 = (q3 + 1) % N, kk2 = k[SECOF[j1]], b = BRK * kk2 * kk2 * (0.8 + 0.25 * Math.min(1, v[j2] / 70));
          v[j1] = Math.min(v[j1], Math.sqrt(v[j2] * v[j2] + 2 * b * ds[j1])); }
      }
      return v;
    }
    function secTimes(v) { var t = [0, 0, 0, 0]; for (var q = 0; q < N; q++) t[SECOF[q]] += ds[q] / v[q]; return t; }
    vb = profile([1, 1, 1, 1]);
    var TCACHE = {};
    function trace(sectors, ev) {
      ev = ev || [];
      var tgt = [0, 1, 2, 3].map(function (j) { var c = sectors[j]; ev.forEach(function (e) { if (EVWIN[e] && EVWIN[e][2] === j) c -= PEN[e]; }); return c; });
      var key = tgt.map(function (x) { return x.toFixed(3); }).join(',') + '|' + ev.join(','), hit = TCACHE[key];
      var v;
      if (hit) v = hit; else {
        var k = [1, 1, 1, 1];
        for (var it = 0; it < 14; it++) { var pv = profile(k), tt = secTimes(pv), err = 0;
          for (var j = 0; j < 4; j++) { var r = tt[j] / tgt[j]; k[j] *= Math.pow(r, it < 4 ? 1 : 1.2); err = Math.max(err, Math.abs(r - 1)); }
          v = pv; if (err < 0.0015) break; }
        /* exact sector times: tiny per-sector rescale of the converged profile */
        var tt2 = secTimes(v); v = v.map(function (x, q) { return x * tt2[SECOF[q]] / tgt[SECOF[q]]; });
        var keys = Object.keys(TCACHE); if (keys.length > 400) TCACHE = {}; TCACHE[key] = v;
      }
      var dt = new Array(N);
      for (var q = 0; q < N; q++) dt[q] = ds[q] / v[q];
      ev.forEach(function (e) {
        var w = EVWIN[e]; if (!w) return;
        var i0 = idxOf(w[0]), i1 = idxOf(w[1]), cnt = Math.max(1, i1 - i0);
        for (var q = i0; q < i1; q++) { var u = (q - i0) / cnt; dt[q] += PEN[e] * 2 * Math.sin(Math.PI * u) * Math.sin(Math.PI * u) / cnt; }
      });
      var tc = [0], vv = [];
      for (var q = 0; q < N; q++) { tc.push(tc[q] + dt[q]); vv.push(ds[q] / dt[q] * 3.6); }
      return { t: tc, v: vv, n: N };
    }
    /* standing start dist_m metres behind the line, following the lap trace's speed limits (tr.v in km/h).
       Returns {T: seconds to reach the line, vLine: m/s at the line, loss: extra seconds lost on lap 1, pos(t)->metres behind line, v(t)} */
    function launch(dist, tr) {
      var Lm = total * M, steps = [], need = dist, q = N - 1, acc = 0;
      while (need > 0 && q > 0) { steps.unshift(q); need -= ds[q]; q--; }
      var t = 0, v = 0, rem = dist, T = [0], D = [dist], V = [0];
      steps.forEach(function (qq) { var lim = tr.v[qq] / 3.6, a = ACC * Math.max(0.12, 1 - Math.pow(v / VMAX, 2)), d = Math.min(ds[qq], rem);
        var v2 = Math.min(lim, Math.sqrt(v * v + 2 * a * d)), dt = 2 * d / Math.max(0.5, v + v2); t += dt; v = v2; rem -= d; T.push(t); D.push(Math.max(0, rem)); V.push(v); });
      var vFly = tr.v[0] / 3.6, loss = Math.max(0, vFly - v) / (2 * ACC * 0.55);
      function idx(tt) { var i = 0; while (i < T.length - 2 && T[i + 1] < tt) i++; return i; }
      return { T: t, vLine: v, loss: loss, pos: function (tt) { if (tt >= t) return 0; var i = idx(tt), u = (tt - T[i]) / ((T[i + 1] - T[i]) || 1); return D[i] + (D[i + 1] - D[i]) * u; },
        v: function (tt) { if (tt >= t) return v * 3.6; var i = idx(tt), u = (tt - T[i]) / ((T[i + 1] - T[i]) || 1); return (V[i] + (V[i + 1] - V[i]) * u) * 3.6; } };
    }
    function fracOf(q) { return L[q] / total; }
    function idxOf(f) { var d = f * total, lo = 0, hi = N; while (hi - lo > 1) { var m = (lo + hi) >> 1; if (L[m] <= d) lo = m; else hi = m; } return (d - L[lo] > L[hi] - d) ? hi : lo; }
    /* position in a trace at time t (seconds into lap) -> {frac, v, acc} */
    function locate(tr, t) {
      var lo = 0, hi = N;
      if (t <= 0) return { frac: 0, v: tr.v[0], i: 0 };
      if (t >= tr.t[N]) return { frac: 0.99999, v: tr.v[N - 1], i: N - 1 };
      while (hi - lo > 1) { var m = (lo + hi) >> 1; if (tr.t[m] <= t) lo = m; else hi = m; }
      var u = (t - tr.t[lo]) / (tr.t[lo + 1] - tr.t[lo]);
      return { frac: (L[lo] + u * (L[lo + 1] - L[lo])) / total, v: tr.v[lo], i: lo, acc: tr.v[(lo + 2) % N] - tr.v[(lo + N - 2) % N] };
    }
    var SCOL = ['#5ac8fa', '#ffd60a', '#ff6b6b', '#30d158'];
    var LABELS = [['長直道', 0.07, 0, -34], ['高速 S 彎', 0.439, 0, 75], ['髮夾彎', 0.659, 0, -34], ['顛簸減速彎', 0.809, 105, 0]];
    function path(ctx, from, to) {
      var i0 = idxOf(from), i1 = to >= 1 ? N : idxOf(to);
      ctx.beginPath();
      for (var q = i0; q <= i1; q++) { var p = pts[q % N]; q === i0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]); }
    }
    /* ---- circuit artwork: everything static goes into the caller's cache, so detail costs nothing per frame ---- */
    function nrm(q) { var A = pts[(q - 1 + N) % N], C = pts[(q + 1) % N], an = Math.atan2(C[1] - A[1], C[0] - A[0]); return [-Math.sin(an), Math.cos(an), an]; }
    function offPath(ctx, from, to, d) { var i0 = idxOf(from), i1 = to >= 1 ? N : idxOf(to); ctx.beginPath();
      for (var q = i0; q <= i1; q++) { var B = pts[q % N], n0 = nrm(q % N), x = B[0] + n0[0] * d, y = B[1] + n0[1] * d; q === i0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } }
    /* signed curvature per sample (smoothed) → corner apexes for turn numbers and gravel traps */
    var CURV = (function () { var c = []; for (var q = 0; q < N; q++) { var a = nrm((q - 6 + N) % N)[2], b = nrm((q + 6) % N)[2], d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; c.push(d); } return c; })();
    var CORNERS = (function () { var out = [];
      for (var q = 0; q < N; q++) { var k = Math.abs(CURV[q]); if (k < 0.45) continue; var peak = true;
        for (var w = -22; w <= 22; w++) if (w && Math.abs(CURV[(q + w + N) % N]) > k) { peak = false; break; }
        if (peak && !out.some(function (o) { return Math.abs(o.q - q) < 30 || N - Math.abs(o.q - q) < 30; })) out.push({ q: q, s: CURV[q] > 0 ? 1 : -1, k: k }); }
      out.sort(function (a, b) { return a.q - b.q; }); return out; })();
    function rnd(seed) { var s = seed; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
    var UI = '-apple-system, "Segoe UI", "PingFang TC", "Microsoft JhengHei", sans-serif';
    function tag(ctx, x, y, txt, col, fg, size) { size = size || 11; ctx.font = '700 ' + size + 'px ' + UI; var w = ctx.measureText(txt).width + size; ctx.fillStyle = col; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x - w / 2, y - size * 0.85, w, size * 1.7, size * 0.85); else ctx.rect(x - w / 2, y - size * 0.85, w, size * 1.7); ctx.fill(); ctx.fillStyle = fg || '#0b0d12'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x, y + 0.5); ctx.textBaseline = 'alphabetic'; }

    /* o: {wet, hot, active, labels, deco} ; ctx already in design space */
    function draw(ctx, o) {
      o = o || {}; var R = rnd(7), wet = !!o.wet;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (o.deco !== false) {
        // floor: deep navy pool with an engineering grid (reads as a 3D floor once tilted)
        var fl = ctx.createRadialGradient(560, 350, 60, 560, 350, 760); fl.addColorStop(0, wet ? '#0f1b2b' : '#121a28'); fl.addColorStop(1, '#05070b');
        if (o.floor !== false) {
        ctx.fillStyle = fl; ctx.fillRect(-400, -400, 1840, 1480);
        ctx.lineWidth = 1; for (var gx = -400; gx <= 1440; gx += 20) { ctx.strokeStyle = gx % 100 === 0 ? 'rgba(110,170,255,.075)' : 'rgba(110,170,255,.028)'; ctx.beginPath(); ctx.moveTo(gx, -400); ctx.lineTo(gx, 1080); ctx.stroke(); }
        for (var gy = -400; gy <= 1080; gy += 20) { ctx.strokeStyle = gy % 100 === 0 ? 'rgba(110,170,255,.075)' : 'rgba(110,170,255,.028)'; ctx.beginPath(); ctx.moveTo(-400, gy); ctx.lineTo(1440, gy); ctx.stroke(); }
        // grid crosses at major intersections
        ctx.strokeStyle = 'rgba(150,200,255,.16)'; for (var cx0 = 0; cx0 <= 1100; cx0 += 100) for (var cy0 = 0; cy0 <= 700; cy0 += 100) { ctx.beginPath(); ctx.moveTo(cx0 - 4, cy0); ctx.lineTo(cx0 + 4, cy0); ctx.moveTo(cx0, cy0 - 4); ctx.lineTo(cx0, cy0 + 4); ctx.stroke(); }
        }
        // infield/grass band and paved run-off
        path(ctx, 0, 1); ctx.strokeStyle = wet ? 'rgba(40,70,90,.20)' : 'rgba(46,92,74,.16)'; ctx.lineWidth = 118; ctx.stroke();
        path(ctx, 0, 1); ctx.strokeStyle = 'rgba(70,80,100,.22)'; ctx.lineWidth = 64; ctx.stroke();
        // gravel traps on the outside of every real corner
        CORNERS.forEach(function (c) { if (c.k < 0.6) return; var f0 = L[(c.q - 22 + N) % N] / total, f1 = L[(c.q + 22) % N] / total; if (f1 < f0) return; var side = -c.s;
          offPath(ctx, f0, f1, side * 40); ctx.strokeStyle = 'rgba(150,128,92,.16)'; ctx.lineWidth = 22; ctx.stroke();
          for (var g = 0; g < 60; g++) { var q = (c.q - 20 + Math.floor(R() * 40) + N) % N, B = pts[q], n0 = nrm(q), dd = side * (31 + R() * 18); ctx.fillStyle = 'rgba(210,190,150,' + (0.08 + R() * 0.12) + ')'; ctx.fillRect(B[0] + n0[0] * dd, B[1] + n0[1] * dd, 1.4, 1.4); }
          // tyre wall behind the gravel
          for (var t = -15; t <= 15; t += 3) { var qq = (c.q + t + N) % N, Bt = pts[qq], nt = nrm(qq), d2 = side * 50; ctx.beginPath(); ctx.arc(Bt[0] + nt[0] * d2, Bt[1] + nt[1] * d2, 1.9, 0, 7); ctx.fillStyle = (t / 3) % 2 ? 'rgba(255,59,74,.75)' : 'rgba(235,235,235,.75)'; ctx.fill(); }
        });
        // armco / barrier lines both sides
        ctx.setLineDash([10, 6]); ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(190,210,255,.18)';
        offPath(ctx, 0, 1, 34); ctx.stroke(); offPath(ctx, 0, 1, -34); ctx.stroke(); ctx.setLineDash([]);
        // grandstands along the main straight + painted logo on the run-off
        var gs = [[520, 618], [640, 618], [760, 614]]; gs.forEach(function (g) { ctx.save(); ctx.translate(g[0], g[1]);
          ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(-52, 4, 104, 26); ctx.fillStyle = '#1a2030'; ctx.fillRect(-52, 0, 104, 26);
          for (var r2 = 0; r2 < 5; r2++) { ctx.fillStyle = r2 % 2 ? 'rgba(255,55,95,.55)' : 'rgba(90,200,250,.45)'; ctx.fillRect(-50, 3 + r2 * 4.6, 100, 2.4); }
          ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillRect(-52, 0, 104, 1.5); ctx.restore(); });
        ctx.save(); ctx.translate(640, 655); ctx.font = 'italic 900 34px ' + UI; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fillText('CMP GRAND PRIX', 0, 0); ctx.restore();
        // circuit plate + scale bar (painted on the floor)
        ctx.textAlign = 'left'; ctx.font = '800 15px ' + UI; ctx.fillStyle = 'rgba(220,232,255,.55)'; ctx.fillText('CMP INTERNATIONAL CIRCUIT', 150, 642);
        ctx.font = '600 11px ' + UI; ctx.fillStyle = 'rgba(200,215,255,.38)'; ctx.fillText('1.90 KM  ·  ' + CORNERS.length + ' TURNS  ·  12 LAPS  ·  DRS 1 ZONE', 150, 660);
        ctx.fillStyle = 'rgba(255,55,95,.8)'; ctx.fillRect(150, 624, 30, 3);
        var sb = 100 / M; ctx.strokeStyle = 'rgba(200,215,255,.45)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(150, 678); ctx.lineTo(150 + sb, 678); ctx.moveTo(150, 673); ctx.lineTo(150, 683); ctx.moveTo(150 + sb, 673); ctx.lineTo(150 + sb, 683); ctx.stroke();
        ctx.font = '600 10px ' + UI; ctx.fillStyle = 'rgba(200,215,255,.45)'; ctx.textAlign = 'center'; ctx.fillText('100 m', 150 + sb + 22, 681);
        // north arrow
        ctx.save(); ctx.translate(1000, 70); ctx.strokeStyle = 'rgba(200,215,255,.35)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, 13, 0, 7); ctx.stroke();
        ctx.fillStyle = 'rgba(255,55,95,.8)'; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(4, 2); ctx.lineTo(-4, 2); ctx.fill(); ctx.font = '700 9px ' + UI; ctx.fillStyle = 'rgba(200,215,255,.6)'; ctx.fillText('N', 0, -17); ctx.restore();
      }
      // drop shadow + sector-coloured under-glow
      ctx.save(); ctx.translate(0, 7); path(ctx, 0, 1); ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 40; ctx.stroke(); ctx.restore();
      for (var j0 = 0; j0 < 4; j0++) { path(ctx, SB[j0], SB[j0 + 1]); ctx.strokeStyle = SCOL[j0]; ctx.globalAlpha = 0.09; ctx.lineWidth = 46; ctx.stroke(); }
      ctx.globalAlpha = 1;
      // asphalt: white edge lines, dark surface, worn racing groove, aggregate speckle
      path(ctx, 0, 1); ctx.strokeStyle = 'rgba(240,245,255,.42)'; ctx.lineWidth = 27; ctx.stroke();
      path(ctx, 0, 1); ctx.strokeStyle = wet ? '#18273a' : '#13161d'; ctx.lineWidth = 24; ctx.stroke();
      path(ctx, 0, 1); ctx.strokeStyle = wet ? 'rgba(120,180,255,.06)' : 'rgba(255,255,255,.035)'; ctx.lineWidth = 11; ctx.stroke();
      for (var sp = 0; sp < 900; sp++) { var qs = Math.floor(R() * N), Bs = pts[qs], ns = nrm(qs), ds = (R() - 0.5) * 21; ctx.fillStyle = 'rgba(255,255,255,' + (0.025 + R() * 0.05) + ')'; ctx.fillRect(Bs[0] + ns[0] * ds, Bs[1] + ns[1] * ds, 1, 1); }
      if (wet) { for (var pd = 0; pd < 26; pd++) { var qp = Math.floor(R() * N), Bp = pts[qp], np = nrm(qp), dp = (R() - 0.5) * 16; ctx.fillStyle = 'rgba(140,190,255,.10)'; ctx.beginPath(); ctx.ellipse(Bp[0] + np[0] * dp, Bp[1] + np[1] * dp, 5 + R() * 6, 2 + R() * 2, np[2], 0, 7); ctx.fill(); } }
      // DRS zone painted on the surface
      offPath(ctx, 0.925, 0.999, 0); ctx.strokeStyle = 'rgba(48,209,88,.10)'; ctx.lineWidth = 22; ctx.stroke(); offPath(ctx, 0, 0.12, 0); ctx.stroke();
      ctx.setLineDash([2, 4]); ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(48,209,88,.6)'; offPath(ctx, 0.925, 0.999, 17); ctx.stroke(); offPath(ctx, 0, 0.12, 17); ctx.stroke(); ctx.setLineDash([]);
      var dz = at(0.95); tag(ctx, dz[0], dz[1] + 30, 'DRS', 'rgba(48,209,88,.9)', '#04140a', 10);
      // distance boards every 100 m
      for (var dm = 100; dm < LAP_M; dm += 100) { var mp = at(dm / LAP_M), mx0 = -Math.sin(mp[2]), my0 = Math.cos(mp[2]);
        ctx.beginPath(); ctx.moveTo(mp[0] + mx0 * 14, mp[1] + my0 * 14); ctx.lineTo(mp[0] + mx0 * 20, mp[1] + my0 * 20); ctx.strokeStyle = 'rgba(200,215,255,.32)'; ctx.lineWidth = 1.2; ctx.stroke(); }
      // neon racing line per sector
      for (var j = 0; j < 4; j++) {
        var on = o.active == null || o.active < 0 || o.active === j;
        ctx.save(); ctx.shadowColor = SCOL[j]; ctx.shadowBlur = o.active === j ? 22 : 11;
        path(ctx, SB[j], SB[j + 1]); ctx.strokeStyle = SCOL[j]; ctx.globalAlpha = on ? 0.95 : 0.4;
        ctx.lineWidth = o.active === j ? 4.2 : 2.6; ctx.stroke(); ctx.restore();
        ctx.save(); path(ctx, SB[j], SB[j + 1]); ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = on ? 0.55 : 0.2; ctx.lineWidth = 0.8; ctx.stroke(); ctx.restore();
      }
      // kerbs: outside and inside of the corners (red / white blocks)
      function kerb(f0, f1, d) { offPath(ctx, f0, f1, d); ctx.lineWidth = 4.5; ctx.strokeStyle = '#f2f2f2'; ctx.setLineDash([]); ctx.stroke(); offPath(ctx, f0, f1, d); ctx.strokeStyle = '#ff3b4a'; ctx.setLineDash([5, 5]); ctx.stroke(); ctx.setLineDash([]); }
      [[SB[2] + 0.035, SB[2] + 0.1, -12.8], [SB[3] + 0.03, SB[3] + 0.055, 12.8], [SB[3] + 0.075, SB[3] + 0.1, -12.8], [0.189, 0.269, -12.8], [SB[1] + 0.04, SB[1] + 0.07, 12.8]].forEach(function (k) { kerb(k[0], k[1], k[2]); });
      
      // sector timing gates: glowing bar across the track + sector badge
      for (var j2 = 1; j2 < 4; j2++) {
        var bp = at(SB[j2]), nx = -Math.sin(bp[2]), ny = Math.cos(bp[2]);
        ctx.save(); ctx.shadowColor = SCOL[j2]; ctx.shadowBlur = 12; ctx.strokeStyle = SCOL[j2]; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(bp[0] + nx * 17, bp[1] + ny * 17); ctx.lineTo(bp[0] - nx * 17, bp[1] - ny * 17); ctx.stroke(); ctx.restore();
        [17, -17].forEach(function (e) { ctx.fillStyle = '#e8eefc'; ctx.fillRect(bp[0] + nx * e - 2, bp[1] + ny * e - 2, 4, 4); });
        tag(ctx, bp[0] + nx * 32, bp[1] + ny * 32, 'S' + (j2 + 1), SCOL[j2], '#0b0d12', 10);
      }
      // braking boards before the hairpin (3 / 2 / 1)
      for (var bb = 0; bb < 3; bb++) {
        var bq = at(SB[2] - 0.006 - bb * 0.011), mx = -Math.sin(bq[2]), my = Math.cos(bq[2]);
        ctx.fillStyle = '#f2f2f2'; ctx.fillRect(bq[0] + mx * 22 - 4, bq[1] + my * 22 - 4, 8, 8); ctx.fillStyle = '#ff3b4a'; ctx.font = '800 7px ' + UI; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(bb + 1), bq[0] + mx * 22, bq[1] + my * 22 + 0.5); ctx.textBaseline = 'alphabetic';
      }
      var bz = at(SB[2] - 0.02); ctx.fillStyle = 'rgba(255,140,140,.9)'; ctx.font = '700 11px ' + UI; ctx.textAlign = 'left'; ctx.fillText('煞車區', bz[0] + 26, bz[1] + 18);
      // turn numbers on the inside of each apex
      CORNERS.forEach(function (c, i) { var B = pts[c.q], n0 = nrm(c.q), d = c.s * 34, x = B[0] + n0[0] * d, y = B[1] + n0[1] * d;
        ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fillStyle = 'rgba(10,13,20,.85)'; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(220,232,255,.55)'; ctx.stroke();
        ctx.fillStyle = 'rgba(235,242,255,.9)'; ctx.font = '700 9px ' + UI; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('T' + (i + 1), x, y + 0.5); ctx.textBaseline = 'alphabetic'; });
      if (o.labels !== false) {
        ctx.font = '600 15px ' + UI; ctx.textAlign = 'center';
        LABELS.forEach(function (l, i) { var p = at(l[1]); ctx.fillStyle = o.active === i ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.45)'; ctx.fillText(l[0], p[0] + l[2], p[1] + l[3]); });
      }
      // start / finish: chequered strip, grid boxes behind it, gantry posts
      var s0 = at(0);
      ctx.save(); ctx.translate(s0[0], s0[1]); ctx.rotate(s0[2]);
      for (var a2 = 0; a2 < 6; a2++) for (var b2 = 0; b2 < 2; b2++) { ctx.fillStyle = (a2 + b2) % 2 ? 'rgba(0,0,0,.9)' : 'rgba(255,255,255,.95)'; ctx.fillRect(-4 + b2 * 4, -12 + a2 * 4, 4, 4); }
      ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1; for (var gb = 0; gb < 6; gb++) { var gxp = -14 - gb * 13, gyp = gb % 2 ? 4 : -4; ctx.beginPath(); ctx.moveTo(gxp - 5, gyp - 4); ctx.lineTo(gxp, gyp - 4); ctx.lineTo(gxp, gyp + 4); ctx.lineTo(gxp - 5, gyp + 4); ctx.stroke(); }
      ctx.fillStyle = '#e8eefc'; ctx.fillRect(-1.5, -24, 3, 6); ctx.fillRect(-1.5, 18, 3, 6); ctx.fillStyle = 'rgba(255,55,95,.9)'; ctx.fillRect(-1.5, -22, 3, 44);
      ctx.restore();
      tag(ctx, s0[0], s0[1] + 34, 'START / FINISH', 'rgba(255,255,255,.92)', '#0b0d12', 9);
    }
    /* light pulses that sweep along the racing line; call every frame (two short strokes, very cheap) */
    function pulse(ctx, t) {
      /* one comet that laps the circuit every 7 s; tail pieces take the colour of the sector they sit in and wrap across the line */
      var f = (t / 7) % 1, len = 0.05, n = 10;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      for (var k = 0; k < n; k++) { var a = f - len * (k + 1) / n, b = f - len * k / n; if (a < 0) { a += 1; b += 1; } if (b > 1) { piece(a, 1, k); piece(0, b - 1, k); } else piece(a, b, k); }
      function piece(a, b, k) { if (b <= a) return; var j = 0, m = (a + b) / 2; while (j < 3 && m >= SB[j + 1]) j++;
        path(ctx, a, b); ctx.strokeStyle = SCOL[j]; ctx.globalAlpha = 0.85 * (1 - k / n); ctx.lineWidth = 4 - 2.4 * k / n; ctx.stroke();
        if (k === 0) { var h = at(b); ctx.globalAlpha = 0.9; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(h[0], h[1], 2.4, 0, 7); ctx.fill(); } }
      ctx.restore();
    }
    /* short tapered light trail with a soft ground shadow; pts oldest → newest, design-space coords */
    function trail(ctx, pts, color, w) {
      var n = pts.length; if (n < 2) return; w = w || 1; ctx.save(); ctx.lineCap = 'round';
      for (var q = 1; q < n; q++) { var u = q / n; ctx.beginPath(); ctx.moveTo(pts[q - 1][0], pts[q - 1][1] + 3); ctx.lineTo(pts[q][0], pts[q][1] + 3); ctx.strokeStyle = 'rgba(0,0,0,' + (0.35 * u) + ')'; ctx.lineWidth = (2 + 6 * u) * w; ctx.stroke(); }
      for (var k = 1; k < n; k++) { var v = k / n; ctx.beginPath(); ctx.moveTo(pts[k - 1][0], pts[k - 1][1]); ctx.lineTo(pts[k][0], pts[k][1]); ctx.strokeStyle = color; ctx.globalAlpha = 0.05 + 0.5 * v * v; ctx.lineWidth = (1 + 4.5 * v) * w; ctx.stroke(); }
      ctx.restore();
    }
    /* top-down F1 car, nose pointing along +x */
    function car(ctx, x, y, ang, color, alpha, label, sc) {
      sc = sc || 1;
      ctx.save(); ctx.globalAlpha = alpha == null ? 1 : alpha;
      ctx.translate(x, y); ctx.rotate(ang); ctx.scale(sc, sc);
      ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
      function rr(x0, y0, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x0, y0, w, h, r); else ctx.rect(x0, y0, w, h); }
      // tyres
      ctx.fillStyle = '#121418';
      rr(-13, -9.5, 7, 4.2, 1.6); ctx.fill(); rr(-13, 5.3, 7, 4.2, 1.6); ctx.fill();
      rr(5, -8.6, 5.6, 3.6, 1.4); ctx.fill(); rr(5, 5, 5.6, 3.6, 1.4); ctx.fill();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      // suspension arms
      ctx.strokeStyle = 'rgba(200,205,215,.7)'; ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(-9.5, -5.3); ctx.lineTo(-6, -2.5); ctx.moveTo(-9.5, 5.3); ctx.lineTo(-6, 2.5);
      ctx.moveTo(7.8, -5); ctx.lineTo(4, -1.5); ctx.moveTo(7.8, 5); ctx.lineTo(4, 1.5); ctx.stroke();
      // rear wing
      ctx.fillStyle = '#1b1e24'; rr(-17, -6.5, 3, 13, 1); ctx.fill();
      ctx.fillStyle = color; ctx.fillRect(-17, -6.8, 3, 1.4); ctx.fillRect(-17, 5.4, 3, 1.4);
      // body + sidepods
      var g = ctx.createLinearGradient(0, -5, 0, 5); g.addColorStop(0, shade(color, -0.35)); g.addColorStop(0.5, color); g.addColorStop(1, shade(color, -0.35));
      ctx.fillStyle = g; ctx.beginPath();
      ctx.moveTo(15.5, 0); ctx.quadraticCurveTo(12, -1.2, 7, -1.6); ctx.lineTo(1.5, -2.4); ctx.quadraticCurveTo(-1, -4.8, -4.5, -4.6);
      ctx.lineTo(-11, -3.2); ctx.quadraticCurveTo(-14.5, -2.2, -14.5, 0); ctx.quadraticCurveTo(-14.5, 2.2, -11, 3.2); ctx.lineTo(-4.5, 4.6);
      ctx.quadraticCurveTo(-1, 4.8, 1.5, 2.4); ctx.lineTo(7, 1.6); ctx.quadraticCurveTo(12, 1.2, 15.5, 0); ctx.fill();
      // engine cover stripe
      ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(-12, -0.5, 10, 1);
      // cockpit + halo
      ctx.fillStyle = '#0b0d12'; ctx.beginPath(); ctx.ellipse(-0.5, 0, 2.6, 1.6, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(230,232,238,.9)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.ellipse(-0.3, 0, 3.2, 2.1, 0, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(2.9, 0); ctx.lineTo(5.2, 0); ctx.stroke();
      // front wing
      ctx.fillStyle = '#1b1e24'; rr(12.5, -8, 2.6, 16, 1); ctx.fill();
      ctx.fillStyle = color; ctx.fillRect(12.5, -8.3, 2.6, 1.3); ctx.fillRect(12.5, 7, 2.6, 1.3);
      ctx.restore();
      if (label != null) {
        ctx.save(); ctx.globalAlpha = alpha == null ? 1 : alpha;
        var lx = x, ly = y - 17 * sc; ctx.font = '700 10px -apple-system, "Segoe UI", sans-serif'; ctx.textAlign = 'center';
        var tw = Math.max(14, ctx.measureText(String(label)).width + 8);
        ctx.fillStyle = color; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(lx - tw / 2, ly - 7, tw, 13, 6.5); else ctx.rect(lx - tw / 2, ly - 7, tw, 13); ctx.fill();
        ctx.fillStyle = luminance(color) > 0.6 ? '#0b0d12' : '#fff'; ctx.fillText(String(label), lx, ly + 3.5); ctx.restore();
      }
    }
    function hexRgb(c) { c = c.replace('#', ''); if (c.length === 3) c = c.split('').map(function (x) { return x + x; }).join(''); return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)]; }
    function shade(c, f) { var r = hexRgb(c); return 'rgb(' + r.map(function (v) { return Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f); }).join(',') + ')'; }
    function luminance(c) { var r = hexRgb(c); return (0.299 * r[0] + 0.587 * r[1] + 0.114 * r[2]) / 255; }
    var LEN = [0, 1, 2, 3].map(function (j) { return (SB[j + 1] - SB[j]) * LAP_M; });
    return { launch: launch, at: at, SB: SB, LEN: LEN, draw: draw, car: car, trail: trail, pulse: pulse, CORNERS: CORNERS, trace: trace, locate: locate, N: N, LAP_M: LAP_M, SCOL: SCOL, fracOf: fracOf, idxOf: idxOf, SIDX: SIDX, W: 1040, H: 680,
      baseTimes: function () { return [0, 1, 2, 3].map(function (j) { var s = 0; for (var q = SIDX[j]; q < SIDX[j + 1]; q++) s += ds[q] / vb[q]; return s; }); } };
  })();

  /* rehearsal data: simulated teams with mixed strategies */
  function demoTeams(n, seedStr) {
    var A = ['陳','林','黃','張','李','王','吳','劉','蔡','楊','許','鄭','謝','郭','洪','曾','邱','廖','賴','周'];
    var Bn = ['志明','俊傑','怡君','雅婷','家豪','冠宇','佳穎','宗翰','詩涵','彥廷','承恩','筱涵','柏翰','品妤','建宏','欣怡','宇軒','思妤','偉哲','郁婷'];
    var R = rng(hashStr(seedStr || 'demo')), out = [], used = {};
    function rint(a, b) { return a + Math.floor(R() * (b - a + 1)); }
    while (out.length < n) {
      var team = A[rint(0, A.length - 1)] + Bn[rint(0, Bn.length - 1)]; var log = [];
      if (used[team]) continue; used[team] = 1;
      var p = sanitize({ rw: rint(3, 7), eng: rint(2, 5), susp: rint(3, 7), brk: rint(2, 4), tire: 'SMH'[rint(0, 2)] });
      var budget = rint(8, 26), runs = 0, stress = 0, ai = 0, adopted = false, best = null, style = R(), cautious = R() < 0.35;
      if (style < 0.25) { ai = rint(1, 3); for (var a = 0; a < ai; a++) p = aiSuggest(p, 3).params; adopted = R() < 0.8; if (!adopted) { p.eng = Math.max(3, p.eng - 1); p = sanitize(p); } budget -= ai; }
      if (!adopted) {
        var r0 = simulate(p, COND.practice, { seed: rint(1, 1e9) }); budget--; runs++; best = r0.finished ? r0.laps[0].t : null; log.push({ c: 'practice', p: sanitize(p), b: best, s: r0.laps[0].s });
        while (budget > 0) {
          var pj = project(p, COND.practice);
          if (cautious && budget >= 2 && R() < 0.25) {
            var sc = R() < 0.5 ? COND.hot : COND.wet, ps = project(p, sc); var rs2 = simulate(p, sc, { seed: rint(1, 1e9) }); log.push({ c: sc.id, p: sanitize(p), b: rs2.laps[0].t, s: rs2.laps[0].s });
            budget -= 2; runs++; stress++;
            if (!ps.finished) p.tire = p.tire === 'S' ? 'M' : 'H';
            if (ps.engRace > 0.25) p.eng = Math.max(2, p.eng - 1); p = sanitize(p);
            if (sc === COND.wet) { p.rw = Math.min(10, p.rw + 1); p = sanitize(p); }
            continue;
          }
          var q = Object.assign({}, p), ks = ['rw', 'eng', 'susp', 'brk', 'tire'], k = ks[rint(0, 4)];
          if (k === 'tire') q.tire = 'SMH'[rint(0, 2)]; else q[k] += R() < 0.5 ? -1 : 1;
          q = sanitize(q);
          var r = simulate(q, COND.practice, { seed: rint(1, 1e9) }); budget--; runs++;
          var lap = r.laps[0] && r.laps[0].t; log.push({ c: 'practice', p: q, b: lap, s: r.laps[0].s });
          if (lap && (best == null || lap < best) && project(q, COND.practice).finished) { best = lap; p = q; }
        }
      }
      if (adopted) for (var a2 = 0; a2 < rint(1, 4); a2++) { var ra = simulate(p, COND.practice, { seed: rint(1, 1e9) }); log.push({ c: 'practice', p: sanitize(p), b: ra.laps[0].t, s: ra.laps[0].s }); runs++; if (ra.laps[0].t && (best == null || ra.laps[0].t < best)) best = ra.laps[0].t; }
      out.push({ team: team, id: 'D' + (10000 + out.length), log: log, members: ['D' + (10000 + out.length)], params: p,
        stats: { runs: runs, practice: runs - stress, stress: stress, testSeconds: (runs - stress) * 20 + stress * 42 + ai * 15, aiUsed: 0, aiAdopted: false, bestPractice: best, testedFinal: true } });
    }
    return out;
  }

  return { PEN: PEN, GAIN: GAIN, NB: NB, REASON: REASON, demoTeams: demoTeams, LAPS: LAPS, PIT_LOSS: PIT_LOSS, SECTORS: SECTORS, TIRES: TIRES, PARAMS: PARAMS, DEFAULT: DEFAULT, COND: COND, RACE: RACE,
    hashStr: hashStr, rng: rng, project: project, TRACK: TRACK, sanitize: sanitize, simulate: simulate, score: score, qualify: qualify, aiSuggest: aiSuggest,
    code: code, parseCode: parseCode, checksum: checksum, fmt: fmt, pitLaps: pitLaps, fuelNeeded: fuelNeeded };
})();
if (typeof module !== 'undefined') module.exports = SIM;
