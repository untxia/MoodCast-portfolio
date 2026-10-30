// Scène 3D de MoodCast (Three.js) : ciel volumétrique + fenêtres de verre en orbite.
// Nuages = bruit fractal éclairé en shader, pluie/vent = particules instanciées calculées sur GPU,
// éclairs = rubans ramifiés. Effet « réalité augmentée » : parallaxe pointeur/gyroscope + scroll.
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, Sprite,
  PlaneGeometry, ShaderMaterial, MeshBasicMaterial, SpriteMaterial,
  InstancedBufferGeometry, InstancedBufferAttribute, BufferGeometry, BufferAttribute,
  CanvasTexture, SRGBColorSpace, AdditiveBlending, MathUtils
} from 'three';
import { sceneParams, gaugeIcon } from './logic.js';
import { emojiSlug } from './emoji.js';

const COLUMN_UNITS = 4.2;       // largeur de la colonne de l'app (430 px) en unités 3D
const CAMERA_Z = 9;
const FROZEN_TIME = 2;          // instant figé (sans animation / tests visuels)
const RAIN_COUNT = 420;
const WIND_COUNT = 22;
const RAIN_TOP = 0.95, RAIN_RANGE = 3.6;

// PRNG déterministe : mêmes gouttes à chaque chargement (tests visuels)
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Shaders ----------
const QUAD_VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// Nuages : fbm déformé + éclairage par échantillonnage vers le soleil (liseré argenté, base sombre)
const CLOUD_FRAG = `
varying vec2 vUv;
uniform float uDrift, uCoverage, uDark, uSun, uFlash, uOpacity, uScale;
uniform vec2 uSunUV, uSeed;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
  return v;
}
float density(vec2 p, float warp) {
  float d = fbm(p + warp * 1.3);
  float th = mix(0.80, 0.34, uCoverage);
  return smoothstep(th, th + 0.2, d);
}
void main() {
  vec2 uv = vUv;
  float mask = smoothstep(0.0, 0.2, uv.x) * smoothstep(1.0, 0.8, uv.x) * smoothstep(0.0, 0.25, uv.y) * smoothstep(1.0, 0.65, uv.y);
  if (mask < 0.002) { gl_FragColor = vec4(0.0); return; }
  vec2 p = uv * vec2(uScale, uScale * 0.62) + vec2(uDrift, 0.0);
  float warp = fbm(p * 0.55 + uSeed);   // déformation calculée une seule fois par pixel
  float d0 = density(p, warp);
  if (d0 < 0.004) { gl_FragColor = vec4(0.0); return; }
  vec2 dirP = normalize((uSunUV - vec2(0.5, 0.4)) * vec2(uScale, uScale * 0.62)) * 0.2;   // lumière directionnelle (pas de singularité)
  float d1 = density(p + dirP, warp);
  float d2 = density(p + dirP * 2.4, warp);
  float lit = clamp(1.0 - (d1 * 0.45 + d2 * 0.35), 0.0, 1.0);
  vec3 dayShadow = vec3(0.50, 0.56, 0.69), dayLit = vec3(0.90, 0.93, 0.98);
  vec3 stormShadow = vec3(0.10, 0.12, 0.18), stormLit = vec3(0.46, 0.51, 0.62);
  vec3 col = mix(mix(dayShadow, dayLit, lit), mix(stormShadow, stormLit, lit * 0.85), uDark);
  col *= mix(0.82, 1.0, smoothstep(0.1, 0.65, uv.y));                       // base plus sombre
  col += d0 * (1.0 - d1) * uSun * vec3(1.0, 0.80, 0.55) * 0.75;              // liseré chaud du soleil
  col += uFlash * vec3(0.55, 0.65, 1.0) * (0.45 + 0.55 * lit);               // éclair dans le nuage
  gl_FragColor = vec4(col, d0 * mask * uOpacity);
}`;

// Pluie : traînées instanciées, position calculée dans le vertex shader (aucun coût CPU)
const RAIN_VERT = `
attribute vec4 aSeed;            // x, phase, profondeur(0..1), vitesse
uniform float uTime, uWind, uTop, uRange, uRain;
varying float vAlpha; varying vec2 vUv;
void main() {
  float depth = aSeed.z;
  float len = mix(0.16, 0.5, depth), wid = mix(0.0035, 0.011, depth);
  float fall = mod(aSeed.y + uTime * aSeed.w, uRange);   // la distance de chute AUGMENTE avec le temps (cf. rainFall dans logic.js)
  float slant = 0.08 + uWind * 0.55;
  vec3 pos = vec3(aSeed.x - fall * slant, uTop - fall, mix(-0.8, 2.0, depth));
  float a = -atan(slant);
  vec2 c = vec2(position.x * wid, position.y * len);
  c = vec2(c.x * cos(a) - c.y * sin(a), c.x * sin(a) + c.y * cos(a));
  pos.xy += c;
  float k = fall / uRange;
  vAlpha = (0.12 + 0.5 * depth) * uRain * smoothstep(0.0, 0.12, k) * (1.0 - smoothstep(0.8, 1.0, k));
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}`;
const RAIN_FRAG = `
varying float vAlpha; varying vec2 vUv;
void main() {
  float edge = 1.0 - abs(vUv.x - 0.5) * 2.0;
  // tête (bas de la traînée, uv.y = 0) lumineuse, queue qui s'efface vers le haut
  gl_FragColor = vec4(vec3(0.74, 0.82, 1.0), vAlpha * (1.0 - vUv.y) * smoothstep(0.0, 0.6, edge));
}`;

// Vent : filets d'air ondulants qui traversent la scène
const WIND_VERT = `
attribute vec4 aSeed;            // x0, y, vitesse, longueur
uniform float uTime, uWind, uSpan, uVis;
varying float vAlpha;
void main() {
  float u = position.x + 0.5;
  float x = mod(aSeed.x - uTime * aSeed.z * (0.3 + uWind * 1.7), uSpan) - uSpan * 0.5;   // vers la gauche, comme la pluie inclinée et les nuages
  float wob = sin(u * 5.0 + uTime * 1.6 + aSeed.y * 9.0) * 0.05 * (0.4 + uWind);
  vec3 pos = vec3(x + (u - 0.5) * aSeed.w, aSeed.y + wob + position.y * 0.01, -0.4 + fract(aSeed.x * 7.3) * 1.8);
  float edge = smoothstep(0.0, 0.18, (x / uSpan + 0.5)) * smoothstep(1.0, 0.82, (x / uSpan + 0.5));
  vAlpha = sin(u * 3.14159) * 0.14 * uVis * edge;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}`;
const WIND_FRAG = `
varying float vAlpha;
void main() { gl_FragColor = vec4(vec3(0.85, 0.9, 1.0), vAlpha); }`;

// ---------- Textures ----------
function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}
const radial = stops => (g, w, h) => {
  const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  stops.forEach(([o, col]) => grad.addColorStop(o, col));
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
};

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// Fenêtres de verre : mêmes couleurs que les cartes de jauge de l'interface
const PANES = [
  { key: 'p', kind: 'physical', label: 'Corps',  g1: '#fb7185', g2: '#f97316', phase: Math.PI },
  { key: 'h', kind: 'mood',     label: 'Humeur', g1: '#fde047', g2: '#f472b6', phase: Math.PI / 2 },
  { key: 'm', kind: 'mental',   label: 'Mental', g1: '#818cf8', g2: '#c084fc', phase: 0 }
];
const ICON_CHARS = ['💪', '😴', '🧠', '😰', '😊', '😌', '😔'];

// Émojis 3D (WebP) chargés une fois ; dessinés dans la texture des fenêtres
function loadIcons(onChange) {
  const imgs = {};
  let pending = ICON_CHARS.length;
  ICON_CHARS.forEach(ch => {
    const img = new Image();
    img.onload = img.onerror = () => { if (img.naturalWidth) imgs[ch] = img; if (--pending === 0) onChange(true); else onChange(false); };
    img.src = 'emoji/' + emojiSlug(ch) + '.webp';
  });
  return imgs;
}

function drawPane(canvas, def, value, icon) {
  const w = canvas.width, h = canvas.height, g = canvas.getContext('2d');
  g.clearRect(0, 0, w, h);
  // verre givré : fond sombre translucide + dégradé clair + liseré
  roundRect(g, 8, 8, w - 16, h - 16, 36);
  g.fillStyle = 'rgba(14,18,28,0.55)'; g.fill();
  const bg = g.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, 'rgba(255,255,255,0.26)');
  bg.addColorStop(0.5, 'rgba(255,255,255,0.08)');
  bg.addColorStop(1, 'rgba(255,255,255,0.16)');
  g.fillStyle = bg; g.fill();
  g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,0.5)'; g.stroke();
  // halo coloré dans l'angle + reflet diagonal
  g.save(); roundRect(g, 8, 8, w - 16, h - 16, 36); g.clip();
  const halo = g.createRadialGradient(0, 0, 0, 0, 0, w * 0.75);
  halo.addColorStop(0, def.g1 + '55'); halo.addColorStop(1, def.g1 + '00');
  g.fillStyle = halo; g.fillRect(0, 0, w, h);
  const sheen = g.createLinearGradient(0, 0, w * 0.7, h);
  sheen.addColorStop(0.18, 'rgba(255,255,255,0)'); sheen.addColorStop(0.3, 'rgba(255,255,255,0.16)'); sheen.addColorStop(0.42, 'rgba(255,255,255,0)');
  g.fillStyle = sheen; g.fillRect(0, 0, w, h); g.restore();

  // pastille d'icône + émoji 3D
  const ib = g.createRadialGradient(80, 70, 0, 80, 70, 56);
  ib.addColorStop(0, def.g1 + 'aa'); ib.addColorStop(1, def.g2 + '22');
  roundRect(g, 32, 28, 80, 80, 26); g.fillStyle = ib; g.fill();
  if (icon) g.drawImage(icon, 42, 38, 60, 60);

  g.fillStyle = 'rgba(255,255,255,0.96)';
  g.font = '700 42px system-ui, sans-serif';
  g.textBaseline = 'middle';
  g.fillText(def.label, 130, 68);

  g.font = '800 132px system-ui, sans-serif';
  g.textBaseline = 'alphabetic';
  const num = g.createLinearGradient(0, 150, 0, 275);
  num.addColorStop(0, '#ffffff'); num.addColorStop(0.55, def.g1); num.addColorStop(1, def.g2);
  g.shadowColor = def.g1; g.shadowBlur = 26;
  g.fillStyle = num;
  g.fillText(String(value), 36, 282);
  g.shadowBlur = 0;
  const numW = g.measureText(String(value)).width;
  g.font = '600 38px system-ui, sans-serif';
  g.fillStyle = 'rgba(255,255,255,0.6)';
  g.fillText('/10', 36 + numW + 8, 282);

  // jauge dégradée
  const bx = w * 0.6, by = 238, bw = w * 0.3, bh = 20;
  roundRect(g, bx, by, bw, bh, 10); g.fillStyle = 'rgba(255,255,255,0.16)'; g.fill();
  const fill = g.createLinearGradient(bx, 0, bx + bw, 0);
  fill.addColorStop(0, def.g1); fill.addColorStop(1, def.g2);
  roundRect(g, bx, by, Math.max(20, bw * value / 10), bh, 10); g.fillStyle = fill; g.fill();
}

// Éclair : polyligne par déplacement du point milieu + branches, convertie en ruban.
function boltPolyline(rand, x0, y0, x1, y1, disp, depth) {
  let pts = [[x0, y0], [x1, y1]];
  for (let i = 0; i < depth; i++) {
    const next = [pts[0]];
    for (let j = 0; j < pts.length - 1; j++) {
      const [ax, ay] = pts[j], [bx, by] = pts[j + 1];
      next.push([(ax + bx) / 2 + (rand() - 0.5) * disp, (ay + by) / 2 + (rand() - 0.5) * disp * 0.4], pts[j + 1]);
    }
    pts = next;
    disp *= 0.55;
  }
  return pts;
}
function boltGeometry(seed, width) {
  const rand = mulberry32(seed);   // même graine => même tracé pour le cœur et la lueur
  const main = boltPolyline(rand, (rand() - 0.5) * 1.6, RAIN_TOP + 0.1, (rand() - 0.5) * 1.6, -1.8, 0.9, 6);
  const paths = [main];
  for (let b = 0; b < 3; b++) {
    const [sx, sy] = main[Math.floor(main.length * (0.25 + rand() * 0.4))];
    paths.push(boltPolyline(rand, sx, sy, sx + (rand() - 0.5) * 1.4, sy - 0.7 - rand() * 0.9, 0.5, 4));
  }
  const pos = [], idx = [];
  paths.forEach((pts, pi) => {
    const w = width * (pi === 0 ? 1 : 0.55);
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1;
      const nx = (-dy / l) * w, ny = (dx / l) * w;
      const o = pos.length / 3;
      pos.push(ax - nx, ay - ny, 0, ax + nx, ay + ny, 0, bx - nx, by - ny, 0, bx + nx, by + ny, 0);
      idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
    }
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  return g;
}

function instanced(count, seedFn, base) {
  const g = new InstancedBufferGeometry();
  g.index = base.index;
  g.setAttribute('position', base.attributes.position);
  g.setAttribute('uv', base.attributes.uv);
  const arr = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) arr.set(seedFn(i), i * 4);
  g.setAttribute('aSeed', new InstancedBufferAttribute(arr, 4));
  g.instanceCount = count;
  return g;
}

const order = z => 100 + Math.round(z * 10);

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ anchorEl?: Element|null, motion?: boolean }} [opts]
 */
export function createScene(canvas, opts = {}) {
  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    if (!renderer.getContext()) throw new Error('no context');
  } catch (e) {
    console.warn('WebGL indisponible, scène 3D désactivée', e);
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));

  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 1, 0.1, 50);
  camera.position.set(0, 0, CAMERA_Z);
  const root = new Group();
  scene.add(root);
  const disposables = [];
  const track = o => { disposables.push(o); return o; };

  const flat = (extra = {}) => ({ transparent: true, depthWrite: false, depthTest: false, ...extra });
  function place(obj, x, y, z) { obj.position.set(x, y, z); obj.renderOrder = order(z); root.add(obj); return obj; }

  // --- Soleil : halo + cœur éblouissant + traînée, derrière les nuages ---
  const SUN_POS = [1.0, 0.95, -1.7];
  const sunMats = {
    halo: track(new SpriteMaterial({ map: track(canvasTexture(256, 256, radial([[0, 'rgba(255,236,190,0.9)'], [0.25, 'rgba(255,214,140,0.38)'], [1, 'rgba(255,190,110,0)']]))), blending: AdditiveBlending, ...flat() })),
    core: track(new SpriteMaterial({ map: track(canvasTexture(128, 128, radial([[0, 'rgba(255,255,255,1)'], [0.18, 'rgba(255,250,225,0.95)'], [0.5, 'rgba(255,225,160,0.25)'], [1, 'rgba(255,210,140,0)']]))), blending: AdditiveBlending, ...flat() })),
    streak: track(new SpriteMaterial({ map: track(canvasTexture(256, 32, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, 'rgba(255,230,170,0)'); gr.addColorStop(0.5, 'rgba(255,240,200,0.55)'); gr.addColorStop(1, 'rgba(255,230,170,0)');
      g.fillStyle = gr; g.fillRect(0, h / 2 - 2, w, 4);
    })), blending: AdditiveBlending, ...flat() }))
  };
  const sunHalo = place(new Sprite(sunMats.halo), SUN_POS[0], SUN_POS[1], SUN_POS[2]);
  const sunCore = place(new Sprite(sunMats.core), SUN_POS[0], SUN_POS[1], SUN_POS[2] + 0.01);
  const sunStreak = place(new Sprite(sunMats.streak), SUN_POS[0], SUN_POS[1], SUN_POS[2] + 0.02);
  sunHalo.scale.set(6, 6, 1); sunCore.scale.set(1.5, 1.5, 1); sunStreak.scale.set(3.4, 0.6, 1);

  // --- Ciel : deux couches de nuages (arrière dense, avant clairsemée) ---
  const sunUV = [0.5 + SUN_POS[0] / 5.8, 0.5 + (SUN_POS[1] - 0.35) / 3.7];
  function cloudLayer(w, h, x, y, z, cfg) {
    const mat = track(new ShaderMaterial({
      vertexShader: QUAD_VERT, fragmentShader: CLOUD_FRAG, ...flat(),
      uniforms: {
        uDrift: { value: 0 }, uCoverage: { value: 0.5 }, uDark: { value: 0 }, uSun: { value: 0 }, uFlash: { value: 0 },
        uOpacity: { value: 1 }, uScale: { value: cfg.scale }, uSunUV: { value: sunUV }, uSeed: { value: cfg.seed }
      }
    }));
    const geo = track(new PlaneGeometry(w, h));
    return { mat, mesh: place(new Mesh(geo, mat), x, y, z), cfg };
  }
  const cloudBack = cloudLayer(5.8, 3.7, 0, 0.35, -1.2, { scale: 3.4, seed: [3.1, 7.7], cover: 0, speed: 1, opacity: 1 });
  const cloudFront = cloudLayer(6.4, 2.6, 0.3, 0.85, 0.5, { scale: 4.6, seed: [11.4, 2.3], cover: -0.28, speed: 1.6, opacity: 0.6 });

  // --- Vent ---
  const rand = mulberry32(1337);
  const windGeo = track(instanced(WIND_COUNT, () => [rand() * 7, -1.5 + rand() * 3.4, 0.25 + rand() * 0.5, 0.9 + rand() * 1.5], new PlaneGeometry(1, 1, 10, 1)));
  const windMat = track(new ShaderMaterial({
    vertexShader: WIND_VERT, fragmentShader: WIND_FRAG, ...flat(),
    uniforms: { uTime: { value: 0 }, uWind: { value: 0 }, uSpan: { value: 7 }, uVis: { value: 0 } }
  }));
  const wind = place(new Mesh(windGeo, windMat), 0, 0, -0.5);
  wind.frustumCulled = false;

  // --- Pluie ---
  const rainBase = new PlaneGeometry(1, 1); rainBase.translate(0, 0.5, 0);
  const rainGeo = track(instanced(RAIN_COUNT, () => [(rand() - 0.5) * 4.4, rand() * RAIN_RANGE, rand(), 4 + rand() * 3.5], rainBase));
  const rainMat = track(new ShaderMaterial({
    vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, ...flat(),
    uniforms: { uTime: { value: 0 }, uWind: { value: 0 }, uTop: { value: RAIN_TOP }, uRange: { value: RAIN_RANGE }, uRain: { value: 0 } }
  }));
  const rain = place(new Mesh(rainGeo, rainMat), 0, 0, 0.3);
  rain.frustumCulled = false;

  // --- Éclair ---
  const boltCoreMat = track(new MeshBasicMaterial({ color: 0xffffff, ...flat({ blending: AdditiveBlending, opacity: 0 }) }));
  const boltGlowMat = track(new MeshBasicMaterial({ color: 0x8fb0ff, ...flat({ blending: AdditiveBlending, opacity: 0 }) }));
  const boltCore = place(new Mesh(new BufferGeometry(), boltCoreMat), 0, 0, -0.9);
  const boltGlow = place(new Mesh(new BufferGeometry(), boltGlowMat), 0, 0, -0.95);
  boltCore.visible = boltGlow.visible = false;
  function newBolt() {
    const seed = (Math.random() * 1e9) | 0;
    boltCore.geometry.dispose(); boltGlow.geometry.dispose();
    boltCore.geometry = boltGeometry(seed, 0.012);
    boltGlow.geometry = boltGeometry(seed, 0.05);
  }

  // --- Fenêtres de verre en orbite ---
  const gauges = { p: 5, m: 5, h: 5 };
  const shadowTex = track(canvasTexture(256, 160, (g, w, h) => {
    g.shadowColor = 'rgba(0,0,0,0.9)'; g.shadowBlur = 36;
    roundRect(g, 48, 36, w - 96, h - 72, 24); g.fillStyle = 'rgba(0,0,0,0.9)'; g.fill();
  }));
  const planeGeo = track(new PlaneGeometry(1.3, 0.81));
  const panes = PANES.map(def => {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 320;
    const tex = track(new CanvasTexture(c));
    tex.colorSpace = SRGBColorSpace;
    const mat = track(new MeshBasicMaterial({ map: tex, ...flat() }));
    const shMat = track(new MeshBasicMaterial({ map: shadowTex, ...flat({ opacity: 0.4 }) }));
    const mesh = new Mesh(planeGeo, mat), shadow = new Mesh(planeGeo, shMat);
    root.add(shadow, mesh);
    return { def, canvas: c, tex, mat, shMat, mesh, shadow, pop: 0 };
  });
  let icons = {};
  function redrawPanes() {
    panes.forEach(p => {
      const v = gauges[p.def.key];
      drawPane(p.canvas, p.def, v, icons[gaugeIcon(p.def.kind, v)]);
      p.tex.needsUpdate = true;
    });
  }
  redrawPanes();
  icons = loadIcons(done => {
    redrawPanes();
    if (!motion) renderOnce();
    if (done) canvas.dataset.assets = 'ready';
  });

  // --- État ---
  let motion = opts.motion !== false;
  let active = true;
  let screenName = 'home';
  let t = FROZEN_TIME, drift = 0.4, orbit = 0;
  let flash = 0, flicker = 0, nextStrike = 2.5;
  const cur = { sun: 0, cover: 0, rain: 0, storm: 0, wind: 0, presence: 1, ax: 0, ay: 0, scale: 1, scroll: 0 };
  let target = sceneParams(5);
  let anchor = { x: 0, y: 0.3, scale: 1, presence: 1 };
  const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
  let gyroOn = false;
  let raf = 0, last = 0, destroyed = false, sizeW = 0, sizeH = 0;
  const rootEl = document.documentElement;

  function layout() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    if (w !== sizeW || h !== sizeH) {
      sizeW = w; sizeH = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    const visH = 2 * Math.tan(MathUtils.degToRad(camera.fov / 2)) * CAMERA_Z;
    const visW = visH * camera.aspect;
    const colW = Math.min(visW, visW * 430 / w);
    const scale = colW / COLUMN_UNITS * 0.9;
    const r = opts.anchorEl && opts.anchorEl.getBoundingClientRect();
    if (screenName === 'home' && r && r.width > 0) {
      const ndcX = ((r.left + r.width / 2) / w) * 2 - 1;
      const ndcY = 1 - ((r.top + r.height / 2) / h) * 2;
      anchor = { x: ndcX * visW / 2, y: ndcY * visH / 2, scale, presence: 1 };
    } else {
      anchor = { x: 0, y: visH / 2 - visH * 0.13, scale: scale * 0.55, presence: 0.4 };
    }
    if (!motion) { snap(); renderOnce(); }
  }

  function snap() {
    cur.sun = target.sun; cur.cover = target.cloud; cur.rain = target.rain; cur.storm = target.storm; cur.wind = target.wind;
    cur.presence = anchor.presence; cur.ax = anchor.x; cur.ay = anchor.y; cur.scale = anchor.scale;
    cur.scroll = Math.min(1, (window.scrollY || 0) / 380);
  }

  function update(dt) {
    const k = motion ? 1 - Math.exp(-dt * 3) : 1;
    const ka = motion ? 1 - Math.exp(-dt * 8) : 1;
    cur.sun += (target.sun - cur.sun) * k;
    cur.cover += (target.cloud - cur.cover) * k;
    cur.rain += (target.rain - cur.rain) * k;
    cur.storm += (target.storm - cur.storm) * k;
    cur.wind += (target.wind - cur.wind) * k;
    cur.presence += (anchor.presence - cur.presence) * k;
    cur.ax += (anchor.x - cur.ax) * ka;
    cur.ay += (anchor.y - cur.ay) * ka;
    cur.scale += (anchor.scale - cur.scale) * ka;
    const scrollTarget = Math.min(1, (window.scrollY || 0) / 380);
    cur.scroll += (scrollTarget - cur.scroll) * ka;

    if (motion) {
      t += dt;
      drift += dt * (0.012 + 0.05 * cur.wind);
      orbit += dt * (0.2 + 0.25 * cur.wind);
      const kt = 1 - Math.exp(-dt * 6);
      tilt.x += (tilt.tx - tilt.x) * kt;
      tilt.y += (tilt.ty - tilt.y) * kt;
    } else {
      t = FROZEN_TIME; drift = 0.4; orbit = 0;
      tilt.x = tilt.y = 0;
    }
    rootEl.style.setProperty('--tx', tilt.x.toFixed(3));
    rootEl.style.setProperty('--ty', tilt.y.toFixed(3));

    root.position.set(cur.ax, cur.ay, 0);
    root.scale.setScalar(cur.scale);
    camera.position.set(tilt.x * 1.3, -tilt.y * 0.8, CAMERA_Z);
    camera.lookAt(0, 0, 0);

    const pres = cur.presence;
    const dark = Math.min(1, cur.rain * 0.8 + cur.storm * 0.4);

    // soleil : s'efface sous les nuages épais
    const sunV = cur.sun * cur.sun * (1 - cur.rain);
    sunHalo.visible = sunCore.visible = sunStreak.visible = sunV > 0.02;
    sunMats.halo.opacity = 0.9 * sunV * pres;
    sunMats.core.opacity = sunV * pres;
    sunMats.streak.opacity = 0.5 * sunV * pres;
    sunCore.scale.setScalar(1.3 + (motion ? 0.4 * Math.sin(t * 0.9) : 0) + 0.3 * cur.sun);

    // nuages
    [cloudBack, cloudFront].forEach(c => {
      const u = c.mat.uniforms, cfg = c.cfg;
      u.uDrift.value = drift * cfg.speed;
      u.uCoverage.value = MathUtils.clamp(cur.cover + cfg.cover, 0, 1);
      u.uDark.value = dark;
      u.uSun.value = sunV;
      u.uFlash.value = flash;
      u.uOpacity.value = cfg.opacity * pres * (0.35 + 0.65 * Math.min(1, cur.cover * 1.6));
      c.mesh.visible = u.uOpacity.value > 0.02;
    });

    // pluie & vent
    rain.visible = cur.rain > 0.03 && pres > 0.5;
    rainMat.uniforms.uTime.value = t;
    rainMat.uniforms.uWind.value = cur.wind;
    rainMat.uniforms.uRain.value = Math.min(1, cur.rain * 1.1) * pres;
    windMat.uniforms.uTime.value = t;
    windMat.uniforms.uWind.value = cur.wind;
    windMat.uniforms.uVis.value = Math.max(0, cur.wind - 0.12) * 1.2 * pres;
    wind.visible = windMat.uniforms.uVis.value > 0.02;

    // éclairs
    if (motion && cur.storm > 0.45) {
      nextStrike -= dt;
      if (nextStrike <= 0) { newBolt(); flicker = 0.55; nextStrike = 2.2 + Math.random() * 4.5; }
    }
    if (flicker > 0) {
      flicker = Math.max(0, flicker - dt);
      flash = flicker > 0 ? (Math.sin(flicker * 38) * 0.5 + 0.5) * Math.min(1, flicker * 3) : 0;
    } else flash = 0;
    boltCore.visible = boltGlow.visible = flash > 0.02;
    boltCoreMat.opacity = flash; boltGlowMat.opacity = flash * 0.6;

    // fenêtres de verre en orbite (z varie → vraie perspective, passent devant/derrière le ciel)
    const scroll = cur.scroll;
    panes.forEach((p, i) => {
      const th = p.def.phase + orbit;
      const s = Math.sin(th), c = Math.cos(th);
      const x = 1.5 * c + tilt.x * 0.15;
      const z = 0.9 + 1.05 * s + scroll * 1.6;
      const y = -0.1 - 0.3 * s + (motion ? Math.sin(t * 1.1 + i * 1.9) * 0.05 : 0) + scroll * 0.25;
      p.pop += (0 - p.pop) * (motion ? 1 - Math.exp(-dt * 5) : 1);
      const sc = 1 + 0.2 * p.pop;
      p.mesh.position.set(x, y, z + 0.4 * p.pop);
      p.mesh.rotation.set(-tilt.y * 0.25 - 0.12 * s - scroll * 0.7, -c * 0.55 + tilt.x * 0.3, c * 0.05);
      p.mesh.scale.setScalar(sc);
      const depthFade = MathUtils.clamp((z + 0.4) / 1.6, 0.35, 1);
      const vis = (pres > 0.9 ? 1 : Math.max(0, (pres - 0.4) / 0.6)) * (1 - scroll * 0.75);
      p.mat.opacity = depthFade * vis;
      p.shMat.opacity = 0.4 * depthFade * vis;
      p.mesh.visible = p.shadow.visible = p.mat.opacity > 0.02;
      p.shadow.position.set(x + 0.1 + tilt.x * 0.06, y - 0.22, z - 0.05);
      p.shadow.rotation.copy(p.mesh.rotation);
      p.shadow.scale.set(1.35 * sc, 1.35 * sc, 1);
      p.mesh.renderOrder = order(z) + 1;
      p.shadow.renderOrder = order(z);
    });
  }

  function renderOnce() {
    if (destroyed) return;
    update(0);
    renderer.render(scene, camera);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    renderer.render(scene, camera);
  }
  function start() {
    if (raf || destroyed || !motion || !active || document.hidden) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

  function onPointer(e) {
    if (!motion) return;
    tilt.tx = MathUtils.clamp((e.clientX / window.innerWidth) * 2 - 1, -1, 1);
    tilt.ty = MathUtils.clamp((e.clientY / window.innerHeight) * 2 - 1, -1, 1);
  }
  function onOrient(e) {
    if (!motion || e.gamma == null) return;
    tilt.tx = MathUtils.clamp(e.gamma / 30, -1, 1);
    tilt.ty = MathUtils.clamp(((e.beta ?? 45) - 45) / 30, -1, 1);
  }
  function onVisibility() { document.hidden ? stop() : start(); }
  function onScroll() { if (screenName === 'home') layout(); }
  function onContextLost(e) { e.preventDefault(); stop(); canvas.dispatchEvent(new CustomEvent('scene-lost')); }

  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('resize', layout);
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  canvas.addEventListener('webglcontextlost', onContextLost);

  function listenGyro() {
    if (gyroOn) return;
    window.addEventListener('deviceorientation', onOrient, { passive: true });
    gyroOn = true;
  }
  const needsPermission = typeof DeviceOrientationEvent !== 'undefined'
    && typeof DeviceOrientationEvent.requestPermission === 'function';
  if (typeof DeviceOrientationEvent !== 'undefined' && !needsPermission) listenGyro();

  layout();
  if (motion) start(); else renderOnce();

  return {
    setWeather(score, g) {
      target = sceneParams(score);
      if (g) {
        panes.forEach(p => { if (g[p.def.key] !== gauges[p.def.key]) p.pop = 1; });
        const changed = g.p !== gauges.p || g.m !== gauges.m || g.h !== gauges.h;
        Object.assign(gauges, { p: g.p, m: g.m, h: g.h });
        if (changed) redrawPanes();
      }
      if (!motion) { snap(); renderOnce(); }
    },
    setScreen(name) { screenName = name; layout(); },
    setMotion(on) {
      motion = on;
      if (on) start(); else { stop(); snap(); layout(); renderOnce(); }
    },
    setActive(on) {
      active = on;
      canvas.style.display = on ? '' : 'none';
      if (on) { layout(); start(); } else stop();
    },
    needsGyroPermission() { return needsPermission && !gyroOn; },
    async enableGyro() {
      try {
        if (needsPermission) {
          const res = await DeviceOrientationEvent.requestPermission();
          if (res !== 'granted') return false;
        }
        listenGyro();
        return true;
      } catch (e) { return false; }
    },
    layout,
    dispose() {
      destroyed = true;
      stop();
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('resize', layout);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('deviceorientation', onOrient);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      boltCore.geometry.dispose(); boltGlow.geometry.dispose();
      disposables.forEach(d => d.dispose && d.dispose());
      renderer.dispose();
    }
  };
}
