/* ===== CMP Grand Prix · showroom 3D F1 car (three.js r149, fully procedural, offline) ===== */
var CAR3D = (function () {
  var V3 = THREE.Vector3, PI = Math.PI;

  /* ---------------- textures (all drawn on canvas) ---------------- */
  function cvs(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function tex(c, rx, ry, srgb) {
    var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx || 1, ry || 1);
    t.anisotropy = 8; if (srgb !== false) t.encoding = THREE.sRGBEncoding; return t;
  }
  // 2x2 twill carbon weave
  function carbonCanvas() {
    var c = cvs(256, 256), x = c.getContext('2d'), n = 16, s = 256 / n;
    x.fillStyle = '#0d0e10'; x.fillRect(0, 0, 256, 256);
    for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) {
      var horiz = ((i + j) >> 1) % 2 === 0, g;
      if (horiz) { g = x.createLinearGradient(0, j * s, 0, j * s + s); } else { g = x.createLinearGradient(i * s, 0, i * s + s, 0); }
      g.addColorStop(0, '#0b0c0e'); g.addColorStop(0.5, horiz ? '#2c3036' : '#22252a'); g.addColorStop(1, '#0b0c0e');
      x.fillStyle = g; x.fillRect(i * s + 0.6, j * s + 0.6, s - 1.2, s - 1.2);
    }
    return c;
  }
  // body livery: u = nose(0) → tail(1), v around the section (0/1 = +z side, .25 top, .5 -z side, .75 bottom)
  function shade(hex, f) { var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; function c(v) { return Math.max(0, Math.min(255, Math.round(v * f))); } return 'rgb(' + c(r) + ',' + c(g) + ',' + c(b) + ')'; }
  function liveryCanvas(carbon, col) {
    col = col || '#c80f2e';
    var W = 2048, H = 1024, c = cvs(W, H), x = c.getContext('2d');
    x.fillStyle = x.createPattern(carbon, 'repeat'); x.save(); x.scale(0.5, 0.5); x.fillRect(0, 0, W * 2, H * 2); x.restore();
    // red spine over the top: canvas y = (1 - v) * H  (flipY)
    function vy(v) { return (1 - v) * H; }
    function band(u0, u1, vTop, vBot, col) { x.fillStyle = col; x.fillRect(u0 * W, vy(vTop), (u1 - u0) * W, vy(vBot) - vy(vTop)); }
    var red = x.createLinearGradient(0, 0, W, 0); red.addColorStop(0, col); red.addColorStop(0.55, shade(col, 0.8)); red.addColorStop(1, shade(col, 0.46));
    x.fillStyle = red;
    // tapered red region: wide on the nose, narrowing toward the tail
    x.beginPath();
    for (var u = 0; u <= 1.0001; u += 0.01) { var half = 0.17 - 0.09 * Math.pow(u, 1.4); x.lineTo(u * W, vy(0.25 + half)); }
    for (var u2 = 1; u2 >= -0.0001; u2 -= 0.01) { var h2 = 0.17 - 0.09 * Math.pow(u2, 1.4); x.lineTo(u2 * W, vy(0.25 - h2)); }
    x.closePath(); x.fill();
    // white pinstripes along the edge of the red
    x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 6;
    [1, -1].forEach(function (sd) { x.beginPath(); for (var u3 = 0; u3 <= 1.0001; u3 += 0.01) { var h3 = 0.17 - 0.09 * Math.pow(u3, 1.4) + 0.012; x.lineTo(u3 * W, vy(0.25 + sd * h3)); } x.stroke(); });
    // underside darker carbon
    band(0, 1, 0.86, 0.64, 'rgba(0,0,0,.45)');
    return c;
  }
  function decal(lines, w, h, bg) {
    var c = cvs(w, h), x = c.getContext('2d'); if (bg) { x.fillStyle = bg; x.fillRect(0, 0, w, h); }
    lines.forEach(function (l) {
      x.save(); x.translate(w / 2 + (l.dx || 0), l.y); if (l.sk) x.transform(1, 0, l.sk, 1, 0, 0);
      x.fillStyle = l.c || '#fff'; x.font = l.f; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(l.t, 0, 0); x.restore();
      if (l.bar) { x.fillStyle = l.c || '#fff'; x.fillRect(w / 2 - l.bar / 2, l.y + l.by, l.bar, 6); }
    });
    return c;
  }
  // tyre sidewall: compound stripe + lettering around the ring (RingGeometry uses planar UVs)
  function sidewallCanvas(color, word) {
    var S = 1024, c = cvs(S, S), x = c.getContext('2d'), cx = S / 2, R = S / 2;
    x.strokeStyle = color; x.lineWidth = 26; x.beginPath(); x.arc(cx, cx, R * 0.7, 0, 2 * PI); x.stroke();
    x.lineWidth = 5; x.globalAlpha = .6; x.beginPath(); x.arc(cx, cx, R * 0.93, 0, 2 * PI); x.stroke(); x.globalAlpha = 1;
    x.fillStyle = 'rgba(255,255,255,.92)'; x.font = '900 64px "Segoe UI", Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
    [-PI / 2, PI / 2].forEach(function (a0) {
      var txt = 'CMP  ' + word, n = txt.length, span = 0.065;
      for (var i = 0; i < n; i++) { var a = a0 + (i - (n - 1) / 2) * span; x.save(); x.translate(cx + Math.cos(a) * R * 0.815, cx + Math.sin(a) * R * 0.815); x.rotate(a + PI / 2); x.fillText(txt[i], 0, 0); x.restore(); }
    });
    x.fillStyle = color; x.font = '800 40px "Segoe UI", Arial';
    [0, PI].forEach(function (a) { x.save(); x.translate(cx + Math.cos(a) * R * 0.815, cx + Math.sin(a) * R * 0.815); x.rotate(a + PI / 2); x.fillText('GRAND PRIX', 0, 0); x.restore(); });
    return c;
  }
  function woodCanvas() {
    var W = 1024, H = 1024, c = cvs(W, H), x = c.getContext('2d'), pw = 1024 / 8;
    for (var i = 0; i < 8; i++) {
      var b = 34 + (i * 37) % 14; x.fillStyle = 'rgb(' + (b + 18) + ',' + (b + 6) + ',' + (b - 8) + ')'; x.fillRect(i * pw, 0, pw, H);
      for (var g = 0; g < 40; g++) { x.strokeStyle = 'rgba(0,0,0,' + (0.05 + Math.random() * 0.08) + ')'; x.lineWidth = 1 + Math.random() * 2; x.beginPath(); var gx = i * pw + Math.random() * pw; x.moveTo(gx, 0); x.bezierCurveTo(gx + 6, H * 0.3, gx - 6, H * 0.6, gx + 3, H); x.stroke(); }
      x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(i * pw, 0, 2, H);
      var cut = Math.random() * H; x.fillRect(i * pw, cut, pw, 2);
    }
    return c;
  }
  function radialTex(inner, outer) {
    var c = cvs(256, 256), x = c.getContext('2d'), g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, inner); g.addColorStop(1, outer); x.fillStyle = g; x.fillRect(0, 0, 256, 256); return tex(c);
  }

  /* ---------------- geometry helpers ---------------- */
  function cr(arr, key, t) {
    var n = arr.length - 1, f = Math.max(0, Math.min(n - 1e-6, t * n)), i = Math.floor(f), u = f - i;
    var p0 = arr[Math.max(0, i - 1)][key], p1 = arr[i][key], p2 = arr[Math.min(n, i + 1)][key], p3 = arr[Math.min(n, i + 2)][key];
    return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
  }
  /* loft through super-elliptic stations {x,y,w,h,zc?}; ne = exponent; flat = flat underside factor */
  function loft(st, rings, seg, ne, flat) {
    var pos = [], uv = [], idx = [];
    for (var r = 0; r <= rings; r++) {
      var t = r / rings, X = cr(st, 'x', t), Y = cr(st, 'y', t), Wd = Math.max(0.002, cr(st, 'w', t)), Hh = Math.max(0.002, cr(st, 'h', t)), Z = st[0].zc != null ? cr(st, 'zc', t) : 0;
      for (var k = 0; k <= seg; k++) {
        var a = k / seg * 2 * PI, c = Math.cos(a), s = Math.sin(a);
        var y = Y + Hh * Math.sign(s) * Math.pow(Math.abs(s), 2 / ne); if (flat && s < 0) y = Y - Hh * flat * Math.pow(Math.abs(s), 0.3);
        pos.push(X, y, Z + Wd * Math.sign(c) * Math.pow(Math.abs(c), 2 / ne)); uv.push(t, k / seg);
      }
    }
    for (var r2 = 0; r2 < rings; r2++) for (var k2 = 0; k2 < seg; k2++) { var a0 = r2 * (seg + 1) + k2, b0 = a0 + seg + 1; idx.push(a0, b0, a0 + 1, b0, b0 + 1, a0 + 1); }
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  /* wing element: cambered airfoil extruded along z, then bent (lift ends, sweep tips) */
  function wing(chord, thick, camber, span, lift, sweep, dip) {
    var sh = new THREE.Shape(), N = 20, top = [], bot = [];
    for (var i = 0; i <= N; i++) {
      var q = i / N, x = q * q, yt = 5 * thick * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1036 * x * x * x * x), yc = camber * 4 * x * (1 - x);
      top.push([-x * chord, yc + yt * chord]); bot.push([-x * chord, yc - yt * chord]);
    }
    sh.moveTo(top[0][0], top[0][1]); top.forEach(function (p) { sh.lineTo(p[0], p[1]); }); for (var j = N; j >= 0; j--) sh.lineTo(bot[j][0], bot[j][1]);
    var g = new THREE.ExtrudeGeometry(sh, { depth: span, bevelEnabled: false, steps: 40, curveSegments: 6 });
    g.translate(0, 0, -span / 2);
    var p = g.attributes.position;
    for (var k = 0; k < p.count; k++) {
      var z = p.getZ(k), u = Math.abs(z) / (span / 2);
      p.setY(k, p.getY(k) + lift * Math.pow(u, 3) - (dip || 0) * Math.max(0, 1 - u * 3.2));
      p.setX(k, p.getX(k) - sweep * u * u);
    }
    g.computeVertexNormals(); return g;
  }
  function wingL(chord, thick, span, lift, sweep, dip) {
    var st = [];
    for (var i = 0; i <= 16; i++) { var q = -1 + i / 8, a = Math.abs(q);
      st.push({ x: q * span / 2, y: lift * a * a * a - (dip || 0) * Math.max(0, 1 - a * 3.2), w: chord / 2, h: thick * chord / 2, zc: -chord / 2 - sweep * q * q }); }
    var g = loft(st, 64, 28, 2.2); g.rotateY(PI / 2); return g;
  }
  function plate(pts, depth, bev) {
    var sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
    var g = new THREE.ExtrudeGeometry(sh, { depth: depth, bevelEnabled: true, bevelThickness: bev || depth * 0.4, bevelSize: bev || depth * 0.4, bevelSegments: 2, curveSegments: 8 }); g.translate(0, 0, -depth / 2); return g;
  }
  function smoothPlate(pts, depth) { // spline outline
    var sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); sh.splineThru(pts.slice(1).map(function (p) { return new THREE.Vector2(p[0], p[1]); })); sh.closePath();
    var g = new THREE.ExtrudeGeometry(sh, { depth: depth, bevelEnabled: true, bevelThickness: depth * 0.35, bevelSize: depth * 0.35, bevelSegments: 2, curveSegments: 24 }); g.translate(0, 0, -depth / 2); return g;
  }
  function rod(a, b, r, mat, flat) {
    var d = new V3().subVectors(b, a), L = d.length(), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 10), mat);
    if (flat) m.scale.set(1, 1, 0.35);
    m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(new V3(0, 1, 0), d.clone().normalize()); m.castShadow = true; return m;
  }
  function decalPlane(texture, w, h) {
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshPhysicalMaterial({ map: texture, transparent: true, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false }));
  }

  /* ---------------- studio environment for reflections ---------------- */
  function showroomEnv(renderer) {
    var sc = new THREE.Scene();
    sc.add(new THREE.Mesh(new THREE.SphereGeometry(30, 32, 16), new THREE.MeshBasicMaterial({ color: 0x0c0907, side: THREE.BackSide })));
    function panel(w, h, x, y, z, rx, ry, col, k) { var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); sc.add(m); }
    panel(16, 1.6, 0, 9, 0, PI / 2, 0, 0xfff1de, 2.6);     // long overhead softbox
    panel(10, 1.0, 0, 9, 4, PI / 2, 0, 0xfff1de, 1.5);
    panel(10, 1.0, 0, 9, -4, PI / 2, 0, 0xfff1de, 1.5);
    panel(8, 4, -14, 3, 0, 0, PI / 2, 0xffb070, 0.55);       // warm wall
    panel(8, 4, 14, 3, 0, 0, -PI / 2, 0x9cb8ff, 0.55);      // cool wall
    panel(14, 2.5, 0, 2, -14, 0, 0, 0xffd9a8, 0.45);
    panel(30, 30, 0, -0.5, 0, PI / 2, 0, 0x2a1a10, 0.25);    // floor bounce
    var pm = new THREE.PMREMGenerator(renderer), t = pm.fromScene(sc, 0.02).texture; pm.dispose(); return t;
  }

  /* ---------------- the car ---------------- */
  function buildCar(M, T) {
    var car = new THREE.Group(), body = new THREE.Group(); car.add(body);
    var P = {};
    function add(g, m, parent) { var o = new THREE.Mesh(g, m); o.castShadow = true; o.receiveShadow = true; (parent || body).add(o); return o; }

    /* floor with edge wings, plank and diffuser */
    var fs = new THREE.Shape();
    [[2.2, 0], [1.6, 0.34], [1.15, 0.62], [0.75, 0.86], [-1.35, 0.86], [-1.9, 0.62], [-2.35, 0.5]].forEach(function (p, i) { if (!i) fs.moveTo(p[0], p[1]); else fs.lineTo(p[0], p[1]); });
    [[-2.35, -0.5], [-1.9, -0.62], [-1.35, -0.86], [0.75, -0.86], [1.15, -0.62], [1.6, -0.34], [2.2, 0]].forEach(function (p) { fs.lineTo(p[0], p[1]); });
    var floor = add(new THREE.ExtrudeGeometry(fs, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.01, bevelSegments: 2 }), M.wingC);
    floor.rotation.x = PI / 2; floor.position.y = 0.11;
    [-1, 1].forEach(function (sd) {
      
      var lip = add(smoothPlate([[0, 0], [1.9, 0], [1.7, 0.05], [0.2, 0.06]], 0.008), M.wingC); lip.position.set(-1.25, 0.122, sd * 0.865); lip.rotation.x = 0;
    });
    var dif = add(new THREE.BoxGeometry(0.55, 0.018, 1.0), M.wingC); dif.position.set(-2.55, 0.2, 0); dif.rotation.z = -0.32;
    for (var f = -2; f <= 2; f++) { var fin = add(new THREE.BoxGeometry(0.5, 0.17, 0.01), M.wingC); fin.position.set(-2.52, 0.2, f * 0.21); fin.rotation.z = -0.32; }
    var plank = add(new THREE.BoxGeometry(2.6, 0.012, 0.28), M.plank); plank.position.set(-0.3, 0.095, 0);

    /* survival cell + nose + engine cover (one loft with livery UVs) */
    var mono = [
      { x: 2.98, y: 0.205, w: 0.03, h: 0.022 }, { x: 2.78, y: 0.215, w: 0.075, h: 0.05 }, { x: 2.45, y: 0.24, w: 0.11, h: 0.075 },
      { x: 2.0, y: 0.285, w: 0.15, h: 0.1 }, { x: 1.5, y: 0.34, w: 0.19, h: 0.14 }, { x: 1.0, y: 0.4, w: 0.24, h: 0.19 },
      { x: 0.5, y: 0.44, w: 0.29, h: 0.22 }, { x: 0.0, y: 0.47, w: 0.3, h: 0.25 }, { x: -0.5, y: 0.47, w: 0.25, h: 0.27 },
      { x: -1.05, y: 0.44, w: 0.19, h: 0.23 }, { x: -1.6, y: 0.38, w: 0.13, h: 0.16 }, { x: -2.1, y: 0.33, w: 0.08, h: 0.1 }, { x: -2.45, y: 0.3, w: 0.045, h: 0.06 }
    ];
    var monoM = add(loft(mono, 140, 64, 2.4, 0.55), M.livery);
    /* sidepods with undercut + top ramp */
    [-1, 1].forEach(function (sd) {
      var sp = [
        { x: 0.92, y: 0.36, w: 0.16, h: 0.14, zc: sd * 0.52 }, { x: 0.75, y: 0.37, w: 0.22, h: 0.16, zc: sd * 0.55 }, { x: 0.35, y: 0.37, w: 0.25, h: 0.17, zc: sd * 0.56 },
        { x: -0.2, y: 0.35, w: 0.22, h: 0.16, zc: sd * 0.52 }, { x: -0.8, y: 0.31, w: 0.15, h: 0.12, zc: sd * 0.43 }, { x: -1.35, y: 0.27, w: 0.08, h: 0.08, zc: sd * 0.32 }, { x: -1.75, y: 0.25, w: 0.03, h: 0.04, zc: sd * 0.24 }
      ];
      var pod = add(loft(sp, 80, 40, 3.0, 0.15), M.podR);
      var inlet = add(new THREE.CircleGeometry(1, 40), M.inlet); inlet.scale.set(0.14, 0.075, 1); inlet.position.set(0.93, 0.385, sd * 0.55); inlet.rotation.y = PI / 2;
      // louvres
      for (var lv = 0; lv < 6; lv++) { var l = add(new THREE.BoxGeometry(0.05, 0.004, 0.16), M.inlet); l.position.set(-0.35 - lv * 0.085, 0.535 - lv * 0.012, sd * 0.42); l.rotation.x = sd * 0.42; }
      // mirror on carbon stalk
      body.add(rod(new V3(0.72, 0.6, sd * 0.24), new V3(0.66, 0.73, sd * 0.5), 0.012, M.carbon, true));
      var mh = add(smoothPlate([[0, 0], [0.1, 0], [0.095, 0.045], [0.01, 0.05]], 0.075), M.wingC); mh.position.set(0.61, 0.715, sd * 0.53);
      var mg = add(new THREE.PlaneGeometry(0.075, 0.035), M.mirror); mg.position.set(0.607, 0.74, sd * 0.53); mg.rotation.y = -PI / 2;
      // bargeboard / floor fence
      var bb = add(smoothPlate([[0, 0], [0.55, 0], [0.48, 0.16], [0.08, 0.2]], 0.008), M.carbon); bb.position.set(0.9, 0.12, sd * 0.7);
    });
    /* cockpit, driver, halo, airbox, fin */
    var cp = add(new THREE.CircleGeometry(1, 48), M.inlet); cp.scale.set(0.42, 0.2, 1); cp.rotation.x = -PI / 2; cp.position.set(0.48, 0.712, 0);
    var helmet = add(new THREE.SphereGeometry(0.12, 40, 24), M.helmet); helmet.position.set(0.22, 0.73, 0);
    var visor = add(new THREE.SphereGeometry(0.122, 40, 12, -0.62, 1.24, 1.12, 0.42), M.visor); visor.position.set(0.22, 0.73, 0);
    var hstripe = add(new THREE.TorusGeometry(0.121, 0.012, 8, 48, PI), M.paintBright); hstripe.position.set(0.22, 0.73, 0); hstripe.rotation.y = PI / 2;
    var hc = new THREE.CatmullRomCurve3([new V3(-0.12, 0.69, -0.27), new V3(0.2, 0.86, -0.28), new V3(0.58, 0.89, -0.16), new V3(0.7, 0.89, 0), new V3(0.58, 0.89, 0.16), new V3(0.2, 0.86, 0.28), new V3(-0.12, 0.69, 0.27)]);
    var halo = add(new THREE.TubeGeometry(hc, 80, 0.026, 14, false), M.halo); halo.scale.set(1, 1, 1);
    body.add(rod(new V3(0.7, 0.89, 0), new V3(0.95, 0.66, 0), 0.024, M.halo));
    // airbox / roll hoop
    var ab = add(loft([{ x: 0.05, y: 0.86, w: 0.09, h: 0.08 }, { x: -0.15, y: 0.88, w: 0.1, h: 0.1 }, { x: -0.5, y: 0.78, w: 0.12, h: 0.12 }, { x: -0.85, y: 0.66, w: 0.12, h: 0.1 }], 30, 32, 2.2), M.livery);
    var abIn = add(new THREE.CircleGeometry(1, 3), M.inlet); abIn.scale.set(0.085, 0.075, 1); abIn.position.set(0.051, 0.86, 0); abIn.rotation.y = PI / 2; abIn.rotation.z = PI / 2;
    var tcam = add(new THREE.BoxGeometry(0.1, 0.04, 0.06), M.paint); tcam.position.set(-0.05, 0.99, 0);
    add(new THREE.CylinderGeometry(0.004, 0.004, 0.22, 6), M.metal).position.set(1.3, 0.62, 0.08);
    var fin = add(smoothPlate([[0, 0], [-1.2, 0], [-1.25, 0.2], [-0.95, 0.24], [-0.2, 0.06]], 0.006), M.fin); fin.position.set(-0.75, 0.74, 0);
    var num = decalPlane(T.num, 0.24, 0.16); num.position.set(-1.45, 0.86, 0.008); body.add(num);
    var num2 = decalPlane(T.num, 0.24, 0.16); num2.position.set(-1.45, 0.86, -0.008); num2.rotation.y = PI; body.add(num2);

    /* livery decals: nose top + sidepods */
    var noseTxt = decalPlane(T.nose, 0.62, 0.16); noseTxt.rotation.x = -PI / 2; noseTxt.rotation.z = PI / 2; noseTxt.position.set(2.15, 0.392, 0); noseTxt.rotation.y = -0.12; body.add(noseTxt);
    var cockTxt = decalPlane(T.cock, 0.42, 0.13); cockTxt.rotation.x = -PI / 2; cockTxt.rotation.z = PI / 2; cockTxt.position.set(1.35, 0.485, 0); cockTxt.rotation.y = -0.1; body.add(cockTxt);
    [-1, 1].forEach(function (sd) {
      var d = decalPlane(T.pod, 0.82, 0.2); d.position.set(0.12, 0.43, sd * 0.814); d.rotation.y = sd > 0 ? 0.02 : PI - 0.02; d.rotation.x = sd * -0.08; body.add(d);
      var d2 = decalPlane(T.engine, 0.6, 0.13); d2.position.set(-0.85, 0.6, sd * 0.207); d2.rotation.y = sd > 0 ? 0.13 : PI - 0.13; body.add(d2);
    });

    /* front wing: 4 elements, spoon centre, swept tips, carbon endplates with lettering */
    var FW = new THREE.Group(); FW.position.set(3.08, 0.115, 0); body.add(FW); P.fw = FW; P.fwEl = [];
    [[0.46, 0.0, 0.0, 0.05, 0.03, 0.1, 0.03, M.wingC], [0.27, 0.055, -0.13, 0.17, 0.05, 0.15, 0.025, M.wingC], [0.21, 0.105, -0.26, 0.3, 0.07, 0.19, 0.015, M.wingC], [0.15, 0.15, -0.36, 0.44, 0.09, 0.22, 0.0, M.paint]].forEach(function (e, i) {
      var m = add(wingL(e[0], 0.11, 1.92, e[4], e[5], e[6]), e[7], FW); m.position.set(e[2], e[1], 0); m.rotation.z = -e[3]; P.fwEl.push(m);
    });
    var fwTxt = decalPlane(T.fw, 0.7, 0.09); fwTxt.rotation.x = -PI / 2; fwTxt.position.set(-0.17, 0.03, 0.55); FW.add(fwTxt);
    var fwTxt2 = decalPlane(T.fw, 0.7, 0.09); fwTxt2.rotation.x = -PI / 2; fwTxt2.position.set(-0.17, 0.03, -0.55); FW.add(fwTxt2);
    [-1, 1].forEach(function (sd) {
      var ep = add(smoothPlate([[0.08, -0.01], [-0.62, -0.01], [-0.66, 0.2], [-0.5, 0.34], [-0.2, 0.36], [0.02, 0.2]], 0.012), M.carbon, FW); ep.position.set(0, 0, sd * 0.965);
      var et = decalPlane(T.ep, 0.42, 0.2); et.position.set(-0.32, 0.17, sd * 0.975); et.rotation.y = sd > 0 ? 0 : PI; FW.add(et);
      for (var a = 0; a < 3; a++) FW.add(rod(new V3(-0.18 - a * 0.13, 0.06, sd * (0.4 + a * 0.15)), new V3(-0.18 - a * 0.13, 0.2, sd * (0.4 + a * 0.15)), 0.005, M.metal));
    });
    [-1, 1].forEach(function (sd) { body.add(rod(new V3(2.8, 0.2, sd * 0.05), new V3(2.95, 0.15, sd * 0.13), 0.012, M.carbon, true)); });

    /* rear wing: spoon main plane + DRS flap on a pivot, curved endplates, swan-neck pylon, beam wing */
    var RW = new THREE.Group(); RW.position.set(-2.62, 0.98, 0); body.add(RW); P.rw = RW;
    add(wingL(0.38, 0.14, 1.0, 0.05, 0.05, 0.025), M.wingC, RW);
    var fp = new THREE.Group(); fp.position.set(-0.37, 0.06, 0); RW.add(fp); P.flap = fp;
    add(wingL(0.24, 0.13, 0.98, 0.04, 0.03, 0), M.paint, fp);
    var rwT = decalPlane(T.rw, 0.8, 0.1); rwT.rotation.x = -PI / 2 + 0.06; rwT.position.set(-0.17, 0.047, 0); RW.add(rwT);
    [-1, 1].forEach(function (sd) {
      var ep = add(smoothPlate([[0.18, -0.48], [-0.6, -0.5], [-0.66, 0.06], [-0.48, 0.25], [0.02, 0.26], [0.2, 0.0]], 0.014), M.carbon, RW); ep.position.set(0, 0, sd * 0.51);
      var et = decalPlane(T.rwEp, 0.6, 0.28); et.position.set(-0.24, -0.2, sd * 0.522); et.rotation.y = sd > 0 ? 0 : PI; RW.add(et);
      var lip = add(new THREE.BoxGeometry(0.5, 0.025, 0.018), M.paintBright, RW); lip.position.set(-0.22, 0.24, sd * 0.515);
    });
    var sn = new THREE.CatmullRomCurve3([new V3(-2.28, 0.48, 0), new V3(-2.45, 0.8, 0), new V3(-2.62, 1.1, 0), new V3(-2.78, 1.09, 0)]);
    [-1, 1].forEach(function (sd) { var m = add(new THREE.TubeGeometry(sn, 30, 0.018, 8, false), M.carbon); m.position.z = sd * 0.06; });
    var beam = add(wingL(0.2, 0.14, 0.95, 0.03, 0.02, 0), M.wingC); beam.position.set(-2.42, 0.46, 0);
    var rain = add(new THREE.BoxGeometry(0.02, 0.05, 0.13), M.rain); rain.position.set(-2.46, 0.36, 0);
    var ex = add(new THREE.CylinderGeometry(0.05, 0.055, 0.16, 24, 1, true), M.metal); ex.rotation.z = PI / 2; ex.position.set(-2.45, 0.45, 0);
    var glow = add(new THREE.CircleGeometry(0.045, 24), M.glow); glow.rotation.y = -PI / 2; glow.position.set(-2.53, 0.45, 0);

    /* wheels: rounded tyre, sidewall lettering, carbon wheel cover, brake disc + caliper, suspension */
    function tyre(r, wd) {
      var g = new THREE.Group(), rr = 0.085, ri = r * 0.6, pts = [];
      pts.push(new THREE.Vector2(ri, -wd / 2 + 0.01));
      for (var i = 0; i <= 10; i++) { var a = -PI / 2 + i / 10 * PI / 2; pts.push(new THREE.Vector2(r - rr + Math.cos(a) * rr, -wd / 2 + rr + Math.sin(a) * rr)); }
      for (var j = 0; j <= 10; j++) { var b = j / 10 * PI / 2; pts.push(new THREE.Vector2(r - rr + Math.cos(b) * rr + 0.004 * Math.sin(j / 10 * PI), wd / 2 - rr + Math.sin(b) * rr)); }
      pts.push(new THREE.Vector2(ri, wd / 2 - 0.01));
      var t = new THREE.Mesh(new THREE.LatheGeometry(pts, 80), M.rubber); t.rotation.x = PI / 2; t.castShadow = true; g.add(t);
      [1, -1].forEach(function (sd) {
        var sw = new THREE.Mesh(new THREE.RingGeometry(ri * 1.02, r - 0.012, 96, 1), M.sidewall); sw.position.z = sd * (wd / 2 - 0.004); if (sd < 0) sw.rotation.y = PI; g.add(sw);
        var cov = new THREE.Mesh(new THREE.CircleGeometry(ri * 1.02, 64), M.cover); cov.position.z = sd * (wd / 2 - 0.03); if (sd < 0) cov.rotation.y = PI; g.add(cov);
        var rim = new THREE.Mesh(new THREE.RingGeometry(ri * 0.94, ri * 1.03, 64), M.coverRing); rim.position.z = sd * (wd / 2 - 0.028); if (sd < 0) rim.rotation.y = PI; g.add(rim);
        var nut = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 6), M.nut); nut.rotation.x = PI / 2; nut.position.z = sd * (wd / 2 - 0.015); g.add(nut);
      });
      var disc = new THREE.Mesh(new THREE.CylinderGeometry(ri * 0.8, ri * 0.8, 0.03, 48, 1, true), M.brake); disc.rotation.x = PI / 2; g.add(disc);
      var discF = new THREE.Mesh(new THREE.RingGeometry(ri * 0.3, ri * 0.8, 48), M.brake); g.add(discF);
      return g;
    }
    P.wheels = [];
    [[1.95, 0.36, 0.33, 0.8], [-1.85, 0.37, 0.42, 0.79]].forEach(function (w) {
      [-1, 1].forEach(function (sd) {
        var g = tyre(w[1], w[2]); g.position.set(w[0], w[1], sd * w[3]); car.add(g); P.wheels.push(g);
        var hub = w[1], zi = sd * (w[3] - 0.15);
        [[0.06, 0.32, 0.26], [-0.09, 0.19, 0.17]].forEach(function (o) {
          body.add(rod(new V3(w[0] + 0.3, hub + o[0], sd * 0.22), new V3(w[0], hub + o[0], zi), 0.016, M.carbon, true));
          body.add(rod(new V3(w[0] - 0.24, hub + o[0], sd * 0.22), new V3(w[0], hub + o[0], zi), 0.016, M.carbon, true));
        });
        body.add(rod(new V3(w[0] - 0.04, hub - 0.08, zi), new V3(w[0] - 0.14, 0.55, sd * 0.18), 0.013, M.carbon, true));
        var duct = add(smoothPlate([[0, 0], [0.3, 0], [0.26, 0.2], [0.04, 0.22]], 0.05), M.carbon); duct.position.set(w[0] - 0.15, hub - 0.12, sd * (w[3] - 0.2));
        var cal = add(new THREE.BoxGeometry(0.08, 0.12, 0.05), M.caliper); cal.position.set(w[0] + 0.12, hub + 0.12, sd * (w[3] - 0.17));
      });
    });
    /* exposed front coil-over (suspension setting visual) */
    P.springs = [];
    [-1, 1].forEach(function (sd) {
      var pts = []; for (var i = 0; i <= 160; i++) { var t = i / 160, a = t * 8 * 2 * PI; pts.push(new V3(Math.cos(a) * 0.034, t * 0.2, Math.sin(a) * 0.034)); }
      var sp = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 260, 0.0065, 6, false), M.spring);
      var hold = new THREE.Group(); hold.position.set(1.7, 0.42, sd * 0.36); hold.rotation.x = sd * 1.0; hold.add(sp); body.add(hold); P.springs.push(sp);
    });
    P.body = body; P.glow = glow;
    return { group: car, parts: P };
  }

  var TCOL = { S: ['#ff375f', 'SOFT'], M: ['#ffd60a', 'MEDIUM'], H: ['#f2f2f2', 'HARD'] };
  function kit(o) {
    o = o || {};
    var carbonC = carbonCanvas(), carbonT = tex(carbonC, 9, 9), carbonB = tex(carbonC, 9, 9, false);
    var podR = cvs(512, 256), podL = cvs(512, 256);
    var T = {
      num: tex(decal([{ t: o.num || '26', f: 'italic 900 150px "Segoe UI", Arial', y: 110, c: '#fff' }], 320, 220)),
      nose: tex(decal([{ t: 'CMP', f: 'italic 900 120px "Segoe UI", Arial', y: 80, sk: -0.2 }, { t: 'R & D', f: '700 44px "Segoe UI", Arial', y: 170 }], 620, 210)),
      cock: tex(decal([{ t: 'PLANAR', f: '900 82px "Segoe UI", Arial', y: 70 }, { t: 'SLURRY · PAD · AI', f: '600 34px "Segoe UI", Arial', y: 140 }], 520, 170)),
      pod: tex(decal([{ t: 'CMP GRAND PRIX', f: 'italic 900 110px "Segoe UI", Arial', y: 95, sk: -0.15 }, { t: 'WAFER · ENDPOINT · NANO', f: '700 40px "Segoe UI", Arial', y: 185, c: 'rgba(255,255,255,.75)' }], 1024, 240)),
      engine: tex(decal([{ t: 'DOE', f: 'italic 900 96px "Segoe UI", Arial', y: 66, c: '#ff2d4a', sk: -0.2 }], 460, 130)),
      fw: tex(decal([{ t: 'ENDPOINT', f: 'italic 900 90px "Segoe UI", Arial', y: 62, sk: -0.2 }], 700, 120)),
      ep: tex(decal([{ t: 'CMP', f: '900 150px "Segoe UI", Arial', y: 105 }, { t: 'RACING', f: '700 46px "Segoe UI", Arial', y: 200 }], 420, 240)),
      rw: tex(decal([{ t: 'CMP · AI · DOE', f: 'italic 900 80px "Segoe UI", Arial', y: 62, sk: -0.2 }], 900, 120)),
      rwEp: tex(decal([{ t: 'CMP', f: '900 170px "Segoe UI", Arial', y: 120 }, { t: 'PLANARIZATION', f: '700 48px "Segoe UI", Arial', y: 228 }], 640, 280))
    };
    var clear = { metalness: 0.12, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.75 };
    var liv = tex(liveryCanvas(carbonC, o.color)); liv.wrapS = liv.wrapT = THREE.ClampToEdgeWrapping; liv.flipY = false;
    var M = {
      livery: new THREE.MeshPhysicalMaterial(Object.assign({ map: liv, bumpMap: carbonB, bumpScale: 0.0006 }, clear)),
      podR: new THREE.MeshPhysicalMaterial({ map: carbonT, bumpMap: carbonB, bumpScale: 0.001, metalness: 0.2, roughness: 0.36, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.7 }),
      wingC: new THREE.MeshPhysicalMaterial({ color: 0x0f1013, metalness: 0.25, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.85 }),
      paint: new THREE.MeshPhysicalMaterial(Object.assign({ color: new THREE.Color(shade(o.color || '#c80f2e', 0.83)) }, clear)),
      paintBright: new THREE.MeshPhysicalMaterial(Object.assign({ color: new THREE.Color(shade(o.color || '#e0153a', 1.1)) }, clear)),
      carbon: new THREE.MeshPhysicalMaterial({ map: carbonT, bumpMap: carbonB, bumpScale: 0.0012, metalness: 0.25, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 0.9 }),
      fin: new THREE.MeshPhysicalMaterial({ map: carbonT, metalness: 0.3, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.06 }),
      plank: new THREE.MeshStandardMaterial({ color: 0x3a2716, roughness: 0.8 }),
      inlet: new THREE.MeshBasicMaterial({ color: 0x020203, side: THREE.DoubleSide }),
      halo: new THREE.MeshPhysicalMaterial({ map: carbonT, metalness: 0.35, roughness: 0.3, clearcoat: 1 }),
      helmet: new THREE.MeshPhysicalMaterial({ color: 0xf4f4f4, metalness: 0.1, roughness: 0.18, clearcoat: 1 }),
      visor: new THREE.MeshPhysicalMaterial({ color: 0x14244a, metalness: 0.95, roughness: 0.06 }),
      mirror: new THREE.MeshStandardMaterial({ color: 0xb8c8d8, metalness: 1, roughness: 0.04 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x9aa0aa, metalness: 0.95, roughness: 0.22 }),
      rubber: new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.72, metalness: 0, envMapIntensity: 0.35 }),
      sidewall: new THREE.MeshStandardMaterial({ map: tex(sidewallCanvas(TCOL[o.tire || 'M'][0], TCOL[o.tire || 'M'][1])), transparent: true, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
      cover: new THREE.MeshPhysicalMaterial({ map: carbonT, metalness: 0.3, roughness: 0.3, clearcoat: 1 }),
      coverRing: new THREE.MeshStandardMaterial({ color: new THREE.Color(o.color || '#c40d26'), metalness: 0.5, roughness: 0.3, side: THREE.DoubleSide }),
      nut: new THREE.MeshStandardMaterial({ color: 0xd0d4da, metalness: 0.9, roughness: 0.2 }),
      caliper: new THREE.MeshStandardMaterial({ color: new THREE.Color(o.color || '#c40d26'), metalness: 0.4, roughness: 0.35 }),
      brake: new THREE.MeshStandardMaterial({ color: 0x2b1d18, emissive: 0x000000, roughness: 0.55, metalness: 0.4, side: THREE.DoubleSide }),
      glow: new THREE.MeshBasicMaterial({ color: 0xff375f }),
      rain: new THREE.MeshBasicMaterial({ color: 0x551018 }),
      spring: new THREE.MeshStandardMaterial({ color: 0xff9f0a, roughness: 0.3, metalness: 0.7, emissive: 0x000000 })
    };
    return { M: M, T: T };
  }

  /* ---------------- scene ---------------- */
  function create(canvas, onFrame) {
    if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
    renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    var scene = new THREE.Scene(); scene.environment = showroomEnv(renderer);
    var cam = new THREE.PerspectiveCamera(24, 1, 0.1, 120);

    var KIT = kit(), M = KIT.M, T = KIT.T;
    var built = buildCar(M, T), car = built.group, P = built.parts; scene.add(car);
    if (window.__cardbg) window.__cardbg(M, P, scene, built);

    /* reflection: mirrored copy under a semi-transparent polished floor */
    var mirror = car.clone(true); mirror.scale.y = -1; mirror.traverse(function (o) { o.castShadow = false; }); scene.add(mirror);
    var woodT = tex(woodCanvas(), 3, 3);
    var floor = new THREE.Mesh(new THREE.CircleGeometry(14, 96), new THREE.MeshStandardMaterial({ map: woodT, color: 0x2b1d13, roughness: 0.42, metalness: 0, transparent: true, opacity: 0.9, envMapIntensity: 0.12 }));
    floor.rotation.x = -PI / 2; scene.add(floor);
    var shadowP = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ opacity: 0.6 })); shadowP.rotation.x = -PI / 2; shadowP.position.y = 0.002; shadowP.receiveShadow = true; scene.add(shadowP);
    var pool = new THREE.Mesh(new THREE.CircleGeometry(6, 64), new THREE.MeshBasicMaterial({ map: radialTex('rgba(255,214,170,0.10)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false })); pool.rotation.x = -PI / 2; pool.position.y = 0.004; scene.add(pool);
    var vign = new THREE.Mesh(new THREE.RingGeometry(6, 14, 64), new THREE.MeshBasicMaterial({ color: 0x050302, transparent: true, opacity: 0.92, depthWrite: false })); vign.rotation.x = -PI / 2; vign.position.y = 0.005; scene.add(vign);

    var key = new THREE.SpotLight(0xfff0dc, 3.2, 30, 0.55, 0.6, 1.2); key.position.set(2.5, 9, 3.5); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 6; key.shadow.bias = -0.0004; scene.add(key);
    var warm = new THREE.DirectionalLight(0xffb878, 0.9); warm.position.set(-7, 3, -2); scene.add(warm);
    var cool = new THREE.DirectionalLight(0x9fb8ff, 0.6); cool.position.set(7, 2.5, -5); scene.add(cool);
    scene.add(new THREE.HemisphereLight(0xffe6c8, 0x1a0f08, 0.35));

    /* orbit camera */
    var yaw = 0.62, pitch = 0.18, dist = 11, auto = true, drag = null, last = 0;
    canvas.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY, yaw: yaw, pitch: pitch }; auto = false; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', function (e) { if (!drag) return; yaw = drag.yaw - (e.clientX - drag.x) * 0.008; pitch = Math.max(0.03, Math.min(1.15, drag.pitch + (e.clientY - drag.y) * 0.006)); });
    canvas.addEventListener('pointerup', function () { drag = null; last = performance.now(); });
    canvas.addEventListener('wheel', function (e) { e.preventDefault(); dist = Math.max(6.5, Math.min(16, dist * (1 + e.deltaY * 0.001))); }, { passive: false });

    var S = { rw: 5, rwT: 5, eng: 3, engT: 3, susp: 5, suspT: 5, brk: 3, brkT: 3, tire: 'M' };
    var TC = { S: ['#ff375f', 'SOFT'], M: ['#ffd60a', 'MEDIUM'], H: ['#f2f2f2', 'HARD'] };
    function setParams(p) {
      S.rwT = p.rw; S.engT = p.eng; S.suspT = p.susp; S.brkT = p.brk || 3;
      if (p.tire !== S.tire) { S.tire = p.tire; var o = M.sidewall.map; M.sidewall.map = tex(sidewallCanvas(TC[p.tire][0], TC[p.tire][1])); M.sidewall.needsUpdate = true; if (o) o.dispose(); }
    }
    var anchors = { rw: new V3(-2.75, 1.22, 0), eng: new V3(-0.95, 0.8, 0), susp: new V3(1.72, 0.55, 0.38), brk: new V3(1.95, 0.36, 0.98), tire: new V3(-1.85, 0.74, 0.99) };
    function resize() { var r = canvas.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); cam.aspect = r.width / Math.max(1, r.height); cam.updateProjectionMatrix(); }
    window.addEventListener('resize', resize); resize();
    var t0 = performance.now(), running = true;
    /* adaptive quality for office laptops: watch the frame time and step down if the GPU struggles */
    var QA = { acc: 0, n: 0, level: 0, since: performance.now() };
    function quality(ms) {
      if (document.hidden || window.__cmpNoAdapt) return; QA.acc += ms; QA.n++;
      if (performance.now() - QA.since < 2500 || QA.n < 20) return;
      var avg = QA.acc / QA.n; QA.acc = 0; QA.n = 0; QA.since = performance.now();
      if (avg > 34 && QA.level < 3) {
        QA.level++;
        if (QA.level === 1) { renderer.setPixelRatio(Math.min(1.25, window.devicePixelRatio || 1)); resize(); }
        else if (QA.level === 2) { renderer.setPixelRatio(1); resize(); key.shadow.mapSize.set(512, 512); if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; } }
        else if (QA.level === 3) { mirror.visible = false; floor.material.opacity = 1; floor.material.transparent = false; floor.material.needsUpdate = true; }
      }
    }
    function frame(now) {
      if (!running) return;
      var rawMs = now - t0, dt = Math.min(0.05, rawMs / 1000); t0 = now; if (rawMs < 500) quality(rawMs);
      if (!auto && !drag && now - last > 4000) auto = true;
      if (auto) yaw += dt * 0.14;
      ['rw', 'eng', 'susp', 'brk'].forEach(function (k) { S[k] += (S[k + 'T'] - S[k]) * Math.min(1, dt * 6); });
      P.flap.rotation.z = 0.05 + (S.rw - 1) * 0.075; P.rw.rotation.z = 0.02 + (S.rw - 1) * 0.012;
      P.fwEl.forEach(function (m, i) { m.rotation.z = -[0.05, 0.17, 0.3, 0.44][i] - (S.rw - 1) * 0.016 * (i + 1); });
      P.body.position.y = 0.03 - (S.susp - 1) * 0.004;
      P.springs.forEach(function (sp) { sp.scale.set(1, 0.75 + (10 - S.susp) * 0.05, 1); });
      M.spring.emissive.setRGB((S.susp - 1) / 9 * 0.35, (S.susp - 1) / 9 * 0.15, 0);
      var e = (S.eng - 1) / 4, flick = 0.85 + 0.15 * Math.sin(now / 40);
      M.glow.color.setRGB((0.2 + 0.8 * e) * flick, (0.55 - 0.35 * e) * flick, (1 - 0.85 * e) * flick);
      var b = (S.brk - 1) / 4, pulse = 0.8 + 0.2 * Math.sin(now / 220);
      M.brake.emissive.setRGB((0.1 + 1.8 * b * b) * pulse, (0.02 + 0.5 * b * b * b) * pulse, 0.0);
      M.rain.color.setRGB(Math.sin(now / 160) > 0 ? 1 : 0.25, 0.04, 0.08);
      P.wheels.forEach(function (w) { w.rotation.z -= dt * (0.5 + e); });
      // keep the mirrored car in sync with the animated parts
      mirror.children[0].position.y = P.body.position.y;
      var dd = dist * Math.max(1, Math.min(1.6, 1.45 / cam.aspect));
      cam.position.set(Math.sin(yaw) * Math.cos(pitch) * dd, Math.sin(pitch) * dd + 0.5, Math.cos(yaw) * Math.cos(pitch) * dd);
      cam.lookAt(0.15, 0.42, 0);
      renderer.render(scene, cam);
      if (onFrame) {
        var r = canvas.getBoundingClientRect(), out = {}, flip = Math.cos(yaw) > 0 ? 1 : -1;
        Object.keys(anchors).forEach(function (k) { var v = anchors[k].clone(); if (v.z) v.z *= flip; v.project(cam); out[k] = { x: (v.x + 1) / 2 * r.width, y: (1 - v.y) / 2 * r.height }; });
        onFrame(out);
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    return {
      setView: function (y, p, d) { yaw = y; pitch = p; dist = d; auto = false; last = 1e12; },
      setParams: setParams, resize: resize,
      pause: function () { running = false; }, resume: function () { if (!running) { running = true; t0 = performance.now(); QA.since = t0; QA.acc = 0; QA.n = 0; requestAnimationFrame(frame); } },
      quality: function () { return QA.level; }
    };
  }

  /* ---------------- podium ceremony (3 cars) ---------------- */
  function podium(canvas, list, onFrame) {
    if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    var scene = new THREE.Scene(); scene.environment = showroomEnv(renderer);
    var cam = new THREE.PerspectiveCamera(28, 1, 0.1, 200);
    var SLOT = [{ x: 0, h: 1.5, rot: 0.2, glow: 0xffd60a, n: '1', rev: 3.2 }, { x: -5.3, h: 0.95, rot: 0.3, glow: 0xd8dde6, n: '2', rev: 1.6 }, { x: 5.3, h: 0.55, rot: -0.3, glow: 0xd08a4a, n: '3', rev: 0.6 }];
    var cars = [], anchors = [];
    function blockTex(n, col) {
      var c = cvs(512, 256), x = c.getContext('2d'); var g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, '#191b21'); g.addColorStop(1, '#0a0b0e'); x.fillStyle = g; x.fillRect(0, 0, 512, 256);
      x.fillStyle = col; x.fillRect(0, 0, 512, 10); x.font = '900 170px "Segoe UI", Arial'; x.textAlign = 'center'; x.fillStyle = col; x.globalAlpha = 0.95; x.fillText(n, 256, 200); return tex(c);
    }
    list.slice(0, 3).forEach(function (e, i) {
      var sl = SLOT[i], k = kit({ color: e.color, num: sl.n, tire: (e.params && e.params.tire) || 'M' });
      var b = buildCar(k.M, k.T), g = b.group, P = b.parts, pr = e.params || {};
      var rw = pr.rw || 5; P.flap.rotation.z = 0.05 + (rw - 1) * 0.075; P.rw.rotation.z = 0.02 + (rw - 1) * 0.012;
      P.fwEl.forEach(function (m, j) { m.rotation.z = -[0.05, 0.17, 0.3, 0.44][j] - (rw - 1) * 0.016 * (j + 1); });
      var be = ((pr.brk || 3) - 1) / 4; k.M.brake.emissive.setRGB(0.1 + 1.8 * be * be, 0.02 + 0.5 * be * be * be, 0);
      var ee = ((pr.eng || 3) - 1) / 4; k.M.glow.color.setRGB(0.2 + 0.8 * ee, 0.55 - 0.35 * ee, 1 - 0.85 * ee);
      var holder = new THREE.Group(); holder.add(g); g.position.x = -0.15; holder.rotation.y = -PI / 2 + sl.rot; holder.visible = false;
      holder.position.set(sl.x, sl.h, 0); scene.add(holder);
      var blk = new THREE.Mesh(new THREE.BoxGeometry(4.4, sl.h, 7.4), [
        new THREE.MeshStandardMaterial({ color: 0x101116, roughness: 0.35, metalness: 0.4 }), new THREE.MeshStandardMaterial({ color: 0x101116, roughness: 0.35, metalness: 0.4 }),
        new THREE.MeshPhysicalMaterial({ color: 0x15171d, roughness: 0.25, metalness: 0.3, clearcoat: 1 }), new THREE.MeshStandardMaterial({ color: 0x050506 }),
        (function () { var bt = blockTex(sl.n, '#' + sl.glow.toString(16).padStart(6, '0')); return new THREE.MeshStandardMaterial({ map: bt, emissiveMap: bt, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.4 }); })(), new THREE.MeshStandardMaterial({ color: 0x101116 })]);
      blk.position.set(sl.x, sl.h / 2, 0); blk.receiveShadow = true; scene.add(blk);
      [3.71, -3.71].forEach(function (zz) { var strip = new THREE.Mesh(new THREE.BoxGeometry(4.44, 0.035, 0.035), new THREE.MeshBasicMaterial({ color: sl.glow })); strip.position.set(sl.x, sl.h, zz); scene.add(strip); }); [2.21, -2.21].forEach(function (xx) { var st2 = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 7.44), new THREE.MeshBasicMaterial({ color: sl.glow })); st2.position.set(sl.x + xx, sl.h, 0); scene.add(st2); });
      var sp = new THREE.SpotLight(i === 0 ? 0xfff1d0 : 0xeef3ff, i === 0 ? 4.2 : 2.6, 30, 0.32, 0.55, 1.2); sp.position.set(sl.x * 0.6, 11, 6); sp.target = holder; sp.castShadow = i === 0; if (i === 0) { sp.shadow.mapSize.set(1024, 1024); sp.shadow.bias = -0.0004; } scene.add(sp);
      cars.push({ holder: holder, P: P, M: k.M, base: holder.rotation.y, i: i, sl: sl, sp: sp, spI: sp.intensity }); sp.intensity = 0.15;
      anchors.push(new V3(sl.x, sl.h + 2.3, 0));
    });
    (function () { var c = cvs(2048, 512), x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, '#05060a'); g.addColorStop(0.6, '#140d1c'); g.addColorStop(1, '#2a1208'); x.fillStyle = g; x.fillRect(0, 0, 2048, 512);
      for (var i = 0; i < 64; i++) { x.fillStyle = 'rgba(255,255,255,' + (0.025 + 0.03 * (i % 2)) + ')'; x.fillRect(i * 32, 0, 1, 512); }
      x.textAlign = 'center'; x.font = 'italic 900 132px "Segoe UI", Arial'; x.fillStyle = 'rgba(255,255,255,.055)'; x.fillText('CMP GRAND PRIX', 1024, 170);
      var wall = new THREE.Mesh(new THREE.CylinderGeometry(26, 26, 13, 96, 1, true, -1.15, 2.3), new THREE.MeshBasicMaterial({ map: (function () { var t = tex(c); t.repeat.x = -1; return t; })(), side: THREE.BackSide }));
      wall.rotation.y = PI; wall.position.set(0, 6.5, 6); scene.add(wall); })();
    var floor = new THREE.Mesh(new THREE.CircleGeometry(40, 96), new THREE.MeshStandardMaterial({ color: 0x0a0a0d, roughness: 0.3, metalness: 0.5, envMapIntensity: 0.25 }));
    floor.rotation.x = -PI / 2; floor.receiveShadow = true; scene.add(floor);
    var pool = new THREE.Mesh(new THREE.CircleGeometry(9, 64), new THREE.MeshBasicMaterial({ map: radialTex('rgba(255,214,120,0.16)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false })); pool.rotation.x = -PI / 2; pool.position.y = 0.01; scene.add(pool);
    scene.add(new THREE.HemisphereLight(0xfff0e0, 0x101018, 0.4));
    var warm = new THREE.DirectionalLight(0xffb878, 0.8); warm.position.set(-8, 4, 3); scene.add(warm);
    var cool = new THREE.DirectionalLight(0x9fb8ff, 0.7); cool.position.set(8, 3, -4); scene.add(cool);
    // floating gold particles
    var N = 260, pg = new THREE.BufferGeometry(), pos = new Float32Array(N * 3), vel = [];
    for (var q = 0; q < N; q++) { pos[q * 3] = (Math.random() - 0.5) * 18; pos[q * 3 + 1] = Math.random() * 9; pos[q * 3 + 2] = (Math.random() - 0.5) * 8; vel.push(0.2 + Math.random() * 0.5); }
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xffd98a, size: 0.06, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })); scene.add(pts);
    function resize() { var r = canvas.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); cam.aspect = r.width / Math.max(1, r.height); cam.updateProjectionMatrix(); }
    window.addEventListener('resize', resize); resize();
    var t0 = performance.now(), start = t0, running = true;
    function frame(now) {
      if (!running) return;
      var dt = Math.min(0.05, (now - t0) / 1000); t0 = now; var T = (now - start) / 1000;
      var intro = Math.min(1, T / 4), ease = 1 - Math.pow(1 - intro, 3);
      var fit = Math.max(1, 1.9 / cam.aspect);
      var r = (32 - 12 * ease) * fit, a = 0.5 * (1 - ease) + 0.1 * Math.sin(T * 0.15) * ease;
      cam.position.set(Math.sin(a) * r, 4.4 + 5 * (1 - ease) + 0.3 * Math.sin(T * 0.2), Math.cos(a) * r); cam.lookAt(0, 1.6, 0);
      cars.forEach(function (c) { var u = (T - c.sl.rev) / 0.75; c.holder.visible = u > 0; var d = u >= 1 ? 0 : u <= 0 ? 1 : Math.pow(1 - u, 3);
        c.holder.position.y = c.sl.h + d * 5 + (u > 1 && u < 1.6 ? Math.sin((u - 1) / 0.6 * PI) * 0.12 : 0);
        c.sp.intensity = c.spI * (u <= 0 ? 0.05 : Math.min(1, 0.05 + u));
        c.holder.rotation.y = c.base + Math.sin(T * 0.35 + c.i) * 0.06; c.P.wheels.forEach(function (w) { w.rotation.z -= dt * 0.3; }); c.M.rain.color.setRGB(Math.sin(now / 160) > 0 ? 1 : 0.25, 0.04, 0.08); });
      for (var q = 0; q < N; q++) { pos[q * 3 + 1] -= vel[q] * dt; pos[q * 3] += Math.sin(T + q) * dt * 0.1; if (pos[q * 3 + 1] < 0) pos[q * 3 + 1] = 9; } pg.attributes.position.needsUpdate = true;
      renderer.render(scene, cam);
      if (onFrame) { var rc = canvas.getBoundingClientRect(); onFrame(anchors.map(function (v) { var w = v.clone().project(cam); return { x: (w.x + 1) / 2 * rc.width, y: (1 - w.y) / 2 * rc.height }; }), T); }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    return { resize: resize, stop: function () { running = false; renderer.dispose(); try { renderer.forceContextLoss(); } catch (e) { } } };
  }
  return { create: create, podium: podium };
})();
