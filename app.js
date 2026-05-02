const canvas = document.getElementById("patternCanvas");
const ctx = canvas.getContext("2d");
const controls = document.getElementById("controls");
const marker = document.getElementById("textAreaMarker");

const state = {
  canvasWidth: 1400,
  canvasHeight: 1400,
  textAreaW: 0,
  textAreaH: 0,
  density: 0.4,
  straightLines: 0.12,
  flourishes: 0.75,
  blankAreas: 0.3,
  lineThickness: 7,
  visibleTime: 1.3,
  speed: 0.012,
  colorChoice: "black",
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
  black: { bg: "#f8f8f6", ink: "#050505", alpha: 1, outline: false },
  "faint black": { bg: "#f8f8f6", ink: "#050505", alpha: 0.35, outline: false },
  "black outlines": { bg: "#f8f8f6", ink: "#050505", alpha: 1, outline: true },
  white: { bg: "#050505", ink: "#ffffff", alpha: 1, outline: false },
  "faint white": { bg: "#050505", ink: "#ffffff", alpha: 0.35, outline: false },
  "white outlines": { bg: "#050505", ink: "#ffffff", alpha: 1, outline: true },
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

function buildPattern() {
  state.seed = Date.now() >>> 0;
  createBlankZones();
  const audioBoost = clamp(state.audioLevel * 1.6, 0, 0.45);
  const count = Math.floor(22 + (state.density + audioBoost) * 90);
  const basePaths = [];

  for (let i = 0; i < count; i += 1) {
    const signX = chance(0.5) ? -1 : 1;
    const signY = chance(0.5) ? -1 : 1;
    const path = createCurlPath(signX, signY);
    decoratePath(path);
    if (path.points.length > 2) basePaths.push(path);
  }

  const mirrored = [];
  for (const path of basePaths) {
    mirrored.push(path);
    if (chance(0.85)) mirrored.push(mirrorPath(path, true, false));
    if (chance(0.85)) mirrored.push(mirrorPath(path, false, true));
    if (chance(0.7)) mirrored.push(mirrorPath(path, true, true));
  }

  state.paths = mirrored.sort(() => rand(-1, 1));
  state.progress = state.animate ? 0 : 1;
  state.hold = 0;
  draw();
}

function drawPath(points, width, progress, phase) {
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
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (mode.outline) {
    ctx.strokeStyle = mode.ink;
    ctx.globalAlpha = mode.alpha;
    ctx.lineWidth = width * 1.15;
    ctx.stroke();
    ctx.strokeStyle = mode.bg;
    ctx.globalAlpha = 1;
    ctx.lineWidth = Math.max(1, width * 0.58);
    ctx.stroke();
  } else {
    ctx.strokeStyle = mode.ink;
    ctx.globalAlpha = mode.alpha;
    ctx.lineWidth = width;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function draw() {
  const mode = colorModes[state.colorChoice];
  ctx.save();
  ctx.fillStyle = mode.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const path of state.paths) {
    drawPath(path.points, path.width, state.progress, path.phase);
    for (const branch of path.branches) {
      drawPath(branch.points, branch.width, clamp(state.progress * 1.2 - 0.15, 0, 1), path.phase + 1.7);
    }
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
      buildPattern();
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
