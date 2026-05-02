const canvas = document.getElementById("patternCanvas");
const ctx = canvas.getContext("2d");
const controls = document.getElementById("controls");
const marker = document.getElementById("textAreaMarker");

const state = {
  canvasWidth: 1400,
  canvasHeight: 1400,
  textAreaW: 42,
  textAreaH: 54,
  density: 0.55,
  straightLines: 0.08,
  flourishes: 0.86,
  blankAreas: 0.16,
  lineThickness: 14,
  visibleTime: 1.3,
  speed: 0.012,
  blurStroke: true,
  blurStrokeSize: 30,
  blurStrokeOpacity: 0.72,
  showText: true,
  textValue: "Nothing\nPrecious",
  textSize: 116,
  textLeading: 1.25,
  colorChoice: "pink",
  animate: false,
  paths: [],
  blankZones: [],
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

const colorModes = {
  pink: { bg: "#ee7fc4", fill: "#ee7fc4", stroke: "#111111", glow: "#ff1493", alpha: 1, hollow: true },
  black: { bg: "#fbfbf8", fill: "#050505", stroke: "#111111", glow: "#ff1493", alpha: 1, hollow: false },
  blue: { bg: "#69a7ff", fill: "#69a7ff", stroke: "#111111", glow: "#ff1493", alpha: 1, hollow: true },
  green: { bg: "#9bd66f", fill: "#9bd66f", stroke: "#111111", glow: "#ff1493", alpha: 1, hollow: true },
  white: { bg: "#050505", fill: "#ffffff", stroke: "#ffffff", glow: "#ff1493", alpha: 1, hollow: false },
  outline: { bg: "#fbfbf8", fill: "#fbfbf8", stroke: "#111111", glow: "#ff1493", alpha: 1, hollow: true },
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

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function syncInputs() {
  [...sliders, ...numberInputs].forEach((input) => {
    const key = input.dataset.key;
    input.value = state[key];
  });
  document.getElementById("textAreaWValue").textContent = `${Math.round(state.textAreaW)}%`;
  document.getElementById("textAreaHValue").textContent = `${Math.round(state.textAreaH)}%`;
  document.getElementById("blurStrokeToggle").checked = state.blurStroke;
  document.getElementById("showTextToggle").checked = state.showText;
  document.getElementById("textInput").value = state.textValue;
}

function resizeCanvas() {
  canvas.width = Math.round(state.canvasWidth);
  canvas.height = Math.round(state.canvasHeight);
  updateMarker(true);
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

function pointInTextRect(x, y, pad = 0) {
  const rect = getTextRect(pad);
  return x > rect.x && x < rect.x + rect.w && y > rect.y && y < rect.y + rect.h;
}

function pointInBlankZone(x, y) {
  return state.blankZones.some((zone) => {
    const dx = (x - zone.x) / zone.rx;
    const dy = (y - zone.y) / zone.ry;
    return dx * dx + dy * dy < 1;
  });
}

function pointBlocked(x, y, pad = 0) {
  return pointInTextRect(x, y, pad) || pointInBlankZone(x, y);
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

function createSeedPoint(signX, signY, margin, gapPad) {
  const cx = state.canvasWidth / 2;
  const cy = state.canvasHeight / 2;
  const rect = getTextRect(gapPad);
  const minX = signX < 0 ? margin : cx + rect.w / 2 + rand(0, margin);
  const maxX = signX < 0 ? cx - rect.w / 2 - rand(0, margin) : state.canvasWidth - margin;
  const minY = signY < 0 ? margin : cy + rect.h / 2 + rand(0, margin);
  const maxY = signY < 0 ? cy - rect.h / 2 - rand(0, margin) : state.canvasHeight - margin;

  let x = rand(Math.min(minX, maxX), Math.max(minX, maxX));
  let y = rand(Math.min(minY, maxY), Math.max(minY, maxY));
  if (pointBlocked(x, y, gapPad)) {
    x = cx + signX * rand(gapPad + 20, state.canvasWidth * 0.42);
    y = cy + signY * rand(gapPad + 20, state.canvasHeight * 0.42);
  }
  return { x: clamp(x, margin, state.canvasWidth - margin), y: clamp(y, margin, state.canvasHeight - margin) };
}

function createCurlPath(signX, signY) {
  const minSide = Math.min(state.canvasWidth, state.canvasHeight);
  const margin = minSide * 0.035;
  const gapPad = minSide * 0.02;
  const points = [];
  const straight = chance(state.straightLines);
  const start = createSeedPoint(signX, signY, margin, gapPad);
  let x = start.x;
  let y = start.y;
  let angle = Math.atan2(signY, signX) + rand(-1.8, 1.8);
  const steps = straight ? rand(7, 15) : rand(42, 110);
  const stepSize = straight ? rand(minSide * 0.012, minSide * 0.03) : rand(minSide * 0.004, minSide * 0.012);
  const curl = rand(-0.25, 0.25);
  const wave = rand(0.08, 0.28);
  const turnEvery = rand(5, 18);

  for (let i = 0; i < steps; i += 1) {
    const t = i / Math.max(1, steps - 1);
    if (!straight) {
      angle += curl + Math.sin(t * Math.PI * turnEvery) * wave + rand(-0.22, 0.22);
    } else {
      angle += rand(-0.015, 0.015);
    }

    x += Math.cos(angle) * stepSize * rand(0.75, 1.35);
    y += Math.sin(angle) * stepSize * rand(0.75, 1.35);

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

  return {
    type: straight ? "straight" : "curl",
    points: simplifyBlockedSegments(points),
    width: rand(0.45, 1.2) * state.lineThickness,
    phase: rand(0, Math.PI * 2),
    branches: [],
  };
}

function simplifyBlockedSegments(points) {
  return points.filter((point, index) => index === 0 || !pointBlocked(point.x, point.y, 4));
}

function createBranch(anchor, tangent, width) {
  const points = [];
  const length = rand(18, 70) * (state.canvasWidth + state.canvasHeight) / 2800;
  const side = chance(0.5) ? 1 : -1;
  let angle = tangent + side * rand(0.75, 1.4);
  let x = anchor.x;
  let y = anchor.y;
  const steps = Math.floor(rand(12, 28));

  for (let i = 0; i < steps; i += 1) {
    const t = i / steps;
    angle += side * rand(0.02, 0.16);
    x += Math.cos(angle) * (length / steps);
    y += Math.sin(angle) * (length / steps);
    if (pointBlocked(x, y, 6)) break;
    points.push({ x, y });
    if (state.flourishes > 0.35 && i === steps - 1 && chance(state.flourishes)) {
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

function decoratePath(path) {
  if (path.points.length < 8 || path.type === "straight") return;
  const branchCount = Math.floor(rand(0, 4) * state.flourishes);
  for (let i = 0; i < branchCount; i += 1) {
    const index = Math.floor(rand(2, path.points.length - 3));
    const prev = path.points[index - 1];
    const next = path.points[index + 1];
    const tangent = Math.atan2(next.y - prev.y, next.x - prev.x);
    const branch = createBranch(path.points[index], tangent, path.width);
    if (branch.points.length > 2) path.branches.push(branch);
  }
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

function getFrameRect() {
  const minSide = Math.min(state.canvasWidth, state.canvasHeight);
  const textRect = getTextRect(0);
  const gap = minSide * 0.065;
  const marginX = Math.min(state.canvasWidth * 0.11, minSide * 0.14);
  const marginY = Math.min(state.canvasHeight * 0.12, minSide * 0.14);
  const textLeftLimit = state.textAreaW > 0 ? textRect.x - gap : marginX;
  const textRightLimit = state.textAreaW > 0 ? textRect.x + textRect.w + gap : state.canvasWidth - marginX;
  const textTopLimit = state.textAreaH > 0 ? textRect.y - gap : marginY;
  const textBottomLimit = state.textAreaH > 0 ? textRect.y + textRect.h + gap : state.canvasHeight - marginY;

  return {
    left: clamp(Math.min(marginX, textLeftLimit), marginX * 0.45, state.canvasWidth * 0.42),
    right: clamp(Math.max(state.canvasWidth - marginX, textRightLimit), state.canvasWidth * 0.58, state.canvasWidth - marginX * 0.45),
    top: clamp(Math.min(marginY, textTopLimit), marginY * 0.45, state.canvasHeight * 0.42),
    bottom: clamp(Math.max(state.canvasHeight - marginY, textBottomLimit), state.canvasHeight * 0.58, state.canvasHeight - marginY * 0.45),
  };
}

function makeSidePoints(rect, side, offset = 0) {
  const points = [];
  const horizontal = side === "top" || side === "bottom";
  const length = horizontal ? rect.right - rect.left : rect.bottom - rect.top;
  const steps = Math.max(26, Math.floor(length / 18));
  const minSide = Math.min(state.canvasWidth, state.canvasHeight);
  const wobble = minSide * rand(0.012, 0.036) * (1 + state.flourishes * 0.45);
  const waveA = rand(1.5, 3.6);
  const waveB = rand(4.5, 8.5);

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const wave = Math.sin(t * Math.PI * 2 * waveA + offset) * wobble +
      Math.sin(t * Math.PI * 2 * waveB + offset * 0.7) * wobble * 0.35;
    let x;
    let y;

    if (side === "top") {
      x = rect.left + t * length;
      y = rect.top + wave;
    } else if (side === "bottom") {
      x = rect.right - t * length;
      y = rect.bottom + wave;
    } else if (side === "left") {
      x = rect.left + wave;
      y = rect.bottom - t * length;
    } else {
      x = rect.right + wave;
      y = rect.top + t * length;
    }

    points.push({ x, y });
  }
  return points;
}

function tangentAt(points, index) {
  const prev = points[Math.max(0, index - 1)];
  const next = points[Math.min(points.length - 1, index + 1)];
  return Math.atan2(next.y - prev.y, next.x - prev.x);
}

function normalForSide(side) {
  if (side === "top") return -Math.PI / 2;
  if (side === "bottom") return Math.PI / 2;
  if (side === "left") return Math.PI;
  return 0;
}

function createLoop(anchor, side, scale) {
  const outward = normalForSide(side);
  const cx = state.canvasWidth / 2;
  const cy = state.canvasHeight / 2;
  const bias = Math.atan2(anchor.y - cy, anchor.x - cx);
  return {
    kind: "loop",
    x: anchor.x + Math.cos(outward) * scale * rand(0.3, 1.25),
    y: anchor.y + Math.sin(outward) * scale * rand(0.3, 1.25),
    angle: bias + rand(-0.7, 0.7),
    rx: scale * rand(0.65, 1.35),
    ry: scale * rand(0.26, 0.58),
    width: Math.max(6, state.lineThickness * rand(0.55, 0.95)),
    phase: rand(0, Math.PI * 2),
  };
}

function createLeaf(anchor, tangent, side, scale) {
  const outward = normalForSide(side);
  return {
    kind: "leaf",
    x: anchor.x + Math.cos(outward) * scale * rand(0.15, 0.8),
    y: anchor.y + Math.sin(outward) * scale * rand(0.15, 0.8),
    angle: tangent + rand(-0.9, 0.9),
    length: scale * rand(1.0, 2.35),
    width: scale * rand(0.45, 1.0),
    notch: rand(0.08, 0.22),
    phase: rand(0, Math.PI * 2),
  };
}

function createTendril(anchor, tangent, side, scale) {
  const points = [];
  const direction = chance(0.5) ? 1 : -1;
  const outward = normalForSide(side);
  let x = anchor.x;
  let y = anchor.y;
  let angle = tangent + direction * rand(0.75, 1.35) + Math.cos(outward) * 0.18;
  const steps = Math.floor(rand(20, 42));

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    angle += direction * (0.08 + t * 0.18);
    const step = scale * rand(0.06, 0.16);
    x += Math.cos(angle) * step;
    y += Math.sin(angle) * step;
    if (!pointInTextRect(x, y, scale * 0.5)) points.push({ x, y });
  }

  return {
    kind: "ribbon",
    points,
    width: Math.max(5, state.lineThickness * rand(0.34, 0.56)),
    phase: rand(0, Math.PI * 2),
  };
}

function addCornerMass(ornaments, rect) {
  const minSide = Math.min(state.canvasWidth, state.canvasHeight);
  const scale = minSide * 0.035 * (0.8 + state.flourishes);
  const corners = [
    { x: rect.left, y: rect.top, angle: -Math.PI * 0.75 },
    { x: rect.right, y: rect.top, angle: -Math.PI * 0.25 },
    { x: rect.right, y: rect.bottom, angle: Math.PI * 0.25 },
    { x: rect.left, y: rect.bottom, angle: Math.PI * 0.75 },
  ];

  for (const corner of corners) {
    if (!chance(0.45 + state.flourishes * 0.35)) continue;
    ornaments.push({
      kind: "leaf",
      x: corner.x + Math.cos(corner.angle) * scale * 0.55,
      y: corner.y + Math.sin(corner.angle) * scale * 0.55,
      angle: corner.angle,
      length: scale * rand(1.9, 3.2),
      width: scale * rand(0.7, 1.25),
      notch: rand(0.12, 0.22),
      phase: rand(0, Math.PI * 2),
    });
  }
}

function sideVectors(side) {
  if (side === "top") return { tx: 1, ty: 0, nx: 0, ny: -1 };
  if (side === "right") return { tx: 0, ty: 1, nx: 1, ny: 0 };
  if (side === "bottom") return { tx: -1, ty: 0, nx: 0, ny: 1 };
  return { tx: 0, ty: -1, nx: -1, ny: 0 };
}

function sideLength(rect, side) {
  return side === "top" || side === "bottom" ? rect.right - rect.left : rect.bottom - rect.top;
}

function sideBasePoint(rect, side, t) {
  if (side === "top") return { x: rect.left + (rect.right - rect.left) * t, y: rect.top };
  if (side === "right") return { x: rect.right, y: rect.top + (rect.bottom - rect.top) * t };
  if (side === "bottom") return { x: rect.right - (rect.right - rect.left) * t, y: rect.bottom };
  return { x: rect.left, y: rect.bottom - (rect.bottom - rect.top) * t };
}

function borderPoint(rect, side, t, normalOffset, sidePhase) {
  const base = sideBasePoint(rect, side, t);
  const vectors = sideVectors(side);
  const length = sideLength(rect, side);
  const wobble = Math.sin(t * Math.PI * 2.2 + sidePhase) * length * 0.015 +
    Math.sin(t * Math.PI * 8.5 + sidePhase * 0.4) * length * 0.004;
  return {
    x: base.x + vectors.nx * (normalOffset + wobble),
    y: base.y + vectors.ny * (normalOffset + wobble),
    sideT: t,
  };
}

function appendSideRun(points, rect, side, fromT, toT, phase, normalOffset) {
  const length = sideLength(rect, side);
  const steps = Math.max(2, Math.ceil(Math.abs(toT - fromT) * length / 15));
  for (let i = 0; i <= steps; i += 1) {
    const t = fromT + (toT - fromT) * (i / steps);
    points.push(borderPoint(rect, side, t, normalOffset, phase));
  }
}

function appendLoopMotif(points, rect, side, t, scale, phase, normalOffset) {
  const base = borderPoint(rect, side, t, normalOffset, phase);
  const vectors = sideVectors(side);
  const direction = chance(0.5) ? 1 : -1;
  const rx = scale * rand(0.7, 1.6);
  const ry = scale * rand(0.45, 1.2);
  const loops = chance(0.25 + state.flourishes * 0.25) ? 1.65 : 1;
  const steps = Math.floor(30 * loops);

  for (let i = 0; i <= steps; i += 1) {
    const a = (i / steps) * Math.PI * 2 * loops * direction;
    const along = (Math.cos(a) - 1) * rx;
    const out = Math.sin(a) * ry;
    points.push({
      x: base.x + vectors.tx * along + vectors.nx * out,
      y: base.y + vectors.ty * along + vectors.ny * out,
    });
  }
}

function appendSignatureKnot(points, rect, side, t, scale, phase, normalOffset) {
  const base = borderPoint(rect, side, t, normalOffset, phase);
  const vectors = sideVectors(side);
  const direction = chance(0.5) ? 1 : -1;
  const steps = 28;

  for (let i = 0; i <= steps; i += 1) {
    const p = i / steps;
    const along = (p - 0.5) * scale * 2.8;
    const out = Math.sin(p * Math.PI * 2) * scale * 0.8 * direction +
      Math.sin(p * Math.PI * 5) * scale * 0.26;
    points.push({
      x: base.x + vectors.tx * along + vectors.nx * out,
      y: base.y + vectors.ty * along + vectors.ny * out,
    });
  }
}

function estimateTextWidth(phrase, size) {
  ctx.save();
  ctx.font = `700 ${size}px "Snell Roundhand", "Brush Script MT", "Apple Chancery", cursive`;
  const width = ctx.measureText(phrase).width;
  ctx.restore();
  return width;
}

function getBorderTextPlacements(rect) {
  if (!state.showText || !state.textValue.trim()) return [];
  const phrases = getTextPhrases();
  const minSide = Math.min(state.canvasWidth, state.canvasHeight);
  const normalOffset = minSide * 0.006;
  const size = state.textSize;
  const spread = state.textLeading;
  const specs = [
    { side: "top", t: 0.36, phrase: phrases[0], tilt: -0.03, alpha: 0.98, sizeMult: 1 },
    { side: "bottom", t: 0.55, phrase: phrases[1] || phrases[0], tilt: -0.08, alpha: 0.98, sizeMult: 1 },
    { side: "left", t: 0.58, phrase: phrases[1] || phrases[0], tilt: 0.05, alpha: 0.82, sizeMult: 0.78 },
    { side: "right", t: 0.36, phrase: phrases[0], tilt: -0.08, alpha: 0.82, sizeMult: 0.78 },
  ];

  return specs.map((spec) => {
    const vectors = sideVectors(spec.side);
    const phraseSize = size * spec.sizeMult;
    const phraseWidth = estimateTextWidth(spec.phrase, phraseSize);
    const length = sideLength(rect, spec.side);
    const gap = clamp((phraseWidth / length) * 0.62 * spread, 0.12, 0.56);
    const gapStart = clamp(spec.t - gap / 2, 0.02, 0.94);
    const gapEnd = clamp(spec.t + gap / 2, 0.06, 0.98);
    const base = borderPoint(rect, spec.side, spec.t, normalOffset, 0);
    const angle = Math.atan2(vectors.ty, vectors.tx) + spec.tilt;
    const half = phraseWidth * 0.34;

    return {
      kind: "borderText",
      side: spec.side,
      phrase: spec.phrase,
      x: base.x,
      y: base.y,
      angle,
      size: phraseSize,
      alpha: spec.alpha,
      width: state.lineThickness * 0.72,
      phase: rand(0, Math.PI * 2),
      revealAt: 0,
      gapStart,
      gapEnd,
      startPoint: {
        x: base.x - vectors.tx * half,
        y: base.y - vectors.ty * half,
      },
      endPoint: {
        x: base.x + vectors.tx * half,
        y: base.y + vectors.ty * half,
      },
    };
  });
}

function createTextConnectors(rect, placement) {
  const minSide = Math.min(state.canvasWidth, state.canvasHeight);
  const normalOffset = minSide * 0.006;
  const startEdge = borderPoint(rect, placement.side, placement.gapStart, normalOffset, 0);
  const endEdge = borderPoint(rect, placement.side, placement.gapEnd, normalOffset, 0);
  return [
    {
      kind: "connector",
      points: [startEdge, placement.startPoint],
      width: placement.width,
      phase: placement.phase,
      revealAt: 0,
    },
    {
      kind: "connector",
      points: [placement.endPoint, endEdge],
      width: placement.width,
      phase: placement.phase + 0.8,
      revealAt: 0,
    },
  ];
}

function createContinuousBorderSegments(rect, placements = []) {
  const segments = [];
  const minSide = Math.min(state.canvasWidth, state.canvasHeight);
  const scale = minSide * (0.018 + state.lineThickness / 1400);
  const normalOffset = minSide * 0.006;
  const sides = ["top", "right", "bottom", "left"];

  for (const side of sides) {
    const sidePoints = [];
    const length = sideLength(rect, side);
    const motifCount = Math.max(3, Math.floor(length / (minSide * (0.13 - state.density * 0.035))));
    const phase = rand(0, Math.PI * 2);
    let cursor = 0;
    const motifs = [];
    const gaps = placements
      .filter((placement) => placement.side === side)
      .map((placement) => ({
        start: placement.gapStart,
        end: placement.gapEnd,
      }))
      .sort((a, b) => a.start - b.start);

    for (let i = 0; i < motifCount; i += 1) {
      motifs.push(clamp((i + rand(0.28, 0.74)) / motifCount, 0.08, 0.92));
    }

    for (const motifT of motifs) {
      if (gaps.some((gap) => motifT > gap.start && motifT < gap.end)) continue;
      const radiusT = rand(0.025, 0.055);
      appendSideRun(sidePoints, rect, side, cursor, Math.max(cursor, motifT - radiusT), phase, normalOffset);
      if (chance(0.58 + state.flourishes * 0.28)) {
        appendLoopMotif(sidePoints, rect, side, motifT, scale * rand(0.8, 1.7), phase, normalOffset);
      } else {
        appendSignatureKnot(sidePoints, rect, side, motifT, scale * rand(0.75, 1.45), phase, normalOffset);
      }
      cursor = Math.min(1, motifT + radiusT);
    }

    appendSideRun(sidePoints, rect, side, cursor, 1, phase, normalOffset);
    const splitSegments = [];
    let current = [];

    for (const point of sidePoints) {
      const t = point.sideT;
      const inGap = gaps.some((gap) => t > gap.start && t < gap.end);
      if (inGap) {
        if (current.length > 1) splitSegments.push(current);
        current = [];
      } else {
        current.push(point);
      }
    }
    if (current.length > 1) splitSegments.push(current);

    for (const points of splitSegments) {
      segments.push({
        kind: "continuous",
        points,
        side,
        width: state.lineThickness * 0.72,
        phase: rand(0, Math.PI * 2),
        revealAt: 0,
      });
    }
  }

  return segments;
}

function buildPattern() {
  state.seed = Date.now() >>> 0;
  const rect = getFrameRect();
  const audioBoost = clamp(state.audioLevel * 0.5, 0, 0.25);
  const textPlacements = getBorderTextPlacements(rect);
  const borderSegments = createContinuousBorderSegments(rect, textPlacements)
    .map((segment) => ({
      ...segment,
      width: state.lineThickness * (0.72 + audioBoost),
    }));
  const connectors = textPlacements.flatMap((placement) => createTextConnectors(rect, placement));
  state.paths = [...borderSegments, ...connectors, ...textPlacements];
  state.progress = state.animate ? 0 : 1;
  state.hold = 0;
  draw();
}

function drawSmoothStroke(points, width, progress, phase) {
  if (points.length < 2 || progress <= 0) return;
  const mode = colorModes[state.colorChoice];
  const drawCount = clamp(Math.ceil(points.length * progress), 2, points.length);
  const animatedNoise = state.animate ? Math.sin(performance.now() * 0.002 + phase) * state.audioLevel * 3 : 0;

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < drawCount - 1; i += 1) {
    const current = points[i];
    const next = points[i + 1];
    const mx = (current.x + next.x) / 2 + Math.sin(i * 0.7 + phase) * animatedNoise;
    const my = (current.y + next.y) / 2 + Math.cos(i * 0.6 + phase) * animatedNoise;
    ctx.quadraticCurveTo(current.x, current.y, mx, my);
  }
  ctx.lineTo(points[drawCount - 1].x, points[drawCount - 1].y);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (state.blurStroke && state.blurStrokeSize > 0 && state.blurStrokeOpacity > 0) {
    ctx.save();
    ctx.globalAlpha = state.blurStrokeOpacity;
    ctx.shadowColor = mode.glow;
    ctx.shadowBlur = state.blurStrokeSize;
    ctx.strokeStyle = mode.glow;
    ctx.lineWidth = width + state.blurStrokeSize * 0.42;
    ctx.stroke();
    ctx.restore();
  }

  ctx.globalAlpha = mode.alpha;
  ctx.strokeStyle = mode.stroke;
  ctx.lineWidth = width + Math.max(3, width * 0.34);
  ctx.stroke();
  ctx.strokeStyle = mode.hollow ? mode.bg : mode.fill;
  ctx.lineWidth = Math.max(1, width);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawLeaf(item, localProgress) {
  if (localProgress <= 0) return;
  const mode = colorModes[state.colorChoice];
  const scale = clamp(localProgress, 0, 1);
  const length = item.length * scale;
  const width = item.width * scale;

  ctx.save();
  ctx.translate(item.x, item.y);
  ctx.rotate(item.angle);
  ctx.beginPath();
  ctx.moveTo(-length * 0.48, 0);
  ctx.bezierCurveTo(-length * 0.24, -width, length * 0.22, -width * 0.9, length * 0.52, 0);
  ctx.bezierCurveTo(length * 0.08, width * (1 + item.notch), -length * 0.28, width * 0.74, -length * 0.48, 0);
  ctx.closePath();
  ctx.fillStyle = mode.hollow ? mode.bg : mode.fill;
  ctx.strokeStyle = mode.stroke;
  ctx.lineWidth = Math.max(2, state.lineThickness * 0.22);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawLoop(item, localProgress) {
  if (localProgress <= 0) return;
  const points = [];
  const steps = Math.floor(34 * clamp(localProgress, 0, 1));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / 34;
    const a = t * Math.PI * 2;
    const x = item.x + Math.cos(item.angle) * Math.cos(a) * item.rx - Math.sin(item.angle) * Math.sin(a) * item.ry;
    const y = item.y + Math.sin(item.angle) * Math.cos(a) * item.rx + Math.cos(item.angle) * Math.sin(a) * item.ry;
    points.push({ x, y });
  }
  drawSmoothStroke(points, item.width, 1, item.phase);
}

function drawOrnament(item) {
  const localProgress = clamp((state.progress - item.revealAt) / 0.22, 0, 1);
  if (item.kind === "continuous") drawSmoothStroke(item.points, item.width, state.progress, item.phase);
  if (item.kind === "connector") drawSmoothStroke(item.points, item.width, state.progress, item.phase);
  if (item.kind === "borderText") drawOutlinedText(item.phrase, item.x, item.y, item.angle, item.size, item.alpha * state.progress);
  if (item.kind === "ribbon") drawSmoothStroke(item.points, item.width, localProgress, item.phase);
  if (item.kind === "leaf") drawLeaf(item, localProgress);
  if (item.kind === "loop") drawLoop(item, localProgress);
}

function getTextPhrases() {
  const lines = state.textValue
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length) return lines;
  return state.textValue.trim().split(/\s+/).filter(Boolean);
}

function drawOutlinedText(phrase, x, y, angle, size, alpha = 1) {
  const mode = colorModes[state.colorChoice];
  const strokeWidth = Math.max(3, size * 0.055);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.font = `700 ${size}px "Snell Roundhand", "Brush Script MT", "Apple Chancery", cursive`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (state.blurStroke && state.blurStrokeSize > 0 && state.blurStrokeOpacity > 0) {
    ctx.save();
    ctx.globalAlpha = state.blurStrokeOpacity * alpha;
    ctx.shadowColor = mode.glow;
    ctx.shadowBlur = state.blurStrokeSize * 0.85;
    ctx.strokeStyle = mode.hollow ? "#ffffff" : mode.glow;
    ctx.lineWidth = strokeWidth + state.blurStrokeSize * 0.12;
    ctx.strokeText(phrase, 0, 0);
    ctx.restore();
  }

  ctx.globalAlpha = alpha;
  ctx.strokeStyle = mode.hollow ? "#ffffff" : mode.stroke;
  ctx.lineWidth = strokeWidth;
  ctx.strokeText(phrase, 0, 0);

  ctx.globalAlpha = Math.min(0.35, alpha * 0.55);
  ctx.strokeStyle = mode.stroke;
  ctx.lineWidth = Math.max(1, strokeWidth * 0.25);
  ctx.strokeText(phrase, 0, 0);
  ctx.restore();
}

function drawBorderText() {
  if (!state.showText || !state.textValue.trim()) return;
  const phrases = getTextPhrases();
  const rect = getFrameRect();
  const w = rect.right - rect.left;
  const h = rect.bottom - rect.top;
  const size = state.textSize;
  const spread = state.textLeading;
  const placements = [
    { x: rect.left + w * 0.28, y: rect.top + size * 0.1, angle: -0.03, phrase: phrases[0], alpha: 0.98 },
    { x: rect.left + w * 0.66, y: rect.bottom - size * 0.02, angle: -0.08, phrase: phrases[1] || phrases[0], alpha: 0.98 },
    { x: rect.left + size * 0.18, y: rect.top + h * 0.58, angle: -Math.PI / 2 + 0.05, phrase: phrases[1] || phrases[0], alpha: 0.82 },
    { x: rect.right - size * 0.12, y: rect.top + h * 0.38, angle: Math.PI / 2 - 0.08, phrase: phrases[0], alpha: 0.82 },
    { x: rect.left + w * 0.18, y: rect.bottom + size * 0.36 * spread, angle: 0.1, phrase: phrases[0], alpha: 0.45 },
    { x: rect.right - w * 0.16, y: rect.top - size * 0.34 * spread, angle: -0.12, phrase: phrases[1] || phrases[0], alpha: 0.38 },
  ];

  for (const placement of placements) {
    drawOutlinedText(
      placement.phrase,
      placement.x,
      placement.y,
      placement.angle,
      size * (placement.alpha > 0.9 ? 1 : 0.78),
      placement.alpha,
    );
  }
}

function draw() {
  const mode = colorModes[state.colorChoice];
  ctx.save();
  ctx.fillStyle = mode.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const item of state.paths) {
    drawOrnament(item);
  }
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

function downloadPng() {
  const link = document.createElement("a");
  link.download = `eternal-pattern-${Date.now()}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
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

function bindControls() {
  sliders.forEach((input) => {
    input.addEventListener("input", () => {
      const key = input.dataset.key;
      state[key] = Number(input.value);
      syncInputs();
      if (key.startsWith("textArea")) updateMarker();
      if (key === "canvasWidth" || key === "canvasHeight") resizeCanvas();
      if (key.startsWith("blurStroke")) draw();
      else buildPattern();
    });
  });

  numberInputs.forEach((input) => {
    input.addEventListener("change", () => {
      const key = input.dataset.key;
      state[key] = Number(input.value);
      syncInputs();
      resizeCanvas();
      buildPattern();
    });
  });

  document.querySelectorAll("input[name='controlsPosition']").forEach((radio) => {
    radio.addEventListener("change", () => setControlPosition(radio.value));
  });

  document.querySelectorAll("input[name='colorChoice']").forEach((radio) => {
    radio.addEventListener("change", () => {
      state.colorChoice = radio.value;
      document.getElementById("selectedColorTag").textContent = radio.value;
      document.querySelectorAll(".color-option").forEach((label) => {
        label.classList.toggle("selected", label.querySelector("input").checked);
      });
      draw();
    });
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

  document.getElementById("blurStrokeToggle").addEventListener("change", (event) => {
    state.blurStroke = event.target.checked;
    draw();
  });

  document.getElementById("showTextToggle").addEventListener("change", (event) => {
    state.showText = event.target.checked;
    buildPattern();
  });

  document.getElementById("textInput").addEventListener("input", (event) => {
    state.textValue = event.target.value;
    buildPattern();
  });

  document.getElementById("generateButton").addEventListener("click", buildPattern);
  document.getElementById("downloadButton").addEventListener("click", downloadPng);
  document.getElementById("demoAudio").addEventListener("click", toggleDemoAudio);
  document.getElementById("audioUpload").addEventListener("change", handleAudioUpload);
  document.getElementById("playUploaded").addEventListener("click", toggleUploadedAudio);
  document.getElementById("mobileToggle").addEventListener("click", () => controls.classList.toggle("hideControls"));

  window.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() !== "a") return;
    if (controls.classList.contains("hideControls")) {
      setControlPosition("stacked");
    } else {
      setControlPosition("hideControls");
      showToggleMessage();
    }
  });

  window.addEventListener("resize", () => updateMarker(true));
}

syncInputs();
resizeCanvas();
bindControls();
buildPattern();
requestAnimationFrame(tick);
