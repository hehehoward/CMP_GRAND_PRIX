/* ===== CMP Grand Prix · procedural sound engine (WebAudio, no audio files, works offline) =====
   Modern, restrained palette: soft sine/FM tones with a short room reverb, a hybrid-V6 engine voice,
   filtered-noise tyres / rain / crowd. Everything goes through one bus + compressor so nothing clips. */
var SFX = (function () {
  var AC = window.AudioContext || window.webkitAudioContext;
  var ctx = null, master = null, comp = null, verb = null, verbIn = null, dry = null, noiseBuf = null, an = null;
  var on = true, vol = 0.8;
  try { var v = localStorage.getItem('cmpgp_sfx'); if (v === '0') on = false; } catch (e) { }

  function init(forced) {
    if (ctx || (!AC && !forced)) return !!ctx;
    try {
      ctx = forced || new AC();
      comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
      master = ctx.createGain(); master.gain.value = on ? vol : 0;
      an = ctx.createAnalyser(); an.fftSize = 1024;
      dry = ctx.createGain(); dry.gain.value = 1;
      verbIn = ctx.createGain(); verbIn.gain.value = 1;
      verb = ctx.createConvolver(); verb.buffer = impulse(1.9, 2.6);
      var vOut = ctx.createGain(); vOut.gain.value = 0.32;
      dry.connect(comp); verbIn.connect(verb); verb.connect(vOut); vOut.connect(comp);
      comp.connect(master); master.connect(an); an.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      loadWorklet();
    } catch (e) { ctx = null; }
    return !!ctx;
  }
  function impulse(sec, decay) {
    var n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (var c = 0; c < 2; c++) { var d = b.getChannelData(c); for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay) * (i < 90 ? i / 90 : 1); }
    return b;
  }
  function unlock() { if (!init()) return; if (ctx.state === 'suspended') ctx.resume(); }
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { window.addEventListener(ev, unlock, { capture: true, passive: true }); });
  function ready() { return on && ctx && ctx.state !== 'closed'; }
  function T() { return ctx.currentTime; }
  /* output helper: node -> (dry + reverb send) */
  function out(node, send) { node.connect(dry); if (send) { var s = ctx.createGain(); s.gain.value = send; node.connect(s); s.connect(verbIn); } }
  function env(g, t0, a, peak, d, sus, rel) {
    g.gain.cancelScheduledValues(t0); g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    if (sus != null) { g.gain.setTargetAtTime(peak * sus, t0 + a, d / 3); g.gain.setTargetAtTime(0.0001, t0 + a + d, rel / 4); }
    else g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }
  /* soft modern tone: sine + gentle FM shimmer */
  function tone(f, dur, gain, delay, opt) {
    if (!ready()) return; opt = opt || {};
    var t0 = T() + (delay || 0), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = opt.type || 'sine'; o.frequency.setValueAtTime(f, t0); if (opt.slide) o.frequency.exponentialRampToValueAtTime(f * opt.slide, t0 + dur);
    if (opt.fm) { var m = ctx.createOscillator(), mg = ctx.createGain(); m.frequency.value = f * opt.fm; mg.gain.setValueAtTime(f * 0.6, t0); mg.gain.exponentialRampToValueAtTime(1, t0 + dur); m.connect(mg); mg.connect(o.frequency); m.start(t0); m.stop(t0 + dur + 0.1); }
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = opt.lp || 6000;
    o.connect(lp); lp.connect(g); out(g, opt.verb == null ? 0.5 : opt.verb);
    env(g, t0, opt.a || 0.006, gain, dur);
    o.start(t0); o.stop(t0 + dur + 0.2);
  }
  function noise(dur, gain, delay, f) {
    if (!ready()) return null; f = f || {};
    var t0 = T() + (delay || 0), s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    var bp = ctx.createBiquadFilter(); bp.type = f.type || 'bandpass'; bp.frequency.setValueAtTime(f.f || 1000, t0); bp.Q.value = f.q || 1;
    if (f.f2) bp.frequency.exponentialRampToValueAtTime(f.f2, t0 + dur);
    var g = ctx.createGain(); s.connect(bp); bp.connect(g); out(g, f.verb || 0);
    env(g, t0, f.a || 0.005, gain, dur);
    s.start(t0, Math.random()); s.stop(t0 + dur + 0.3); return g;
  }

  /* ---------- UI ---------- */
  function ui(kind) {
    if (!ready()) return;
    if (kind === 'tick') { tone(2600, 0.035, 0.05, 0, { verb: 0.08 }); tone(1300, 0.05, 0.03, 0, { verb: 0.05 }); }
    else if (kind === 'click') { tone(880, 0.09, 0.07, 0, { fm: 2, verb: 0.2 }); }
    else if (kind === 'whoosh') { noise(0.32, 0.06, 0, { f: 500, f2: 2600, q: 0.8, a: 0.12, verb: 0.2 }); }
    else if (kind === 'confirm') { tone(660, 0.18, 0.06, 0, { fm: 2 }); tone(990, 0.3, 0.06, 0.09, { fm: 2 }); }
    else if (kind === 'error') { tone(330, 0.16, 0.06, 0, { type: 'triangle' }); tone(262, 0.24, 0.06, 0.12, { type: 'triangle' }); }
    else if (kind === 'ai') { [523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.25, 0.035, i * 0.06, { fm: 3, verb: 0.6 }); }); }
  }
  /* start lights: soft low pings, GO = brighter chord */
  function light(i) { tone(440, 0.28, 0.08, 0, { fm: 1, verb: 0.35 }); tone(220, 0.3, 0.05, 0, { verb: 0.2 }); }
  function go() { tone(880, 0.45, 0.08, 0, { fm: 1, verb: 0.5 }); tone(1320, 0.5, 0.05, 0.01, { fm: 1, verb: 0.5 }); }

  /* ---------- engine: physically-inspired V6 turbo-hybrid ----------
     Not oscillators: every cylinder firing is a short pressure pulse (with per-cylinder imbalance and
     cycle-to-cycle jitter) that rings a set of exhaust resonances, then a muffler low-pass and soft
     saturation. That is what gives a real engine its rumble and growl. Runs in an AudioWorklet
     (blob URL, offline-safe) with a ScriptProcessor fallback. */
  function engineDSP(sr) {
    var st = { rpm: 3500, thr: 0, gain: 0, tr: 3500, tt: 0, tg: 0, ph: 0, cyl: 0, e: 0, en: 0, pop: 0, boost: 0, tph: 0, lp: 0, lp2: 0, dc: 0, dcx: 0 };
    var amps = [1, 0.84, 0.97, 0.9, 1.06, 0.8];
    function bp() { return { b0: 0, b2: 0, a1: 0, a2: 0, x1: 0, x2: 0, y1: 0, y2: 0 }; }
    var R = [bp(), bp(), bp(), bp(), bp()];
    function setBP(f, f0, q) { var w = 2 * Math.PI * Math.min(f0, sr * 0.45) / sr, al = Math.sin(w) / (2 * q), a0 = 1 + al; f.b0 = al / a0; f.b2 = -al / a0; f.a1 = -2 * Math.cos(w) / a0; f.a2 = (1 - al) / a0; }
    function run(f, x) { var y = f.b0 * x + f.b2 * f.x2 - f.a1 * f.y1 - f.a2 * f.y2; f.x2 = f.x1; f.x1 = x; f.y2 = f.y1; f.y1 = y; return y; }
    var seed = 22222; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    var pulseDecay = Math.exp(-1 / (sr * 0.0016)), noiseDecay = Math.exp(-1 / (sr * 0.0007));
    return {
      set: function (rpm, thr, gain) { st.tr = rpm; st.tt = thr; st.tg = gain; },
      process: function (L, Rr, n) {
        var fire = st.rpm / 60 * 3;
        /* exhaust: one resonance tracks the firing pitch (tuned primaries), the rest are fixed body/pipe modes */
        setBP(R[0], fire, 2.2); setBP(R[1], fire * 2, 3); setBP(R[2], 165, 1.6); setBP(R[3], 520, 2.5); setBP(R[4], 1350, 3.5);
        var lpC = 1 - Math.exp(-2 * Math.PI * (900 + 2600 * Math.max(0, st.thr)) / sr);
        for (var i = 0; i < n; i++) {
          st.rpm += (st.tr - st.rpm) * 0.0009; st.thr += (st.tt - st.thr) * 0.002; st.gain += (st.tg - st.gain) * 0.001;
          var on = Math.max(0, st.thr);
          st.ph += st.rpm / 60 * 3 / sr * (1 + (rnd() - 0.5) * 0.02);
          if (st.ph >= 1) {
            st.ph -= 1; var a = amps[st.cyl] * (0.28 + 0.72 * on) * (0.88 + 0.24 * rnd());
            st.e += a; st.en += a * 0.8; st.cyl = (st.cyl + 1) % 6;
            if (st.thr < 0.05 && st.rpm > 6000 && rnd() < 0.035) st.pop = 1.4 + rnd(); /* overrun burble */
          }
          var w = rnd() * 2 - 1, x = st.e + st.en * w * 0.55 + st.pop * w;
          st.e *= pulseDecay; st.en *= noiseDecay; st.pop *= 0.9985;
          var y = run(R[0], x) * 1.1 + run(R[1], x) * 0.45 + run(R[2], x) * 0.55 + run(R[3], x) * 0.4 + run(R[4], x) * 0.18;
          /* muffler + dc block */
          st.lp += lpC * (y - st.lp); st.lp2 += lpC * (st.lp - st.lp2); y = st.lp2 * 0.6 + st.lp * 0.4;
          var d = y - st.dcx + 0.995 * st.dc; st.dcx = y; st.dc = d; y = d;
          /* turbo / MGU-H whine follows boost */
          st.boost += ((on * st.rpm / 12000) - st.boost) * 0.0004; st.tph += (2600 + 3200 * st.boost) / sr; if (st.tph > 1) st.tph -= 1;
          y += Math.sin(st.tph * 6.2831853) * 0.035 * st.boost * st.boost;
          y = Math.tanh(y * 2.2) * st.gain;
          L[i] = y; if (Rr) Rr[i] = y;
        }
      }
    };
  }
  var WK = { state: 0 };
  function loadWorklet() {
    if (WK.state || !ctx || !ctx.audioWorklet || !window.Blob) { if (!WK.state) WK.state = -1; return; }
    WK.state = 1;
    var src = 'var engineDSP=' + engineDSP.toString() + ';\nclass E extends AudioWorkletProcessor{constructor(){super();this.d=engineDSP(sampleRate);this.port.onmessage=(m)=>{var v=m.data;if(v==="stop")this.dead=true;else this.d.set(v[0],v[1],v[2])}}process(i,o){var c=o[0];this.d.process(c[0],c[1],c[0].length);return !this.dead}}\nregisterProcessor("cmp-engine",E);';
    try { /* data: URL works on file:// pages (blob: does not) */
      var url = 'data:application/javascript;base64,' + btoa(unescape(encodeURIComponent(src)));
      ctx.audioWorklet.addModule(url).then(function () { WK.state = 2; }, function () {
        try { ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([src], { type: 'application/javascript' }))).then(function () { WK.state = 2; }, function () { WK.state = -1; }); } catch (e) { WK.state = -1; } }); } catch (e) { WK.state = -1; }
  }
  /* one engine voice -> {set(rpm,thr,gain), node, stop()} */
  function voice() {
    if (WK.state === 2) {
      try { var nd = new AudioWorkletNode(ctx, 'cmp-engine', { numberOfInputs: 0, outputChannelCount: [2] });
        return { node: nd, set: function (r, t, g) { nd.port.postMessage([r, t, g]); }, stop: function () { nd.port.postMessage('stop'); setTimeout(function () { try { nd.disconnect(); } catch (e) { } }, 50); } }; } catch (e) { }
    }
    var dsp = engineDSP(ctx.sampleRate), sp = ctx.createScriptProcessor(1024, 0, 2);
    sp.onaudioprocess = function (ev) { var b = ev.outputBuffer; dsp.process(b.getChannelData(0), b.getChannelData(1), b.length); };
    return { node: sp, set: dsp.set, stop: function () { sp.onaudioprocess = null; try { sp.disconnect(); } catch (e) { } } };
  }
  var ENG = null;
  /* level ~0.05..0.1 ; rpm band in the game is a 0..1 fraction inside the current gear */
  var NOENG = false;
  function engineStart(level) {
    if (NOENG || !ready() || ENG) return; loadWorklet();
    var e = { v: voice(), lvl: (level || 0.06) * 1.6, out: ctx.createGain() };
    e.out.gain.value = 1; e.v.node.connect(e.out); out(e.out, 0.1);
    e.rpm = 0.1; e.thr = 0; ENG = e; e.v.set(4200, 0, e.lvl * 0.5);
  }
  function rpmOf(f) { return 6800 + f * 5200; }
  function engineSet(rpm, thr) {
    if (!ENG || !ctx) return; var e = ENG; e.rpm = rpm; e.thr = thr; var on = Math.max(0, thr);
    e.v.set(rpmOf(rpm), thr, e.lvl * (0.55 + 0.35 * on + 0.15 * rpm));
  }
  function shift() { /* seamless-shift: 40 ms ignition cut, the rpm drop comes from the game's gear change */
    if (!ENG || !ready()) return; var e = ENG; e.v.set(rpmOf(e.rpm), -0.2, e.lvl * 0.5); setTimeout(function () { if (ENG === e) engineSet(e.rpm, e.thr); }, 45);
  }
  function engineStop(fast) {
    if (!ENG || !ctx) return; var e = ENG; ENG = null;
    e.v.set(3000, -0.3, 0); var t = T(); e.out.gain.setTargetAtTime(0.0001, t, fast ? 0.05 : 0.3);
    setTimeout(function () { e.v.stop(); }, fast ? 600 : 2200);
  }
  /* short rev on the design page (level 1..5) */
  function rev(level) {
    if (!ready() || ENG) return; engineStart(0.07);
    var peak = 0.35 + 0.13 * level, t = 0;
    var iv = setInterval(function () { t += 0.03; var u = t < 0.18 ? t / 0.18 : Math.max(0, 1 - (t - 0.18) / 0.55); engineSet(0.15 + peak * u, u > 0.2 ? 1 : 0); if (t > 0.8) { clearInterval(iv); engineStop(); } }, 30);
  }

  /* ---------- track events ---------- */
  function chime(kind) { /* sector crossing */
    if (kind === 'p') { tone(1175, 0.32, 0.05, 0, { fm: 2, verb: 0.6 }); tone(1568, 0.4, 0.045, 0.07, { fm: 2, verb: 0.6 }); }
    else if (kind === 'g') tone(1046, 0.26, 0.045, 0, { fm: 2, verb: 0.5 });
    else if (kind === 'y') tone(784, 0.2, 0.035, 0, { fm: 1.5, verb: 0.4 });
    else tone(880, 0.16, 0.03, 0, { verb: 0.3 });
  }
  function screech(len) { len = len || 0.7; noise(len, 0.07, 0, { f: 2400, f2: 1500, q: 7, a: 0.03, verb: 0.15 }); noise(len, 0.04, 0, { f: 3300, f2: 2100, q: 9, a: 0.03 }); }
  function kerb() { for (var i = 0; i < 6; i++) noise(0.04, 0.06, i * 0.055, { type: 'lowpass', f: 300, q: 0.5 }); }
  function failure() {
    if (!ready()) return; engineStop(true);
    tone(70, 0.5, 0.11, 0, { slide: 0.5, verb: 0.3 }); noise(0.5, 0.06, 0, { type: 'lowpass', f: 600, f2: 120, verb: 0.4 });
    for (var i = 0; i < 4; i++) noise(0.07, 0.04 * (1 - i / 5), 0.35 + i * 0.16 + Math.random() * 0.05, { f: 500, q: 1.5 });
  }
  function puncture() { if (!ready()) return; noise(0.08, 0.12, 0, { type: 'highpass', f: 1500 }); engineStop(true); noise(0.9, 0.04, 0.05, { f: 900, f2: 300, q: 2 }); }
  /* rain ambience */
  var RAIN = null;
  function rain(onR, lvl) {
    if (!onR) { if (RAIN && ctx) { RAIN.g.gain.setTargetAtTime(0.0001, T(), 0.4); var r = RAIN; setTimeout(function () { try { r.s.stop(); } catch (e) { } }, 2000); RAIN = null; } return; }
    if (!ready()) return; lvl = (lvl == null ? 0.05 : lvl) * 0.5;
    if (RAIN) { RAIN.g.gain.setTargetAtTime(lvl, T(), 0.5); return; }
    var s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4500; var g = ctx.createGain(); g.gain.value = 0.0001;
    s.connect(hp); hp.connect(lp); lp.connect(g); out(g, 0.2); s.start(); g.gain.setTargetAtTime(lvl, T(), 0.6); RAIN = { s: s, g: g };
  }
  function thunder() { if (!ready()) return; noise(2.6, 0.16, 0, { type: 'lowpass', f: 220, f2: 70, q: 0.4, a: 0.08, verb: 0.6 }); noise(0.4, 0.05, 0.05, { type: 'lowpass', f: 900, f2: 200 }); }

  /* ---------- crowd ---------- */
  var CROWD = null;
  function crowdBed() {
    if (CROWD || !ready()) return CROWD;
    var c = { g: ctx.createGain(), v: [] }; c.g.gain.value = 0.0001; out(c.g, 0.5);
    [380, 560, 760, 1050, 1400].forEach(function (f, i) {
      var s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 1.4;
      var g = ctx.createGain(); g.gain.value = 0.5; s.connect(bp); bp.connect(g); g.connect(c.g); s.start(0, Math.random() * 1.5); c.v.push({ g: g, bp: bp, f: f });
    });
    var lo = ctx.createBufferSource(); lo.buffer = noiseBuf; lo.loop = true; var lf = ctx.createBiquadFilter(); lf.type = 'lowpass'; lf.frequency.value = 300; var lg = ctx.createGain(); lg.gain.value = 0.6; lo.connect(lf); lf.connect(lg); lg.connect(c.g); lo.start();
    c.iv = setInterval(function () { if (!ctx) return; var t = T(); c.v.forEach(function (x) { x.g.gain.setTargetAtTime(0.25 + Math.random() * 0.75, t, 0.18); x.bp.frequency.setTargetAtTime(x.f * (0.85 + Math.random() * 0.35), t, 0.25); }); }, 180);
    CROWD = c; return c;
  }
  function crowd(level, tc) { var c = crowdBed(); if (!c) return; c.g.gain.setTargetAtTime(Math.max(0.0001, level), T(), tc || 0.6); }
  function cheer(intensity, dur) {
    var c = crowdBed(); if (!c) return; intensity = intensity || 0.5; dur = dur || 2.5; var t = T(), base = c.base || 0.0001;
    c.g.gain.cancelScheduledValues(t); c.g.gain.setTargetAtTime(0.05 + 0.12 * intensity, t, 0.12); c.g.gain.setTargetAtTime(Math.max(0.0001, base), t + dur, 0.9);
    if (intensity > 0.6) for (var i = 0; i < 4; i++) whistle(i * 0.35 + Math.random() * 0.4);
  }
  function crowdBase(level) { var c = crowdBed(); if (!c) return; c.base = level; c.g.gain.setTargetAtTime(Math.max(0.0001, level), T(), 1.2); }
  function crowdStop() { if (!CROWD || !ctx) return; var c = CROWD; CROWD = null; c.g.gain.setTargetAtTime(0.0001, T(), 0.8); setTimeout(function () { clearInterval(c.iv); }, 3000); }
  function whistle(delay) { var f = 1900 + Math.random() * 900; tone(f, 0.35, 0.012, delay, { slide: 1.25, verb: 0.6 }); }
  function applause(dur, density) {
    if (!ready()) return; dur = dur || 3; density = density || 34; var n = Math.floor(dur * density);
    for (var i = 0; i < n; i++) { var d = Math.random() * dur, fade = Math.min(1, (dur - d) / 1.2) * Math.min(1, d / 0.3 + 0.3);
      noise(0.018 + Math.random() * 0.02, (0.03 + Math.random() * 0.04) * fade, d, { f: 1100 + Math.random() * 1800, q: 1.2, a: 0.001, verb: 0.35 }); }
  }

  /* ---------- moments ---------- */
  function finish(pb) {
    noise(0.6, 0.05, 0, { f: 700, f2: 3200, q: 0.7, a: 0.2, verb: 0.3 });
    var ch = pb ? [784, 988, 1175, 1568] : [659, 784, 988];
    ch.forEach(function (f, i) { tone(f, 1.1, 0.045, 0.15 + i * 0.05, { fm: 2, verb: 0.7, a: 0.02 }); });
    if (pb) [2093, 2637, 3136].forEach(function (f, i) { tone(f, 0.25, 0.018, 0.5 + i * 0.08, { verb: 0.8 }); });
  }
  function sparkle() { [1568, 2093, 2637, 3136, 2637].forEach(function (f, i) { tone(f, 0.22, 0.016, i * 0.07, { verb: 0.8 }); }); }
  function fanfare() { /* modern swell: stacked fifths, slow attack */
    [[262, 0], [392, 0.02], [523, 0.04], [659, 0.3], [784, 0.32], [1046, 0.6]].forEach(function (x) { tone(x[0], 2.2, 0.05, x[1], { fm: 1, verb: 0.8, a: 0.25, lp: 3500 }); });
  }
  function alert(kind) {
    if (kind === 'lap') { tone(988, 0.22, 0.06, 0, { fm: 2, verb: 0.5 }); tone(988, 0.22, 0.06, 0.26, { fm: 2, verb: 0.5 }); tone(1319, 0.5, 0.06, 0.52, { fm: 2, verb: 0.6 }); }
    else if (kind === 'time') { [880, 660, 880, 660].forEach(function (f, i) { tone(f, 0.18, 0.07, i * 0.2, { fm: 1, verb: 0.4 }); }); }
    else if (kind === 'reveal') { tone(660, 0.3, 0.04, 0, { fm: 2, verb: 0.6 }); noise(0.25, 0.025, 0, { f: 1200, f2: 3000, q: 0.8, a: 0.08, verb: 0.3 }); }
    else if (kind === 'fl') { tone(1319, 0.3, 0.04, 0, { fm: 2, verb: 0.6 }); tone(1760, 0.4, 0.035, 0.08, { fm: 2, verb: 0.6 }); }
  }
  function passby(delay, pan) { /* distant car passing: engine voice + doppler + pan (big screen ambience) */
    if (!ready()) return; loadWorklet(); if (WK.state !== 2) return; /* skip heavy fallback on the big screen */
    setTimeout(function () {
      if (!ready()) return; var v = voice(), g = ctx.createGain(), lp = ctx.createBiquadFilter(), p = ctx.createStereoPanner ? ctx.createStereoPanner() : null, t0 = T();
      lp.type = 'lowpass'; lp.frequency.value = 2400; v.node.connect(lp); lp.connect(g); if (p) { g.connect(p); out(p, 0.3); p.pan.setValueAtTime(-pan, t0); p.pan.linearRampToValueAtTime(pan, t0 + 1.6); } else out(g, 0.3);
      var r = 10800 + Math.random() * 900; v.set(r * 1.06, 1, 0.5);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.09, t0 + 0.75); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.65);
      setTimeout(function () { v.set(r * 0.9, 1, 0.5); }, 700); setTimeout(function () { v.stop(); }, 1800);
    }, (delay || 0) * 1000);
  }
  function setOn(v) { on = !!v; try { localStorage.setItem('cmpgp_sfx', on ? '1' : '0'); } catch (e) { } if (master) master.gain.setTargetAtTime(on ? vol : 0, T(), 0.05); if (!on) { engineStop(true); rain(false); } }
  function level() { if (!an) return 0; var d = new Float32Array(an.fftSize); an.getFloatTimeDomainData(d); var s = 0; for (var i = 0; i < d.length; i++) s += d[i] * d[i]; return Math.sqrt(s / d.length); }
  return { unlock: unlock, isOn: function () { return on; }, setOn: setOn, tone: tone, ui: ui, light: light, go: go, engineStart: engineStart, engineSet: engineSet, engineStop: engineStop, shift: shift, rev: rev,
    chime: chime, screech: screech, kerb: kerb, failure: failure, puncture: puncture, rain: rain, thunder: thunder, crowd: crowd, crowdBase: crowdBase, cheer: cheer, crowdStop: crowdStop, applause: applause,
    finish: finish, sparkle: sparkle, fanfare: fanfare, alert: alert, passby: passby, level: level, _ctx: function () { return ctx; }, _offline: function (oc) { ctx = null; WK.state = 0; init(oc); }, _wk: function () { return WK.state; }, noEngine: function (v) { NOENG = v !== false; } };
})();
