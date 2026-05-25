const canvas = document.getElementById("patternCanvas");
const ctx = canvas.getContext("2d");
const controls = document.getElementById("controls");
const marker = document.getElementById("textAreaMarker");

const state = {
  canvasWidth: 1400,
  canvasHeight: 1400,
<<<<<<< Updated upstream
  textAreaW: 42,
  textAreaH: 54,
  density: 0.55,
  straightLines: 0.08,
  flourishes: 0.86,
  blankAreas: 0.16,
  lineThickness: 14,
=======
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
  textStartOffset: 0,
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
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    angle += direction * (0.08 + t * 0.18);
    const step = scale * rand(0.06, 0.16);
    x += Math.cos(angle) * step;
    y += Math.sin(angle) * step;
    if (!pointInTextRect(x, y, scale * 0.5)) points.push({ x, y });
=======
  // Frame band: the ribbon around the canvas edges within which letters live.
  const bandDepth = minSide * 0.21;                   // radial thickness (bigger frame)
  const offH = Math.ceil(bandDepth * 1.25);
  // Centreline must be at least offH/2 from the canvas edge so the outer half
  // of the text ribbon never gets clipped on ANY canvas size.
  const frameCx = Math.max(
    minSide * 0.02 + getPatternSafeMarginPx() + bandDepth * 0.31,
    offH / 2 + 2
  );
  const fontSize = clamp(bandDepth * 0.90, 52, minSide * 0.24);

  const subtitleRaw = (state.subtitleValue || "").trim();
  const subChars = subtitleRaw;

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
  if (frameIsQuadSymmetric()) {
    // No subtitle → the frame is one unified ornament with full four-fold
    // symmetry. Render only the top-left quarter.
    waypoints = [ {x:W/2,y:fc}, {x:fc,y:fc}, {x:fc,y:H/2} ];
    edgeFlip  = [ false, false ];
    closed = false;
  } else if (state.mirrorMode === "horizontal") {
    waypoints = [ {x:W/2,y:fc}, {x:fc,y:fc}, {x:fc,y:H-fc}, {x:W/2,y:H-fc} ];
    edgeFlip  = [ false, false, false ];
    closed = false;
  } else if (state.mirrorMode === "vertical") {
    waypoints = [ {x:fc,y:H/2}, {x:fc,y:fc}, {x:W-fc,y:fc}, {x:W-fc,y:H/2} ];
    edgeFlip  = [ false, false, false ];
    closed = false;
  } else {
    waypoints = [ {x:fc,y:fc}, {x:W-fc,y:fc}, {x:W-fc,y:H-fc}, {x:fc,y:H-fc} ];
    edgeFlip  = [ false, false, false, false ];
    closed = true;
  }

  const edgeN = closed ? waypoints.length : waypoints.length - 1;
  const cornerR = 0; // square (sharp) frame corners

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
  const repeats = Math.max(1, Math.ceil((totalLen * 2.3) / _unitW));
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

    // Apply text start offset: shift all title text along the perimeter
    const offsetPx = Math.round((state.textStartOffset || 0) * totalLen);
    let curX = 2 - offsetPx;
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
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
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
=======
  const { ctx: octx } = cfg.renderStrip();

  // ── Edge-pixel extraction ────────────────────────────────────────────────────
  const raw = octx.getImageData(0, 0, offW, offH).data;
  const filled = (x, y) => x >= 0 && x < offW && y >= 0 && y < offH && raw[(y * offW + x) * 4] > 64;
  const isEdge = (x, y) =>
    filled(x, y) && (!filled(x - 1, y) || !filled(x + 1, y) || !filled(x, y - 1) || !filled(x, y + 1));

  const step = Math.max(2, Math.round(fontSize / 34));
  const edgePts = [], edgeSet = new Set();
  // Inset the scan range so edge pixels at the very outer/inner boundary of the
  // strip don't produce debris fragments outside the visible frame.
  const depthMargin = Math.max(3, Math.ceil(offH * 0.04));
  for (let y = depthMargin; y < offH - depthMargin; y++) {
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
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
function drawSmoothStroke(points, width, progress, phase) {
  if (points.length < 2 || progress <= 0) return;
  const mode = colorModes[state.colorChoice];
  const drawCount = clamp(Math.ceil(points.length * progress), 2, points.length);
  const animatedNoise = state.animate ? Math.sin(performance.now() * 0.002 + phase) * state.audioLevel * 3 : 0;
=======
function segmentWidth(baseWidth, t, phase) {
  const widthVariation = clamp(state.widthVariation, 0, 1);
  const taperStrength = clamp(state.taperStrength, 0, 1);
  const tt = clamp(t, 0, 1);

  // Per-path organic identity so each stroke bulges/necks differently.
  const seedA = phase * 1.31 + 2.17;
  const seedB = phase * 2.07 + 5.43;
  const lobes = 1 + Math.floor(stableNoise(seedA) * 3);          // 1..3 thick nodes along the path
  const lobePhase = stableNoise(seedB) * Math.PI * 2;

  // Low-frequency lobes create the "bulb" thick spots, biased to peak near 1 so
  // necks (thin) read clearly between them.
  const lobeWave = 0.5 + 0.5 * Math.sin(tt * Math.PI * 2 * lobes + lobePhase);
  const bulge = Math.pow(lobeWave, 1.6);

  // Mid + high frequency noise breaks any mechanical regularity in the necks.
  const ripple = 0.5 + 0.5 * Math.sin(tt * Math.PI * 6.3 + phase * 1.7);
  const grain = stableNoise(tt * 7.91 + phase * 3.3) - 0.5;

  let profile = 0.32 + bulge * 0.78 + ripple * 0.12 + grain * 0.18;
  profile = clamp(profile, 0.12, 1.18);

  // widthVariation drives how strongly thick/thin diverge from the mean.
  const variationScale = (1 - widthVariation) * 0.85 + profile * (0.55 + widthVariation * 1.05);

  // Soft taper to a point at both ends so strokes feel naturally drawn.
  const edgeFalloff = Math.pow(Math.sin(Math.PI * tt), 0.85);
  const taperScale = (1 - taperStrength) + taperStrength * (0.12 + edgeFalloff * 0.88);

  return Math.max(0.3, baseWidth * variationScale * taperScale);
}
>>>>>>> Stashed changes

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

<<<<<<< Updated upstream
  for (const placement of placements) {
    drawOutlinedText(
      placement.phrase,
      placement.x,
      placement.y,
      placement.angle,
      size * (placement.alpha > 0.9 ? 1 : 0.78),
      placement.alpha,
=======
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
  const expand = Math.max(0, expandPx);
  forEachPathSegment((points, width, progress, phase = 0) => {
    if (points.length < 2 || progress <= 0) return;
    const drawCount = clamp(Math.ceil(points.length * progress), 2, points.length);
    const baseWidth = width * widthScale;
    // Stroke each segment with the same thick/thin profile as the visible
    // pattern so the bubble shell bulges at nodes and necks down between them.
    for (let i = 1; i < drawCount; i += 1) {
      const t = i / (drawCount - 1);
      const localWidth = segmentWidth(baseWidth, t, phase);
      // Inflate thick parts more than thin necks so blobs stay fluid (image 1).
      const ratio = clamp(localWidth / Math.max(0.5, baseWidth), 0.1, 1.3);
      const localExpand = expand * (0.4 + 0.6 * ratio);
      targetCtx.lineWidth = Math.max(0.2, localWidth + localExpand * 2);
      targetCtx.beginPath();
      targetCtx.moveTo(points[i - 1].x, points[i - 1].y);
      targetCtx.lineTo(points[i].x, points[i].y);
      targetCtx.stroke();
    }
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

  const scale = Math.min(1, 1800 / Math.max(canvas.width, canvas.height));
  const bubbleAmount = clamp(state.fxBubbleStrength, 0, 1);
  const bodyExpandPx = 24 + bubbleAmount * 34 + state.fxBubbleOutlinePx * 0.9;
  const shellWidthScale = 1.14 + bubbleAmount * 0.2;
  const glassColor = state.fxBubbleGlowColor || "#bfffd6";
  const lightColor = mixRgb(glassColor, "#ffffff", 0.48);
  const midColor = mixRgb(glassColor, "#ffffff", 0.14);
  const darkColor = mixRgb(glassColor, "#000000", 0.34);

  const softUnion = drawExpandedPathMask(shellWidthScale, bodyExpandPx, 7 + bubbleAmount * 10, scale);
  const bodyMask = thresholdMask(softUnion, 10 + (1 - opacity) * 9);
  const innerMask = erodeMask(bodyMask, Math.max(1, (5 + state.fxBubbleOutlinePx * 0.55) * scale));
  const rimMask = subtractMask(bodyMask, innerMask);

  const glassLayer = createFxCanvas(scale);
  glassLayer.width = bodyMask.width;
  glassLayer.height = bodyMask.height;
  const glassCtx = glassLayer.getContext("2d");
  glassCtx.drawImage(bodyMask, 0, 0);
  glassCtx.globalCompositeOperation = "source-in";
  const glassGradient = glassCtx.createLinearGradient(0, 0, glassLayer.width, glassLayer.height);
  glassGradient.addColorStop(0, colorToRgba(lightColor, 0.12 + opacity * 0.2));
  glassGradient.addColorStop(0.44, colorToRgba(midColor, 0.08 + opacity * 0.18));
  glassGradient.addColorStop(1, colorToRgba(darkColor, 0.04 + opacity * 0.14));
  glassCtx.fillStyle = glassGradient;
  glassCtx.fillRect(0, 0, glassLayer.width, glassLayer.height);
  drawFxLayer(glassLayer, "source-over", 0.86);

  const depthLayer = createFxCanvas(scale);
  depthLayer.width = bodyMask.width;
  depthLayer.height = bodyMask.height;
  const depthCtx = depthLayer.getContext("2d");
  depthCtx.drawImage(innerMask, 0, 0);
  depthCtx.globalCompositeOperation = "source-in";
  const depthGradient = depthCtx.createRadialGradient(
    depthLayer.width * 0.42,
    depthLayer.height * 0.25,
    depthLayer.width * 0.05,
    depthLayer.width * 0.6,
    depthLayer.height * 0.72,
    Math.max(depthLayer.width, depthLayer.height) * 0.66,
  );
  depthGradient.addColorStop(0, "rgba(255, 255, 255, 0)");
  depthGradient.addColorStop(0.54, colorToRgba(darkColor, opacity * 0.04));
  depthGradient.addColorStop(1, colorToRgba(darkColor, opacity * 0.16));
  depthCtx.fillStyle = depthGradient;
  depthCtx.fillRect(0, 0, depthLayer.width, depthLayer.height);
  drawFxLayer(depthLayer, "multiply", 0.58 + opacity * 0.18);

  const pathGlowLayer = createFxCanvas(scale);
  const pathGlowCtx = pathGlowLayer.getContext("2d");
  pathGlowCtx.save();
  pathGlowCtx.scale(scale, scale);
  forEachPathSegment((points, width, progress) => {
    strokePolyline(points, width, progress, glassColor, opacity * (0.08 + shine * 0.14), {
      widthScale: 1.25 + shine * 0.36,
      expandPx: bodyExpandPx * (0.08 + shine * 0.18),
      blur: (8 + shine * 12) * scale,
    }, pathGlowCtx);
    strokePolyline(points, width, progress, "#ffffff", shine * (0.05 + opacity * 0.12), {
      widthScale: 0.92 + shine * 0.22,
      expandPx: bodyExpandPx * 0.04,
      blur: (3 + shine * 5) * scale,
      offsetX: -1.8 - shine * 1.2,
      offsetY: -1.8 - shine * 1.2,
    }, pathGlowCtx);
  });
  pathGlowCtx.restore();
  pathGlowCtx.globalCompositeOperation = "destination-in";
  pathGlowCtx.drawImage(bodyMask, 0, 0);
  drawFxLayer(pathGlowLayer, "screen", 0.72 + shine * 0.2);

  const rimLayer = tintedMaskLayer(rimMask, "#ffffff", 0.18 + shine * 0.26);
  const rimCtx = rimLayer.getContext("2d");
  rimCtx.save();
  rimCtx.globalCompositeOperation = "screen";
  rimCtx.filter = `blur(${Math.max(0.8, (1.3 + shine * 1.8) * scale).toFixed(2)}px)`;
  rimCtx.drawImage(tintedMaskLayer(rimMask, "#ffffff", 0.2 + shine * 0.22), 0, 0);
  rimCtx.restore();
  drawFxLayer(rimLayer, "screen", 0.68 + shine * 0.18);
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
>>>>>>> Stashed changes
    );
  }
<<<<<<< Updated upstream
=======

  // Clip away any debris that bleeds outside the frame rectangle.
  // A generous bleed keeps the soft glow intact while removing stray fragments.
  const bleed = cfg.offH * 0.15;
  const fc = cfg.frameCx;
  const px = canvas.width / state.canvasWidth;
  fx.globalCompositeOperation = "destination-in";
  fx.fillStyle = "#fff";
  fx.beginPath();
  fx.rect(
    (fc - bleed) * px, (fc - bleed) * px,
    (cfg.W - 2 * fc + 2 * bleed) * px, (cfg.H - 2 * fc + 2 * bleed) * px
  );
  fx.fill();
  fx.globalCompositeOperation = "source-over";

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

  // Clip away debris outside the frame rectangle.
  // Allow a small bleed (half the glyph depth) so the glow
  // doesn't get hard-cut, but any stray corner fragments vanish.
  const bleed = offH * 0.15;
  const fc = cfg.frameCx;
  const W = cfg.W, H = cfg.H;
  lctx.globalCompositeOperation = "destination-in";
  lctx.fillStyle = "#fff";
  lctx.beginPath();
  lctx.rect(
    (fc - bleed) * px, (fc - bleed) * px,
    (W - 2 * fc + 2 * bleed) * px, (H - 2 * fc + 2 * bleed) * px
  );
  lctx.fill();
  lctx.globalCompositeOperation = "source-over";

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
  const stamp = (sx, sy) => {
    ctx.save();
    ctx.translate(sx < 0 ? canvas.width : 0, sy < 0 ? canvas.height : 0);
    ctx.scale(sx, sy);
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
  };
  if (frameIsQuadSymmetric()) {
    stamp(1, 1); stamp(-1, 1); stamp(1, -1); stamp(-1, -1);
  } else {
    stamp(1, 1);
    if (state.mirrorMode === "horizontal") stamp(-1, 1);
    else if (state.mirrorMode === "vertical") stamp(1, -1);
  }
  ctx.restore();
}

// Clean text frame: the warped decorative letters rendered directly as the frame
// (no messy contour tracing), with a neon glow in the chosen colour.
function drawTextFrame() {
  if (!state.useTextSeed || !state.textAsStroke) return;
  const cfg = getFrameWarpConfig();
  if (!cfg) return;

  const baseLayer = warpStripToLayer(cfg);   // white glyphs (already clipped)

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
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
=======
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

  document.getElementById("textStartSlider").addEventListener("input", (event) => {
    state.textStartOffset = parseFloat(event.target.value);
    document.getElementById("textStartVal").textContent = Math.round(state.textStartOffset * 100) + "%";
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

>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
=======
applyColorPreset(state.colorChoice);
document.getElementById("startFromBottomToggle").checked = state.startFromBottom;
document.getElementById("textSeedToggle").checked = state.useTextSeed;
document.getElementById("textReferenceToggle").checked = state.showTextReference;
document.getElementById("textAsStrokeToggle").checked = state.textAsStroke;
document.getElementById("textColorInput").value = state.textColor;
document.getElementById("textSeedInput").value = state.textSeedValue;
document.getElementById("subtitleInput").value = state.subtitleValue;
document.getElementById("textStartSlider").value = state.textStartOffset;
document.getElementById("textStartVal").textContent = Math.round(state.textStartOffset * 100) + "%";
document.getElementById("fxBubbleToggle").checked = state.fxBubbleBlur;
document.getElementById("fxGlassToggle").checked = state.fxGlassPolish;
document.getElementById("fxPatternColorInput").value = state.strokeColor;
document.getElementById("fxBubbleColorInput").value = state.fxBubbleGlowColor;
document.querySelectorAll("input[name='mirrorMode']").forEach((radio) => {
  radio.checked = radio.value === state.mirrorMode;
});
updateTextSeedMeta(state.textSeedValue);
>>>>>>> Stashed changes
syncInputs();
resizeCanvas();
bindControls();
buildPattern();
requestAnimationFrame(tick);
