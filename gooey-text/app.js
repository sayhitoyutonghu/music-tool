/**
 * Gooey Liquid Text Tool
 *
 * EFFECT (matching reference):
 *   - Shapes (text + frame + blobs) are rendered in a solid COLOR
 *   - A BRIGHT INNER HIGHLIGHT (white/light) runs through the center of each shape
 *   - The highlight is blurry/soft, creating a 3D gel/tube look
 *   - Frame and text get the same treatment
 *
 * Technique:
 *   1. Draw all shapes (frame + text + blobs) white on offscreen → "rawAll"
 *   2. Blur rawAll → alpha contrast (normal threshold) → colorize → OUTER BODY
 *   3. Same blur → alpha contrast (higher threshold = narrower) → white → blur → INNER HIGHLIGHT
 *   4. Composite: bg → glow → solid frame → colored body → bright highlight
 */

const canvas = document.getElementById("patternCanvas");
const ctx = canvas.getContext("2d");
const controls = document.getElementById("controls");

const state = {
  canvasWidth: 1400,
  canvasHeight: 1400,

  // Text
  title: "UNTRANSLATED",
  fontSize: 184,
  letterSpacing: -20,
  lineHeight: 0.95,
  textYOffset: 600,
  maxWidthPct: 58,
  uppercase: true,
  bold: true,

  // Gooey effect
  gooeyBlur: 6,
  gooeyContrast: 5,
  glowRadius: 13,
  glowOpacity: 0.5,
  innerGlow: 0.24,

  // Expanded bg aura — wide soft halo sitting behind the text
  expandRadius: 45,
  expandOpacity: 0.4,
  expandColor: "#b9a0ff",

  // Frame
  showFrame: true,
  frameThickness: 12,
  framePadding: 60,
  frameRoundness: 4,
  showFrameBlobs: false,
  blobCount: 7,
  blobSize: 5,
  dripLength: 14,
  frameWaviness: 0,
  logoCornerSize: 275,

  // Style
  fgColor: "#e8e4c0",        // shape body / ink outline color
  innerColor: "#ffffff",      // inner highlight color (bright center glow)
  innerTightness: 0.78,       // how tight the highlight is (higher = narrower center glow)
  bgColor: "#5c5a32",
  bgOpacity: 1,
  grain: 0.12,

  // Internal
  backgroundImage: null,
  seed: Date.now(),
};

/* ── Utility ─────────────────────────────────────────────────── */

function rand(min = 0, max = 1) {
  state.seed = (state.seed * 1664525 + 1013904223) >>> 0;
  return min + (state.seed / 4294967296) * (max - min);
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function hexToRgb(hex) {
  const c = hex.replace("#", "");
  const f = c.length === 3 ? c.split("").map(x => x + x).join("") : c;
  return { r: parseInt(f.slice(0, 2), 16), g: parseInt(f.slice(2, 4), 16), b: parseInt(f.slice(4, 6), 16) };
}
function hexToRgba(hex, a = 1) { const { r, g, b } = hexToRgb(hex); return `rgba(${r},${g},${b},${clamp(a, 0, 1)})`; }
function hashString(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/* ── Inputs ──────────────────────────────────────────────────── */

const sliders = Array.from(document.querySelectorAll("input[type='range'][data-key]"));
const numberInputs = Array.from(document.querySelectorAll("input[type='number'][data-key]"));

function syncInputs() {
  [...sliders, ...numberInputs].forEach(el => { if (state[el.dataset.key] !== undefined) el.value = state[el.dataset.key]; });
  const m = {
    fontSizeValue: state.fontSize, letterSpacingValue: state.letterSpacing,
    lineHeightValue: state.lineHeight.toFixed(2), textYOffsetValue: state.textYOffset,
    maxWidthPctValue: state.maxWidthPct, gooeyBlurValue: state.gooeyBlur,
    gooeyContrastValue: state.gooeyContrast, glowRadiusValue: state.glowRadius,
    glowOpacityValue: state.glowOpacity.toFixed(2), innerGlowValue: state.innerGlow.toFixed(2),
    frameThicknessValue: state.frameThickness, framePaddingValue: state.framePadding,
    frameRoundnessValue: state.frameRoundness, blobCountValue: state.blobCount,
    blobSizeValue: state.blobSize, dripLengthValue: state.dripLength,
    frameWavinessValue: state.frameWaviness,
    logoCornerSizeValue: state.logoCornerSize,
    grainValue: state.grain.toFixed(2), bgOpacityValue: state.bgOpacity.toFixed(2),
    innerTightnessValue: state.innerTightness.toFixed(2),
    expandRadiusValue: state.expandRadius,
    expandOpacityValue: state.expandOpacity.toFixed(2),
  };
  for (const [id, val] of Object.entries(m)) { const el = document.getElementById(id); if (el) el.textContent = val; }
}

function resizeCanvas() { canvas.width = Math.round(state.canvasWidth); canvas.height = Math.round(state.canvasHeight); }

/* ── Text Layout ─────────────────────────────────────────────── */

function getFont() {
  return `${state.bold ? "900" : "700"} ${state.fontSize}px "Helvetica Neue","Arial Black",Helvetica,Arial,sans-serif`;
}

function wrapText(text) {
  const maxW = (state.canvasWidth * state.maxWidthPct) / 100;
  const words = text.split(/\s+/);
  const lines = []; let cur = "";
  ctx.font = getFont();
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

function measureBlock(lines) {
  ctx.font = getFont();
  let maxW = 0;
  for (const l of lines) { const w = ctx.measureText(l).width + state.letterSpacing * (l.length - 1); if (w > maxW) maxW = w; }
  return { width: maxW, height: lines.length * state.fontSize * state.lineHeight };
}

/* ── Drawing Helpers ─────────────────────────────────────────── */

function drawImageCover(img) {
  const ir = img.width / img.height, cr = canvas.width / canvas.height;
  let dw, dh, dx = 0, dy = 0;
  if (ir > cr) { dh = canvas.height; dw = dh * ir; dx = (canvas.width - dw) / 2; }
  else { dw = canvas.width; dh = dw / ir; dy = (canvas.height - dh) / 2; }
  ctx.drawImage(img, dx, dy, dw, dh);
}

function drawTextOn(c, lines, startY, W, r, g, b) {
  c.fillStyle = `rgb(${r},${g},${b})`;
  c.font = getFont();
  c.textAlign = "center";
  c.textBaseline = "middle";
  for (let i = 0; i < lines.length; i++) {
    const y = startY + i * state.fontSize * state.lineHeight;
    if (state.letterSpacing !== 0) {
      const chars = lines[i].split("");
      let tw = 0;
      const cw = chars.map(ch => { const w = c.measureText(ch).width; tw += w + state.letterSpacing; return w; });
      tw -= state.letterSpacing;
      let x = W / 2 - tw / 2;
      for (let j = 0; j < chars.length; j++) { c.fillText(chars[j], x + cw[j] / 2, y); x += cw[j] + state.letterSpacing; }
    } else {
      c.fillText(lines[i], W / 2, y);
    }
  }
}

function drawFrameBorder(c, W, H, r, g, b) {
  const pad = state.framePadding;
  const rnd = state.frameRoundness;
  const r0 = state.logoCornerSize || rnd;  // top-left (logo corner, can be large)
  const waveAmt = state.frameWaviness || 0;

  c.fillStyle = `rgb(${r},${g},${b})`;
  c.beginPath();
  // Outer rect (full canvas)
  c.moveTo(0, 0); c.lineTo(W, 0); c.lineTo(W, H); c.lineTo(0, H); c.closePath();

  const ix = pad, iy = pad, iw = W - pad * 2, ih = H - pad * 2;

  if (waveAmt <= 0) {
    // Clean inner rect — top-left corner gets logoCornerSize radius
    c.moveTo(ix + r0, iy);
    c.lineTo(ix + iw - rnd, iy);
    c.arcTo(ix + iw, iy, ix + iw, iy + rnd, rnd);
    c.lineTo(ix + iw, iy + ih - rnd);
    c.arcTo(ix + iw, iy + ih, ix + iw - rnd, iy + ih, rnd);
    c.lineTo(ix + rnd, iy + ih);
    c.arcTo(ix, iy + ih, ix, iy + ih - rnd, rnd);
    c.lineTo(ix, iy + r0);
    c.arcTo(ix, iy, ix + r0, iy, r0);
    c.closePath();
  } else {
    // Wavy inner edge — sample the rounded rect, then add wave perturbation
    const pts = sampleRoundedRect(ix, iy, iw, ih, r0, rnd, 120);
    const seed = hashString(state.title + "frame");
    const totalPts = pts.length;

    const wavyPts = pts.map((pt, i) => {
      const t = i / totalPts;

      // Reduce waviness near non-top-left corners (top-left keeps full wave)
      const cornerFade = pt.isArc && !pt.isTopLeft
        ? smoothstep(0, 0.3, Math.min(pt.arcT, 1 - pt.arcT))
        : 1.0;

      // Multi-frequency organic wave
      const s = seed;
      const wave = (
        Math.cos(t * Math.PI * 2 * 3 + s * 0.13) * 0.40 +
        Math.cos(t * Math.PI * 2 * 5 + s * 0.31) * 0.30 +
        Math.cos(t * Math.PI * 2 * 8 + s * 0.71) * 0.20 +
        Math.cos(t * Math.PI * 2 * 13 + s * 1.1) * 0.10
      ) * waveAmt * cornerFade;

      return { x: pt.x + pt.nx * wave, y: pt.y + pt.ny * wave };
    });

    // Smooth bezier curve through midpoints
    const first = wavyPts[0], last = wavyPts[wavyPts.length - 1];
    c.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);
    for (let i = 0; i < wavyPts.length; i++) {
      const curr = wavyPts[i];
      const next = wavyPts[(i + 1) % wavyPts.length];
      c.quadraticCurveTo(curr.x, curr.y, (curr.x + next.x) / 2, (curr.y + next.y) / 2);
    }
    c.closePath();
  }

  c.fill("evenodd");
}

/** Sample N points uniformly along a rounded rectangle with per-corner radii.
 *  Returns [{x, y, nx, ny, isArc, isTopLeft, arcT}] where nx,ny = inward normal. */
function sampleRoundedRect(ix, iy, iw, ih, rTL, rOther, numPts) {
  const r0 = Math.min(rTL, iw / 2, ih / 2);       // top-left
  const r1 = Math.min(rOther, iw / 2, ih / 2);     // top-right
  const r2 = Math.min(rOther, iw / 2, ih / 2);     // bottom-right
  const r3 = Math.min(rOther, iw / 2, ih / 2);     // bottom-left

  // Segments in drawing order (clockwise for inner cutout):
  // top-edge → TR-arc → right-edge → BR-arc → bottom-edge → BL-arc → left-edge → TL-arc
  const segments = [
    { type: 'line', x0: ix + r0, y0: iy, x1: ix + iw - r1, y1: iy, corner: null },
    { type: 'arc', cx: ix + iw - r1, cy: iy + r1, r: r1, a0: -Math.PI / 2, a1: 0, corner: 'TR' },
    { type: 'line', x0: ix + iw, y0: iy + r1, x1: ix + iw, y1: iy + ih - r2, corner: null },
    { type: 'arc', cx: ix + iw - r2, cy: iy + ih - r2, r: r2, a0: 0, a1: Math.PI / 2, corner: 'BR' },
    { type: 'line', x0: ix + iw - r2, y0: iy + ih, x1: ix + r3, y1: iy + ih, corner: null },
    { type: 'arc', cx: ix + r3, cy: iy + ih - r3, r: r3, a0: Math.PI / 2, a1: Math.PI, corner: 'BL' },
    { type: 'line', x0: ix, y0: iy + ih - r3, x1: ix, y1: iy + r0, corner: null },
    { type: 'arc', cx: ix + r0, cy: iy + r0, r: r0, a0: Math.PI, a1: 3 * Math.PI / 2, corner: 'TL' },
  ];

  // Compute segment lengths
  const lens = segments.map(seg =>
    seg.type === 'line'
      ? Math.hypot(seg.x1 - seg.x0, seg.y1 - seg.y0)
      : Math.max(seg.r, 0.1) * Math.abs(seg.a1 - seg.a0)
  );
  const totalLen = lens.reduce((a, b) => a + b, 0);

  const points = [];
  for (let i = 0; i < numPts; i++) {
    let d = (i / numPts) * totalLen;

    // Find which segment
    let si = 0;
    while (si < lens.length - 1 && d > lens[si]) { d -= lens[si]; si++; }

    const seg = segments[si];
    const segT = lens[si] > 0 ? d / lens[si] : 0;
    let x, y, nx, ny;

    if (seg.type === 'line') {
      x = seg.x0 + (seg.x1 - seg.x0) * segT;
      y = seg.y0 + (seg.y1 - seg.y0) * segT;
      const dx = seg.x1 - seg.x0, dy = seg.y1 - seg.y0;
      const len = Math.hypot(dx, dy) || 1;
      nx = -dy / len;  // inward normal (CCW perpendicular)
      ny = dx / len;
    } else {
      const angle = seg.a0 + (seg.a1 - seg.a0) * segT;
      x = seg.cx + seg.r * Math.cos(angle);
      y = seg.cy + seg.r * Math.sin(angle);
      nx = -Math.cos(angle);  // inward = toward arc center
      ny = -Math.sin(angle);
    }

    points.push({
      x, y, nx, ny,
      isArc: seg.type === 'arc',
      isTopLeft: seg.corner === 'TL',
      arcT: segT,
    });
  }
  return points;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/* ── Liquid Connector ────────────────────────────────────────── */

function drawLiquidConnector(c, x1, y1, x2, y2, size, r, g, b) {
  const dx = x2 - x1, dy = y2 - y1, dist = Math.hypot(dx, dy);
  if (dist < 1) return;
  const steps = Math.max(8, Math.floor(dist / 8));
  const nx = -dy / dist, ny = dx / dist;
  c.fillStyle = `rgb(${r},${g},${b})`;
  c.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, ease = Math.sin(t * Math.PI);
    const taper = 1 - Math.pow(Math.abs(t - 0.5) * 2, 1.5);
    const w = size * (0.2 + 0.8 * taper) * (0.5 + 0.5 * ease);
    const wb = Math.sin(t * 7 + rand(0, 3)) * size * 0.08;
    const px = x1 + dx * t + nx * (w + wb), py = y1 + dy * t + ny * (w + wb);
    i === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
  }
  for (let i = steps; i >= 0; i--) {
    const t = i / steps, ease = Math.sin(t * Math.PI);
    const taper = 1 - Math.pow(Math.abs(t - 0.5) * 2, 1.5);
    const w = size * (0.2 + 0.8 * taper) * (0.5 + 0.5 * ease);
    const wb = Math.sin(t * 7 + rand(0, 3) + 2) * size * 0.08;
    c.lineTo(x1 + dx * t - nx * (w + wb), y1 + dy * t - ny * (w + wb));
  }
  c.closePath(); c.fill();
  const bs = Math.max(2, Math.floor(dist / (size * 2.5)));
  for (let i = 0; i <= bs; i++) {
    const t = i / bs, br = size * rand(0.3, 0.7) * (1 - Math.pow(Math.abs(t - 0.5) * 2, 2));
    c.beginPath();
    c.arc(x1 + dx * t + nx * rand(-size * 0.3, size * 0.3), y1 + dy * t + ny * rand(-size * 0.3, size * 0.3), Math.max(2, br), 0, Math.PI * 2);
    c.fill();
  }
}

/* ── Drip ────────────────────────────────────────────────────── */

function drawDrip(c, x, y, angle, len, size, r, g, b) {
  if (len < 2) return;
  c.fillStyle = `rgb(${r},${g},${b})`;
  const ex = x + Math.cos(angle) * len, ey = y + Math.sin(angle) * len;
  const steps = Math.max(4, Math.floor(len / 6));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, rad = size * (1 - t * 0.7) * rand(0.7, 1.1);
    c.beginPath(); c.arc(x + (ex - x) * t, y + (ey - y) * t, Math.max(1.5, rad), 0, Math.PI * 2); c.fill();
  }
  c.beginPath(); c.arc(ex, ey, size * rand(0.5, 0.9), 0, Math.PI * 2); c.fill();
}

/* ── Canvas Processing ───────────────────────────────────────── */

function blurCanvas(src, amount) {
  const c = document.createElement("canvas");
  c.width = src.width; c.height = src.height;
  const cx = c.getContext("2d");
  cx.filter = `blur(${amount}px)`;
  cx.drawImage(src, 0, 0);
  return c;
}

function alphaContrast(src, contrast, r, g, b) {
  const c = document.createElement("canvas");
  c.width = src.width; c.height = src.height;
  const cx = c.getContext("2d");
  cx.drawImage(src, 0, 0);
  const id = cx.getImageData(0, 0, c.width, c.height);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i + 3] = clamp(Math.round((d[i + 3] - 128) * contrast + 128), 0, 255);
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  cx.putImageData(id, 0, 0);
  return c;
}

function colorize(src, r, g, b) {
  const c = document.createElement("canvas");
  c.width = src.width; c.height = src.height;
  const cx = c.getContext("2d");
  cx.drawImage(src, 0, 0);
  const id = cx.getImageData(0, 0, c.width, c.height);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) { d[i] = r; d[i + 1] = g; d[i + 2] = b; }
  cx.putImageData(id, 0, 0);
  return c;
}

function maskTo(content, mask) {
  const c = document.createElement("canvas");
  c.width = mask.width; c.height = mask.height;
  const cx = c.getContext("2d");
  cx.drawImage(mask, 0, 0);
  cx.globalCompositeOperation = "source-in";
  cx.drawImage(content, 0, 0);
  return c;
}

/* ── Alpha High-Cut (for narrow center highlight) ────────── */

/** Keep only pixels with alpha above `threshold` (0-255).
 *  Maps surviving alpha from [threshold..255] → [0..255].
 *  Used to extract the narrow center spine of blurred shapes. */
function alphaHighCut(src, threshold, r, g, b) {
  const c = document.createElement("canvas");
  c.width = src.width; c.height = src.height;
  const cx = c.getContext("2d");
  cx.drawImage(src, 0, 0);
  const id = cx.getImageData(0, 0, c.width, c.height);
  const d = id.data;
  const range = 255 - threshold || 1;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a < threshold) {
      d[i + 3] = 0;
    } else {
      d[i + 3] = Math.round(((a - threshold) / range) * 255);
    }
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  cx.putImageData(id, 0, 0);
  return c;
}

/* ── Film Grain ──────────────────────────────────────────────── */

function applyGrain(c, w, h, strength) {
  const id = c.getImageData(0, 0, w, h), d = id.data, amt = strength * 40;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amt;
    d[i] = clamp(d[i] + n, 0, 255); d[i + 1] = clamp(d[i + 1] + n, 0, 255); d[i + 2] = clamp(d[i + 2] + n, 0, 255);
  }
  c.putImageData(id, 0, 0);
}

/* ═══════════════════════════════════════════════════════════════
   MAIN DRAW
   
   Matching reference exactly:
   - DARK blurry text in center (readable but fuzzy)
   - LIGHT fluid outline ring around text (gooey organic edge)
   - LIGHT frame border connected via liquid bridges
   
   The outline = gooey shape (wider, due to heavy blur) minus dark text (narrower)
   ═══════════════════════════════════════════════════════════════ */

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  state.seed = hashString(state.title + state.fontSize + state.blobCount);

  // Audio modulation: temporarily boost parameters
  let _fw, _gb, _go, _gr, _ig, _it, _fs;
  if (isAudioActive) {
    const r = audioReactivity;
    _fw = state.frameWaviness; _gb = state.gooeyBlur; _go = state.glowOpacity;
    _gr = state.glowRadius; _ig = state.innerGlow; _it = state.innerTightness;
    _fs = state.fontSize;

    // Bass → frame waviness explosion + font size pulse + glow radius
    state.frameWaviness = Math.max(_fw, 5) * (1 + audioMod.bass * r * 4.0);
    state.glowRadius    = _gr * (1 + audioMod.bass * r * 2.0);
    state.fontSize      = Math.round(_fs * (1 + audioMod.bass * r * 0.06));

    // Mid → blur variation + highlight tightness loosens (wider highlight on beats)
    state.gooeyBlur       = _gb * (1 + audioMod.mid * r * 1.5);
    state.innerTightness  = Math.max(0.1, _it * (1 - audioMod.mid * r * 0.4));

    // Treble → glow opacity + highlight intensity flash
    state.glowOpacity   = Math.min(1, _go * (1 + audioMod.treble * r * 2.5));
    state.innerGlow     = Math.min(1, _ig + audioMod.treble * r * 0.6);

    // Organic seed shift
    state.seed += Math.floor(audioMod.bass * 2000 + audioMod.treble * 500);
  }

  const W = canvas.width, H = canvas.height;
  const text = state.uppercase ? state.title.toUpperCase() : state.title;
  if (!text.trim()) { ctx.fillStyle = hexToRgba(state.bgColor, state.bgOpacity); ctx.fillRect(0, 0, W, H); return; }

  const lines = wrapText(text);
  const block = measureBlock(lines);
  const outline = hexToRgb(state.fgColor);     // shape body color
  const startY = H / 2 - block.height / 2 + state.fontSize * state.lineHeight / 2 + state.textYOffset;

  /* ── A. rawAll: frame + text + blobs (WHITE, for gooey outline shape) ── */
  const rawAll = document.createElement("canvas");
  rawAll.width = W; rawAll.height = H;
  const rcAll = rawAll.getContext("2d");

  if (state.showFrame) drawFrameBorder(rcAll, W, H, 255, 255, 255);
  drawTextOn(rcAll, lines, startY, W, 255, 255, 255);

  if (state.showFrame && state.showFrameBlobs && state.blobCount > 0) {
    state.seed = hashString(state.title) >>> 0;
    const pad = state.framePadding, rnd = state.frameRoundness;
    const ix = pad, iy = pad, iw = W - pad * 2, ih = H - pad * 2;
    const tTop = startY - state.fontSize * state.lineHeight / 2;
    const tBot = startY + (lines.length - 1) * state.fontSize * state.lineHeight + state.fontSize * state.lineHeight / 2;
    const tLeft = W / 2 - block.width / 2, tRight = W / 2 + block.width / 2;

    for (let i = 0; i < state.blobCount; i++) {
      const side = Math.floor(rand(0, 4));
      let sx, sy, ex, ey;
      switch (side) {
        case 0: sx = rand(ix + rnd, ix + iw - rnd); sy = iy; ex = rand(tLeft, tRight); ey = tTop; break;
        case 1: sx = ix + iw; sy = rand(iy + rnd, iy + ih - rnd); ex = tRight; ey = rand(tTop, tBot); break;
        case 2: sx = rand(ix + rnd, ix + iw - rnd); sy = iy + ih; ex = rand(tLeft, tRight); ey = tBot; break;
        case 3: sx = ix; sy = rand(iy + rnd, iy + ih - rnd); ex = tLeft; ey = rand(tTop, tBot); break;
      }
      drawLiquidConnector(rcAll, sx, sy, ex, ey, state.blobSize, 255, 255, 255);
    }
    for (let i = 0, n = Math.floor(state.blobCount * 0.6); i < n; i++) {
      const side = Math.floor(rand(0, 4));
      let dx, dy, da;
      switch (side) {
        case 0: dx = rand(ix + rnd, ix + iw - rnd); dy = iy;    da =  Math.PI / 2; break;
        case 1: dx = ix + iw; dy = rand(iy + rnd, iy + ih - rnd); da =  Math.PI;    break;
        case 2: dx = rand(ix + rnd, ix + iw - rnd); dy = iy + ih; da = -Math.PI / 2; break;
        case 3: dx = ix;      dy = rand(iy + rnd, iy + ih - rnd); da = 0;            break;
      }
      drawDrip(rcAll, dx, dy, da, state.dripLength * rand(0.3, 1.2), state.blobSize * rand(0.3, 0.8), 255, 255, 255);
    }
    for (let i = 0, n = Math.floor(state.blobCount * 0.4); i < n; i++) {
      const side = Math.floor(rand(0, 4));
      let dx, dy, da;
      switch (side) {
        case 0: dx = rand(tLeft, tRight); dy = tTop;  da = -Math.PI / 2; break;
        case 1: dx = tRight;  dy = rand(tTop, tBot);  da = 0;            break;
        case 2: dx = rand(tLeft, tRight); dy = tBot;   da =  Math.PI / 2; break;
        case 3: dx = tLeft;   dy = rand(tTop, tBot);  da =  Math.PI;     break;
      }
      drawDrip(rcAll, dx, dy, da, state.dripLength * rand(0.2, 0.7), state.blobSize * rand(0.4, 1.0), 255, 255, 255);
    }
  }

  /* ── B. Gooey processing — 3-layer gel effect ── */
  const gooeyBlurred = blurCanvas(rawAll, state.gooeyBlur);

  // Layer 1 — INK OUTLINE (widest): dark colored edge, same as frame
  const bodyColor = hexToRgb(state.fgColor);
  const gooeyBody = alphaContrast(gooeyBlurred, state.gooeyContrast, bodyColor.r, bodyColor.g, bodyColor.b);

  // Layer 2 — INNER FILL (medium): lighter body color, narrower
  const hlColor = hexToRgb(state.innerColor);
  const fillR = Math.round(bodyColor.r * 0.25 + hlColor.r * 0.75);
  const fillG = Math.round(bodyColor.g * 0.25 + hlColor.g * 0.75);
  const fillB = Math.round(bodyColor.b * 0.25 + hlColor.b * 0.75);
  const fillThreshold = Math.round(128 + 54 * state.innerTightness); // fill from light blur
  const innerFill = alphaHighCut(gooeyBlurred, fillThreshold, fillR, fillG, fillB);
  const innerFillSoft = blurCanvas(innerFill, Math.max(1, state.gooeyBlur * 0.15));

  // Layer 3 — CENTER HIGHLIGHT (narrowest): bright white, thin spine down the
  // MIDDLE of each stroke. Extracted from a heavily-blurred source so even wide
  // strokes / the frame band collapse to a single peaked centerline (instead of
  // a flat plateau that would light up the whole edge).
  const spineBlur = blurCanvas(rawAll, Math.max(state.gooeyBlur * 2.5, 14));
  // Heavier blur lowers peak alpha, so use a gentler threshold (90–170) keyed to
  // tightness; higher tightness = narrower centered spine.
  const hlThreshold = Math.round(90 + 80 * state.innerTightness);
  const highlightCore = alphaHighCut(spineBlur, hlThreshold, hlColor.r, hlColor.g, hlColor.b);
  const highlightFinal = blurCanvas(highlightCore, Math.max(1, state.gooeyBlur * 0.28));

  /* ── C. Composite onto main canvas ── */

  // 1. Background
  if (state.backgroundImage) { drawImageCover(state.backgroundImage); }
  else { ctx.fillStyle = hexToRgba(state.bgColor, state.bgOpacity); ctx.fillRect(0, 0, W, H); }

  // 2. Expanded bg aura (wide soft colored halo, sits behind the glow)
  if (state.expandRadius > 0 && state.expandOpacity > 0) {
    const ec = hexToRgb(state.expandColor);
    const auraShape = alphaContrast(gooeyBlurred, state.gooeyContrast, ec.r, ec.g, ec.b);
    const aura = document.createElement("canvas");
    aura.width = W; aura.height = H;
    const ax = aura.getContext("2d");
    ax.filter = `blur(${state.expandRadius}px)`;
    ax.globalAlpha = state.expandOpacity;
    ax.drawImage(auraShape, 0, 0);
    ctx.drawImage(aura, 0, 0);
  }

  // 3. Outer glow (soft halo behind everything)
  if (state.glowRadius > 0 && state.glowOpacity > 0) {
    const gc = document.createElement("canvas");
    gc.width = W; gc.height = H;
    const gx = gc.getContext("2d");
    gx.filter = `blur(${state.glowRadius}px)`;
    gx.globalAlpha = state.glowOpacity;
    gx.drawImage(gooeyBody, 0, 0);
    ctx.drawImage(gc, 0, 0);
  }

  // 3. Solid frame (ink color, ensures outer edges fill to corners)
  if (state.showFrame) drawFrameBorder(ctx, W, H, bodyColor.r, bodyColor.g, bodyColor.b);

  // 4. Gooey ink outline (dark, widest — forms the visible colored edge)
  ctx.drawImage(gooeyBody, 0, 0);

  // 5. Inner fill (lighter, medium — sits inside ink outline)
  ctx.drawImage(innerFillSoft, 0, 0);

  // 6. Center highlight (bright white, narrowest — the gel shine)
  if (state.innerGlow > 0) {
    ctx.globalAlpha = state.innerGlow;
    ctx.drawImage(highlightFinal, 0, 0);
    ctx.globalAlpha = 1;
  }

  // 7. Grain
  if (state.grain > 0) applyGrain(ctx, W, H, state.grain);

  // Restore audio-modulated parameters
  if (isAudioActive) {
    state.frameWaviness = _fw; state.gooeyBlur = _gb;
    state.glowOpacity = _go; state.glowRadius = _gr;
    state.innerGlow = _ig; state.innerTightness = _it;
    state.fontSize = _fs;
  }
}

/* ── Download ────────────────────────────────────────────────── */

function downloadPng() {
  const a = document.createElement("a");
  a.download = `gooey-${state.title.replace(/\s+/g, "-").toLowerCase()}.png`;
  a.href = canvas.toDataURL("image/png");
  a.click();
}

/* ── Background Image ────────────────────────────────────────── */

function handleBgUpload(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => { state.backgroundImage = img; document.getElementById("bgFileName").textContent = file.name; document.getElementById("clearBg").disabled = false; draw(); };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function clearBg() {
  state.backgroundImage = null;
  document.getElementById("bgFileName").textContent = "No background image";
  document.getElementById("clearBg").disabled = true;
  document.getElementById("bgUpload").value = "";
  draw();
}

/* ── Controls ────────────────────────────────────────────────── */

function bindControls() {
  const intKeys = new Set(["fontSize","letterSpacing","textYOffset","maxWidthPct","gooeyContrast","glowRadius","framePadding","frameRoundness","blobCount","blobSize","dripLength","canvasWidth","canvasHeight","frameWaviness","logoCornerSize","expandRadius"]);

  [...sliders, ...numberInputs].forEach(el => {
    const key = el.dataset.key;
    el.addEventListener("input", () => {
      const v = intKeys.has(key) ? parseInt(el.value, 10) : parseFloat(el.value);
      state[key] = v;
      document.querySelectorAll(`input[data-key="${key}"]`).forEach(o => { if (o !== el) o.value = v; });
      syncInputs();
      if (key === "canvasWidth" || key === "canvasHeight") resizeCanvas();
      draw();
    });
  });

  document.getElementById("titleInput").addEventListener("input", e => { state.title = e.target.value; draw(); });
  document.getElementById("titleInput").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); draw(); } });
  document.getElementById("uppercaseToggle").addEventListener("change", e => { state.uppercase = e.target.checked; draw(); });
  document.getElementById("boldToggle").addEventListener("change", e => { state.bold = e.target.checked; draw(); });
  document.getElementById("frameToggle").addEventListener("change", e => { state.showFrame = e.target.checked; draw(); });
  document.getElementById("frameBlobsToggle").addEventListener("change", e => { state.showFrameBlobs = e.target.checked; draw(); });
  document.getElementById("fgColorInput").addEventListener("input", e => { state.fgColor = e.target.value; draw(); });
  document.getElementById("innerColorInput").addEventListener("input", e => { state.innerColor = e.target.value; draw(); });
  document.getElementById("expandColorInput").addEventListener("input", e => { state.expandColor = e.target.value; draw(); });
  document.getElementById("bgColorInput").addEventListener("input", e => { state.bgColor = e.target.value; draw(); });
  document.getElementById("bgOpacityInput").addEventListener("input", e => {
    state.bgOpacity = parseFloat(e.target.value);
    document.getElementById("bgOpacityValue").textContent = state.bgOpacity.toFixed(2);
    draw();
  });

  document.getElementById("canvasPresets").addEventListener("click", e => {
    const btn = e.target.closest("button[data-size]"); if (!btn) return;
    const p = { full: [innerWidth * 2, innerHeight * 2], "9x16": [1080, 1920], "4x5": [1080, 1350], "16x9": [1920, 1080] };
    [state.canvasWidth, state.canvasHeight] = p[btn.dataset.size];
    syncInputs(); resizeCanvas(); draw();
  });

  document.getElementById("generateButton").addEventListener("click", () => { state.seed = Date.now(); draw(); });
  document.getElementById("downloadButton").addEventListener("click", downloadPng);
  document.getElementById("bgUpload").addEventListener("change", handleBgUpload);
  document.getElementById("clearBg").addEventListener("click", clearBg);
  document.getElementById("mobileToggle").addEventListener("click", () => controls.classList.toggle("hideControls"));

  document.querySelectorAll("input[name='controlsPosition']").forEach(r => {
    r.addEventListener("change", () => {
      if (!r.checked) return;
      controls.className = r.value;
      document.querySelectorAll(".top-tabs label").forEach(l => l.classList.remove("selected"));
      r.closest("label").classList.add("selected");
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   AUDIO REACTIVITY — VARIABLES (must be before draw() is called)
   ═══════════════════════════════════════════════════════════════ */

let audioCtx = null;
let analyser = null;
let audioSource = null;
let audioElement = null;
let micStream = null;
let isAudioActive = false;
let animFrameId = null;
let audioReactivity = 0.5;
const audioMod = { bass: 0, mid: 0, treble: 0, overall: 0 };

/* ── Init ────────────────────────────────────────────────────── */

document.getElementById("uppercaseToggle").checked = state.uppercase;
document.getElementById("boldToggle").checked = state.bold;
document.getElementById("frameToggle").checked = state.showFrame;
document.getElementById("frameBlobsToggle").checked = state.showFrameBlobs;
document.getElementById("fgColorInput").value = state.fgColor;
document.getElementById("innerColorInput").value = state.innerColor;
document.getElementById("expandColorInput").value = state.expandColor;
document.getElementById("bgColorInput").value = state.bgColor;
document.getElementById("bgOpacityInput").value = state.bgOpacity;
document.getElementById("titleInput").value = state.title;
syncInputs(); resizeCanvas(); bindControls(); bindAudioControls(); draw();

/* ═══════════════════════════════════════════════════════════════
   AUDIO REACTIVITY — FUNCTIONS
   ═══════════════════════════════════════════════════════════════ */

function initAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (!analyser) {
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.82;
  }
}

function handleAudioFileUpload(e) {
  const file = e.target.files[0]; if (!file) return;
  stopAudio();
  initAudioContext();

  if (audioElement) { audioElement.pause(); audioElement.remove(); }
  audioElement = new Audio();
  audioElement.crossOrigin = 'anonymous';
  audioElement.src = URL.createObjectURL(file);
  audioElement.loop = true;

  const src = audioCtx.createMediaElementSource(audioElement);
  audioSource = src;
  src.connect(analyser);
  analyser.connect(audioCtx.destination);

  document.getElementById('audioFileName').textContent = file.name;
  document.getElementById('audioPlayControls').style.display = 'block';
  document.getElementById('audioPlayPause').textContent = '▶ Play';
}

function toggleMicrophone() {
  if (micStream) {
    stopAudio();
    document.getElementById('micToggle').textContent = '🎤 Use Microphone';
    return;
  }
  stopAudio();
  initAudioContext();

  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    micStream = stream;
    audioSource = audioCtx.createMediaStreamSource(stream);
    audioSource.connect(analyser);
    document.getElementById('micToggle').textContent = '⏹ Stop Microphone';
    startAudioLoop();
  }).catch(err => {
    console.error('Mic access denied:', err);
    alert('Microphone access denied. Please allow microphone access.');
  });
}

function togglePlayPause() {
  if (!audioElement) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();

  if (audioElement.paused) {
    audioElement.play();
    document.getElementById('audioPlayPause').textContent = '⏸ Pause';
    startAudioLoop();
  } else {
    audioElement.pause();
    document.getElementById('audioPlayPause').textContent = '▶ Play';
    stopAudioLoop();
  }
}

function stopAudio() {
  stopAudioLoop();
  if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  if (audioElement) { audioElement.pause(); }
  if (audioSource) {
    try { audioSource.disconnect(); } catch(e) {}
    audioSource = null;
  }
  resetAudioMod();
  draw();
}

function startAudioLoop() {
  isAudioActive = true;
  const data = new Uint8Array(analyser.frequencyBinCount);

  function loop() {
    if (!isAudioActive) return;
    analyser.getByteFrequencyData(data);

    const len = data.length;
    const bassEnd = Math.floor(len * 0.08);
    const midEnd  = Math.floor(len * 0.35);
    let bS = 0, mS = 0, tS = 0;
    for (let i = 0; i < bassEnd; i++) bS += data[i];
    for (let i = bassEnd; i < midEnd; i++) mS += data[i];
    for (let i = midEnd; i < len; i++) tS += data[i];

    audioMod.bass    = bS / (bassEnd * 255) || 0;
    audioMod.mid     = mS / ((midEnd - bassEnd) * 255) || 0;
    audioMod.treble  = tS / ((len - midEnd) * 255) || 0;
    audioMod.overall = (bS + mS + tS) / (len * 255) || 0;

    // Update level bars
    updateAudioUI();
    draw();
    animFrameId = requestAnimationFrame(loop);
  }
  loop();
}

function stopAudioLoop() {
  isAudioActive = false;
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
  resetAudioMod();
  updateAudioUI();
}

function resetAudioMod() {
  audioMod.bass = 0; audioMod.mid = 0; audioMod.treble = 0; audioMod.overall = 0;
}

function updateAudioUI() {
  const bp = Math.round(audioMod.bass * 100);
  const mp = Math.round(audioMod.mid * 100);
  const tp = Math.round(audioMod.treble * 100);
  document.getElementById('audioBassValue').textContent = bp;
  document.getElementById('audioMidValue').textContent = mp;
  document.getElementById('audioTrebleValue').textContent = tp;
  document.getElementById('audioBassBar').style.width = bp + '%';
  document.getElementById('audioMidBar').style.width = mp + '%';
  document.getElementById('audioTrebleBar').style.width = tp + '%';
}

function bindAudioControls() {
  document.getElementById('audioUploadBtn').addEventListener('click', () => {
    document.getElementById('audioUpload').click();
  });
  document.getElementById('audioUpload').addEventListener('change', handleAudioFileUpload);
  document.getElementById('micToggle').addEventListener('click', toggleMicrophone);
  document.getElementById('audioPlayPause').addEventListener('click', togglePlayPause);
  document.getElementById('audioReactivitySlider').addEventListener('input', e => {
    audioReactivity = parseInt(e.target.value, 10) / 100;
    document.getElementById('audioReactivityValue').textContent = e.target.value;
  });
}
