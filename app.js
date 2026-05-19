const canvas = document.getElementById("patternCanvas");
const ctx = canvas.getContext("2d");
const controls = document.getElementById("controls");
const marker = document.getElementById("textAreaMarker");
const logoMarker = document.getElementById("logoPlaceholderMarker");

const state = {
  canvasWidth: 1400,
  canvasHeight: 1400,
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
  mirrorMode: "horizontal",
  startFromBottom: true,
  useCircleScaffold: true,
  showGuides: false,
  textSeedValue: "",
  useTextSeed: true,
  crayonEffect: false,
  crayonStrength: 0.45,
  fxWaxTexture: true,
  fxWaxStrength: 0.52,
  fxEdgeLightShadow: true,
  fxEdgeStrength: 0.48,
  fxBubbleBlur: true,
  fxBubbleStrength: 0.45,
  fxBubbleOutlinePx: 4,
  fxBubbleGlowColor: "#8f8796",
  fxEmbossDepth: false,
  fxEmbossStrength: 0.34,
  fxHalftoneNoise: false,
  fxHalftoneMix: 0.38,
  visibleTime: 1.3,
  speed: 0.012,
  colorChoice: "black",
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
  progress: 1,
  hold: 0,
  lastFrame: performance.now(),
  audioLevel: 0,
  seed: Date.now(),
};

let audioContext;
let analyser;
let audioSource;
let audioElement;
let oscillator;
let gainNode;
let demoPlaying = false;
let backgroundImageUrl;
let logoImageUrl;
let halftoneNoiseCache = { key: "", canvas: null };

const colorModes = {
  black: { bg: "#f8f8f6", bgAlpha: 1, stroke: "#050505", strokeAlpha: 1, outline: false },
  "faint black": { bg: "#f8f8f6", bgAlpha: 1, stroke: "#050505", strokeAlpha: 0.35, outline: false },
  "black outlines": { bg: "#f8f8f6", bgAlpha: 1, stroke: "#050505", strokeAlpha: 1, outline: true },
  white: { bg: "#050505", bgAlpha: 1, stroke: "#ffffff", strokeAlpha: 1, outline: false },
  "faint white": { bg: "#050505", bgAlpha: 1, stroke: "#ffffff", strokeAlpha: 0.35, outline: false },
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

function resizeCanvas() {
  canvas.width = Math.round(state.canvasWidth);
  canvas.height = Math.round(state.canvasHeight);
  updateMarker(true);
  updateLogoMarker(true);
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
  if (!state.useCircleScaffold) return;

  const minSide = Math.min(state.canvasWidth, state.canvasHeight);
  const density = clamp(options.circleGuideDensity ?? state.circleGuideDensity, 0.1, 1);
  const count = Math.floor(16 + density * 58);
  const maxAttempts = count * 16;
  const minR = minSide * (0.012 + (1 - density) * 0.01);
  const maxR = minSide * (0.05 + density * 0.05);

  for (let i = 0; i < maxAttempts && state.guideCircles.length < count; i += 1) {
    const r = rand(minR, maxR);
    const x = rand(r + 8, state.canvasWidth - r - 8);
    const yBase = state.startFromBottom ? Math.pow(rand(), 2.4) : rand();
    const y = clamp((1 - yBase * 0.96) * state.canvasHeight, r + 8, state.canvasHeight - r - 8);
    if (pointInTextRect(x, y, r * 1.2) || pointInBlankZone(x, y)) continue;

    let collide = false;
    for (const c of state.guideCircles) {
      if (Math.hypot(x - c.x, y - c.y) < r + c.r + minSide * 0.006) {
        collide = true;
        break;
      }
    }
    if (collide) continue;
    state.guideCircles.push({ x, y, r });
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
    x = cx + signX * rand(gapPad + 20, state.canvasWidth * 0.42);
    y = state.startFromBottom ? rand(state.canvasHeight * 0.74, state.canvasHeight * 0.96) : cy + signY * rand(gapPad + 20, state.canvasHeight * 0.42);
  }
  return { x: clamp(x, margin, state.canvasWidth - margin), y: clamp(y, margin, state.canvasHeight - margin) };
}

function createCurlPath(signX, signY, options = {}) {
  const minSide = Math.min(state.canvasWidth, state.canvasHeight);
  const margin = minSide * 0.035;
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
  if (path.points.length < 8 || path.type === "straight") return;
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
  const runtime = {
    straightLines: straightValue,
    flourishes: flourishesValue,
    curveSmoothness: smoothnessValue,
    circleGuideDensity: circleDensityValue,
    circleGuideInfluence: circleInfluenceValue,
  };

  createBlankZones();
  createCircleGuides(runtime);
  const audioBoost = clamp(state.audioLevel * 0.8, 0, 0.2);
  const count = Math.floor(7 + (densityValue + audioBoost) * 20);
  const maxAttempts = count * 24;
  const collisionMap = new Map();
  const collisionCell = Math.max(10, state.lineThickness * 1.3);
  const minDistance = Math.max(8, state.lineThickness * 1.8);
  const basePaths = [];
  let attempts = 0;

  while (basePaths.length < count && attempts < maxAttempts) {
    attempts += 1;
    const seedSignX = state.mirrorMode === "vertical" ? (chance(0.5) ? -1 : 1) : -1;
    const path = createCurlPath(seedSignX, state.startFromBottom ? 1 : -1, runtime);
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
  layerCtx.fillStyle = hexToRgba(color, alpha);
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

function drawEdgeLightShadowFx() {
  if (!state.fxEdgeLightShadow) return;
  const amount = clamp(state.fxEdgeStrength, 0, 1);
  if (amount < 0.01) return;

  const lightOffset = 0.4 + amount * 2.8;
  const blur = 0.8 + amount * 4.8;
  const light = mixRgb(state.strokeColor, "#ffffff", 0.8);

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
    strokePolyline(points, width, progress, "#000000", 0.08 + amount * 0.32, {
      widthScale: 1.62 + amount * 0.56,
      blur: blur * 0.92,
      offsetX: lightOffset,
      offsetY: lightOffset,
    });
  });
  ctx.restore();
}

function drawBubbleBlurFx() {
  if (!state.fxBubbleBlur) return;
  const amount = clamp(state.fxBubbleStrength, 0, 1);
  if (amount < 0.01) return;

  const scale = Math.min(1, 1800 / Math.max(canvas.width, canvas.height));
  const bodyExpandPx = 22 + amount * 26;
  const mergeBlurPx = 4 + amount * 8;
  const outlinePx = clamp(state.fxBubbleOutlinePx, 0, 14);
  const shellWidthScale = 1.08 + amount * 0.22;
  const blurColor = state.fxBubbleGlowColor;

  const softUnion = drawExpandedPathMask(shellWidthScale, bodyExpandPx, mergeBlurPx, scale);
  const bodyMask = thresholdMask(softUnion, 18 + amount * 14);
  const innerBodyMask = erodeMask(bodyMask, outlinePx * scale);
  const hardOuterEdgeMask = subtractMask(bodyMask, innerBodyMask);

  const outerGlowMask = drawExpandedPathMask(shellWidthScale, bodyExpandPx + 10 + amount * 8, 8 + amount * 16, scale);
  drawFxLayer(tintedMaskLayer(outerGlowMask, "#ffffff", 0.22 + amount * 0.42), "screen", 0.78);

  const innerGlowLayer = createFxCanvas(scale);
  const innerGlowCtx = innerGlowLayer.getContext("2d");
  innerGlowCtx.save();
  innerGlowCtx.scale(scale, scale);
  forEachPathSegment((points, width, progress) => {
    strokePolyline(points, width, progress, blurColor, 0.24 + amount * 0.34, {
      widthScale: 1.15 + amount * 0.26,
      expandPx: bodyExpandPx * (0.28 + amount * 0.18),
      blur: (5 + amount * 10) * scale,
    }, innerGlowCtx);
    strokePolyline(points, width, progress, "#ffffff", 0.06 + amount * 0.16, {
      widthScale: 1.05 + amount * 0.16,
      expandPx: bodyExpandPx * 0.18,
      blur: (8 + amount * 12) * scale,
    }, innerGlowCtx);
  });
  innerGlowCtx.restore();
  innerGlowCtx.save();
  innerGlowCtx.globalCompositeOperation = "destination-in";
  innerGlowCtx.drawImage(innerBodyMask, 0, 0);
  innerGlowCtx.restore();
  drawFxLayer(innerGlowLayer, "source-over", 0.9);

  const shadowMask = drawExpandedPathMask(shellWidthScale, Math.max(2, bodyExpandPx - outlinePx * 0.8), 5 + amount * 6, scale);
  drawFxLayer(tintedMaskLayer(shadowMask, "#000000", 0.08 + amount * 0.18), "multiply", 0.7);

  const hardEdgeLayer = tintedMaskLayer(hardOuterEdgeMask, "#ffffff", 0.92);
  const hardEdgeCtx = hardEdgeLayer.getContext("2d");
  hardEdgeCtx.save();
  hardEdgeCtx.globalCompositeOperation = "screen";
  hardEdgeCtx.filter = `blur(${Math.max(0.7, 1.3 * scale).toFixed(2)}px)`;
  hardEdgeCtx.drawImage(tintedMaskLayer(hardOuterEdgeMask, "#ffffff", 0.65), 0, 0);
  hardEdgeCtx.restore();
  drawFxLayer(hardEdgeLayer, "source-over", 1);
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
  drawPathMask(mctx, 1.36);

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

  const w = canvas.width;
  const h = canvas.height;
  const grainCount = Math.floor((w * h) / 2400 * (0.28 + rough * 1.45));
  const sizeMin = 0.6;
  const sizeMax = 1.8 + rough * 1.7;

  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  for (let i = 0; i < grainCount; i += 1) {
    const x = stableNoise(i * 12.989 + 17.3) * w;
    const y = stableNoise(i * 78.233 + 91.7) * h;
    const tone = stableNoise(i * 35.173 + 6.4);
    if (tone < 0.42) continue;
    const size = sizeMin + stableNoise(i * 9.17 + 2.1) * (sizeMax - sizeMin);
    const alpha = (0.018 + rough * 0.06) * (0.55 + tone * 0.75);
    ctx.fillStyle = `rgba(0,0,0,${alpha.toFixed(3)})`;
    ctx.fillRect(x, y, size, size * (0.75 + stableNoise(i * 5.91) * 0.7));
  }

  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < grainCount * 0.72; i += 1) {
    const x = stableNoise(i * 51.731 + 33.2) * w;
    const y = stableNoise(i * 19.117 + 44.8) * h;
    const tone = stableNoise(i * 7.717 + 12.6);
    if (tone < 0.58) continue;
    const size = sizeMin + stableNoise(i * 4.63 + 8.5) * (sizeMax - sizeMin);
    const alpha = (0.014 + rough * 0.05) * (0.5 + tone * 0.7);
    ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
    ctx.fillRect(x, y, size, size * (0.7 + stableNoise(i * 6.21) * 0.8));
  }
  ctx.restore();
}

function draw() {
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (state.backgroundImage) {
    drawImageCover(state.backgroundImage);
  }

  ctx.fillStyle = hexToRgba(state.bgColor, state.bgAlpha);
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawGuideCircles();

  for (const path of state.paths) {
    drawPath(path.points, path.width, state.progress, path.phase);
    for (const branch of path.branches) {
      drawPath(branch.points, branch.width, clamp(state.progress * 1.2 - 0.15, 0, 1), path.phase + 1.7);
    }
  }
  drawEdgeLightShadowFx();
  drawBubbleBlurFx();
  drawEmbossFx();
  drawHalftoneNoiseFx();
  drawCrayonPaperTexture();
  drawLogoImage();
  ctx.restore();
}

function tick(now) {
  const delta = Math.min(80, now - state.lastFrame);
  state.lastFrame = now;
  updateAudioLevel();

  if (state.animate) {
    if (state.progress < 1) {
      state.progress = clamp(state.progress + state.speed * delta * (1 + state.audioLevel * 1.8), 0, 1);
    } else {
      state.hold += delta;
      if (state.hold > state.visibleTime * 1000) buildPattern();
    }
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

function showToggleMessage() {
  const message = document.getElementById("toggleMessage");
  message.style.display = "block";
  message.style.opacity = "1";
  setTimeout(() => {
    message.style.transition = "opacity 0.5s";
    message.style.opacity = "0";
    setTimeout(() => {
      message.style.display = "none";
      message.style.transition = "";
    }, 500);
  }, 2200);
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
    audioContext = new AudioContext();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.82;
    analyser.connect(audioContext.destination);
  }
  if (audioContext.state === "suspended") await audioContext.resume();
}

function connectAudioElement(element) {
  if (!audioContext || !analyser) return;
  if (audioSource) audioSource.disconnect();
  audioSource = audioContext.createMediaElementSource(element);
  audioSource.connect(analyser);
}

function updateAudioLevel() {
  if (!analyser) return;
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  let total = 0;
  for (let i = 0; i < data.length; i += 1) total += data[i];
  state.audioLevel = total / data.length / 255;
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
    button.textContent = "Demon Box Audio";
    return;
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
  state.animate = true;
  document.getElementById("animateToggle").checked = true;
  document.getElementById("motionControls").classList.remove("closed");
}

async function handleAudioUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  await ensureAudioContext();
  if (audioElement) {
    audioElement.pause();
    URL.revokeObjectURL(audioElement.src);
  }
  audioElement = new Audio(URL.createObjectURL(file));
  audioElement.crossOrigin = "anonymous";
  connectAudioElement(audioElement);
  const button = document.getElementById("playUploaded");
  button.disabled = false;
  button.textContent = file.name.length > 18 ? `${file.name.slice(0, 18)}...` : file.name;
}

async function toggleUploadedAudio() {
  if (!audioElement) return;
  await ensureAudioContext();
  const button = document.getElementById("playUploaded");
  if (audioElement.paused) {
    audioElement.play();
    button.classList.add("playing");
    state.animate = true;
    document.getElementById("animateToggle").checked = true;
    document.getElementById("motionControls").classList.remove("closed");
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

  document.getElementById("textSeedToggle").addEventListener("change", (event) => {
    state.useTextSeed = event.target.checked;
    updateTextSeedMeta(state.textSeedValue);
    buildPattern();
  });

  document.getElementById("applyTextSeed").addEventListener("click", () => {
    buildPattern();
  });
  document.getElementById("crayonToggle").addEventListener("change", (event) => {
    state.crayonEffect = event.target.checked;
    state.fxWaxTexture = event.target.checked;
    document.getElementById("fxWaxToggle").checked = state.fxWaxTexture;
    draw();
  });
  document.getElementById("fxWaxToggle").addEventListener("change", (event) => {
    state.fxWaxTexture = event.target.checked;
    state.crayonEffect = state.fxWaxTexture;
    document.getElementById("crayonToggle").checked = state.fxWaxTexture;
    draw();
  });
  document.getElementById("fxEdgeToggle").addEventListener("change", (event) => {
    state.fxEdgeLightShadow = event.target.checked;
    draw();
  });
  document.getElementById("fxBubbleToggle").addEventListener("change", (event) => {
    state.fxBubbleBlur = event.target.checked;
    draw();
  });
  document.getElementById("fxEmbossToggle").addEventListener("change", (event) => {
    state.fxEmbossDepth = event.target.checked;
    draw();
  });
  document.getElementById("fxHalftoneToggle").addEventListener("change", (event) => {
    state.fxHalftoneNoise = event.target.checked;
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
  document.getElementById("circleScaffoldToggle").addEventListener("change", (event) => {
    state.useCircleScaffold = event.target.checked;
    buildPattern();
  });
  document.getElementById("showGuidesToggle").addEventListener("change", (event) => {
    state.showGuides = event.target.checked;
    draw();
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

  window.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() !== "a") return;
    if (controls.classList.contains("hideControls")) {
      setControlPosition("stacked");
    } else {
      setControlPosition("hideControls");
      showToggleMessage();
    }
  });

  window.addEventListener("resize", () => {
    updateMarker(true);
    updateLogoMarker(true);
  });
}

applyColorPreset(state.colorChoice);
document.getElementById("startFromBottomToggle").checked = state.startFromBottom;
document.getElementById("circleScaffoldToggle").checked = state.useCircleScaffold;
document.getElementById("showGuidesToggle").checked = state.showGuides;
document.getElementById("textSeedToggle").checked = state.useTextSeed;
document.getElementById("textSeedInput").value = state.textSeedValue;
state.crayonEffect = state.fxWaxTexture;
state.crayonStrength = state.fxWaxStrength;
document.getElementById("crayonToggle").checked = state.fxWaxTexture;
document.getElementById("fxWaxToggle").checked = state.fxWaxTexture;
document.getElementById("fxEdgeToggle").checked = state.fxEdgeLightShadow;
document.getElementById("fxBubbleToggle").checked = state.fxBubbleBlur;
document.getElementById("fxPatternColorInput").value = state.strokeColor;
document.getElementById("fxBubbleColorInput").value = state.fxBubbleGlowColor;
document.getElementById("fxEmbossToggle").checked = state.fxEmbossDepth;
document.getElementById("fxHalftoneToggle").checked = state.fxHalftoneNoise;
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
