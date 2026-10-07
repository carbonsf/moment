// One shared WebGL context renders every <canvas data-gl="name"> on the board, then blits to each canvas's 2D context.
// Attributes: data-gl (shader), data-l (level 0..1), data-p / data-q (vec4), data-k ("x,y,r;x,y,r" up to 8), data-o (breath offset s), data-s (time speed)
(() => {
  if (window.MomentGL) return;
  const HDR = `precision highp float;
uniform vec2 R;uniform float T,B,L,N;uniform vec4 P,Q;uniform vec3 K[8];
const vec3 BG=vec3(.071,.078,.094),TEAL=vec3(.549,.765,.8),SAND=vec3(.824,.725,.561),INK=vec3(.914,.902,.875);
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float ns(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+1.),f.x),f.y);}
float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*ns(p);p=mat2(1.6,1.2,-1.2,1.6)*p;a*=.5;}return s;}
uniform sampler2D HT;uniform float HS;
float hh(float x){return (texture2D(HT,vec2(clamp(x,0.,1.)*.984+.008,.5)).r*2.-1.)*.08*HS;}
`;
  const VS = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
  const SH = {};
  window.MomentGL = { add: (n, s) => { SH[n] = s; } };
  let gl, cv, last = 0;
  const progs = {};
  const MAX = 900;

  function init() {
    cv = document.createElement('canvas');
    cv.width = MAX; cv.height = MAX;
    gl = cv.getContext('webgl', { preserveDrawingBuffer: true, antialias: false, alpha: false });
    if (!gl) return;
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 64, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, new Uint8Array(64).fill(128));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  let tex;
  function prog(n) {
    if (n in progs) return progs[n];
    if (!SH[n]) return null;
    const mk = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(n + ': ' + gl.getShaderInfoLog(s));
      return s;
    };
    try {
      const p = gl.createProgram();
      gl.attachShader(p, mk(gl.VERTEX_SHADER, VS));
      gl.attachShader(p, mk(gl.FRAGMENT_SHADER, HDR + SH[n]));
      gl.linkProgram(p);
      const loc = gl.getAttribLocation(p, 'a');
      const u = {};
      ['R', 'T', 'B', 'L', 'N', 'P', 'Q', 'K', 'HT', 'HS'].forEach((k) => { u[k] = gl.getUniformLocation(p, k === 'K' ? 'K[0]' : k); });
      progs[n] = { p, loc, u };
    } catch (e) { console.warn(e.message); progs[n] = null; }
    return progs[n];
  }
  const breath = (t) => { const p = ((t % 10) + 10) % 10; const x = p < 4 ? p / 4 : 1 - (p - 4) / 6; return 0.5 - 0.5 * Math.cos(Math.PI * x); };
  const v4 = (s) => { const a = (s || '').split(',').map(Number); while (a.length < 4) a.push(0); return a.slice(0, 4); };
  const balls = (s) => {
    const out = new Float32Array(24); let n = 0;
    (s || '').split(';').filter(Boolean).slice(0, 8).forEach((b, i) => { const v = b.split(',').map(Number); out[i * 3] = v[0]; out[i * 3 + 1] = v[1]; out[i * 3 + 2] = v[2]; n++; });
    return [out, n];
  };

  function drawWave(el, t, B, w, h, sc) {
    const c = el.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, w, h);
    c.setTransform(sc, 0, 0, sc, 0, 0);
    const W = w / sc, H = h / sc;
    const amp = H * (0.12 + 0.28 * B), base = H * 0.92, ph = (t / 10) * Math.PI * 0.5;
    c.beginPath(); c.moveTo(0, H);
    for (let x = 0; x <= W; x += 4) c.lineTo(x, base - amp * (0.6 + 0.4 * Math.sin((x / W) * Math.PI * 2 + ph)));
    c.lineTo(W, H); c.closePath(); c.fillStyle = 'rgba(140,195,204,0.14)'; c.fill();
    if (!el.dataset.pts) return;
    const pL = 28, pR = 12, pT = 14, pB = 14, pw = W - pL - pR, phh = H - pT - pB;
    const X = (x) => pL + x * pw, Y = (v) => pT + (1 - v / 10) * phh;
    c.font = '11px system-ui,-apple-system,sans-serif'; c.textBaseline = 'middle'; c.textAlign = 'right'; c.lineWidth = 1;
    for (const g of [0, 5, 10]) {
      c.strokeStyle = '#2e3540'; c.globalAlpha = 0.6; c.beginPath(); c.moveTo(pL, Math.round(Y(g)) + 0.5); c.lineTo(W - pR, Math.round(Y(g)) + 0.5); c.stroke();
      c.globalAlpha = 1; c.fillStyle = '#8a9099'; c.fillText(String(g), pL - 8, Y(g));
    }
    const now = +(el.dataset.now || 0.8);
    c.strokeStyle = '#b3b8bf'; c.globalAlpha = 0.5; c.beginPath(); c.moveTo(X(now), pT); c.lineTo(X(now), pT + phh); c.stroke(); c.globalAlpha = 1;
    const pts = el.dataset.pts.split(';').map((s) => s.split(',').map(Number)).map(([x, v]) => ({ x: X(x), y: Y(v) }));
    c.strokeStyle = '#8cc3cc'; c.lineWidth = 2.5; c.lineJoin = c.lineCap = 'round'; c.beginPath(); c.moveTo(pts[0].x, pts[0].y);
    for (let i = 0; i < pts.length - 1; i++) { const dx = (pts[i + 1].x - pts[i].x) / 3; c.bezierCurveTo(pts[i].x + dx, pts[i].y, pts[i + 1].x - dx, pts[i + 1].y, pts[i + 1].x, pts[i + 1].y); }
    c.stroke();
    pts.forEach((p) => { c.fillStyle = '#e9e6df'; c.beginPath(); c.arc(p.x, p.y, 5, 0, 7); c.fill(); c.strokeStyle = '#121418'; c.lineWidth = 1.5; c.stroke(); });
  }

  function frame(ts) {
    const all = document.querySelectorAll('canvas[data-gl]');
    if (ts - last < (all.length <= 2 ? 12 : 30)) return;
    last = ts;
    const t = ts / 1000;
    document.querySelectorAll('canvas[data-gl]').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      if (el.dataset.drawn && (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth)) return;
      el.dataset.drawn = '1';
      const cw = el.offsetWidth, ch = el.offsetHeight;
      const sc = Math.min(1, Math.max(0.3, (r.width / cw) * (window.devicePixelRatio || 1) * 0.7));
      const w = Math.min(MAX, Math.round(cw * sc)), h = Math.min(MAX, Math.round(ch * sc));
      if (el.width !== w || el.height !== h) { el.width = w; el.height = h; }
      const ds = el.dataset;
      const tt = t * +(ds.s || 1) + +(ds.o || 0) * 3;
      const B = breath(t + +(ds.o || 0));
      if (ds.gl === 'wave') { drawWave(el, t, B, w, h, w / cw); return; }
      if (!gl) return;
      const pr = prog(ds.gl);
      if (!pr) return;
      gl.useProgram(pr.p);
      gl.enableVertexAttribArray(pr.loc);
      gl.vertexAttribPointer(pr.loc, 2, gl.FLOAT, false, 0, 0);
      gl.viewport(0, 0, w, h);
      const u = pr.u;
      gl.uniform2f(u.R, w, h); gl.uniform1f(u.T, tt); gl.uniform1f(u.B, B); gl.uniform1f(u.L, +(ds.l || 0));
      gl.uniform4fv(u.P, v4(ds.p)); gl.uniform4fv(u.Q, v4(ds.q));
      const [k, n] = balls(ds.k);
      if (u.K) gl.uniform3fv(u.K, k);
      gl.uniform1f(u.N, n);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      if (el._h) gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 64, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, el._h);
      if (u.HT) gl.uniform1i(u.HT, 0);
      gl.uniform1f(u.HS, el._h ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      el.getContext('2d').drawImage(cv, 0, MAX - h, w, h, 0, 0, w, h);
    });
  }
  init();
  const loop = () => { frame(performance.now()); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  setInterval(() => { const n = performance.now(); if (n - last > 200) frame(n); }, 250);
})();
