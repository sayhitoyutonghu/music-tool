const canvas = document.getElementById("patternCanvas");
const ctx = canvas.getContext("2d");
const controls = document.getElementById("controls");
const marker = document.getElementById("textAreaMarker");
const logoMarker = document.getElementById("logoPlaceholderMarker");

const DEFAULT_CANVAS_PADDING = 0;

const state = {
  canvasWidth: 1400,
  canvasHeight: 1400,
  canvasPadding: DEFAULT_CANVAS_PADDING,
  textAreaW: 38,
  textAreaH: 56,
  logoX: 50,
  logoY: 22,
  logoW: 26,
  logoH: 18,
  logoOpacity: 1,
  density: 0.28,
  straightLines: 0.2,
  flourishes: 0.42,
  blankAreas: 0.08,
  lineThickness: 8,
  widthVariation: 0.42,
  taperStrength: 0.58,
  curveSmoothness: 0.7,
  circleGuideDensity: 0.52,
  circleGuideInfluence: 0.68,
  circleMinRadius: 2.4,
  circleMaxRadius: 9.5,
  noOverlapGap: 18,
  mirrorMode: "horizontal",
  startFromBottom: true,
  useCircleScaffold: true,
  showGuides: false,
  textSeedValue: "untranslated",
  subtitleValue: "",
  useTextSeed: true,
  showTextReference: false,
  textAsStroke: true,
  textColor: "#ffffff",
  scriptStrokeInfluence: 0.78,
  crayonEffect: false,
  crayonStrength: 0.45,
  fxWaxTexture: true,
  fxWaxStrength: 0.52,
  fxEdgeLightShadow: true,
  fxEdgeStrength: 0.48,
  fxBubbleBlur: true,
  fxBubbleStrength: 0.04,
  fxBubbleBlurDensity: 1,
  fxBubbleOutlinePx: 1,
  fxBubbleGrain: 0,
  fxBubbleGlowColor: "#8f8796",
  fxGlassPolish: true,
  fxGlassOpacity: 0.42,
  fxGlassShine: 0.58,
  fxEmbossDepth: false,
  fxEmbossStrength: 0.34,
  fxHalftoneNoise: false,
  fxHalftoneMix: 0.38,
  visibleTime: 1.3,
  speed: 0.012,
  colorChoice: "white outlines",
  bgColor: "#f8f8f6",
  bgAlpha: 1,
  strokeColor: "#050505",
  strokeAlpha: 1,
  outlineStroke: false,
  outlineColor: "#f8f8f6",
  outlineAlpha: 1,
  backgroundImage: null,
  logoImage: null,
  animate: false,
  paths: [],
  blankZones: [],
  guideCircles: [],
  guideLinks: [],
  progress: 1,
  hold: 0,
  lastFrame: performance.now(),
  audioLevel: 0,
  audioBassLevel: 0,
  audioMidLevel: 0,
  audioTrebleLevel: 0,
  audioBeat: 0,
  audioTransient: 0,
  audioAverage: 0.04,
  audioMotionPhase: 0,
  seed: Date.now(),
};

let audioContext;
let analyser;
let audioSource;
let audioSourceElement;
let audioElement;
let audioObjectUrl;
let oscillator;
let gainNode;
let demoPlaying = false;
let backgroundImageUrl;
let logoImageUrl;
let halftoneNoiseCache = { key: "", canvas: null };

// Decorative font for text-pattern mode — loaded async, falls back to Georgia
let _patternFontFamily = 'Georgia, "Times New Roman", serif';
(function preloadPatternFont() {
  if (typeof FontFace === "undefined") return;
  try {
    const ff = new FontFace("Superfluous01", "url('/assets/Superfluous01.woff2')");
    ff.load().then((loaded) => {
      document.fonts.add(loaded);
      _patternFontFamily = "Superfluous01, Georgia, serif";
    }).catch(() => {});
  } catch (e) {}
})();

const colorModes = {
  black: { bg: "#f8f8f6", bgAlpha: 1, stroke: "#050505", strokeAlpha: 1, outline: false },
  "black outlines": { bg: "#f8f8f6", bgAlpha: 1, stroke: "#050505", strokeAlpha: 1, outline: true },
  white: { bg: "#050505", bgAlpha: 1, stroke: "#ffffff", strokeAlpha: 1, outline: false },
  "white outlines": { bg: "#050505", bgAlpha: 1, stroke: "#ffffff", strokeAlpha: 1, outline: true },
};

const sliders = Array.from(document.querySelectorAll("input[type='range'][data-key]"));
const numberInputs = Array.from(document.querySelectorAll("input[type='number'][data-key]"));

function rand(min = 0, max = 1) {
  state.seed = (state.seed * 1664525 + 1013904223) >>> 0;
  return min + (state.seed / 4294967296) * (max - min);
}

function chance(value) {
  return rand() < value;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function stableNoise(value) {
  const raw = Math.sin(value * 12.9898) * 43758.5453;
  return raw - Math.floor(raw);
}

function hashTextToSeed(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function textSeedFactors(rawText) {
  const text = rawText.trim().toLowerCase();
  if (!text) {
    return {
      active: false,
      label: "Text seed inactive",
      seed: Date.now() >>> 0,
      density: 0,
      straight: 0,
      flourishes: 0,
      smoothness: 0,
      guideDensity: 0,
      guideInfluence: 0,
    };
  }

  const seed = hashTextToSeed(text);
  const len = text.length;
  const uniqueCount = new Set(text).size;
  const vowelCount = (text.match(/[aeiou]/g) || []).length;
  const uniqueRatio = uniqueCount / Math.max(1, len);
  const vowelRatio = vowelCount / Math.max(1, len);

  const byte0 = seed & 255;
  const byte1 = (seed >>> 8) & 255;
  const byte2 = (seed >>> 16) & 255;
  const byte3 = (seed >>> 24) & 255;
  const centered = (b) => b / 255 - 0.5;

  return {
    active: true,
    label: `Seed #${seed.toString(16).padStart(8, "0")}`,
    seed,
    density: centered(byte0) * 0.22 + Math.min(12, len) * 0.005,
    straight: centered(byte1) * 0.16,
    flourishes: centered(byte2) * 0.2 + uniqueRatio * 0.06,
    smoothness: centered(byte3) * 0.12 + vowelRatio * 0.08,
    guideDensity: centered((byte0 + byte2) & 255) * 0.16 + uniqueRatio * 0.08,
    guideInfluence: centered((byte1 + byte3) & 255) * 0.2 + vowelRatio * 0.1,
  };
}

function updateTextSeedMeta(text) {
  const meta = document.getElementById("textSeedMeta");
  if (!state.useTextSeed || !text.trim()) {
    meta.textContent = "Text seed inactive";
    return;
  }
  const factors = textSeedFactors(text);
  meta.textContent = factors.label;
}

function isAudioPlaying() {
  return demoPlaying || Boolean(audioElement && !audioElement.paused);
}

function isAudioMotionActive() {
  return isAudioPlaying() || state.audioLevel > 0.003 || state.audioBeat > 0.003;
}

function audioMotion() {
  if (!isAudioMotionActive()) {
    return { active: false, energy: 0, bass: 0, mid: 0, treble: 0, beat: 0, transient: 0, phase: state.audioMotionPhase };
  }
  return {
    active: true,
    energy: clamp(state.audioLevel, 0, 1),
    bass: clamp(state.audioBassLevel, 0, 1),
    mid: clamp(state.audioMidLevel, 0, 1),
    treble: clamp(state.audioTrebleLevel, 0, 1),
    beat: clamp(state.audioBeat, 0, 1),
    transient: clamp(state.audioTransient, 0, 1),
    phase: state.audioMotionPhase,
  };
}

function blendAngle(from, to, amount) {
  const diff = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + diff * clamp(amount, 0, 1);
}

function hexToRgba(hex, alpha = 1) {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => `${c}${c}`).join("") : clean;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => `${c}${c}`).join("") : clean;
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

function mixRgb(colorA, colorB, amount) {
  const a = hexToRgb(colorA);
  const b = hexToRgb(colorB);
  const t = clamp(amount, 0, 1);
  return {
    r: Math.round(a.r * (1 - t) + b.r * t),
    g: Math.round(a.g * (1 - t) + b.g * t),
    b: Math.round(a.b * (1 - t) + b.b * t),
  };
}

function rgbToRgba(color, alpha = 1) {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${clamp(alpha, 0, 1)})`;
}

function colorToRgba(color, alpha = 1) {
  return typeof color === "string" ? hexToRgba(color, alpha) : rgbToRgba(color, alpha);
}

function applyColorPreset(modeKey) {
  const preset = colorModes[modeKey] || colorModes.black;
  state.bgColor = preset.bg;
  state.bgAlpha = preset.bgAlpha;
  state.strokeColor = preset.stroke;
  state.strokeAlpha = preset.strokeAlpha;
  state.outlineStroke = preset.outline;
  state.outlineColor = preset.bg;
  state.outlineAlpha = preset.bgAlpha;

  document.getElementById("bgColorInput").value = state.bgColor;
  document.getElementById("bgAlphaInput").value = state.bgAlpha;
  document.getElementById("strokeColorInput").value = state.strokeColor;
  document.getElementById("strokeAlphaInput").value = state.strokeAlpha;
  document.getElementById("outlineToggle").checked = state.outlineStroke;
  document.getElementById("outlineColorInput").value = state.outlineColor;
  document.getElementById("outlineAlphaInput").value = state.outlineAlpha;
  document.getElementById("fxPatternColorInput").value = state.strokeColor;
  document.getElementById("bgAlphaValue").textContent = state.bgAlpha.toFixed(2);
  document.getElementById("strokeAlphaValue").textContent = state.strokeAlpha.toFixed(2);
  document.getElementById("outlineAlphaValue").textContent = state.outlineAlpha.toFixed(2);
}

function drawImageCover(image) {
  const imageRatio = image.width / image.height;
  const canvasRatio = canvas.width / canvas.height;
  let drawWidth;
  let drawHeight;
  let drawX = 0;
  let drawY = 0;

  if (imageRatio > canvasRatio) {
    drawHeight = canvas.height;
    drawWidth = drawHeight * imageRatio;
    drawX = (canvas.width - drawWidth) / 2;
  } else {
    drawWidth = canvas.width;
    drawHeight = drawWidth / imageRatio;
    drawY = (canvas.height - drawHeight) / 2;
  }
  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

function drawLogoImage() {
  if (!state.logoImage) return;
  const rect = getLogoRect();
  const imageRatio = state.logoImage.width / state.logoImage.height;
  const rectRatio = rect.w / rect.h;
  let drawW;
  let drawH;
  let drawX = rect.x;
  let drawY = rect.y;

  if (imageRatio > rectRatio) {
    drawW = rect.w;
    drawH = drawW / imageRatio;
    drawY = rect.y + (rect.h - drawH) / 2;
  } else {
    drawH = rect.h;
    drawW = drawH * imageRatio;
    drawX = rect.x + (rect.w - drawW) / 2;
  }

  ctx.save();
  ctx.globalAlpha = clamp(state.logoOpacity, 0, 1);
  ctx.drawImage(state.logoImage, drawX, drawY, drawW, drawH);
  ctx.restore();
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function findNearestGuideCircle(x, y, maxDistance) {
  if (!state.guideCircles.length) return null;
  let nearest = null;
  let best = Infinity;
  for (const circle of state.guideCircles) {
    const centerDist = Math.hypot(x - circle.x, y - circle.y);
    if (centerDist > circle.r + maxDistance) continue;
    const edgeDist = Math.abs(centerDist - circle.r);
    if (edgeDist < best) {
      best = edgeDist;
      nearest = { circle, centerDist, edgeDist };
    }
  }
  return nearest;
}

function syncInputs() {
  [...sliders, ...numberInputs].forEach((input) => {
    const key = input.dataset.key;
    input.value = state[key];
  });
  document.getElementById("textAreaWValue").textContent = `${Math.round(state.textAreaW)}%`;
  document.getElementById("textAreaHValue").textContent = `${Math.round(state.textAreaH)}%`;
}

function setCanvasFillAlpha(value) {
  state.bgAlpha = clamp(value, 0, 1);
  document.getElementById("bgAlphaInput").value = state.bgAlpha;
  document.getElementById("bgAlphaValue").textContent = state.bgAlpha.toFixed(2);
}

function resizeCanvas() {
  canvas.width = Math.round(state.canvasWidth);
  canvas.height = Math.round(state.canvasHeight);
  updateMarker(true);
  updateLogoMarker(true);
}

function getPatternPaddingPx() {
  const minSide = Math.min(state.canvasWidth, state.canvasHeight);
  return (minSide * clamp(state.canvasPadding, 0, 24)) / 100;
}

function getVisualBleedAllowancePx() {
  const bubbleAllowance = state.fxBubbleBlur ? 46 + state.fxBubbleStrength * 28 + state.fxBubbleOutlinePx : 0;
  return state.lineThickness * 2.2 + bubbleAllowance;
}

function getPatternSafeMarginPx() {
  const minSide = Math.min(state.canvasWidth, state.canvasHeight);
  return clamp(getPatternPaddingPx() + getVisualBleedAllowancePx(), minSide * 0.035, minSide * 0.34);
}

function getTextRect(pad = 0) {
  const w = (state.canvasWidth * state.textAreaW) / 100;
  const h = (state.canvasHeight * state.textAreaH) / 100;
  return {
    x: state.canvasWidth / 2 - w / 2 - pad,
    y: state.canvasHeight / 2 - h / 2 - pad,
    w: w + pad * 2,
    h: h + pad * 2,
  };
}

function getLogoRect() {
  const w = (state.canvasWidth * state.logoW) / 100;
  const h = (state.canvasHeight * state.logoH) / 100;
  const cx = (state.canvasWidth * state.logoX) / 100;
  const cy = (state.canvasHeight * state.logoY) / 100;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

function pointInTextRect(x, y, pad = 0) {
  const rect = getTextRect(pad);
  return x > rect.x && x < rect.x + rect.w && y > rect.y && y < rect.y + rect.h;
}

function pointInLogoRect(x, y, pad = 0) {
  if (!state.logoImage) return false;
  const rect = getLogoRect();
  return x > rect.x - pad && x < rect.x + rect.w + pad && y > rect.y - pad && y < rect.y + rect.h + pad;
}

function pointInBlankZone(x, y) {
  return state.blankZones.some((zone) => {
    const dx = (x - zone.x) / zone.rx;
    const dy = (y - zone.y) / zone.ry;
    return dx * dx + dy * dy < 1;
  });
}

function pointBlocked(x, y, pad = 0) {
  return pointInTextRect(x, y, pad) || pointInLogoRect(x, y, pad) || pointInBlankZone(x, y);
}

function segmentHitsBlocked(a, b, pad = 0, samples = 10) {
  for (let i = 1; i < samples; i += 1) {
    const t = i / samples;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    if (pointBlocked(x, y, pad)) return true;
  }
  return false;
}

function pushAwayFromCenter(point, amount) {
  const cx = state.canvasWidth / 2;
  const cy = state.canvasHeight / 2;
  const angle = Math.atan2(point.y - cy, point.x - cx);
  point.x += Math.cos(angle) * amount;
  point.y += Math.sin(angle) * amount;
}

function createBlankZones() {
  state.blankZones = [];
  const count = Math.floor(state.blankAreas * 8);
  const minSide = Math.min(state.canvasWidth, state.canvasHeight);
  for (let i = 0; i < count; i += 1) {
    const zone = {
      x: rand(state.canvasWidth * 0.12, state.canvasWidth * 0.88),
      y: rand(state.canvasHeight * 0.12, state.canvasHeight * 0.88),
      rx: rand(minSide * 0.035, minSide * 0.12),
      ry: rand(minSide * 0.035, minSide * 0.12),
    };
    if (!pointInTextRect(zone.x, zone.y, minSide * 0.05)) {
      state.blankZones.push(zone);
    }
  }
}

function createCircleGuides(options = {}) {
  state.guideCircles = [];
  state.guideLinks = [];
  if (!state.useCircleScaffold) return;

  const minSide = Math.min(state.canvasWidth, state.canvasHeight);
  const safeMargin = getPatternSafeMarginPx();
  const density = clamp(options.circleGuideDensity ?? state.circleGuideDensity, 0.1, 1);
  const totalCount = Math.floor(18 + density * 66);
  const baseCount = state.mirrorMode === "none" ? totalCount : Math.ceil(totalCount / 2);
  const maxAttempts = baseCount * 22;
  const minR = minSide * clamp(state.circleMinRadius, 1, 12) / 100;
  const maxR = minSide * Math.max(clamp(state.circleMaxRadius, 2, 18), state.circleMinRadius + 0.5) / 100;
  const baseCircles = [];

  for (let i = 0; i < maxAttempts && baseCircles.length < baseCount; i += 1) {
    const r = rand(minR, maxR);
    const edge = Math.min(minSide * 0.42, safeMargin + r);
    let xMin = edge;
    let xMax = state.canvasWidth - edge;
    let yMin = edge;
    let yMax = state.canvasHeight - edge;

    if (state.mirrorMode === "horizontal") {
      xMax = Math.max(xMin, state.canvasWidth / 2 - minSide * 0.025 - r * 0.3);
    } else if (state.mirrorMode === "vertical") {
      if (state.startFromBottom) {
        yMin = Math.min(yMax, state.canvasHeight / 2 + minSide * 0.025 + r * 0.3);
      } else {
        yMax = Math.max(yMin, state.canvasHeight / 2 - minSide * 0.025 - r * 0.3);
      }
    }

    const x = rand(xMin, xMax);
    const yBase = state.startFromBottom ? Math.pow(rand(), 2.15) : rand();
    let y = clamp((1 - yBase * 0.96) * state.canvasHeight, yMin, yMax);
    if (state.mirrorMode === "vertical" && !state.startFromBottom) y = rand(yMin, yMax);
    const candidate = { x, y, r };
    if (pointInTextRect(x, y, r * 1.35) || pointInLogoRect(x, y, r * 1.1) || pointInBlankZone(x, y)) continue;

    let collide = false;
    for (const c of baseCircles) {
      if (Math.hypot(x - c.x, y - c.y) < r + c.r + minSide * 0.008) {
        collide = true;
        break;
      }
    }
    if (collide) continue;
    baseCircles.push(candidate);
  }

  const addCircle = (circle) => {
    if (
      circle.x < circle.r ||
      circle.x > state.canvasWidth - circle.r ||
      circle.y < circle.r ||
      circle.y > state.canvasHeight - circle.r ||
      pointBlocked(circle.x, circle.y, circle.r * 1.15)
    ) {
      return;
    }
    state.guideCircles.push(circle);
  };

  for (const circle of baseCircles) {
    addCircle(circle);
    if (state.mirrorMode === "horizontal") {
      addCircle({ ...circle, x: state.canvasWidth - circle.x, mirrorOf: circle });
    } else if (state.mirrorMode === "vertical") {
      addCircle({ ...circle, y: state.canvasHeight - circle.y, mirrorOf: circle });
    }
  }

  buildGuideLinks();
}

function buildGuideLinks() {
  state.guideLinks = [];
  if (!state.guideCircles.length) return;

  const minSide = Math.min(state.canvasWidth, state.canvasHeight);
  const maxLinkDistance = minSide * 0.32;
  const seen = new Set();
  for (let i = 0; i < state.guideCircles.length; i += 1) {
    const circle = state.guideCircles[i];
    const neighbors = state.guideCircles
      .map((other, index) => ({ other, index, d: Math.hypot(circle.x - other.x, circle.y - other.y) }))
      .filter(({ index, d }) => index !== i && d < maxLinkDistance)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3);

    for (const { other, index } of neighbors) {
      const key = i < index ? `${i}-${index}` : `${index}-${i}`;
      if (seen.has(key)) continue;
      if (segmentHitsBlocked(circle, other, Math.max(circle.r, other.r) * 0.35, 8)) continue;
      seen.add(key);
      state.guideLinks.push({ a: circle, b: other });
    }
  }
}

function createSeedPoint(signX, signY, margin, gapPad) {
  const cx = state.canvasWidth / 2;
  const cy = state.canvasHeight / 2;
  const rect = getTextRect(gapPad);
  const minX = signX < 0 ? margin : cx + rect.w / 2 + rand(0, margin);
  const maxX = signX < 0 ? cx - rect.w / 2 - rand(0, margin) : state.canvasWidth - margin;
  const minY = state.startFromBottom ? state.canvasHeight * 0.72 : signY < 0 ? margin : cy + rect.h / 2 + rand(0, margin);
  const maxY = state.startFromBottom ? state.canvasHeight - margin : signY < 0 ? cy - rect.h / 2 - rand(0, margin) : state.canvasHeight - margin;

  let x = rand(Math.min(minX, maxX), Math.max(minX, maxX));
  let y = rand(Math.min(minY, maxY), Math.max(minY, maxY));

  if (state.useCircleScaffold && state.guideCircles.length && chance(0.78)) {
    const pool = state.startFromBottom
      ? state.guideCircles.filter((c) => c.y > state.canvasHeight * 0.42)
      : state.guideCircles;
    const source = pool.length ? pool : state.guideCircles;
    const circle = source[Math.floor(rand(0, source.length))];
    const perimeterAngle = state.startFromBottom
      ? -Math.PI / 2 + rand(-1.2, 1.2)
      : rand(-Math.PI, Math.PI);
    x = circle.x + Math.cos(perimeterAngle) * circle.r * rand(0.85, 1.12);
    y = circle.y + Math.sin(perimeterAngle) * circle.r * rand(0.85, 1.12);
  }

  if (pointBlocked(x, y, gapPad)) {
    x = clamp(cx + signX * rand(gapPad + 20, state.canvasWidth * 0.42), margin, state.canvasWidth - margin);
    y = state.startFromBottom
      ? rand(Math.min(state.canvasHeight - margin, state.canvasHeight * 0.74), state.canvasHeight - margin)
      : clamp(cy + signY * rand(gapPad + 20, state.canvasHeight * 0.42), margin, state.canvasHeight - margin);
  }
  return { x: clamp(x, margin, state.canvasWidth - margin), y: clamp(y, margin, state.canvasHeight - margin) };
}

function circleAllowedForSign(circle, signX, signY) {
  if (state.mirrorMode === "horizontal") {
    return signX < 0 ? circle.x <= state.canvasWidth / 2 : circle.x >= state.canvasWidth / 2;
  }
  if (state.mirrorMode === "vertical") {
    return signY > 0 ? circle.y >= state.canvasHeight / 2 : circle.y <= state.canvasHeight / 2;
  }
  return true;
}

function chooseCircleChain(signX, signY, desiredLength) {
  if (!state.useCircleScaffold || state.guideCircles.length < 2) return [];
  const minSide = Math.min(state.canvasWidth, state.canvasHeight);
  const pool = state.guideCircles.filter((circle) => (
    circleAllowedForSign(circle, signX, signY) &&
    !pointBlocked(circle.x, circle.y, circle.r * 1.1)
  ));
  if (pool.length < 2) return [];

  const edgeBias = state.startFromBottom
    ? (circle) => state.canvasHeight - circle.y
    : (circle) => Math.abs(circle.y - state.canvasHeight / 2);
  const starters = [...pool].sort((a, b) => edgeBias(a) - edgeBias(b));
  const start = starters[Math.floor(rand(0, Math.min(starters.length, 8)))];
  const chain = [start];
  const used = new Set([start]);
  const targetDistance = minSide * rand(0.12, 0.24);

  while (chain.length < desiredLength) {
    const current = chain[chain.length - 1];
    const candidates = pool
      .filter((circle) => !used.has(circle) && !segmentHitsBlocked(current, circle, Math.max(current.r, circle.r) * 0.28, 8))
      .map((circle) => {
        const d = Math.hypot(circle.x - current.x, circle.y - current.y);
        const yDirectionPenalty = state.startFromBottom
          ? Math.max(0, circle.y - current.y + minSide * 0.02) * 1.8
          : 0;
        const centerPenalty = pointInTextRect(
          (circle.x + current.x) / 2,
          (circle.y + current.y) / 2,
          minSide * 0.035,
        ) ? minSide * 2 : 0;
        const distancePenalty = Math.abs(d - targetDistance) * 0.34;
        return {
          circle,
          score: d + yDirectionPenalty + centerPenalty + distancePenalty + rand(0, minSide * 0.05),
        };
      })
      .sort((a, b) => a.score - b.score);

    if (!candidates.length) break;
    const next = candidates[0].circle;
    chain.push(next);
    used.add(next);
  }

  return chain.length >= 2 ? chain : [];
}

function directedAngleDelta(from, to, direction) {
  let diff = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  if (direction > 0 && diff < 0) diff += Math.PI * 2;
  if (direction < 0 && diff > 0) diff -= Math.PI * 2;
  const magnitude = clamp(Math.abs(diff), 0.72, 2.85);
  return magnitude * direction;
}

function pushPointIfClear(points, point, pad) {
  if (pointBlocked(point.x, point.y, pad)) return;
  const previous = points[points.length - 1];
  if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 2) return;
  points.push(point);
}

function createCircleScaffoldPath(signX, signY, options = {}) {
  const minSide = Math.min(state.canvasWidth, state.canvasHeight);
  const guideInfluence = state.useCircleScaffold ? clamp(options.circleGuideInfluence ?? state.circleGuideInfluence, 0, 1) : 0;
  if (guideInfluence < 0.08 || state.guideCircles.length < 2) return null;

  const smoothness = clamp(options.curveSmoothness ?? state.curveSmoothness, 0, 1);
  const chainLength = Math.floor(rand(2.8, 5.8 + guideInfluence * 2.2));
  const chain = chooseCircleChain(signX, signY, chainLength);
  if (chain.length < 2) return null;

  const points = [];
  const orbitDirection = state.mirrorMode === "horizontal"
    ? (signX < 0 ? -1 : 1)
    : (chance(0.5) ? -1 : 1);
  const gapPad = minSide * 0.018;

  for (let i = 0; i < chain.length; i += 1) {
    const circle = chain[i];
    const previous = chain[i - 1];
    const next = chain[i + 1];
    const incomingAngle = previous
      ? Math.atan2(previous.y - circle.y, previous.x - circle.x)
      : state.startFromBottom
        ? Math.PI / 2 + rand(-0.55, 0.55)
        : rand(-Math.PI, Math.PI);
    const outgoingAngle = next
      ? Math.atan2(next.y - circle.y, next.x - circle.x)
      : incomingAngle + orbitDirection * rand(1.0, 2.2);
    const arcStart = incomingAngle + orbitDirection * rand(0.32, 0.9);
    const arcEnd = outgoingAngle - orbitDirection * rand(0.22, 0.82);
    const delta = directedAngleDelta(arcStart, arcEnd, orbitDirection);
    const arcSteps = Math.floor(rand(6, 12) + (circle.r / minSide) * 42);

    for (let step = 0; step < arcSteps; step += 1) {
      const t = step / Math.max(1, arcSteps - 1);
      const wobble = (stableNoise(circle.x * 0.013 + circle.y * 0.017 + step * 1.91) - 0.5) * 0.16;
      const radius = circle.r * (0.88 + guideInfluence * 0.18 + wobble);
      const angle = arcStart + delta * t + Math.sin(t * Math.PI) * rand(-0.16, 0.16) * (1 - smoothness * 0.6);
      pushPointIfClear(points, {
        x: circle.x + Math.cos(angle) * radius,
        y: circle.y + Math.sin(angle) * radius,
      }, gapPad);
    }

    if (next) {
      const last = points[points.length - 1];
      if (!last) continue;
      const targetAngle = Math.atan2(circle.y - next.y, circle.x - next.x) - orbitDirection * rand(0.2, 0.72);
      const target = {
        x: next.x + Math.cos(targetAngle) * next.r * rand(0.82, 1.08),
        y: next.y + Math.sin(targetAngle) * next.r * rand(0.82, 1.08),
      };
      const vx = target.x - last.x;
      const vy = target.y - last.y;
      const len = Math.hypot(vx, vy) || 1;
      const nx = -vy / len;
      const ny = vx / len;
      const bend = rand(-0.22, 0.22) * minSide * (0.18 + guideInfluence * 0.18);
      const bridgeSteps = Math.floor(rand(3, 7));
      for (let step = 1; step <= bridgeSteps; step += 1) {
        const t = step / (bridgeSteps + 1);
        const ease = t * t * (3 - 2 * t);
        const lift = Math.sin(t * Math.PI) * bend;
        pushPointIfClear(points, {
          x: last.x + vx * ease + nx * lift,
          y: last.y + vy * ease + ny * lift,
        }, gapPad);
      }
    }
  }

  if (points.length < 8) return null;
  const smoothed = smoothPolyline(points, Math.round(2 + smoothness * 4), 0.48 + smoothness * 0.36);
  return {
    type: "curl",
    points: simplifyBlockedSegments(smoothed),
    width: rand(0.48, 1.18) * state.lineThickness,
    phase: rand(0, Math.PI * 2),
    branches: [],
  };
}

function createCurlPath(signX, signY, options = {}) {
  const minSide = Math.min(state.canvasWidth, state.canvasHeight);
  const margin = getPatternSafeMarginPx();
  const gapPad = minSide * 0.02;
  const guideInfluence = state.useCircleScaffold ? clamp(options.circleGuideInfluence ?? state.circleGuideInfluence, 0, 1) : 0;
  const points = [];
  const straightRatio = clamp(options.straightLines ?? state.straightLines, 0, 1);
  const straight = chance(straightRatio);
  const smoothness = clamp(options.curveSmoothness ?? state.curveSmoothness, 0, 1);
  const start = createSeedPoint(signX, signY, margin, gapPad);
  let x = start.x;
  let y = start.y;
  let angle = state.startFromBottom
    ? -Math.PI / 2 + rand(-0.95, 0.95) + signX * rand(-0.24, 0.24)
    : Math.atan2(signY, signX) + rand(-1.8, 1.8);
  const steps = straight ? rand(7, 15) : rand(46, 116);
  const stepSize = straight ? rand(minSide * 0.012, minSide * 0.03) : rand(minSide * 0.004, minSide * 0.012);
  const curl = rand(-0.17, 0.17) * (1 - smoothness * 0.35);
  const wave = rand(0.04, 0.2) * (1 - smoothness * 0.2);
  const turnEvery = rand(3.5, 12.5);

  for (let i = 0; i < steps; i += 1) {
    const t = i / Math.max(1, steps - 1);
    if (!straight) {
      angle += curl + Math.sin(t * Math.PI * turnEvery) * wave + rand(-0.18, 0.18) * (1 - smoothness * 0.78);
    } else {
      angle += rand(-0.015, 0.015);
    }

    if (guideInfluence > 0.01) {
      const nearest = findNearestGuideCircle(x, y, minSide * 0.18);
      if (nearest) {
        const centerAngle = Math.atan2(y - nearest.circle.y, x - nearest.circle.x);
        const tangentDirection = signX < 0 ? -1 : 1;
        const tangentAngle = centerAngle + tangentDirection * Math.PI / 2;
        angle = blendAngle(angle, tangentAngle, 0.1 + guideInfluence * 0.45);
        const targetRadius = nearest.circle.r + rand(-nearest.circle.r * 0.16, nearest.circle.r * 0.2);
        const radialError = targetRadius - nearest.centerDist;
        x += Math.cos(centerAngle) * radialError * (0.08 + guideInfluence * 0.2);
        y += Math.sin(centerAngle) * radialError * (0.08 + guideInfluence * 0.2);
      }
    }

    x += Math.cos(angle) * stepSize * rand(0.75, 1.35);
    y += Math.sin(angle) * stepSize * rand(0.75, 1.35);
    if (state.startFromBottom) {
      y -= stepSize * rand(0.12, 0.48);
      x += signX * stepSize * rand(-0.08, 0.14);
    }

    if (pointBlocked(x, y, gapPad)) {
      const p = { x, y };
      pushAwayFromCenter(p, stepSize * 2.8);
      x = p.x;
      y = p.y;
      angle += Math.PI * rand(0.25, 0.75);
    }

    x = clamp(x, margin, state.canvasWidth - margin);
    y = clamp(y, margin, state.canvasHeight - margin);
    points.push({ x, y });
  }

  const smoothed = smoothPolyline(points, Math.round(1 + smoothness * 3), 0.5 + smoothness * 0.38);
  return {
    type: straight ? "straight" : "curl",
    points: simplifyBlockedSegments(smoothed),
    width: rand(0.45, 1.2) * state.lineThickness,
    phase: rand(0, Math.PI * 2),
    branches: [],
  };
}

function getActiveTextGlyphs() {
  const text = state.useTextSeed ? state.textSeedValue.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  return text ? Array.from(text) : ["u", "n", "t", "r", "a", "s", "l", "g", "y"];
}

function glyphStrokeFamily(glyph) {
  if ("ygjpq9".includes(glyph)) return "descender";
  if ("bdfhklt".includes(glyph)) return "ascender";
  if ("aceog068".includes(glyph)) return "round";
  if ("mnruw".includes(glyph)) return "hump";
  if ("svxz25".includes(glyph)) return "sweep";
  return "connector";
}

function cubicPoint(p0, c1, c2, p1, t) {
  const mt = 1 - t;
  return {
    x: mt ** 3 * p0.x + 3 * mt ** 2 * t * c1.x + 3 * mt * t ** 2 * c2.x + t ** 3 * p1.x,
    y: mt ** 3 * p0.y + 3 * mt ** 2 * t * c1.y + 3 * mt * t ** 2 * c2.y + t ** 3 * p1.y,
  };
}

function appendCubicLocal(points, p0, c1, c2, p1, steps = 16) {
  if (!points.length) points.push({ ...p0 });
  for (let i = 1; i <= steps; i += 1) {
    points.push(cubicPoint(p0, c1, c2, p1, i / steps));
  }
}

function appendArcLocal(points, cx, cy, rx, ry, startAngle, endAngle, steps = 28) {
  for (let i = 0; i <= steps; i += 1) {
    if (points.length && i === 0) continue;
    const t = i / steps;
    const a = startAngle + (endAngle - startAngle) * t;
    points.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
}

function localBounds(points) {
  return points.reduce((bounds, p) => ({
    minX: Math.min(bounds.minX, p.x),
    maxX: Math.max(bounds.maxX, p.x),
    minY: Math.min(bounds.minY, p.y),
    maxY: Math.max(bounds.maxY, p.y),
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
}

function createScriptLocalStroke(glyph) {
  const points = [];
  const family = glyphStrokeFamily(glyph);

  if (family === "descender") {
    appendCubicLocal(points, { x: 0.02, y: 0.08 }, { x: 0.12, y: -0.18 }, { x: 0.42, y: -0.24 }, { x: 0.56, y: -0.03 }, 14);
    appendArcLocal(points, 0.38, 0.02, 0.23, 0.26, -0.18 * Math.PI, 1.72 * Math.PI, 34);
    const last = points[points.length - 1];
    appendCubicLocal(points, last, { x: 0.72, y: 0.18 }, { x: 0.62, y: 0.66 }, { x: 0.44, y: 0.78 }, 18);
    appendArcLocal(points, 0.51, 0.78, 0.18, 0.17, 0.95 * Math.PI, -0.95 * Math.PI, 26);
    appendCubicLocal(points, points[points.length - 1], { x: 0.66, y: 1.02 }, { x: 0.86, y: 0.63 }, { x: 1.02, y: 0.5 }, 14);
  } else if (family === "ascender") {
    appendCubicLocal(points, { x: 0.06, y: 0.42 }, { x: 0.02, y: -0.5 }, { x: 0.48, y: -0.72 }, { x: 0.54, y: -0.28 }, 20);
    appendArcLocal(points, 0.42, -0.35, 0.17, 0.32, -0.18 * Math.PI, 1.35 * Math.PI, 28);
    appendCubicLocal(points, points[points.length - 1], { x: 0.48, y: 0.15 }, { x: 0.58, y: 0.58 }, { x: 0.24, y: 0.72 }, 18);
    appendCubicLocal(points, points[points.length - 1], { x: 0.46, y: 0.56 }, { x: 0.74, y: 0.48 }, { x: 0.98, y: 0.26 }, 12);
  } else if (family === "round") {
    appendCubicLocal(points, { x: 0.0, y: 0.08 }, { x: 0.18, y: -0.18 }, { x: 0.58, y: -0.22 }, { x: 0.72, y: 0.04 }, 12);
    appendArcLocal(points, 0.45, 0.08, 0.28, 0.32, -0.08 * Math.PI, 1.86 * Math.PI, 42);
    appendCubicLocal(points, points[points.length - 1], { x: 0.68, y: 0.42 }, { x: 0.88, y: 0.32 }, { x: 1.0, y: 0.12 }, 12);
  } else if (family === "hump") {
    appendCubicLocal(points, { x: 0.0, y: 0.26 }, { x: 0.16, y: -0.08 }, { x: 0.28, y: -0.18 }, { x: 0.4, y: 0.16 }, 14);
    appendCubicLocal(points, points[points.length - 1], { x: 0.5, y: 0.44 }, { x: 0.68, y: -0.18 }, { x: 0.82, y: 0.12 }, 16);
    appendCubicLocal(points, points[points.length - 1], { x: 0.9, y: 0.36 }, { x: 1.04, y: 0.26 }, { x: 1.12, y: 0.02 }, 10);
  } else if (family === "sweep") {
    appendCubicLocal(points, { x: 0.02, y: -0.08 }, { x: 0.28, y: -0.38 }, { x: 0.74, y: -0.22 }, { x: 0.64, y: 0.1 }, 18);
    appendCubicLocal(points, points[points.length - 1], { x: 0.56, y: 0.42 }, { x: 0.18, y: 0.26 }, { x: 0.24, y: 0.58 }, 16);
    appendCubicLocal(points, points[points.length - 1], { x: 0.32, y: 0.82 }, { x: 0.72, y: 0.72 }, { x: 1.02, y: 0.42 }, 14);
  } else {
    appendCubicLocal(points, { x: 0.0, y: 0.1 }, { x: 0.16, y: -0.12 }, { x: 0.34, y: 0.28 }, { x: 0.5, y: 0.04 }, 14);
    appendArcLocal(points, 0.58, 0.1, 0.16, 0.22, Math.PI, 2.45 * Math.PI, 24);
    appendCubicLocal(points, points[points.length - 1], { x: 0.72, y: -0.04 }, { x: 0.9, y: 0.18 }, { x: 1.04, y: 0.0 }, 12);
  }

  return points;
}

function glyphReadableWidth(glyph) {
  const family = glyphStrokeFamily(glyph);
  if ("ilt1".includes(glyph)) return 0.58;
  if ("mw".includes(glyph)) return 1.22;
  if (family === "descender") return 1.02;
  if (family === "ascender") return 0.92;
  if (family === "hump") return 1.1;
  return 0.96;
}

function createScriptWordLocalStroke(glyphs) {
  const points = [];
  let cursor = 0;

  glyphs.forEach((glyph, index) => {
    const local = createScriptLocalStroke(glyph);
    if (local.length < 3) return;

    const bounds = localBounds(local);
    const localW = Math.max(0.001, bounds.maxX - bounds.minX);
    const targetW = glyphReadableWidth(glyph);
    const family = glyphStrokeFamily(glyph);
    const baselineShift = family === "descender" ? 0.06 : family === "ascender" ? -0.04 : 0;
    const shaped = local.map((point) => ({
      x: cursor + ((point.x - bounds.minX) / localW) * targetW,
      y: point.y + baselineShift,
    }));

    if (points.length && shaped.length) {
      const last = points[points.length - 1];
      const first = shaped[0];
      appendCubicLocal(
        points,
        last,
        { x: last.x + targetW * 0.18, y: last.y - 0.05 },
        { x: first.x - targetW * 0.2, y: first.y + 0.04 },
        first,
        8,
      );
      points.push(...shaped.slice(1));
    } else {
      points.push(...shaped);
    }

    const overlap = index < glyphs.length - 1 ? rand(0.68, 0.82) : 1;
    cursor += targetW * overlap;
  });

  return points;
}

function chooseScriptGlyphSequence(glyphs, zone, forceReadable, influence) {
  if (!glyphs.length) return ["u"];
  if (forceReadable && glyphs.length > 1) return glyphs.slice(0, Math.min(glyphs.length, 14));

  const canWriteWord = glyphs.length > 2 && (zone === "bottom" || zone === "top");
  if (canWriteWord && chance(0.34 + influence * 0.42)) {
    const maxLen = Math.min(glyphs.length, 7);
    const len = Math.floor(rand(3, maxLen + 1));
    const start = Math.floor(rand(0, Math.max(1, glyphs.length - len + 1)));
    return glyphs.slice(start, start + len);
  }

  return [glyphs[Math.floor(rand(0, glyphs.length))]];
}

function createCalligraphicStrokePath(signX, signY, options = {}) {
  if (!state.useTextSeed || !state.textSeedValue.trim()) return null;
  const influence = clamp(state.scriptStrokeInfluence, 0, 1);
  if (influence < 0.03) return null;

  const glyphs = getActiveTextGlyphs();
  const minSide = Math.min(state.canvasWidth, state.canvasHeight);
  const margin = getPatternSafeMarginPx();
  const rect = getTextRect(minSide * 0.055);
  const safeTop = margin;
  const safeBottom = state.canvasHeight - margin;
  const sideInner = signX < 0 ? rect.x - minSide * 0.045 : rect.x + rect.w + minSide * 0.045;
  const sideOuter = signX < 0 ? margin : state.canvasWidth - margin;
  const availableSide = Math.max(minSide * 0.12, Math.abs(sideInner - sideOuter));
  const zoneRoll = rand();
  const forceReadable = Boolean(options.forceReadable);
  const zone = forceReadable
    ? (options.forceZone || (state.startFromBottom ? "bottom" : "top"))
    : state.startFromBottom
    ? (zoneRoll < 0.42 ? "bottom" : zoneRoll < 0.86 ? "side" : "top")
    : (zoneRoll < 0.52 ? "side" : zoneRoll < 0.78 ? "top" : "bottom");
  const sequence = chooseScriptGlyphSequence(glyphs, zone, forceReadable, influence);
  const isWord = sequence.length > 1;
  const local = isWord ? createScriptWordLocalStroke(sequence) : createScriptLocalStroke(sequence[0]);
  if (local.length < 8) return null;

  const family = glyphStrokeFamily(sequence[0]);
  const containsAscender = sequence.some((glyph) => glyphStrokeFamily(glyph) === "ascender");
  const containsDescender = sequence.some((glyph) => glyphStrokeFamily(glyph) === "descender");
  const size = rand(minSide * 0.12, minSide * (0.18 + influence * 0.1));
  let drawW = size * rand(0.82, family === "hump" ? 1.52 : 1.28);
  let drawH = size * rand(family === "ascender" || family === "descender" ? 1.15 : 0.72, 1.72);

  if (isWord) {
    const readableWidth = forceReadable
      ? Math.min(state.canvasWidth - margin * 2.4, minSide * (0.44 + sequence.length * 0.035))
      : minSide * rand(0.24 + sequence.length * 0.028, 0.34 + sequence.length * 0.042);
    drawW = readableWidth;
    drawH = minSide * rand(
      containsAscender || containsDescender ? 0.12 : 0.095,
      containsAscender || containsDescender ? 0.19 : 0.15,
    );
  }

  let anchorX;
  let anchorY;
  let angle;

  if (forceReadable && (zone === "bottom" || zone === "top")) {
    anchorX = state.canvasWidth / 2 + rand(-minSide * 0.035, minSide * 0.035);
    anchorY = zone === "bottom"
      ? rand(safeBottom - drawH * 0.9, safeBottom - drawH * 0.42)
      : rand(safeTop + drawH * 0.42, safeTop + drawH * 0.9);
    angle = rand(-0.055, 0.055);
  } else if (zone === "bottom") {
    const minX = signX < 0
      ? margin + drawW * 0.35
      : Math.max(sideInner, margin + drawW * 0.35);
    const maxX = signX < 0
      ? Math.min(sideInner, state.canvasWidth - margin - drawW * 0.35)
      : state.canvasWidth - margin - drawW * 0.35;
    anchorX = rand(Math.min(minX, maxX), Math.max(minX, maxX));
    anchorY = rand(safeBottom - minSide * 0.16, safeBottom - drawH * 0.15);
    angle = (signX < 0 ? 0 : Math.PI) + rand(-0.18, 0.18);
  } else if (zone === "top") {
    const minX = signX < 0
      ? margin + drawW * 0.35
      : Math.max(sideInner, margin + drawW * 0.35);
    const maxX = signX < 0
      ? Math.min(sideInner, state.canvasWidth - margin - drawW * 0.35)
      : state.canvasWidth - margin - drawW * 0.35;
    anchorX = rand(Math.min(minX, maxX), Math.max(minX, maxX));
    anchorY = rand(safeTop + drawH * 0.2, safeTop + minSide * 0.14);
    angle = (signX < 0 ? 0 : Math.PI) + rand(-0.12, 0.12);
  } else {
    const sideWidth = Math.min(availableSide, minSide * 0.2);
    anchorX = signX < 0
      ? rand(margin + drawH * 0.25, margin + sideWidth)
      : rand(state.canvasWidth - margin - sideWidth, state.canvasWidth - margin - drawH * 0.25);
    anchorY = rand(safeTop + drawW * 0.32, safeBottom - drawW * 0.32);
    angle = (signX < 0 ? -Math.PI / 2 : Math.PI / 2) + rand(-0.22, 0.22);
  }

  const bounds = localBounds(local);
  const localW = Math.max(0.001, bounds.maxX - bounds.minX);
  const localH = Math.max(0.001, bounds.maxY - bounds.minY);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const slant = rand(-0.14, 0.24) + (family === "descender" ? 0.08 : 0);
  const smoothness = clamp(options.curveSmoothness ?? state.curveSmoothness, 0, 1);
  const pad = minSide * 0.014;
  let blockedCount = 0;

  const transformed = local.map((point, index) => {
    let lx = ((point.x - bounds.minX) / localW - 0.5) * drawW;
    const ly = ((point.y - bounds.minY) / localH - 0.5) * drawH;
    lx += ly * slant;
    const jitter = (1 - smoothness) * minSide * 0.004;
    const jx = (stableNoise(index * 1.77 + state.seed * 0.00011) - 0.5) * jitter;
    const jy = (stableNoise(index * 2.13 + state.seed * 0.00017) - 0.5) * jitter;
    const next = {
      x: anchorX + lx * cos - ly * sin + jx,
      y: anchorY + lx * sin + ly * cos + jy,
    };
    next.x = clamp(next.x, margin, state.canvasWidth - margin);
    next.y = clamp(next.y, margin, state.canvasHeight - margin);
    if (pointBlocked(next.x, next.y, pad)) {
      blockedCount += 1;
      pushAwayFromCenter(next, minSide * (0.035 + influence * 0.035));
      next.x = clamp(next.x, margin, state.canvasWidth - margin);
      next.y = clamp(next.y, margin, state.canvasHeight - margin);
    }
    return next;
  });

  if (blockedCount > transformed.length * 0.48) return null;
  const smoothed = smoothPolyline(transformed, Math.round(2 + smoothness * 4), 0.52 + smoothness * 0.32);
  const points = simplifyBlockedSegments(smoothed);
  if (points.length < 9) return null;

  return {
    type: "script",
    glyph: sequence.join(""),
    noMirror: forceReadable,
    points,
    width: rand(0.62, 1.12) * state.lineThickness * (0.82 + influence * 0.28),
    phase: rand(0, Math.PI * 2),
    branches: [],
  };
}

function smoothPolyline(points, passes = 2, pull = 0.75) {
  if (points.length < 3) return points;
  let current = points.map((p) => ({ ...p }));
  for (let pass = 0; pass < passes; pass += 1) {
    const next = [current[0]];
    for (let i = 1; i < current.length - 1; i += 1) {
      const prev = current[i - 1];
      const now = current[i];
      const after = current[i + 1];
      const avgX = (prev.x + now.x * 2 + after.x) / 4;
      const avgY = (prev.y + now.y * 2 + after.y) / 4;
      next.push({
        x: now.x * (1 - pull) + avgX * pull,
        y: now.y * (1 - pull) + avgY * pull,
      });
    }
    next.push(current[current.length - 1]);
    current = next;
  }
  return current;
}

function simplifyBlockedSegments(points) {
  return points.filter((point, index) => index === 0 || !pointBlocked(point.x, point.y, 4));
}

function decoratePath(path, options = {}) {
  if (path.points.length < 8 || path.type === "straight" || path.type === "script") return;
  const flourishLevel = clamp(options.flourishes ?? state.flourishes, 0, 1);
  const branchCount = Math.floor(rand(0, 2.4) * flourishLevel);
  for (let i = 0; i < branchCount; i += 1) {
    const index = Math.floor(rand(2, path.points.length - 3));
    const prev = path.points[index - 1];
    const next = path.points[index + 1];
    const tangent = Math.atan2(next.y - prev.y, next.x - prev.x);
    const branch = createBranch(path.points[index], tangent, path.width, flourishLevel);
    if (branch.points.length > 2) path.branches.push(branch);
  }
}

function createBranch(anchor, tangent, width, flourishLevel = state.flourishes) {
  const points = [];
  const length = rand(18, 70) * (state.canvasWidth + state.canvasHeight) / 2800;
  const side = chance(0.5) ? 1 : -1;
  let angle = tangent + side * rand(0.75, 1.4);
  let x = anchor.x;
  let y = anchor.y;
  const steps = Math.floor(rand(12, 28));

  for (let i = 0; i < steps; i += 1) {
    angle += side * rand(0.02, 0.16);
    x += Math.cos(angle) * (length / steps);
    y += Math.sin(angle) * (length / steps);
    if (pointBlocked(x, y, 6)) break;
    points.push({ x, y });
    if (flourishLevel > 0.35 && i === steps - 1 && chance(flourishLevel)) {
      points.push(...createSpiral({ x, y }, angle, side, length * 0.34));
    }
  }

  return { points, width: Math.max(1, width * rand(0.25, 0.52)) };
}

function createSpiral(anchor, angle, side, radius) {
  const points = [];
  const loops = rand(1.1, 2.4);
  const steps = Math.floor(rand(16, 34));
  for (let i = 0; i < steps; i += 1) {
    const t = i / steps;
    const r = radius * (1 - t);
    const a = angle + side * t * Math.PI * 2 * loops;
    const x = anchor.x + Math.cos(a) * r;
    const y = anchor.y + Math.sin(a) * r;
    if (!pointBlocked(x, y, 6)) points.push({ x, y });
  }
  return points;
}

function mirrorPoint(point, mirrorX, mirrorY) {
  return {
    x: mirrorX ? state.canvasWidth - point.x : point.x,
    y: mirrorY ? state.canvasHeight - point.y : point.y,
  };
}

function mirrorPath(path, mirrorX, mirrorY) {
  return {
    ...path,
    points: path.points.map((point) => mirrorPoint(point, mirrorX, mirrorY)),
    branches: path.branches.map((branch) => ({
      ...branch,
      points: branch.points.map((point) => mirrorPoint(point, mirrorX, mirrorY)),
    })),
  };
}

function collectPathPoints(path) {
  const result = [];
  for (let i = 0; i < path.points.length; i += 2) {
    result.push(path.points[i]);
  }
  for (const branch of path.branches) {
    for (let i = 0; i < branch.points.length; i += 2) {
      result.push(branch.points[i]);
    }
  }
  return result;
}

function getCellKey(x, y, size) {
  return `${Math.floor(x / size)},${Math.floor(y / size)}`;
}

function pathOverlaps(points, cellMap, cellSize, minDist) {
  const minDistSq = minDist * minDist;
  for (const point of points) {
    const cx = Math.floor(point.x / cellSize);
    const cy = Math.floor(point.y / cellSize);
    for (let ox = -1; ox <= 1; ox += 1) {
      for (let oy = -1; oy <= 1; oy += 1) {
        const bucket = cellMap.get(`${cx + ox},${cy + oy}`);
        if (!bucket) continue;
        for (const other of bucket) {
          const dx = point.x - other.x;
          const dy = point.y - other.y;
          if (dx * dx + dy * dy < minDistSq) return true;
        }
      }
    }
  }
  return false;
}

function addPointsToMap(points, cellMap, cellSize) {
  for (const point of points) {
    const key = getCellKey(point.x, point.y, cellSize);
    if (!cellMap.has(key)) cellMap.set(key, []);
    cellMap.get(key).push(point);
  }
}

// ── Font-contour frame pattern ──────────────────────────────────────────────
// Renders each input character with the decorative font, extracts its pixel
// contours as stroke chains, and places them along the four frame edges.
// Mirror mode is applied exactly as organic paths are mirrored.

// ── Text-on-a-path frame warp ────────────────────────────────────────────────
// Renders the input text as a continuous horizontal strip at large font size,
// extracts pixel contours as stroke chains, then warps each chain point so that
// its x-coordinate maps to arc-distance along the frame perimeter and its
// y-coordinate maps to radial depth (inward from the frame edge).
// This produces a single flowing calligraphic ribbon of letter shapes that
// wraps continuously around all four frame edges.

// Shared geometry for the text-on-a-path frame. Both the pattern generator and
// the reference overlay use this so they are guaranteed to stay aligned.
function getFrameWarpConfig() {
  const text = state.textSeedValue.trim();
  if (!text) return null;
  const rawChars = [...text].filter((c) => c.trim()).join("");
  if (!rawChars) return null;

  const W = state.canvasWidth;
  const H = state.canvasHeight;
  const minSide = Math.min(W, H);

  // Frame band: the ribbon around the canvas edges within which letters live.
  const bandDepth = minSide * 0.21;                   // radial thickness (bigger frame)
  // Centreline kept close to the edge so the letter ink reaches near the border.
  // Pattern Padding pushes it inward when you want more breathing room.
  const frameCx = minSide * 0.02 + getPatternSafeMarginPx() + bandDepth * 0.31; // centreline inset
  const fontSize = clamp(bandDepth * 0.90, 52, minSide * 0.24);

  const subtitleRaw = (state.subtitleValue || "").trim();
  const subChars = subtitleRaw;

  const offH = Math.ceil(bandDepth * 1.25);

  // Perimeter as a polyline of waypoints; interior corners become rounded
  // quarter-arcs so the text ribbon flows continuously around them instead of
  // being chopped where two straight edges meet at 90°. `flip` re-orients a
  // segment's letters so they read upright on edges that would otherwise invert.
  const fc = frameCx;
  let waypoints, edgeFlip, closed;
  // No per-edge flip: letters keep "tops outward" all the way around, so the
  // ribbon rotates continuously through every corner with no reflection seam.
  // (The bottom decorative swirls read upside-down, which is fine for abstract
  // calligraphy; the readable subtitle gets its own upright flip below.)
  if (state.mirrorMode === "horizontal") {
    waypoints = [ {x:W/2,y:fc}, {x:fc,y:fc}, {x:fc,y:H-fc}, {x:W/2,y:H-fc} ]; // top→left→bottom
    edgeFlip  = [ false, false, false ];
    closed = false;
  } else if (state.mirrorMode === "vertical") {
    waypoints = [ {x:fc,y:H/2}, {x:fc,y:fc}, {x:W-fc,y:fc}, {x:W-fc,y:H/2} ]; // left→top→right
    edgeFlip  = [ false, false, false ];
    closed = false;
  } else {
    waypoints = [ {x:fc,y:fc}, {x:W-fc,y:fc}, {x:W-fc,y:H-fc}, {x:fc,y:H-fc} ]; // CW loop
    edgeFlip  = [ false, false, false, false ];
    closed = true;
  }

  // Corner radius: large enough that the inner band radius stays positive
  // (no fold), and small enough to fit on the shortest rounded edge.
  let shortestEdge = Infinity;
  const edgeN = closed ? waypoints.length : waypoints.length - 1;
  for (let i = 0; i < edgeN; i++) {
    const a = waypoints[i], b = waypoints[(i + 1) % waypoints.length];
    shortestEdge = Math.min(shortestEdge, Math.hypot(b.x - a.x, b.y - a.y));
  }
  const cornerR = clamp(bandDepth * 1.05, offH * 0.55, shortestEdge * 0.42);

  // Build line + arc segments with rounded corners.
  const segs = [];
  const edges = [];
  for (let i = 0; i < edgeN; i++) {
    const a = waypoints[i], b = waypoints[(i + 1) % waypoints.length];
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const tx = (b.x - a.x) / L, ty = (b.y - a.y) / L;
    let nx = -ty, ny = tx; // inward normal (toward canvas centre)
    if (nx * (W / 2 - a.x) + ny * (H / 2 - a.y) < 0) { nx = -nx; ny = -ny; }
    edges.push({ a, b, tx, ty, nx, ny, flip: edgeFlip[i] });
  }
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    const startCorner = closed || i > 0;
    const endCorner = closed || i < edges.length - 1;
    let x0 = e.a.x, y0 = e.a.y, x1 = e.b.x, y1 = e.b.y;
    if (startCorner) { x0 += e.tx * cornerR; y0 += e.ty * cornerR; }
    if (endCorner)   { x1 -= e.tx * cornerR; y1 -= e.ty * cornerR; }
    segs.push({ type: "line", x0, y0, x1, y1, nx: e.nx, ny: e.ny, flip: e.flip });
    if (endCorner) {
      const next = edges[(i + 1) % edges.length];
      const V = e.b;
      const A = { x: V.x - e.tx * cornerR, y: V.y - e.ty * cornerR }; // arc start
      const C = { x: A.x + e.nx * cornerR, y: A.y + e.ny * cornerR }; // arc centre
      const Bp = { x: V.x + next.tx * cornerR, y: V.y + next.ty * cornerR }; // arc end
      const a0 = Math.atan2(A.y - C.y, A.x - C.x);
      let dA = Math.atan2(Bp.y - C.y, Bp.x - C.x) - a0;
      while (dA > Math.PI) dA -= 2 * Math.PI;
      while (dA < -Math.PI) dA += 2 * Math.PI;
      segs.push({ type: "arc", cx: C.x, cy: C.y, R: cornerR, a0, a1: a0 + dA, flip: e.flip });
    }
  }

  const segLens = segs.map((s) =>
    s.type === "arc" ? s.R * Math.abs(s.a1 - s.a0) : Math.hypot(s.x1 - s.x0, s.y1 - s.y0));
  const cumLens = segLens.reduce((acc, l) => { acc.push((acc[acc.length - 1] || 0) + l); return acc; }, []);
  const totalLen = cumLens[cumLens.length - 1];

  // Sample the centreline at arc-distance `d` → world position, unit tangent,
  // and inward normal (works for both straight and arc segments).
  function sampleAt(d) {
    d = clamp(d, 0, totalLen * 0.9999);
    let si = 0;
    while (si < segs.length - 1 && cumLens[si] < d) si++;
    const seg = segs[si];
    const segStart = si > 0 ? cumLens[si - 1] : 0;
    const t = segLens[si] > 0 ? (d - segStart) / segLens[si] : 0;
    if (seg.type === "arc") {
      const a = seg.a0 + (seg.a1 - seg.a0) * t;
      const ca = Math.cos(a), sa = Math.sin(a);
      const dir = seg.a1 >= seg.a0 ? 1 : -1;
      return { x: seg.cx + seg.R * ca, y: seg.cy + seg.R * sa,
        nx: -ca, ny: -sa, tx: -sa * dir, ty: ca * dir, flip: seg.flip };
    }
    const L = Math.hypot(seg.x1 - seg.x0, seg.y1 - seg.y0) || 1;
    return { x: seg.x0 + (seg.x1 - seg.x0) * t, y: seg.y0 + (seg.y1 - seg.y0) * t,
      nx: seg.nx, ny: seg.ny, tx: (seg.x1 - seg.x0) / L, ty: (seg.y1 - seg.y0) / L, flip: seg.flip };
  }

  function perimToWorld(d, r) {
    const s = sampleAt(d);
    const sgn = s.flip ? -1 : 1;
    return { x: s.x + s.nx * sgn * r, y: s.y + s.ny * sgn * r };
  }

  const offW = Math.ceil(totalLen);
  // Measure the real glyph width in the decorative font (variable-width cursive)
  // so the repeated text reliably OVERFILLS the perimeter. Estimating from
  // fontSize underfills with narrow scripts, leaving a blank patch at the strip's
  // end that surfaces as a gap/notch where the mirrored halves meet.
  const _measCanvas = document.createElement("canvas").getContext("2d");
  _measCanvas.font = `${fontSize}px ${_patternFontFamily}`;
  const _unitW = Math.max(1, _measCanvas.measureText(rawChars + " ").width);
  const repeats = Math.max(1, Math.ceil((totalLen * 1.15) / _unitW));
  const displayText = (rawChars + " ").repeat(repeats).trimEnd();

  // Render the repeated text into a horizontal strip the width of the perimeter.
  // The title fills the whole frame; an optional subtitle replaces the BOTTOM edge
  // so the top/sides + bottom together compose the complete frame.
  function renderStrip() {
    const off = document.createElement("canvas");
    off.width = offW; off.height = offH;
    const octx = off.getContext("2d");
    octx.font = `${fontSize}px ${_patternFontFamily}`;
    octx.fillStyle = "#fff";
    octx.textBaseline = "middle";

    const bufferZone = Math.ceil(bandDepth * 0.85);

    // 1. Draw the title text character-by-character, skipping bottom-edge buffer zones
    let curX = 2;
    for (let char of displayText) {
      const charW = octx.measureText(char).width;
      let inForbiddenZone = false;
      if (subChars) {
        for (let i = 0; i < segs.length; i++) {
          const seg = segs[i];
          const isBottom = Math.abs(seg.y0 - (H - frameCx)) < 1 && Math.abs(seg.y1 - (H - frameCx)) < 1;
          if (!isBottom) continue;
          const segStart = i > 0 ? cumLens[i - 1] : 0;
          const segEnd = cumLens[i];
          if (curX + charW > segStart - bufferZone && curX < segEnd + bufferZone) {
            inForbiddenZone = true;
            break;
          }
        }
      }
      if (!inForbiddenZone) {
        octx.fillText(char, curX, offH / 2);
      }
      curX += charW;
    }

    // 2. Draw the subtitle pre-rotated 180° in the bottom-edge segment region.
    //    The bottom edge naturally inverts text (ny=-1), so pre-rotating makes it upright.
    if (subChars) {
      for (let i = 0; i < segs.length; i++) {
        const seg = segs[i];
        const isBottom = Math.abs(seg.y0 - (H - frameCx)) < 1 && Math.abs(seg.y1 - (H - frameCx)) < 1;
        if (!isBottom) continue;
        const segStart = i > 0 ? cumLens[i - 1] : 0;
        const segEnd = cumLens[i];
        const segW = segEnd - segStart;
        const segMidX = segStart + segW / 2;

        // Render subtitle into a small temporary canvas, then draw it vertically flipped into the strip
        // Auto-scale font so the full subtitle text fits within the segment width
        let subFontSize = fontSize;
        const tmpC = document.createElement("canvas");
        tmpC.width = Math.ceil(segW); tmpC.height = offH;
        const tc = tmpC.getContext("2d");
        tc.fillStyle = "#fff";
        tc.textBaseline = "middle";
        // Measure at full size first, then scale down if needed
        tc.font = `${subFontSize}px ${_patternFontFamily}`;
        const fullWidth = tc.measureText(subChars).width;
        if (fullWidth > segW * 0.95) {
          subFontSize = Math.floor(subFontSize * (segW * 0.95) / fullWidth);
          tc.font = `${subFontSize}px ${_patternFontFamily}`;
        }
        // Repeat subtitle to fill the segment
        const subReps = Math.max(1, Math.ceil(segW * 1.5 / tc.measureText(subChars + " ").width));
        const subText = (subChars + " ").repeat(subReps).trimEnd();
        // Draw subtitle text into temp canvas
        let subX = 2;
        for (let char of subText) {
          const charW = tc.measureText(char).width;
          if (subX > segW) break;
          tc.fillText(char, subX, offH / 2);
          subX += charW;
        }
        // Draw temp canvas vertically flipped into the main strip at the bottom segment position.
        // Only flip Y (not rotate 180°) so text stays left-to-right after the bottom edge's ny=-1 inversion.
        octx.save();
        octx.translate(segStart, offH);
        octx.scale(1, -1);
        octx.drawImage(tmpC, 0, 0);
        octx.restore();
      }
    }
    return { canvas: off, ctx: octx };
  }

  return {
    W, H, minSide, bandDepth, frameCx, fontSize,
    segs, segLens, cumLens, totalLen, perimToWorld, sampleAt,
    offW, offH, displayText, renderStrip,
  };
}

function buildPatternFromFontContours() {
  const cfg = getFrameWarpConfig();
  if (!cfg) return false;
  const { segs, segLens, cumLens, totalLen, perimToWorld, offW, offH, fontSize } = cfg;
  const strokeW = Math.max(state.lineThickness * 0.7, 5);

  const { ctx: octx } = cfg.renderStrip();

  // ── Edge-pixel extraction ────────────────────────────────────────────────────
  const raw = octx.getImageData(0, 0, offW, offH).data;
  const filled = (x, y) => x >= 0 && x < offW && y >= 0 && y < offH && raw[(y * offW + x) * 4] > 64;
  const isEdge = (x, y) =>
    filled(x, y) && (!filled(x - 1, y) || !filled(x + 1, y) || !filled(x, y - 1) || !filled(x, y + 1));

  const step = Math.max(2, Math.round(fontSize / 34));
  const edgePts = [], edgeSet = new Set();
  for (let y = 1; y < offH - 1; y++) {
    for (let x = 1; x < offW - 1; x++) {
      if (!isEdge(x, y)) continue;
      const sx = Math.round(x / step) * step;
      const sy = Math.round(y / step) * step;
      const key = sy * offW + sx;
      if (!edgeSet.has(key)) { edgeSet.add(key); edgePts.push({ x: sx, y: sy }); }
    }
  }
  if (edgePts.length < 8) return false;

  // ── Direction-biased contour chaining ───────────────────────────────────────
  const cellSize = step * 3;
  const grid = new Map();
  for (const p of edgePts) {
    const gk = `${Math.floor(p.x / cellSize)},${Math.floor(p.y / cellSize)}`;
    if (!grid.has(gk)) grid.set(gk, []);
    grid.get(gk).push(p);
  }

  function nextAlong(cx, cy, dX, dY, maxDist, usedSet) {
    const gx = Math.floor(cx / cellSize), gy = Math.floor(cy / cellSize);
    let best = null, bestScore = Infinity;
    const hasDir = dX !== 0 || dY !== 0;
    for (let dgx = -2; dgx <= 2; dgx++) {
      for (let dgy = -2; dgy <= 2; dgy++) {
        const cell = grid.get(`${gx + dgx},${gy + dgy}`);
        if (!cell) continue;
        for (const p of cell) {
          if (usedSet.has(p)) continue;
          const dx = p.x - cx, dy = p.y - cy;
          const d = Math.hypot(dx, dy);
          if (d >= maxDist || d < 0.5) continue;
          let score = d;
          if (hasDir) {
            const dot = (dx / d) * dX + (dy / d) * dY;
            if (dot < -0.2) continue;
            score += (1 - dot) * d * 1.8;
          }
          if (score < bestScore) { bestScore = score; best = p; }
        }
      }
    }
    return best;
  }

  const usedSet = new Set();
  let rawChains = [];
  const maxGap = step * 3.4;            // bridge bigger gaps while tracing
  const minChainLen = Math.max(4, Math.round(fontSize * 0.08 / step));

  for (const seed of edgePts) {
    if (usedSet.has(seed)) continue;
    const chain = [seed]; usedSet.add(seed);
    let cur = seed, dX = 0, dY = 0;
    for (let i = 0; i < 2000; i++) {
      const next = nextAlong(cur.x, cur.y, dX, dY, maxGap, usedSet);
      if (!next) break;
      const ndx = next.x - cur.x, ndy = next.y - cur.y;
      const nd = Math.hypot(ndx, ndy) || 1;
      dX = dX * 0.55 + (ndx / nd) * 0.45;
      dY = dY * 0.55 + (ndy / nd) * 0.45;
      const dl = Math.hypot(dX, dY) || 1; dX /= dl; dY /= dl;
      chain.push(next); usedSet.add(next); cur = next;
    }
    if (chain.length >= 3) rawChains.push(chain);
  }
  if (!rawChains.length) return false;

  // ── Stitch pass ──────────────────────────────────────────────────────────────
  // Greedily join chains whose endpoints sit close together so the frame reads
  // as long flowing strokes instead of many short fragments.
  const maxStitch = step * 7;
  function stitchChains(chains) {
    const remaining = chains.slice();
    const out = [];
    while (remaining.length) {
      let current = remaining.shift();
      let extended = true;
      while (extended) {
        extended = false;
        const tail = current[current.length - 1];
        let bestIdx = -1, bestDist = maxStitch, bestReverse = false;
        for (let i = 0; i < remaining.length; i++) {
          const c = remaining[i];
          const dStart = Math.hypot(c[0].x - tail.x, c[0].y - tail.y);
          const dEnd = Math.hypot(c[c.length - 1].x - tail.x, c[c.length - 1].y - tail.y);
          if (dStart < bestDist) { bestDist = dStart; bestIdx = i; bestReverse = false; }
          if (dEnd < bestDist) { bestDist = dEnd; bestIdx = i; bestReverse = true; }
        }
        if (bestIdx >= 0) {
          let c = remaining.splice(bestIdx, 1)[0];
          if (bestReverse) c = c.slice().reverse();
          current = current.concat(c);
          extended = true;
        }
      }
      out.push(current);
    }
    return out;
  }
  rawChains = stitchChains(rawChains).filter((c) => c.length >= minChainLen);
  if (!rawChains.length) return false;

  // ── Smooth chains and warp to frame world coords ────────────────────────────
  const smooth = (chain, win = 8) =>
    chain.map((p, i) => {
      let sx = 0, sy = 0, cnt = 0;
      for (let j = Math.max(0, i - win); j <= Math.min(chain.length - 1, i + win); j++) {
        sx += chain[j].x; sy += chain[j].y; cnt++;
      }
      return { x: sx / cnt, y: sy / cnt };
    });

  const allPaths = [];
  for (const chain of rawChains) {
    const pts = smooth(chain).map((p) => {
      // p.x = horizontal position in text strip → arc distance along frame perimeter
      // p.y = vertical position in strip → radial offset (above/below centreline)
      const r = p.y - offH / 2; // + = inward (toward canvas centre), − = outward
      return perimToWorld(p.x, r);
    });
    const pathObj = { points: pts, width: strokeW, phase: rand(0, Math.PI * 2), branches: [] };
    allPaths.push(pathObj);
    if (state.mirrorMode === "horizontal") allPaths.push(mirrorPath(pathObj, true, false));
    else if (state.mirrorMode === "vertical") allPaths.push(mirrorPath(pathObj, false, true));
  }

  if (!allPaths.length) return false;
  state.paths = allPaths;
  return true;
}

function buildPattern() {
  const factors = state.useTextSeed ? textSeedFactors(state.textSeedValue) : textSeedFactors("");
  state.seed = state.useTextSeed && factors.active ? factors.seed : Date.now() >>> 0;
  updateTextSeedMeta(state.textSeedValue);

  const densityValue = clamp(state.density + factors.density, 0.15, 1);
  const straightValue = clamp(state.straightLines + factors.straight, 0, 1);
  const flourishesValue = clamp(state.flourishes + factors.flourishes, 0, 1);
  const smoothnessValue = clamp(state.curveSmoothness + factors.smoothness, 0, 1);
  const circleDensityValue = clamp(state.circleGuideDensity + factors.guideDensity, 0.1, 1);
  const circleInfluenceValue = clamp(state.circleGuideInfluence + factors.guideInfluence, 0, 1);
  const textActive = state.useTextSeed && factors.active;
  const scriptInfluence = textActive ? clamp(state.scriptStrokeInfluence, 0, 1) : 0;
  const runtime = {
    straightLines: straightValue,
    flourishes: flourishesValue,
    curveSmoothness: smoothnessValue,
    circleGuideDensity: circleDensityValue,
    circleGuideInfluence: circleInfluenceValue,
  };

  createBlankZones();

  // Text frame mode.
  if (state.useTextSeed && state.textSeedValue.trim()) {
    if (state.textAsStroke) {
      // Clean mode: the visible frame is the warped glyph fill (drawTextFrame).
      // We still generate the contour paths so the bubble/glass/edge/emboss FX
      // have a mask to glow around — but the raw strokes themselves are not drawn.
      buildPatternFromFontContours(); // populates state.paths (may stay empty)
      state.progress = state.animate ? 0 : 1;
      state.hold = 0;
      draw();
      return;
    }
    // Contour mode: trace each letter into stroke paths along the frame.
    if (buildPatternFromFontContours()) {
      state.progress = state.animate ? 0 : 1;
      state.hold = 0;
      draw();
      return;
    }
  }

  createCircleGuides(runtime);
  const count = Math.floor(7 + densityValue * 20);
  const maxAttempts = count * 24;
  const collisionMap = new Map();
  const collisionCell = Math.max(10, state.lineThickness * 1.3);
  const minDistance = Math.max(clamp(state.noOverlapGap, 4, 80), state.lineThickness * 1.45);
  const basePaths = [];
  const scriptQuota = textActive ? Math.floor(count * (0.28 + scriptInfluence * 0.5)) : 0;
  let attempts = 0;

  while (basePaths.length < count && attempts < maxAttempts) {
    attempts += 1;
    const seedSignX = state.mirrorMode === "horizontal" ? -1 : (chance(0.5) ? -1 : 1);
    let path = null;
    if (textActive && basePaths.length < scriptQuota && chance(0.58 + scriptInfluence * 0.36)) {
      path = createCalligraphicStrokePath(seedSignX, state.startFromBottom ? 1 : -1, runtime);
    }
    if (!path && state.useCircleScaffold && chance(0.68 + circleInfluenceValue * 0.28)) {
      path = createCircleScaffoldPath(seedSignX, state.startFromBottom ? 1 : -1, runtime);
    }
    if (!path) path = createCurlPath(seedSignX, state.startFromBottom ? 1 : -1, runtime);
    decoratePath(path, runtime);
    if (path.points.length <= 2) continue;
    const samples = collectPathPoints(path);
    if (!samples.length) continue;
    if (pathOverlaps(samples, collisionMap, collisionCell, minDistance)) continue;
    addPointsToMap(samples, collisionMap, collisionCell);
    basePaths.push(path);
  }

  const mirrored = [];
  for (const path of basePaths) {
    mirrored.push(path);
    if (state.mirrorMode === "horizontal") {
      mirrored.push(mirrorPath(path, true, false));
    } else if (state.mirrorMode === "vertical") {
      mirrored.push(mirrorPath(path, false, true));
    }
  }

  state.paths = mirrored;
  state.progress = state.animate ? 0 : 1;
  state.hold = 0;
  draw();
}

function segmentWidth(baseWidth, t, phase) {
  const widthVariation = clamp(state.widthVariation, 0, 1);
  const taperStrength = clamp(state.taperStrength, 0, 1);
  const wave = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 + phase * 1.3);
  const variationScale = (1 - widthVariation * 0.48) + wave * widthVariation;
  const edgeFalloff = Math.pow(Math.sin(Math.PI * clamp(t, 0, 1)), 1.08);
  const taperScale = (1 - taperStrength) + taperStrength * (0.18 + edgeFalloff * 0.82);
  return Math.max(0.35, baseWidth * variationScale * taperScale);
}

function drawCrayonMicroDetails(p0, p1, index, currentWidth, phase, color, alpha, rough, baseJitterX, baseJitterY) {
  const vx = p1.x - p0.x;
  const vy = p1.y - p0.y;
  const segmentLength = Math.hypot(vx, vy) || 1;
  const tx = vx / segmentLength;
  const ty = vy / segmentLength;
  const nx = -ty;
  const ny = tx;
  const sampleCount = Math.min(9, Math.max(2, Math.ceil(segmentLength / Math.max(2.2, currentWidth * 0.32))));
  const dark = mixRgb(color, "#000000", 0.72);
  const light = mixRgb(color, "#ffffff", 0.78);
  const mid = mixRgb(color, "#ffffff", 0.22);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const seed = index * 31.91 + sample * 17.37 + phase * 4.73;
    const along = (sample + 0.2 + stableNoise(seed + 0.11) * 0.64) / sampleCount;
    const cross = (stableNoise(seed + 1.41) - 0.5) * currentWidth * (0.9 + rough * 0.7);
    const px = p0.x + vx * along + nx * cross + baseJitterX;
    const py = p0.y + vy * along + ny * cross + baseJitterY;
    const length = currentWidth * (0.1 + stableNoise(seed + 2.03) * (0.34 + rough * 0.34));
    const axis = stableNoise(seed + 3.29);
    const shade = stableNoise(seed + 4.87);
    const useDark = shade < 0.48;
    const useLight = shade > 0.74;
    const tone = useDark ? dark : useLight ? light : mid;
    const toneAlpha = alpha * (useDark ? 0.08 + rough * 0.22 : 0.045 + rough * 0.16);
    const lineWidth = Math.max(0.28, currentWidth * (0.025 + stableNoise(seed + 5.61) * (0.05 + rough * 0.035)));
    const dx = axis < 0.58 ? tx * length : nx * length * 0.62;
    const dy = axis < 0.58 ? ty * length : ny * length * 0.62;

    ctx.globalCompositeOperation = useDark ? "multiply" : "screen";
    ctx.strokeStyle = rgbToRgba(tone, toneAlpha);
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(px - dx, py - dy);
    ctx.lineTo(px + dx, py + dy);
    ctx.stroke();

    if (stableNoise(seed + 6.72) < 0.72 + rough * 0.2) {
      const dotSize = Math.max(0.65, currentWidth * (0.055 + stableNoise(seed + 7.1) * 0.095));
      ctx.fillStyle = rgbToRgba(useDark ? dark : light, alpha * (0.05 + rough * 0.18));
      ctx.fillRect(px - dotSize * 0.5, py - dotSize * 0.5, dotSize * (0.55 + stableNoise(seed + 8.19)), dotSize * (0.45 + stableNoise(seed + 9.61)));
    }

    if (stableNoise(seed + 10.33) < 0.42 + rough * 0.26) {
      const edgeSign = stableNoise(seed + 11.07) > 0.5 ? 1 : -1;
      const edgeX = p0.x + vx * along + nx * edgeSign * currentWidth * (0.46 + rough * 0.2) + baseJitterX;
      const edgeY = p0.y + vy * along + ny * edgeSign * currentWidth * (0.46 + rough * 0.2) + baseJitterY;
      const edgeLength = currentWidth * (0.16 + rough * 0.25);
      ctx.globalCompositeOperation = stableNoise(seed + 12.55) > 0.48 ? "screen" : "multiply";
      ctx.strokeStyle = stableNoise(seed + 13.3) > 0.48
        ? rgbToRgba(light, alpha * (0.08 + rough * 0.18))
        : rgbToRgba(dark, alpha * (0.08 + rough * 0.2));
      ctx.lineWidth = Math.max(0.35, currentWidth * (0.035 + rough * 0.035));
      ctx.beginPath();
      ctx.moveTo(edgeX - tx * edgeLength, edgeY - ty * edgeLength);
      ctx.lineTo(edgeX + tx * edgeLength, edgeY + ty * edgeLength);
      ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = "source-over";
}

function strokePathSegments(points, width, drawCount, phase, color, alpha) {
  if (drawCount < 2) return;
  const animatedNoise = state.animate ? state.audioLevel * 2.2 : 0;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const rough = state.fxWaxTexture ? clamp(state.fxWaxStrength, 0, 1) : 0;
  const edgeStrength = state.fxEdgeLightShadow ? clamp(state.fxEdgeStrength, 0, 1) : 0;

  for (let i = 1; i < drawCount; i += 1) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const t = i / (drawCount - 1);
    const baseJitterX = Math.sin(i * 0.55 + phase) * animatedNoise;
    const baseJitterY = Math.cos(i * 0.62 + phase) * animatedNoise;
    const currentWidth = segmentWidth(width, t, phase);

    if (rough <= 0.001) {
      ctx.strokeStyle = hexToRgba(color, alpha);
      ctx.lineWidth = currentWidth;
      ctx.beginPath();
      ctx.moveTo(p0.x + baseJitterX, p0.y + baseJitterY);
      ctx.lineTo(p1.x + baseJitterX, p1.y + baseJitterY);
      ctx.stroke();

      if (edgeStrength > 0.01) {
        const vxClean = p1.x - p0.x;
        const vyClean = p1.y - p0.y;
        const vLenClean = Math.hypot(vxClean, vyClean) || 1;
        const nxClean = -vyClean / vLenClean;
        const nyClean = vxClean / vLenClean;
        const lightDot = nxClean * -0.72 + nyClean * -0.46;
        const highlightSign = lightDot >= 0 ? 1 : -1;
        const edgeOffset = currentWidth * (0.08 + edgeStrength * 0.22);
        const edgeWidth = Math.max(0.3, currentWidth * (0.08 + edgeStrength * 0.11));

        ctx.globalCompositeOperation = "multiply";
        ctx.strokeStyle = `rgba(0,0,0,${(alpha * (0.08 + edgeStrength * 0.22)).toFixed(3)})`;
        ctx.lineWidth = edgeWidth;
        ctx.beginPath();
        ctx.moveTo(
          p0.x - nxClean * edgeOffset * highlightSign + baseJitterX,
          p0.y - nyClean * edgeOffset * highlightSign + baseJitterY,
        );
        ctx.lineTo(
          p1.x - nxClean * edgeOffset * highlightSign + baseJitterX,
          p1.y - nyClean * edgeOffset * highlightSign + baseJitterY,
        );
        ctx.stroke();

        ctx.globalCompositeOperation = "screen";
        ctx.strokeStyle = `rgba(255,255,255,${(alpha * (0.1 + edgeStrength * 0.24)).toFixed(3)})`;
        ctx.lineWidth = edgeWidth * 0.92;
        ctx.beginPath();
        ctx.moveTo(
          p0.x + nxClean * edgeOffset * highlightSign + baseJitterX,
          p0.y + nyClean * edgeOffset * highlightSign + baseJitterY,
        );
        ctx.lineTo(
          p1.x + nxClean * edgeOffset * highlightSign + baseJitterX,
          p1.y + nyClean * edgeOffset * highlightSign + baseJitterY,
        );
        ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
      }
      continue;
    }

    const vx = p1.x - p0.x;
    const vy = p1.y - p0.y;
    const vLen = Math.hypot(vx, vy) || 1;
    const nx = -vy / vLen;
    const ny = vx / vLen;
    const tx = vx / vLen;
    const ty = vy / vLen;
    const lightX = -0.72;
    const lightY = -0.46;
    const lightDot = nx * lightX + ny * lightY;
    const highlightSign = lightDot >= 0 ? 1 : -1;

    const waxPasses = 3;
    for (let pass = 0; pass < waxPasses; pass += 1) {
      const noiseA = stableNoise(i * 1.31 + pass * 19.1 + phase * 7.7);
      const noiseB = stableNoise(i * 1.93 + pass * 23.4 + phase * 9.2);
      const offset = (noiseA * 2 - 1) * (currentWidth * (0.06 + rough * (0.24 + pass * 0.15)));
      const tangentJitter = (noiseB * 2 - 1) * (currentWidth * (0.03 + rough * 0.12));
      const ox = nx * offset + (vx / vLen) * tangentJitter + baseJitterX;
      const oy = ny * offset + (vy / vLen) * tangentJitter + baseJitterY;
      const passAlpha = alpha * (pass === 0 ? 0.78 : pass === 1 ? 0.5 : 0.31);
      const passWidth = Math.max(0.45, currentWidth * (pass === 0 ? 1 : pass === 1 ? 0.86 : 0.68));

      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = hexToRgba(color, passAlpha);
      ctx.lineWidth = passWidth;
      ctx.beginPath();
      ctx.moveTo(p0.x + ox, p0.y + oy);
      ctx.lineTo(p1.x + ox, p1.y + oy);
      ctx.stroke();
    }

    drawCrayonMicroDetails(p0, p1, i, currentWidth, phase, color, alpha, rough, baseJitterX, baseJitterY);

    if (edgeStrength > 0.01) {
      const edgeOffset = currentWidth * (0.16 + rough * 0.14 + edgeStrength * 0.13);
      const edgeWidth = Math.max(0.35, currentWidth * (0.14 + rough * 0.08 + edgeStrength * 0.1));

      ctx.globalCompositeOperation = "multiply";
      ctx.strokeStyle = `rgba(0,0,0,${(alpha * (0.1 + rough * 0.1 + edgeStrength * 0.18)).toFixed(3)})`;
      ctx.lineWidth = edgeWidth;
      ctx.beginPath();
      ctx.moveTo(p0.x - nx * edgeOffset * highlightSign + baseJitterX, p0.y - ny * edgeOffset * highlightSign + baseJitterY);
      ctx.lineTo(p1.x - nx * edgeOffset * highlightSign + baseJitterX, p1.y - ny * edgeOffset * highlightSign + baseJitterY);
      ctx.stroke();

      ctx.globalCompositeOperation = "screen";
      ctx.strokeStyle = `rgba(255,255,255,${(alpha * (0.12 + rough * 0.12 + edgeStrength * 0.2)).toFixed(3)})`;
      ctx.lineWidth = Math.max(0.3, edgeWidth * 0.88);
      ctx.beginPath();
      ctx.moveTo(p0.x + nx * edgeOffset * highlightSign + baseJitterX, p0.y + ny * edgeOffset * highlightSign + baseJitterY);
      ctx.lineTo(p1.x + nx * edgeOffset * highlightSign + baseJitterX, p1.y + ny * edgeOffset * highlightSign + baseJitterY);
      ctx.stroke();

      ctx.globalCompositeOperation = "source-over";
    }
    const speckleChance = 0.1 + rough * 0.25;
    if (stableNoise(i * 2.17 + phase * 5.9) < speckleChance) {
      const textureDots = 2 + Math.floor(rough * 3);
      for (let d = 0; d < textureDots; d += 1) {
        const r1 = stableNoise(i * 3.11 + d * 1.73 + phase * 0.9) - 0.5;
        const r2 = stableNoise(i * 4.07 + d * 2.21 + phase * 0.7) - 0.5;
        const px = p1.x + nx * r1 * currentWidth * (1 + rough * 1.6) + tx * r2 * currentWidth * 0.28 + baseJitterX;
        const py = p1.y + ny * r1 * currentWidth * (1 + rough * 1.6) + ty * r2 * currentWidth * 0.28 + baseJitterY;
        const dotRadius = Math.max(0.35, currentWidth * (0.05 + rough * 0.09));
        const darkDot = stableNoise(i * 5.13 + d * 0.77 + phase) > 0.5;
        ctx.fillStyle = darkDot
          ? `rgba(0,0,0,${(alpha * (0.1 + rough * 0.22)).toFixed(3)})`
          : `rgba(255,255,255,${(alpha * (0.08 + rough * 0.2)).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(px, py, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.globalCompositeOperation = "source-over";
}

function drawPath(points, width, progress, phase) {
  if (points.length < 2 || progress <= 0) return;
  const drawCount = clamp(Math.ceil(points.length * progress), 2, points.length);

  if (state.outlineStroke) {
    strokePathSegments(points, width * 1.15, drawCount, phase, state.strokeColor, state.strokeAlpha);
    strokePathSegments(points, Math.max(1, width * 0.58), drawCount, phase + 0.15, state.outlineColor, state.outlineAlpha);
  } else {
    strokePathSegments(points, width, drawCount, phase, state.strokeColor, state.strokeAlpha);
  }
}

function drawGuideCircles() {
  if (!state.showGuides || !state.guideCircles.length) return;
  ctx.save();
  for (const link of state.guideLinks) {
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255, 92, 156, 0.14)";
    ctx.lineWidth = Math.max(10, Math.min(link.a.r, link.b.r) * 0.42);
    ctx.lineCap = "round";
    ctx.moveTo(link.a.x, link.a.y);
    ctx.lineTo(link.b.x, link.b.y);
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  for (const circle of state.guideCircles) {
    ctx.beginPath();
    ctx.strokeStyle = "rgba(120, 170, 255, 0.22)";
    ctx.arc(circle.x, circle.y, circle.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function strokePolyline(points, width, progress, color, alpha, options = {}, targetCtx = ctx) {
  if (points.length < 2 || progress <= 0) return;
  const drawCount = clamp(Math.ceil(points.length * progress), 2, points.length);
  const offsetX = options.offsetX || 0;
  const offsetY = options.offsetY || 0;
  targetCtx.save();
  targetCtx.lineCap = "round";
  targetCtx.lineJoin = "round";
  targetCtx.strokeStyle = hexToRgba(color, alpha);
  const expandPx = Math.max(0, options.expandPx || 0);
  targetCtx.lineWidth = Math.max(0.2, width * (options.widthScale || 1) + expandPx * 2);
  if (options.blur && options.blur > 0) targetCtx.filter = `blur(${options.blur.toFixed(2)}px)`;
  targetCtx.beginPath();
  targetCtx.moveTo(points[0].x + offsetX, points[0].y + offsetY);
  for (let i = 1; i < drawCount; i += 1) {
    const point = points[i];
    targetCtx.lineTo(point.x + offsetX, point.y + offsetY);
  }
  targetCtx.stroke();
  targetCtx.restore();
}

function forEachPathSegment(callback) {
  for (const path of state.paths) {
    callback(path.points, path.width, state.progress, path.phase);
    const branchProgress = clamp(state.progress * 1.2 - 0.15, 0, 1);
    for (const branch of path.branches) {
      callback(branch.points, branch.width, branchProgress, path.phase + 1.7);
    }
  }
}

function drawPathMask(targetCtx, widthScale = 1, expandPx = 0) {
  targetCtx.save();
  targetCtx.clearRect(0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
  paintPathMask(targetCtx, widthScale, expandPx);
  targetCtx.restore();
}

function paintPathMask(targetCtx, widthScale = 1, expandPx = 0, alpha = 1) {
  targetCtx.save();
  targetCtx.strokeStyle = "#ffffff";
  targetCtx.globalAlpha = clamp(alpha, 0, 1);
  targetCtx.lineCap = "round";
  targetCtx.lineJoin = "round";
  forEachPathSegment((points, width, progress) => {
    if (points.length < 2 || progress <= 0) return;
    const drawCount = clamp(Math.ceil(points.length * progress), 2, points.length);
    targetCtx.lineWidth = Math.max(0.2, width * widthScale + Math.max(0, expandPx) * 2);
    targetCtx.beginPath();
    targetCtx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < drawCount; i += 1) {
      targetCtx.lineTo(points[i].x, points[i].y);
    }
    targetCtx.stroke();
  });
  targetCtx.restore();
}

// Clip/coverage mask for path-tracing FX. In text-frame mode this is the smooth
// anti-aliased glyph silhouette (optionally fattened) so textures and shadows hug
// the clean letterforms; otherwise it strokes the coarse traced contour paths,
// whose ~8px-grid points stair-step under blur on light backgrounds.
function paintFxClipMask(targetCtx, widthScale = 1, expandPx = 0, fattenPx = 0) {
  const m = getTextFrameMask();
  if (m) {
    targetCtx.save();
    if (fattenPx > 0.5) {
      targetCtx.filter = `blur(${fattenPx.toFixed(2)}px)`;
      for (let i = 0; i < 4; i += 1) targetCtx.drawImage(m, 0, 0);
      targetCtx.filter = "none";
    }
    targetCtx.drawImage(m, 0, 0);
    targetCtx.restore();
    return;
  }
  drawPathMask(targetCtx, widthScale, expandPx);
}

function createFxCanvas(scale = 1) {
  const fxCanvas = document.createElement("canvas");
  fxCanvas.width = Math.max(1, Math.round(canvas.width * scale));
  fxCanvas.height = Math.max(1, Math.round(canvas.height * scale));
  return fxCanvas;
}

function drawExpandedPathMask(widthScale, expandPx, blurPx = 0, scale = 1) {
  const maskCanvas = createFxCanvas(scale);
  const maskCtx = maskCanvas.getContext("2d");
  maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  maskCtx.save();
  maskCtx.scale(scale, scale);
  if (blurPx > 0) maskCtx.filter = `blur(${(blurPx * scale).toFixed(2)}px)`;
  paintPathMask(maskCtx, widthScale, expandPx);
  maskCtx.restore();
  return maskCanvas;
}

function thresholdMask(sourceCanvas, alphaCutoff = 24) {
  const sourceCtx = sourceCanvas.getContext("2d");
  const image = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] >= alphaCutoff ? 255 : 0;
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = alpha;
  }

  const maskCanvas = createFxCanvas();
  maskCanvas.width = sourceCanvas.width;
  maskCanvas.height = sourceCanvas.height;
  maskCanvas.getContext("2d").putImageData(image, 0, 0);
  return maskCanvas;
}

function thresholdMaskWithTexture(sourceCanvas, alphaCutoff = 24, roughness = 0, phase = 0) {
  const sourceCtx = sourceCanvas.getContext("2d");
  const image = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const data = image.data;
  const width = sourceCanvas.width;
  const grain = clamp(roughness, 0, 1);

  for (let i = 0; i < data.length; i += 4) {
    const p = i / 4;
    const x = p % width;
    const y = Math.floor(p / width);
    const cloudy = stableNoise(x * 0.131 + y * 0.071 + phase * 19.7);
    const scratch = stableNoise(x * 0.53 + y * 1.77 + phase * 31.1);
    const cutoff = alphaCutoff + (cloudy - 0.5) * 72 * grain;
    const keep = data[i + 3] >= cutoff && scratch > 0.04 + grain * 0.11;
    const brokenEdge = data[i + 3] > alphaCutoff * 0.5 && cloudy > 0.82 - grain * 0.22;
    const alpha = keep || brokenEdge ? clamp(data[i + 3] * (0.62 + cloudy * 0.55), 0, 255) : 0;
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = alpha;
  }

  const maskCanvas = createFxCanvas();
  maskCanvas.width = sourceCanvas.width;
  maskCanvas.height = sourceCanvas.height;
  maskCanvas.getContext("2d").putImageData(image, 0, 0);
  return maskCanvas;
}

function erodeMask(sourceCanvas, iterations) {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const sourceCtx = sourceCanvas.getContext("2d");
  const source = sourceCtx.getImageData(0, 0, width, height).data;
  let alpha = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < source.length; i += 4, p += 1) {
    alpha[p] = source[i + 3] > 0 ? 255 : 0;
  }

  const passes = Math.max(0, Math.round(iterations));
  for (let pass = 0; pass < passes; pass += 1) {
    const next = new Uint8Array(alpha.length);
    for (let y = 1; y < height - 1; y += 1) {
      const row = y * width;
      for (let x = 1; x < width - 1; x += 1) {
        const p = row + x;
        if (
          alpha[p] &&
          alpha[p - 1] &&
          alpha[p + 1] &&
          alpha[p - width] &&
          alpha[p + width] &&
          alpha[p - width - 1] &&
          alpha[p - width + 1] &&
          alpha[p + width - 1] &&
          alpha[p + width + 1]
        ) {
          next[p] = 255;
        }
      }
    }
    alpha = next;
  }

  const output = sourceCtx.createImageData(width, height);
  for (let p = 0, i = 0; p < alpha.length; p += 1, i += 4) {
    output.data[i] = 255;
    output.data[i + 1] = 255;
    output.data[i + 2] = 255;
    output.data[i + 3] = alpha[p];
  }

  const erodedCanvas = createFxCanvas();
  erodedCanvas.width = width;
  erodedCanvas.height = height;
  erodedCanvas.getContext("2d").putImageData(output, 0, 0);
  return erodedCanvas;
}

function subtractMask(baseMask, subtractCanvas) {
  const result = createFxCanvas();
  result.width = baseMask.width;
  result.height = baseMask.height;
  const resultCtx = result.getContext("2d");
  resultCtx.drawImage(baseMask, 0, 0);
  resultCtx.globalCompositeOperation = "destination-out";
  resultCtx.drawImage(subtractCanvas, 0, 0);
  return result;
}

function tintedMaskLayer(maskCanvas, color, alpha) {
  const layer = createFxCanvas();
  layer.width = maskCanvas.width;
  layer.height = maskCanvas.height;
  const layerCtx = layer.getContext("2d");
  layerCtx.drawImage(maskCanvas, 0, 0);
  layerCtx.globalCompositeOperation = "source-in";
  layerCtx.fillStyle = colorToRgba(color, alpha);
  layerCtx.fillRect(0, 0, layer.width, layer.height);
  return layer;
}

function drawFxLayer(layer, composite = "source-over", alpha = 1) {
  ctx.save();
  ctx.globalCompositeOperation = composite;
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.drawImage(layer, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function drawGlassPolishFx() {
  if (!state.fxGlassPolish) return;
  const opacity = clamp(state.fxGlassOpacity, 0, 1);
  const shine = clamp(state.fxGlassShine, 0, 1);
  if (opacity < 0.01 && shine < 0.01) return;

  if (!state.paths.length) return;
  const minSide = Math.min(canvas.width, canvas.height);
  // Work buffer at full canvas res (supersampled for smaller canvases), capped at
  // 4096px for memory. Never below 1 visually unless the canvas exceeds 4096, so
  // the mask is not upscaled → no pixelation.
  const scale = Math.min(1.6, 4096 / Math.max(canvas.width, canvas.height));
  const bubbleAmount = clamp(state.fxBubbleStrength, 0, 1);
  const outlinePx = clamp(state.fxBubbleOutlinePx, 0, 14);
  const expandPx = minSide * (0.006 + bubbleAmount * 0.014);
  const mergeR = minSide * (0.012 + bubbleAmount * 0.01) * scale; // fuse nearby blobs
  const glassColor = state.fxBubbleGlowColor || "#bfffd6";
  const lightColor = mixRgb(glassColor, "#ffffff", 0.48);
  const midColor = mixRgb(glassColor, "#ffffff", 0.14);
  const darkColor = mixRgb(glassColor, "#000000", 0.34);

  const { S, inv } = buildBubbleSilhouette(scale, expandPx, mergeR);

  // 1) Soft outer glow — gentle outward bloom (柔和的外发光).
  const haloR = (minSide * (0.018 + shine * 0.03 + bubbleAmount * 0.02)) * scale;
  const halo = blurMaskCopy(S, scale, haloR, "destination-out", S);
  tintLayer(halo, lightColor);
  drawFxLayer(halo, "screen", 0.28 + shine * 0.3);

  // 2) Glass body fill — gradient clipped to the smooth (anti-aliased) silhouette.
  const glassLayer = createFxCanvas(scale);
  const glassCtx = glassLayer.getContext("2d");
  glassCtx.drawImage(S, 0, 0);
  glassCtx.globalCompositeOperation = "source-in";
  const glassGradient = glassCtx.createLinearGradient(0, 0, glassLayer.width, glassLayer.height);
  glassGradient.addColorStop(0, colorToRgba(lightColor, 0.12 + opacity * 0.2));
  glassGradient.addColorStop(0.44, colorToRgba(midColor, 0.08 + opacity * 0.18));
  glassGradient.addColorStop(1, colorToRgba(darkColor, 0.04 + opacity * 0.14));
  glassCtx.fillStyle = glassGradient;
  glassCtx.fillRect(0, 0, glassLayer.width, glassLayer.height);
  drawFxLayer(glassLayer, "source-over", 0.86);

  // 3) Depth shading — radial gradient on a soft interior (fades near the edge).
  const innerSoft = blurMaskCopy(S, scale, (minSide * 0.02) * scale, "destination-in", S);
  const depthLayer = createFxCanvas(scale);
  const depthCtx = depthLayer.getContext("2d");
  depthCtx.drawImage(innerSoft, 0, 0);
  depthCtx.globalCompositeOperation = "source-in";
  const depthGradient = depthCtx.createRadialGradient(
    depthLayer.width * 0.42, depthLayer.height * 0.25, depthLayer.width * 0.05,
    depthLayer.width * 0.6, depthLayer.height * 0.72, Math.max(depthLayer.width, depthLayer.height) * 0.66,
  );
  depthGradient.addColorStop(0, "rgba(255, 255, 255, 0)");
  depthGradient.addColorStop(0.54, colorToRgba(darkColor, opacity * 0.04));
  depthGradient.addColorStop(1, colorToRgba(darkColor, opacity * 0.16));
  depthCtx.fillStyle = depthGradient;
  depthCtx.fillRect(0, 0, depthLayer.width, depthLayer.height);
  drawFxLayer(depthLayer, "multiply", 0.58 + opacity * 0.18);

  // 4) Defined outline — smooth bright edge band straddling the contour (有outline).
  const rimR = (minSide * 0.005 + outlinePx * 1.2) * scale;
  const rim = edgeBandMask(S, inv, scale, rimR);
  tintLayer(rim, "#ffffff");
  drawFxLayer(rim, "screen", 0.6 + shine * 0.3);
}

function drawEdgeLightShadowFx() {
  if (!state.fxEdgeLightShadow) return;
  const amount = clamp(state.fxEdgeStrength, 0, 1);
  if (amount < 0.01) return;

  const lightOffset = 0.4 + amount * 2.8;
  const blur = 0.8 + amount * 4.8;
  const light = mixRgb(state.strokeColor, "#ffffff", 0.8);

  // Text-frame mode: build the soft highlight + shadow from offset, blurred copies
  // of the smooth glyph silhouette, so the foggy edge hugs the clean letterforms
  // (no messy gray lines tracing the coarse contour paths, no stair-stepped blur).
  const glyphMask = getTextFrameMask();
  if (glyphMask) {
    const offsetCopy = (offX, offY, blurPx, color) => {
      const c = document.createElement("canvas");
      c.width = canvas.width; c.height = canvas.height;
      const cx = c.getContext("2d");
      cx.filter = `blur(${blurPx.toFixed(2)}px)`;
      cx.drawImage(glyphMask, offX, offY);
      cx.filter = "none";
      tintLayer(c, color);
      return c;
    };
    const lightLayer = offsetCopy(-lightOffset, -lightOffset, blur, rgbToRgba(light, 1));
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = clamp((0.1 + amount * 0.36) * state.strokeAlpha, 0, 1);
    ctx.drawImage(lightLayer, 0, 0);
    ctx.restore();
    const shadowLayer = offsetCopy(lightOffset, lightOffset, blur * 0.92, "#000000");
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = clamp((0.08 + amount * 0.32) * state.strokeAlpha, 0, 1);
    ctx.drawImage(shadowLayer, 0, 0);
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  forEachPathSegment((points, width, progress) => {
    strokePolyline(
      points,
      width,
      progress,
      `#${light.r.toString(16).padStart(2, "0")}${light.g.toString(16).padStart(2, "0")}${light.b.toString(16).padStart(2, "0")}`,
      (0.1 + amount * 0.36) * state.strokeAlpha,
      { widthScale: 1.55 + amount * 0.5, blur, offsetX: -lightOffset, offsetY: -lightOffset },
    );
  });
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  forEachPathSegment((points, width, progress) => {
    strokePolyline(points, width, progress, "#000000", (0.08 + amount * 0.32) * state.strokeAlpha, {
      widthScale: 1.62 + amount * 0.56,
      blur: blur * 0.92,
      offsetX: lightOffset,
      offsetY: lightOffset,
    });
  });
  ctx.restore();
}

// ── Smooth blur-only mask helpers (no thresholding → no pixelation) ───────────
function blurMaskCopy(src, scale, radius, keepOp, keepImg) {
  const c = createFxCanvas(scale);
  const cx = c.getContext("2d");
  cx.filter = `blur(${Math.max(0, radius).toFixed(2)}px)`;
  cx.drawImage(src, 0, 0);
  cx.filter = "none";
  if (keepOp) { cx.globalCompositeOperation = keepOp; cx.drawImage(keepImg, 0, 0); }
  return c;
}

// A soft glowing band straddling the silhouette contour: outer spill + inner falloff.
function edgeBandMask(S, inv, scale, radius) {
  const outer = blurMaskCopy(S, scale, radius, "destination-out", S);
  const inner = blurMaskCopy(inv, scale, radius, "destination-in", S);
  const c = createFxCanvas(scale);
  const cx = c.getContext("2d");
  cx.drawImage(outer, 0, 0);
  cx.globalCompositeOperation = "lighter";
  cx.drawImage(inner, 0, 0);
  return c;
}

// Full-canvas white silhouette of the warped glyph frame (mirrored to match the
// visible frame), cached across animation frames. Used as the FX silhouette
// source in text-frame mode so the glass/bubble edges trace the SAME smooth
// anti-aliased glyph shapes as the visible frame — not the coarse traced
// contour paths, which snap to a ~8px grid and look pixelated.
let _textFrameMaskCanvas = null;
let _textFrameMaskSig = "";
function getTextFrameMask() {
  if (!(state.useTextSeed && state.textAsStroke && state.textSeedValue.trim())) return null;
  const sig = [state.mirrorMode, state.textSeedValue, state.subtitleValue,
    canvas.width, canvas.height, _patternFontFamily].join("|");
  if (_textFrameMaskCanvas && _textFrameMaskSig === sig) return _textFrameMaskCanvas;
  const cfg = getFrameWarpConfig();
  if (!cfg) return null;
  const base = warpStripToLayer(cfg); // white glyphs, base half
  const full = document.createElement("canvas");
  full.width = canvas.width; full.height = canvas.height;
  const fx = full.getContext("2d");
  fx.drawImage(base, 0, 0);
  if (state.mirrorMode === "horizontal") {
    fx.save(); fx.translate(canvas.width, 0); fx.scale(-1, 1); fx.drawImage(base, 0, 0); fx.restore();
  } else if (state.mirrorMode === "vertical") {
    fx.save(); fx.translate(0, canvas.height); fx.scale(1, -1); fx.drawImage(base, 0, 0); fx.restore();
  }
  _textFrameMaskCanvas = full;
  _textFrameMaskSig = sig;
  return full;
}

// White anti-aliased silhouette of the pattern (merged into blobs) and its inverse.
// `mergeR` (scaled px) closes thin necks between nearby blobs metaball-style:
// blur spreads the field, then re-stacking re-densifies it so adjacent shapes
// fuse smoothly — all anti-aliased, so no pixelation.
function buildBubbleSilhouette(scale, expandPx, mergeR = 0) {
  const raw = createFxCanvas(scale);
  const rctx = raw.getContext("2d");
  const textMask = getTextFrameMask();
  if (textMask) {
    // Smooth source: the actual warped glyph silhouette. Fatten by expandPx via
    // a blur+restack so the glass body wraps the ink edge cleanly.
    rctx.save();
    if (expandPx > 0.5) {
      rctx.filter = `blur(${(expandPx * scale).toFixed(2)}px)`;
      for (let i = 0; i < 4; i++) rctx.drawImage(textMask, 0, 0, raw.width, raw.height);
      rctx.filter = "none";
    }
    rctx.drawImage(textMask, 0, 0, raw.width, raw.height);
    rctx.restore();
  } else {
    rctx.save();
    rctx.scale(scale, scale);
    paintPathMask(rctx, 1, expandPx);
    rctx.restore();
  }

  let S = raw;
  if (mergeR > 0.5) {
    S = createFxCanvas(scale);
    const sctx = S.getContext("2d");
    // Blur to spread, then stack draws so the soft field builds back to near-opaque
    // (1−(1−a)^n) — bridges thin gaps while keeping soft, anti-aliased edges.
    sctx.filter = `blur(${mergeR.toFixed(2)}px)`;
    for (let i = 0; i < 6; i++) sctx.drawImage(raw, 0, 0);
    sctx.filter = "none";
    sctx.drawImage(raw, 0, 0); // crisp solid core on top
  }

  const inv = createFxCanvas(scale);
  const ictx = inv.getContext("2d");
  ictx.fillStyle = "#fff";
  ictx.fillRect(0, 0, inv.width, inv.height);
  ictx.globalCompositeOperation = "destination-out";
  ictx.drawImage(S, 0, 0);
  return { S, inv };
}

// Bubble / Blur — soft glow that DIFFUSES INWARD from the outline (like the
// reference): brightest right at the contour, fading smoothly toward a dark
// interior. Built entirely from Gaussian blur, so it's super smooth, no pixels.
function drawBubbleBlurFx() {
  if (!state.fxBubbleBlur) return;
  const amount = clamp(state.fxBubbleStrength, 0, 1);
  if (amount < 0.01 || !state.paths.length) return;

  const density = clamp(state.fxBubbleBlurDensity, 0, 1);
  const outlinePx = clamp(state.fxBubbleOutlinePx, 0, 14);
  const minSide = Math.min(canvas.width, canvas.height);
  // Work buffer at full canvas res (supersampled when small), capped at 4096px.
  const scale = Math.min(1.6, 4096 / Math.max(canvas.width, canvas.height));
  const expandPx = minSide * (0.006 + amount * 0.016);   // body fatten/merge
  const mergeR = minSide * (0.012 + amount * 0.01) * scale; // fuse nearby blobs
  const glowColor = state.fxBubbleGlowColor || "#ffffff";

  const { S, inv } = buildBubbleSilhouette(scale, expandPx, mergeR);

  // Inward-diffusion layers, all = blur(inverse) clipped INSIDE the shape, so each
  // is bright at the contour and fades toward the interior. Deeper radius = the
  // glow reaches further in (density pushes it deeper, toward a filled look).
  const deepR = (minSide * (0.03 + amount * 0.05) + density * minSide * 0.05) * scale;
  const midR  = (minSide * (0.012 + amount * 0.02)) * scale;
  const edgeR = (minSide * 0.006 + outlinePx * 1.2) * scale;
  const deep = blurMaskCopy(inv, scale, deepR, "destination-in", S);
  const mid  = blurMaskCopy(inv, scale, midR, "destination-in", S);
  const rim  = blurMaskCopy(inv, scale, edgeR, "destination-in", S);
  tintLayer(deep, glowColor);
  tintLayer(mid, glowColor);
  tintLayer(rim, glowColor);

  // A small soft outer feather so the silhouette boundary isn't a hard cut.
  const outerR = (minSide * 0.005 + outlinePx * 0.6) * scale;
  const outer = blurMaskCopy(S, scale, outerR, "destination-out", S);
  tintLayer(outer, glowColor);

  const grain = clamp(state.fxBubbleGrain, 0, 1);

  // Assemble the glow into one layer so an optional grain dissolve can be applied
  // to the whole bubble at once.
  const L = createFxCanvas(scale);
  const lc = L.getContext("2d");
  lc.globalCompositeOperation = "screen";
  lc.globalAlpha = 0.3 + amount * 0.22;  lc.drawImage(outer, 0, 0); // outer feather
  lc.globalAlpha = 0.45 + amount * 0.3;  lc.drawImage(deep, 0, 0);  // deep diffusion
  lc.globalAlpha = 0.6 + amount * 0.25;  lc.drawImage(mid, 0, 0);   // mid falloff
  lc.globalAlpha = 0.9;                  lc.drawImage(rim, 0, 0);   // contour edge

  // Fine film grain: subtly modulate the glow BRIGHTNESS with deterministic noise
  // while leaving alpha (the silhouette/edge) untouched — so the outline stays
  // clean & smooth and the grain reads as a film/print texture, not dotty edges.
  if (grain > 0.01) {
    applyFilmGrain(L, grain, state.seed >>> 0, Math.max(1, Math.round(scale)));
  }

  drawFxLayer(L, "screen", 1);
}

// In-place film grain on RGB only (alpha preserved → clean edges). Each pixel's
// brightness is scaled by (1 ± grain·noise), giving a fine, even speckle texture.
function applyFilmGrain(layer, amount, seed, cell) {
  const w = layer.width, h = layer.height;
  const lctx = layer.getContext("2d");
  const img = lctx.getImageData(0, 0, w, h);
  const d = img.data;
  const gs = Math.max(1, cell | 0);
  const s = (seed % 100000) * 0.0001;
  const range = amount * 0.85; // max ± brightness swing
  for (let y = 0; y < h; y++) {
    const cy = (y / gs) | 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] === 0) continue;
      const cx = (x / gs) | 0;
      let n = Math.sin(cx * 127.1 + cy * 311.7 + s) * 43758.5453;
      n = n - Math.floor(n);                 // 0..1
      const f = 1 + (n - 0.5) * 2 * range;   // brightness factor
      d[i]     = Math.max(0, Math.min(255, d[i] * f));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] * f));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] * f));
    }
  }
  lctx.putImageData(img, 0, 0);
}

function drawEmbossFx() {
  if (!state.fxEmbossDepth) return;
  const amount = clamp(state.fxEmbossStrength, 0, 1);
  if (amount < 0.01) return;

  const offset = 0.45 + amount * 3.2;
  const blur = 0.6 + amount * 2.8;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  forEachPathSegment((points, width, progress) => {
    strokePolyline(points, width, progress, "#ffffff", 0.09 + amount * 0.24, {
      widthScale: 1.02 + amount * 0.18,
      blur,
      offsetX: -offset,
      offsetY: -offset,
    });
  });
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  forEachPathSegment((points, width, progress) => {
    strokePolyline(points, width, progress, "#000000", 0.1 + amount * 0.28, {
      widthScale: 1.04 + amount * 0.22,
      blur,
      offsetX: offset,
      offsetY: offset,
    });
  });
  ctx.restore();
}

function buildHalftoneNoiseTexture() {
  const key = [
    canvas.width,
    canvas.height,
    state.fxHalftoneMix.toFixed(3),
    state.strokeColor,
    state.seed,
  ].join("|");
  if (halftoneNoiseCache.canvas && halftoneNoiseCache.key === key) return halftoneNoiseCache.canvas;

  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = canvas.width;
  textureCanvas.height = canvas.height;
  const tctx = textureCanvas.getContext("2d");
  tctx.clearRect(0, 0, textureCanvas.width, textureCanvas.height);

  const mix = clamp(state.fxHalftoneMix, 0, 1);
  const baseTone = mixRgb(state.strokeColor, "#ffffff", 0.28);
  const tone = `rgba(${baseTone.r}, ${baseTone.g}, ${baseTone.b}, `;

  const dotStep = Math.max(5, Math.round(16 - mix * 9));
  const dotRadius = 0.8 + mix * 1.9;
  for (let y = dotStep * 0.5; y < textureCanvas.height; y += dotStep) {
    for (let x = dotStep * 0.5; x < textureCanvas.width; x += dotStep) {
      const wave = stableNoise(x * 0.017 + y * 0.029 + state.seed * 0.0001);
      const alpha = (0.03 + mix * 0.22) * (0.25 + wave * 0.95);
      if (alpha < 0.02) continue;
      tctx.fillStyle = `${tone}${alpha.toFixed(3)})`;
      tctx.beginPath();
      tctx.arc(x, y, dotRadius * (0.72 + wave * 0.6), 0, Math.PI * 2);
      tctx.fill();
    }
  }

  const noiseCount = Math.floor((textureCanvas.width * textureCanvas.height) / 2600 * (0.3 + (1 - mix) * 1.4));
  for (let i = 0; i < noiseCount; i += 1) {
    const x = stableNoise(i * 11.73 + state.seed * 0.0017) * textureCanvas.width;
    const y = stableNoise(i * 6.19 + state.seed * 0.0007) * textureCanvas.height;
    const shade = stableNoise(i * 17.83 + state.seed * 0.0013);
    const alpha = (0.01 + (1 - mix) * 0.12) * (0.4 + shade * 0.8);
    tctx.fillStyle = shade > 0.52
      ? `rgba(255,255,255,${alpha.toFixed(3)})`
      : `rgba(0,0,0,${(alpha * 0.9).toFixed(3)})`;
    tctx.fillRect(x, y, 1 + shade * 1.6, 1 + stableNoise(i * 5.77) * 1.5);
  }

  halftoneNoiseCache = { key, canvas: textureCanvas };
  return textureCanvas;
}

function drawHalftoneNoiseFx() {
  if (!state.fxHalftoneNoise) return;
  if (state.animate && state.progress < 0.99) return;

  const texture = buildHalftoneNoiseTexture();
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = canvas.width;
  maskCanvas.height = canvas.height;
  const mctx = maskCanvas.getContext("2d");
  paintFxClipMask(mctx, 1.36, 0, Math.min(canvas.width, canvas.height) * 0.004);

  const layer = document.createElement("canvas");
  layer.width = canvas.width;
  layer.height = canvas.height;
  const lctx = layer.getContext("2d");
  lctx.drawImage(texture, 0, 0);
  lctx.globalCompositeOperation = "destination-in";
  lctx.drawImage(maskCanvas, 0, 0);

  ctx.save();
  ctx.globalAlpha = 0.78;
  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}

function drawCrayonPaperTexture() {
  if (!state.fxWaxTexture) return;
  const rough = clamp(state.fxWaxStrength, 0, 1);
  if (rough < 0.02) return;
  const strokeVisibility = clamp(state.strokeAlpha, 0, 1);
  if (strokeVisibility < 0.001) return;

  const w = canvas.width;
  const h = canvas.height;
  const textureCanvas = createFxCanvas();
  const tctx = textureCanvas.getContext("2d");
  const grainCount = Math.floor((w * h) / 1450 * (0.42 + rough * 2.15));
  const sizeMin = 0.45;
  const sizeMax = 1.35 + rough * 2.4;
  const dark = mixRgb(state.strokeColor, "#000000", 0.78);
  const light = mixRgb(state.strokeColor, "#ffffff", 0.86);
  const mid = mixRgb(state.strokeColor, "#ffffff", 0.35);

  tctx.clearRect(0, 0, w, h);
  tctx.globalCompositeOperation = "source-over";
  for (let i = 0; i < grainCount; i += 1) {
    const x = stableNoise(i * 12.989 + 17.3) * w;
    const y = stableNoise(i * 78.233 + 91.7) * h;
    const tone = stableNoise(i * 35.173 + 6.4);
    const size = sizeMin + stableNoise(i * 9.17 + 2.1) * (sizeMax - sizeMin);
    const alpha = strokeVisibility * (0.022 + rough * 0.12) * (0.45 + tone * 0.85);
    const color = tone < 0.44 ? dark : tone > 0.78 ? light : mid;
    tctx.fillStyle = rgbToRgba(color, alpha);
    tctx.fillRect(x, y, size * (0.6 + stableNoise(i * 5.91) * 1.4), size * (0.45 + stableNoise(i * 4.31) * 1.8));
  }

  const weaveStep = Math.max(3, Math.round(9 - rough * 4.5));
  const weaveAlpha = strokeVisibility * (0.014 + rough * 0.07);
  for (let y = 0; y < h; y += weaveStep) {
    const wave = stableNoise(y * 0.113 + state.seed * 0.0003);
    tctx.fillStyle = rgbToRgba(wave > 0.5 ? light : dark, weaveAlpha * (0.35 + wave * 0.9));
    tctx.fillRect(0, y + wave * 1.2, w, Math.max(0.45, rough * 1.05));
  }
  for (let x = 0; x < w; x += weaveStep + 1) {
    const wave = stableNoise(x * 0.097 + state.seed * 0.0004);
    tctx.fillStyle = rgbToRgba(wave > 0.55 ? light : dark, weaveAlpha * (0.28 + wave * 0.72));
    tctx.fillRect(x + wave * 1.1, 0, Math.max(0.35, rough * 0.8), h);
  }

  const maskCanvas = createFxCanvas();
  const mctx = maskCanvas.getContext("2d");
  paintFxClipMask(mctx, 1.48 + rough * 0.38, 0.8 + rough * 2.6, Math.min(w, h) * 0.006);
  tctx.globalCompositeOperation = "destination-in";
  tctx.drawImage(maskCanvas, 0, 0);

  ctx.save();
  ctx.globalAlpha = 0.72 + rough * 0.24;
  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(textureCanvas, 0, 0);
  ctx.restore();
}

function pointOnPath(points, travel, progress = 1) {
  if (points.length < 2 || progress <= 0) return null;
  const drawCount = clamp(Math.ceil(points.length * progress), 2, points.length);
  const maxIndex = drawCount - 1;
  let totalLength = 0;
  for (let i = 1; i < drawCount; i += 1) totalLength += distance(points[i - 1], points[i]);
  if (totalLength <= 0) return { x: points[0].x, y: points[0].y, angle: 0 };

  let target = ((travel % 1) + 1) % 1 * totalLength;
  for (let i = 1; i <= maxIndex; i += 1) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const length = distance(p0, p1);
    if (target <= length || i === maxIndex) {
      const t = length <= 0 ? 0 : target / length;
      return {
        x: p0.x + (p1.x - p0.x) * t,
        y: p0.y + (p1.y - p0.y) * t,
        angle: Math.atan2(p1.y - p0.y, p1.x - p0.x),
      };
    }
    target -= length;
  }
  const last = points[maxIndex];
  const prev = points[Math.max(0, maxIndex - 1)];
  return { x: last.x, y: last.y, angle: Math.atan2(last.y - prev.y, last.x - prev.x) };
}

function drawAudioTravellers() {
  const motion = audioMotion();
  if (!motion.active) return;
  const segments = [];
  forEachPathSegment((points, width, progress, phase) => {
    if (points.length > 2 && progress > 0.05) segments.push({ points, width, progress, phase });
  });
  if (!segments.length) return;

  const scale = clamp(880 / Math.max(canvas.width, canvas.height), 0.46, 1);
  const blobMask = createFxCanvas(scale);
  const bctx = blobMask.getContext("2d");
  const audioColor = state.fxBubbleGlowColor || "#ff7bc4";
  const audioGlowColor = mixRgb(audioColor, "#ffffff", 0.36);
  const audioRimColor = mixRgb(audioColor, "#ffffff", 0.58);
  const impact = clamp(motion.beat * 0.75 + motion.transient * 0.95 + motion.bass * 0.45, 0, 1);
  const blobCount = Math.min(64, Math.max(16, Math.floor(16 + motion.energy * 22 + impact * 24)));
  const trailSteps = 6 + Math.floor(motion.mid * 4 + impact * 3);

  bctx.save();
  bctx.scale(scale, scale);
  bctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < blobCount; i += 1) {
    const pick = Math.floor(stableNoise(i * 41.3 + state.seed * 0.00017) * segments.length) % segments.length;
    const segment = segments[pick];
    const offset = stableNoise(i * 17.71 + segment.phase * 3.1);
    const direction = stableNoise(i * 9.91 + state.seed * 0.00023) > 0.5 ? 1 : -1;
    const travelSpeed = 0.058 + motion.bass * 0.24 + motion.mid * 0.075 + impact * 0.12 + stableNoise(i * 5.37) * 0.05;
    const travel = offset + direction * motion.phase * travelSpeed + impact * (0.035 + i * 0.0012);
    const point = pointOnPath(segment.points, travel, segment.progress);
    if (!point) continue;

    const pulse = 0.82 + motion.bass * 1.95 + motion.beat * 2.6 + motion.transient * 3 + stableNoise(i * 3.19 + motion.phase * 7.1) * 0.52;
    const radius = Math.max(4.2, segment.width * (1 + pulse * 0.62));
    const angle = point.angle + Math.sin(motion.phase * 5.8 + i) * (0.24 + impact * 0.32);
    const stretch = 1.08 + motion.bass * 0.55 + impact * 0.5 + stableNoise(i * 2.47) * 0.45;

    bctx.fillStyle = `rgba(255, 255, 255, ${0.54 + impact * 0.32})`;
    bctx.beginPath();
    bctx.ellipse(point.x, point.y, radius * stretch, radius * (0.72 + motion.treble * 0.18), angle, 0, Math.PI * 2);
    bctx.fill();

    for (let trail = 1; trail <= trailSteps; trail += 1) {
      const trailPoint = pointOnPath(segment.points, travel - direction * trail * (0.014 + motion.mid * 0.008 + impact * 0.007), segment.progress);
      if (!trailPoint) continue;
      const falloff = 1 - trail / (trailSteps + 1);
      const trailRadius = Math.max(2.2, radius * (0.34 + falloff * 0.42));
      bctx.fillStyle = `rgba(255, 255, 255, ${0.22 + falloff * (0.4 + motion.energy * 0.22 + impact * 0.2)})`;
      bctx.beginPath();
      bctx.ellipse(trailPoint.x, trailPoint.y, trailRadius * (1 + motion.bass * 0.28), trailRadius * 0.7, trailPoint.angle, 0, Math.PI * 2);
      bctx.fill();
    }

    const satellites = 1 + Math.floor(stableNoise(i * 6.13 + motion.phase) * (3 + impact * 3));
    for (let j = 0; j < satellites; j += 1) {
      const theta = point.angle + Math.PI / 2 + (j - 1) * 0.88 + Math.sin(motion.phase * 3.6 + i + j) * 0.36;
      const dist = radius * (0.75 + stableNoise(i * 8.1 + j) * (1.25 + impact * 0.7));
      const satRadius = Math.max(1.9, radius * (0.2 + stableNoise(i * 11.9 + j) * 0.3) * (1 + impact * 1.15));
      bctx.fillStyle = `rgba(255, 255, 255, ${0.24 + motion.treble * 0.3 + impact * 0.18})`;
      bctx.beginPath();
      bctx.arc(point.x + Math.cos(theta) * dist, point.y + Math.sin(theta) * dist, satRadius, 0, Math.PI * 2);
      bctx.fill();
    }
  }
  bctx.restore();

  const blurredMask = createFxCanvas(scale);
  const blurredCtx = blurredMask.getContext("2d");
  blurredCtx.filter = `blur(${((8 + motion.bass * 14 + impact * 11) * scale).toFixed(2)}px)`;
  blurredCtx.drawImage(blobMask, 0, 0);

  const liquidMask = thresholdMaskWithTexture(
    blurredMask,
    18 + motion.treble * 18 - impact * 8,
    0.3 + motion.treble * 0.32 + impact * 0.24,
    motion.phase
  );
  const pathClip = drawExpandedPathMask(1.75 + motion.bass * 0.46 + impact * 0.32, 6 + motion.energy * 9 + impact * 10, 2 + motion.mid * 3 + impact * 2, scale);
  const maskCtx = liquidMask.getContext("2d");
  maskCtx.globalCompositeOperation = "destination-in";
  maskCtx.drawImage(pathClip, 0, 0);

  const glowMask = createFxCanvas(scale);
  const glowCtx = glowMask.getContext("2d");
  glowCtx.filter = `blur(${((6 + motion.energy * 12 + impact * 8) * scale).toFixed(2)}px)`;
  glowCtx.drawImage(liquidMask, 0, 0);
  glowCtx.globalCompositeOperation = "destination-in";
  glowCtx.drawImage(pathClip, 0, 0);

  const liquidLayer = tintedMaskLayer(liquidMask, audioColor, 0.62 + impact * 0.28);
  const glowLayer = tintedMaskLayer(glowMask, audioGlowColor, 0.18 + motion.energy * 0.28 + impact * 0.18);
  const rimMask = subtractMask(liquidMask, erodeMask(liquidMask, 1 + impact * 1.8));
  const rimLayer = tintedMaskLayer(rimMask, audioRimColor, 0.58 + motion.treble * 0.18 + impact * 0.14);

  drawFxLayer(glowLayer, "screen", 0.82);
  drawFxLayer(liquidLayer, "source-over", 0.7 + motion.energy * 0.22);
  drawFxLayer(rimLayer, "screen", 0.95);
}

// Warp the horizontal text strip onto a full-resolution layer following the
// frame perimeter. On straight edges the warp is a rigid rotation+translation,
// so one setTransform per segment reproduces it exactly. Returns a canvas
// holding the warped white glyphs (base half only — caller mirrors).
function warpStripToLayer(cfg) {
  const { offH, totalLen, sampleAt, renderStrip } = cfg;
  const strip = renderStrip().canvas;
  const layer = document.createElement("canvas");
  layer.width = canvas.width;
  layer.height = canvas.height;
  const lctx = layer.getContext("2d");
  const px = canvas.width / state.canvasWidth; // device-pixel scale (usually 1)

  // Draw the strip in thin slices stepping along the perimeter. Each slice is
  // oriented by the tangent/normal sampled at its centre, so on rounded corners
  // the slices fan smoothly around the bend instead of being chopped at a 90°
  // joint. Straight runs render identically to a single affine.
  const stepW = 3;        // strip-x advance per slice (world px)
  const overlap = 0.8;    // overdraw to hide hairline seams between slices
  for (let d = 0; d < totalLen; d += stepW) {
    const sliceW = Math.min(stepW, totalLen - d);
    if (sliceW <= 0) break;
    const s = sampleAt(d + sliceW / 2);
    const sgn = s.flip ? -1 : 1;
    const nx = s.nx * sgn, ny = s.ny * sgn;
    const p0x = s.x - s.tx * (sliceW / 2); // centreline at strip x = d
    const p0y = s.y - s.ty * (sliceW / 2);
    lctx.setTransform(
      s.tx * px, s.ty * px,
      nx * px, ny * px,
      (p0x - s.tx * d - nx * offH / 2) * px,
      (p0y - s.ty * d - ny * offH / 2) * px,
    );
    lctx.drawImage(strip, d, 0, sliceW + overlap, offH, d, 0, sliceW + overlap, offH);
  }
  lctx.setTransform(1, 0, 0, 1, 0, 0);
  return layer;
}

// Recolour the opaque pixels of a layer in place via source-in.
function tintLayer(layer, color) {
  const lctx = layer.getContext("2d");
  lctx.globalCompositeOperation = "source-in";
  lctx.fillStyle = color;
  lctx.fillRect(0, 0, layer.width, layer.height);
  lctx.globalCompositeOperation = "source-over";
}

// Composite a base-half layer onto the main canvas, mirroring to match the frame.
function compositeMirrored(layer, alpha, mode) {
  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.globalCompositeOperation = mode;
  ctx.drawImage(layer, 0, 0);
  if (state.mirrorMode === "horizontal") {
    ctx.translate(canvas.width, 0); ctx.scale(-1, 1);
    ctx.drawImage(layer, 0, 0);
  } else if (state.mirrorMode === "vertical") {
    ctx.translate(0, canvas.height); ctx.scale(1, -1);
    ctx.drawImage(layer, 0, 0);
  }
  ctx.restore();
}

// Clean text frame: the warped decorative letters rendered directly as the frame
// (no messy contour tracing), with a neon glow in the chosen colour.
function drawTextFrame() {
  if (!state.useTextSeed || !state.textAsStroke) return;
  const cfg = getFrameWarpConfig();
  if (!cfg) return;

  const baseLayer = warpStripToLayer(cfg);   // white glyphs
  const fs = cfg.fontSize;

  // Colourise a copy of the glyphs.
  const colored = document.createElement("canvas");
  colored.width = canvas.width; colored.height = canvas.height;
  const cc = colored.getContext("2d");
  cc.drawImage(baseLayer, 0, 0);
  cc.globalCompositeOperation = "source-in";
  cc.fillStyle = state.textColor;
  cc.fillRect(0, 0, colored.width, colored.height);
  cc.globalCompositeOperation = "source-over";

  // Bake glow + core into a single base-half frame layer.
  const frame = document.createElement("canvas");
  frame.width = canvas.width; frame.height = canvas.height;
  const fctx = frame.getContext("2d");
  fctx.globalCompositeOperation = "lighter";
  fctx.globalAlpha = 0.4;
  fctx.filter = `blur(${(fs * 0.3).toFixed(1)}px)`;
  fctx.drawImage(colored, 0, 0);
  fctx.globalAlpha = 0.7;
  fctx.filter = `blur(${(fs * 0.09).toFixed(1)}px)`;
  fctx.drawImage(colored, 0, 0);
  fctx.filter = "none";
  fctx.globalCompositeOperation = "source-over";
  fctx.globalAlpha = 1;
  fctx.drawImage(colored, 0, 0);
  // Bright white core for the neon-tube highlight.
  fctx.globalCompositeOperation = "lighter";
  fctx.globalAlpha = 0.5;
  fctx.filter = `blur(${(fs * 0.02 + 1).toFixed(1)}px)`;
  fctx.drawImage(baseLayer, 0, 0);
  fctx.filter = "none";
  fctx.globalAlpha = 1;

  compositeMirrored(frame, 1, "source-over");
}

// Hidable reference overlay: same warped letters tinted pink, so the user can
// read the source text and see how it bends around the frame.
function drawTextReference() {
  if (!state.useTextSeed || !state.showTextReference) return;
  const cfg = getFrameWarpConfig();
  if (!cfg) return;
  const layer = warpStripToLayer(cfg);
  tintLayer(layer, "#ff5ea0");
  compositeMirrored(layer, 0.55, "screen");
}

function draw() {
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (state.backgroundImage) {
    drawImageCover(state.backgroundImage);
  }

  ctx.fillStyle = hexToRgba(state.bgColor, state.bgAlpha);
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawGlassPolishFx();

  // In text-as-stroke mode the visible frame is the clean glyph fill; the raw
  // contour strokes are kept only as an FX mask source, so don't draw them here.
  const textFrameMode = state.useTextSeed && state.textAsStroke && state.textSeedValue.trim();
  if (!textFrameMode) {
    for (const path of state.paths) {
      drawPath(path.points, path.width, state.progress, path.phase);
      for (const branch of path.branches) {
        drawPath(branch.points, branch.width, clamp(state.progress * 1.2 - 0.15, 0, 1), path.phase + 1.7);
      }
    }
  }
  drawTextFrame();
  drawEdgeLightShadowFx();
  drawBubbleBlurFx();
  drawEmbossFx();
  drawHalftoneNoiseFx();
  drawCrayonPaperTexture();
  drawAudioTravellers();

  drawTextReference();
  drawLogoImage();
  ctx.restore();
}

function tick(now) {
  const delta = Math.min(80, now - state.lastFrame);
  state.lastFrame = now;
  updateAudioLevel();
  const audioActive = isAudioMotionActive();
  const phaseSpeed = 0.00035 + clamp(state.speed, 0.002, 0.08) * 0.024;
  state.audioMotionPhase += delta * phaseSpeed * (1 + state.audioLevel * 5.2 + state.audioBassLevel * 2.8 + state.audioBeat * 4.2 + state.audioTransient * 5.8);

  if (state.animate) {
    if (state.progress < 1) {
      state.progress = clamp(state.progress + state.speed * delta, 0, 1);
      draw();
    } else {
      state.hold += delta;
      if (state.hold > state.visibleTime * 1000) {
        state.progress = 0;
        state.hold = 0;
        draw();
      } else {
        draw();
      }
    }
  } else if (audioActive) {
    draw();
  }
  requestAnimationFrame(tick);
}

function updateMarker(force = false) {
  const rect = canvas.getBoundingClientRect();
  marker.style.width = `${rect.width * state.textAreaW / 100}px`;
  marker.style.height = `${rect.height * state.textAreaH / 100}px`;
  if (!force) {
    marker.style.transition = "opacity 0.1s";
    marker.style.opacity = "1";
    clearTimeout(updateMarker.timeout);
    updateMarker.timeout = setTimeout(() => {
      marker.style.transition = "opacity 0.5s";
      marker.style.opacity = "0";
    }, 500);
  }
}

function updateLogoMarker(force = false) {
  if (!state.logoImage) {
    logoMarker.style.opacity = "0";
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const logoRect = getLogoRect();
  const scaleX = rect.width / state.canvasWidth;
  const scaleY = rect.height / state.canvasHeight;
  logoMarker.style.width = `${logoRect.w * scaleX}px`;
  logoMarker.style.height = `${logoRect.h * scaleY}px`;
  logoMarker.style.left = `${canvas.offsetLeft + (logoRect.x + logoRect.w / 2) * scaleX}px`;
  logoMarker.style.top = `${canvas.offsetTop + (logoRect.y + logoRect.h / 2) * scaleY}px`;

  if (!force) {
    logoMarker.style.transition = "opacity 0.1s";
    logoMarker.style.opacity = "0.9";
    clearTimeout(updateLogoMarker.timeout);
    updateLogoMarker.timeout = setTimeout(() => {
      logoMarker.style.transition = "opacity 0.6s";
      logoMarker.style.opacity = "0.45";
    }, 500);
  } else {
    logoMarker.style.opacity = "0.45";
  }
}

function setControlPosition(value) {
  controls.classList.remove("stacked", "along-top", "hideControls");
  controls.classList.add(value);
  document.querySelectorAll("input[name='controlsPosition']").forEach((radio) => {
    const selected = radio.value === value;
    radio.checked = selected;
    radio.closest("label").classList.toggle("selected", selected);
  });
}

function tryAnchorDownload(url, fileName) {
  const link = document.createElement("a");
  link.download = fileName;
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener";
  document.body.appendChild(link);
  link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  link.remove();
}

function downloadPng() {
  const fileName = `eternal-pattern-${Date.now()}.png`;
  const failMessage = "Download is blocked in this browser tab. A preview will open; right-click the image to save.";
  const fileProtocolMode = window.location.protocol === "file:";

  try {
    const dataUrl = canvas.toDataURL("image/png");
    tryAnchorDownload(dataUrl, fileName);
    if (fileProtocolMode) {
      window.open(dataUrl, "_blank", "noopener");
      alert("You are in file:// mode. If download is blocked, use the opened image tab and Save As.");
    }
    return;
  } catch (dataUrlErr) {
    console.error(dataUrlErr);
  }

  try {
    canvas.toBlob((blob) => {
      if (blob) {
        const objectUrl = URL.createObjectURL(blob);
        try {
          tryAnchorDownload(objectUrl, fileName);
        } finally {
          setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
        }
        return;
      }

      try {
        const dataUrl = canvas.toDataURL("image/png");
        tryAnchorDownload(dataUrl, fileName);
      } catch (dataErr) {
        const fallback = window.open("", "_blank");
        if (fallback) fallback.document.write(`<title>${fileName}</title><p style="font-family:monospace;padding:16px;">${failMessage}</p>`);
        alert("Download failed. This canvas may be blocked by browser security (cross-origin image).");
        console.error(dataErr);
      }
    }, "image/png");
  } catch (blobErr) {
    alert("Download failed. This canvas may be blocked by browser security (cross-origin image).");
    console.error(blobErr);
  }
}

async function ensureAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.52;
    analyser.connect(audioContext.destination);
  }
  if (audioContext.state === "suspended") await audioContext.resume();
}

function connectAudioElement(element) {
  if (!audioContext || !analyser || !element) return false;
  if (audioSource && audioSourceElement === element) return true;
  if (audioSource) audioSource.disconnect();
  try {
    audioSource = audioContext.createMediaElementSource(element);
    audioSource.connect(analyser);
    audioSourceElement = element;
    return true;
  } catch (error) {
    console.error("Audio analyser connection failed", error);
    document.getElementById("audioLevel").textContent = "ERR";
    return false;
  }
}

function updateAudioLevel() {
  if (!analyser) {
    state.audioLevel *= 0.9;
    state.audioBassLevel *= 0.9;
    state.audioMidLevel *= 0.9;
    state.audioTrebleLevel *= 0.9;
    state.audioBeat *= 0.88;
    state.audioTransient *= 0.82;
    return;
  }
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);

  const averageRange = (startRatio, endRatio) => {
    const start = Math.max(1, Math.floor(data.length * startRatio));
    const end = Math.max(start + 1, Math.floor(data.length * endRatio));
    let total = 0;
    for (let i = start; i < end; i += 1) total += data[i];
    return total / (end - start) / 255;
  };
  const smooth = (previous, next, attack = 0.38, release = 0.14) => previous + (next - previous) * (next > previous ? attack : release);

  const rawBass = averageRange(0.004, 0.08);
  const rawMid = averageRange(0.08, 0.36);
  const rawTreble = averageRange(0.36, 0.92);
  const weightedEnergy = clamp(rawBass * 0.56 + rawMid * 0.31 + rawTreble * 0.13, 0, 1);
  const rawEnergy = Math.pow(weightedEnergy, 0.82);
  const previousEnergy = state.audioLevel;
  const bassTransient = Math.max(0, rawBass - state.audioBassLevel);
  const transient = Math.max(0, rawEnergy - previousEnergy, bassTransient * 0.9);

  state.audioBassLevel = smooth(state.audioBassLevel, rawBass, 0.74, 0.22);
  state.audioMidLevel = smooth(state.audioMidLevel, rawMid, 0.56, 0.18);
  state.audioTrebleLevel = smooth(state.audioTrebleLevel, rawTreble, 0.5, 0.16);
  state.audioLevel = smooth(state.audioLevel, rawEnergy, 0.68, 0.22);
  state.audioTransient = Math.max(transient * 3.8, state.audioTransient * 0.64);
  state.audioAverage = state.audioAverage * 0.97 + rawEnergy * 0.03;

  const beatThreshold = Math.max(0.038, state.audioAverage * 1.08);
  const beatHit = rawBass > beatThreshold && transient > 0.008;
  const beatDecay = 0.79 + clamp(state.visibleTime, 0.2, 3) * 0.035;
  state.audioBeat = beatHit ? Math.min(1, Math.max(state.audioBeat * 0.45, 0.58 + transient * 3.8 + rawBass * 0.36)) : state.audioBeat * Math.min(0.94, beatDecay);

  document.getElementById("audioLevel").textContent = state.audioLevel.toFixed(2);
}

async function toggleDemoAudio() {
  await ensureAudioContext();
  const button = document.getElementById("demoAudio");
  if (demoPlaying) {
    oscillator?.stop();
    oscillator = null;
    gainNode?.disconnect();
    gainNode = null;
    demoPlaying = false;
    button.classList.remove("playing");
    button.textContent = "Demo Audio";
    return;
  }

  if (audioElement && !audioElement.paused) {
    audioElement.pause();
    document.getElementById("playUploaded").classList.remove("playing");
  }

  oscillator = audioContext.createOscillator();
  gainNode = audioContext.createGain();
  oscillator.type = "sawtooth";
  oscillator.frequency.value = 74;
  gainNode.gain.value = 0.035;
  oscillator.connect(gainNode);
  gainNode.connect(analyser);
  oscillator.start();
  demoPlaying = true;
  button.classList.add("playing");
  button.textContent = "Pause";
}

async function handleAudioUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  await ensureAudioContext();
  if (audioElement) {
    audioElement.pause();
  }
  if (audioObjectUrl) {
    URL.revokeObjectURL(audioObjectUrl);
  }
  audioObjectUrl = URL.createObjectURL(file);
  audioElement = new Audio();
  audioElement.preload = "auto";
  audioElement.loop = true;
  audioElement.src = audioObjectUrl;
  audioElement.addEventListener("ended", () => {
    document.getElementById("playUploaded").classList.remove("playing");
  });
  audioElement.addEventListener("error", () => {
    document.getElementById("audioLevel").textContent = "ERR";
    console.error("Audio file could not be decoded", audioElement.error);
  });
  connectAudioElement(audioElement);
  const button = document.getElementById("playUploaded");
  button.disabled = false;
  button.classList.remove("playing");
  button.textContent = file.name.length > 18 ? `${file.name.slice(0, 18)}...` : file.name;
  document.getElementById("audioLevel").textContent = "0.00";
}

async function toggleUploadedAudio() {
  if (!audioElement) return;
  await ensureAudioContext();
  const button = document.getElementById("playUploaded");
  if (audioElement.paused) {
    if (!connectAudioElement(audioElement)) return;
    if (demoPlaying) {
      oscillator?.stop();
      oscillator = null;
      gainNode?.disconnect();
      gainNode = null;
      demoPlaying = false;
      const demoButton = document.getElementById("demoAudio");
      demoButton.classList.remove("playing");
      demoButton.textContent = "Demo Audio";
    }
    try {
      await audioElement.play();
      button.classList.add("playing");
      updateAudioLevel();
      draw();
    } catch (error) {
      button.classList.remove("playing");
      document.getElementById("audioLevel").textContent = "BLOCKED";
      console.error("Audio playback failed", error);
    }
  } else {
    audioElement.pause();
    button.classList.remove("playing");
  }
}

function clearBackgroundImage() {
  if (backgroundImageUrl) {
    URL.revokeObjectURL(backgroundImageUrl);
    backgroundImageUrl = undefined;
  }
  state.backgroundImage = null;
  document.getElementById("bgUpload").value = "";
  document.getElementById("clearBg").disabled = true;
  document.getElementById("bgFileName").textContent = "No background image";
  draw();
}

async function handleBackgroundUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (backgroundImageUrl) URL.revokeObjectURL(backgroundImageUrl);
  const imageUrl = URL.createObjectURL(file);
  const image = new Image();
  try {
    image.src = imageUrl;
    await image.decode();
    state.backgroundImage = image;
    backgroundImageUrl = imageUrl;
    document.getElementById("clearBg").disabled = false;
    document.getElementById("bgFileName").textContent = file.name;
    setCanvasFillAlpha(0);
    draw();
  } catch {
    URL.revokeObjectURL(imageUrl);
    event.target.value = "";
  }
}

function clearLogoImage() {
  if (logoImageUrl) {
    URL.revokeObjectURL(logoImageUrl);
    logoImageUrl = undefined;
  }
  state.logoImage = null;
  document.getElementById("logoUpload").value = "";
  document.getElementById("clearLogo").disabled = true;
  document.getElementById("logoFileName").textContent = "No logo image";
  updateLogoMarker(true);
  buildPattern();
}

async function handleLogoUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (logoImageUrl) URL.revokeObjectURL(logoImageUrl);
  const imageUrl = URL.createObjectURL(file);
  const image = new Image();
  try {
    image.src = imageUrl;
    await image.decode();
    state.logoImage = image;
    logoImageUrl = imageUrl;
    document.getElementById("clearLogo").disabled = false;
    document.getElementById("logoFileName").textContent = file.name;
    updateLogoMarker(true);
    buildPattern();
  } catch {
    URL.revokeObjectURL(imageUrl);
    event.target.value = "";
  }
}

function bindControls() {
  const rebuildKeys = new Set([
    "canvasWidth",
    "canvasHeight",
    "canvasPadding",
    "textAreaW",
    "textAreaH",
    "density",
    "straightLines",
    "flourishes",
    "blankAreas",
    "lineThickness",
    "widthVariation",
    "taperStrength",
    "curveSmoothness",
    "circleGuideDensity",
    "circleGuideInfluence",
    "circleMinRadius",
    "circleMaxRadius",
    "noOverlapGap",
    "logoX",
    "logoY",
    "logoW",
    "logoH",
  ]);

  sliders.forEach((input) => {
    input.addEventListener("input", () => {
      const key = input.dataset.key;
      state[key] = Number(input.value);
      if (key === "crayonStrength") state.fxWaxStrength = state.crayonStrength;
      if (key === "fxWaxStrength") state.crayonStrength = state.fxWaxStrength;
      syncInputs();
      if (key.startsWith("textArea")) updateMarker();
      if (key.startsWith("logo")) updateLogoMarker();
      if (key === "canvasWidth" || key === "canvasHeight") resizeCanvas();
      if (rebuildKeys.has(key)) {
        buildPattern();
      } else {
        draw();
      }
    });
  });

  numberInputs.forEach((input) => {
    input.addEventListener("change", () => {
      const key = input.dataset.key;
      state[key] = Number(input.value);
      syncInputs();
      if (key === "canvasWidth" || key === "canvasHeight") {
        resizeCanvas();
        buildPattern();
      } else {
        draw();
      }
    });
  });

  document.querySelectorAll("input[name='controlsPosition']").forEach((radio) => {
    radio.addEventListener("change", () => setControlPosition(radio.value));
  });

  document.querySelectorAll("input[name='colorChoice']").forEach((radio) => {
    radio.addEventListener("change", () => {
      state.colorChoice = radio.value;
      applyColorPreset(state.colorChoice);
      document.getElementById("selectedColorTag").textContent = radio.value;
      document.querySelectorAll(".color-option").forEach((label) => {
        label.classList.toggle("selected", label.querySelector("input").checked);
      });
      draw();
    });
  });

  document.querySelectorAll("input[name='mirrorMode']").forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      state.mirrorMode = radio.value;
      buildPattern();
    });
  });

  document.getElementById("textSeedInput").addEventListener("input", (event) => {
    state.textSeedValue = event.target.value;
    updateTextSeedMeta(state.textSeedValue);
  });
  document.getElementById("textSeedInput").addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    buildPattern();
  });

  document.getElementById("subtitleInput").addEventListener("input", (event) => {
    state.subtitleValue = event.target.value;
  });
  document.getElementById("subtitleInput").addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    buildPattern();
  });

  document.getElementById("textSeedToggle").addEventListener("change", (event) => {
    state.useTextSeed = event.target.checked;
    updateTextSeedMeta(state.textSeedValue);
    buildPattern();
  });

  document.getElementById("textReferenceToggle").addEventListener("change", (event) => {
    state.showTextReference = event.target.checked;
    draw();
  });

  document.getElementById("textAsStrokeToggle").addEventListener("change", (event) => {
    state.textAsStroke = event.target.checked;
    buildPattern();
  });

  document.getElementById("textColorInput").addEventListener("input", (event) => {
    state.textColor = event.target.value;
    draw();
  });

  document.getElementById("applyTextSeed").addEventListener("click", () => {
    buildPattern();
  });
  document.getElementById("fxBubbleToggle").addEventListener("change", (event) => {
    state.fxBubbleBlur = event.target.checked;
    draw();
  });
  document.getElementById("fxGlassToggle").addEventListener("change", (event) => {
    state.fxGlassPolish = event.target.checked;
    draw();
  });

  document.getElementById("canvasPresets").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-size]");
    if (!button) return;
    const size = button.dataset.size;
    const presets = {
      full: [window.innerWidth * 2, window.innerHeight * 2],
      "9x16": [1080, 1920],
      "4x5": [1080, 1350],
      "16x9": [1920, 1080],
    };
    [state.canvasWidth, state.canvasHeight] = presets[size];
    syncInputs();
    resizeCanvas();
    buildPattern();
  });

  document.getElementById("animateToggle").addEventListener("change", (event) => {
    state.animate = event.target.checked;
    document.getElementById("motionControls").classList.toggle("closed", !state.animate);
    state.progress = state.animate ? 0 : 1;
    state.hold = 0;
    draw();
  });

  document.getElementById("generateButton").addEventListener("click", buildPattern);
  document.getElementById("downloadButton").addEventListener("click", downloadPng);
  document.getElementById("startFromBottomToggle").addEventListener("change", (event) => {
    state.startFromBottom = event.target.checked;
    buildPattern();
  });
  document.getElementById("bgUpload").addEventListener("change", handleBackgroundUpload);
  document.getElementById("clearBg").addEventListener("click", clearBackgroundImage);
  document.getElementById("logoUpload").addEventListener("change", handleLogoUpload);
  document.getElementById("clearLogo").addEventListener("click", clearLogoImage);
  document.getElementById("demoAudio").addEventListener("click", toggleDemoAudio);
  document.getElementById("audioUpload").addEventListener("change", handleAudioUpload);
  document.getElementById("playUploaded").addEventListener("click", toggleUploadedAudio);
  document.getElementById("mobileToggle").addEventListener("click", () => controls.classList.toggle("hideControls"));

  document.getElementById("bgColorInput").addEventListener("input", (event) => {
    state.bgColor = event.target.value;
    draw();
  });
  document.getElementById("bgAlphaInput").addEventListener("input", (event) => {
    state.bgAlpha = Number(event.target.value);
    document.getElementById("bgAlphaValue").textContent = state.bgAlpha.toFixed(2);
    draw();
  });
  document.getElementById("strokeColorInput").addEventListener("input", (event) => {
    state.strokeColor = event.target.value;
    document.getElementById("fxPatternColorInput").value = state.strokeColor;
    draw();
  });
  document.getElementById("fxPatternColorInput").addEventListener("input", (event) => {
    state.strokeColor = event.target.value;
    document.getElementById("strokeColorInput").value = state.strokeColor;
    draw();
  });
  document.getElementById("fxBubbleColorInput").addEventListener("input", (event) => {
    state.fxBubbleGlowColor = event.target.value;
    draw();
  });
  document.getElementById("strokeAlphaInput").addEventListener("input", (event) => {
    state.strokeAlpha = Number(event.target.value);
    document.getElementById("strokeAlphaValue").textContent = state.strokeAlpha.toFixed(2);
    draw();
  });
  document.getElementById("outlineToggle").addEventListener("change", (event) => {
    state.outlineStroke = event.target.checked;
    draw();
  });
  document.getElementById("outlineColorInput").addEventListener("input", (event) => {
    state.outlineColor = event.target.value;
    draw();
  });
  document.getElementById("outlineAlphaInput").addEventListener("input", (event) => {
    state.outlineAlpha = Number(event.target.value);
    document.getElementById("outlineAlphaValue").textContent = state.outlineAlpha.toFixed(2);
    draw();
  });

  window.addEventListener("resize", () => {
    updateMarker(true);
    updateLogoMarker(true);
  });
}

applyColorPreset(state.colorChoice);
document.getElementById("startFromBottomToggle").checked = state.startFromBottom;
document.getElementById("textSeedToggle").checked = state.useTextSeed;
document.getElementById("textReferenceToggle").checked = state.showTextReference;
document.getElementById("textAsStrokeToggle").checked = state.textAsStroke;
document.getElementById("textColorInput").value = state.textColor;
document.getElementById("textSeedInput").value = state.textSeedValue;
document.getElementById("subtitleInput").value = state.subtitleValue;
document.getElementById("fxBubbleToggle").checked = state.fxBubbleBlur;
document.getElementById("fxGlassToggle").checked = state.fxGlassPolish;
document.getElementById("fxPatternColorInput").value = state.strokeColor;
document.getElementById("fxBubbleColorInput").value = state.fxBubbleGlowColor;
document.querySelectorAll("input[name='mirrorMode']").forEach((radio) => {
  radio.checked = radio.value === state.mirrorMode;
});
updateTextSeedMeta(state.textSeedValue);
syncInputs();
resizeCanvas();
bindControls();
buildPattern();
updateLogoMarker(true);
requestAnimationFrame(tick);
