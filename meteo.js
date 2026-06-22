document.addEventListener('DOMContentLoaded', () => {

// Masque le splash après la disparition (attendre splashOut, pas les lettres enfants)
const splash = document.getElementById('splash-screen');
if (splash) {
  const hideSplash = () => splash.classList.add('hidden');
  splash.addEventListener('animationend', e => {
    if (e.animationName === 'splashOut') hideSplash();
  });
  // Garde-fou : cache au bout de 4.5s quoi qu'il arrive
  setTimeout(hideSplash, 4500);
  // Cache immédiatement si toutes les animations sont désactivées
  if (getComputedStyle(splash).animationName === 'none') hideSplash();
}

// ===== CONSTANTES =====
const STORAGE_KEY = 'moodcast-v1';
const NOTIF_KEY = 'moodcast-notif';
const SETTINGS_KEY = 'moodcast-settings';
const TAGS = ['😴 Fatigué', '⚡ Énergique', '😰 Stressé', '😌 Calme', '🎯 Motivé', '😔 Triste', '🤗 Reconnaissant', '😤 Frustré'];

let editingDate = null; // date en cours d'édition depuis le calendrier

// ===== HELPERS DONNÉES =====
function loadData() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch(e) { return {}; }
}
function saveData(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
  catch(e) { console.error('Erreur sauvegarde', e); }
}
function todayKey() {
  const n = new Date();
  return n.getFullYear() + '-' + String(n.getMonth()+1).padStart(2,'0') + '-' + String(n.getDate()).padStart(2,'0');
}
function avgScore(p, m, h) { return Math.round((p + m + h) / 3 * 10) / 10; }
function formatDate(key) {
  const [y, m, d] = key.split('-');
  return new Date(+y, +m-1, +d).toLocaleDateString('fr-FR', { weekday:'short', day:'numeric', month:'short' });
}
function formatDateLong(key) {
  const [y, m, d] = key.split('-');
  return new Date(+y, +m-1, +d).toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}

// ===== RÉGLAGES =====
function loadSettings() {
  try {
    return Object.assign({
      anim: true, dynamicBg: true, contrast: false,
      bigtext: false, reduceMotion: false, vibrate: true
    }, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
  } catch(e) {
    return { anim:true, dynamicBg:true, contrast:false, bigtext:false, reduceMotion:false, vibrate:true };
  }
}
function saveSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

function applySettings(s) {
  document.body.classList.toggle('contrast', s.contrast);
  document.body.classList.toggle('bigtext', s.bigtext);
  document.body.classList.toggle('reduce-motion', s.reduceMotion);
  // synchro visuelle des toggles
  setToggle('set-anim', s.anim);
  setToggle('set-dynamic-bg', s.dynamicBg);
  setToggle('set-contrast', s.contrast);
  setToggle('set-bigtext', s.bigtext);
  setToggle('set-reduce-motion', s.reduceMotion);
  setToggle('set-vibrate', s.vibrate);
  updateWeather(); // pour rafraîchir fond + animation
}
function setToggle(id, on) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('off', !on);
  el.setAttribute('aria-checked', on ? 'true' : 'false');
}

// ===== VIBRATION =====
function buzz(ms = 10) {
  const s = loadSettings();
  if (s.vibrate && navigator.vibrate) navigator.vibrate(ms);
}

// ===== TOAST =====
let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

// ===== NAVIGATION =====
const screens = document.querySelectorAll('.screen');
const navItems = document.querySelectorAll('.nav-item');

function goToScreen(target) {
  screens.forEach(s => s.classList.remove('active'));
  navItems.forEach(n => n.classList.remove('active'));
  document.getElementById('screen-' + target).classList.add('active');
  navItems.forEach(n => { if (n.dataset.screen === target) n.classList.add('active'); });
  if (target === 'calendar') renderCalendar();
  if (target === 'stats') renderStats();
  window.scrollTo(0, 0);
}
navItems.forEach(btn => btn.addEventListener('click', () => { buzz(); goToScreen(btn.dataset.screen); }));

// ===== MENU BURGER =====
const sideMenu = document.getElementById('side-menu');
const menuOverlay = document.getElementById('menu-overlay');
function openMenu() {
  sideMenu.classList.add('open');
  sideMenu.setAttribute('aria-hidden', 'false');
  menuOverlay.hidden = false;
  document.getElementById('btn-menu').setAttribute('aria-expanded', 'true');
  buzz();
}
function closeMenu() {
  sideMenu.classList.remove('open');
  sideMenu.setAttribute('aria-hidden', 'true');
  menuOverlay.hidden = true;
  document.getElementById('btn-menu').setAttribute('aria-expanded', 'false');
}
document.getElementById('btn-menu').addEventListener('click', openMenu);
document.querySelectorAll('.btn-menu-screen').forEach(b => b.addEventListener('click', openMenu));
document.getElementById('btn-close-menu').addEventListener('click', closeMenu);
menuOverlay.addEventListener('click', closeMenu);
document.querySelectorAll('.menu-link').forEach(link => {
  link.addEventListener('click', () => { goToScreen(link.dataset.screen); closeMenu(); });
});
// Le 🔔 ouvre le menu (réglages notif y sont)
document.getElementById('btn-notif').addEventListener('click', openMenu);

// Échap ferme le menu
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeMenu(); }
});

// ===== MÉTÉO =====
function getWeather(score) {
  if (score >= 8.5) return { icon:'☀️', label:'Plein soleil — tu rayonnes !', fx:'sun',   bg:'#1a2e1a' };
  if (score >= 7)   return { icon:'🌤️', label:'Beau temps — bonne énergie',   fx:'sun',   bg:'#16241a' };
  if (score >= 5)   return { icon:'⛅', label:'Nuageux — journée correcte',    fx:'cloud', bg:'#14141c' };
  if (score >= 3.5) return { icon:'🌧️', label:'Pluie — un peu difficile',     fx:'rain',  bg:'#0f1420' };
  return             { icon:'⛈️', label:'Orage — journée éprouvante',          fx:'storm', bg:'#14101a' };
}

function updateWeather() {
  const p = +document.getElementById('gauge-physical').value;
  const m = +document.getElementById('gauge-mental').value;
  const h = +document.getElementById('gauge-mood').value;
  const score = avgScore(p, m, h);
  const w = getWeather(score);
  const iconEl = document.getElementById('weather-icon');
  iconEl.textContent = w.icon;
  iconEl.dataset.fx  = w.fx; // pour le CSS (glow par type)
  document.getElementById('weather-label').textContent = w.label;

  const s = loadSettings();
  // Fond dynamique
  if (s.dynamicBg && !s.contrast) {
    document.body.style.background = w.bg;
  } else {
    document.body.style.background = '';
  }
  // Animation météo
  renderWeatherFx(s.anim && !s.reduceMotion ? w.fx : null);
}

// ===== MOTEUR MÉTÉO CANVAS 3D =====
let _wxCtx = null, _wxRAF = null, _wxW = 0, _wxH = 0, _wxDpr = 1;

function _wxInit() {
  const c = document.getElementById('weather-fx');
  if (!c || c.tagName !== 'CANVAS') return false;
  _wxDpr = Math.min(window.devicePixelRatio || 1, 2);
  // Utiliser les dimensions de fenêtre directement — plus fiable que offsetWidth/Height
  _wxW = Math.min(window.innerWidth, 430);
  _wxH = window.innerHeight;
  c.width  = Math.round(_wxW * _wxDpr);
  c.height = Math.round(_wxH * _wxDpr);
  _wxCtx = c.getContext('2d');
  _wxCtx.scale(_wxDpr, _wxDpr);
  // Redimensionner aussi lors du resize fenêtre
  window.addEventListener('resize', () => {
    _wxW = Math.min(window.innerWidth, 430);
    _wxH = window.innerHeight;
    c.width  = Math.round(_wxW * _wxDpr);
    c.height = Math.round(_wxH * _wxDpr);
    _wxCtx.setTransform(1, 0, 0, 1, 0, 0);
    _wxCtx.scale(_wxDpr, _wxDpr);
  }, { passive: true });
  return true;
}

function _wxStop() {
  if (_wxRAF) { cancelAnimationFrame(_wxRAF); _wxRAF = null; }
  if (_wxCtx) _wxCtx.clearRect(0, 0, _wxW, _wxH);
}

function renderWeatherFx(type) {
  _wxStop();
  if (!type) return;
  if (!_wxCtx) { if (!_wxInit()) return; }
  // Re-synchro dimensions à chaque appel
  _wxW = Math.min(window.innerWidth, 430);
  _wxH = window.innerHeight;
  // Mettre à jour la surface de dessin si les dimensions ont changé
  const _c = document.getElementById('weather-fx');
  if (_c) {
    _c.width  = Math.round(_wxW * _wxDpr);
    _c.height = Math.round(_wxH * _wxDpr);
    _wxCtx.setTransform(1, 0, 0, 1, 0, 0);
    _wxCtx.scale(_wxDpr, _wxDpr);
  }

  if (type === 'rain' || type === 'storm') _wxRain(type === 'storm');
  else if (type === 'sun')   _wxSun();
  else if (type === 'cloud') _wxClouds();
}

// ── PLUIE 3D ──────────────────────────────────────────────
function _wxRain(isStorm) {
  const W = _wxW, H = _wxH;
  const N = isStorm ? 200 : 120;
  const baseWind = isStorm ? 0.22 : 0.13;

  // Générer les gouttes avec profondeur z (0=loin, 1=proche)
  const drops = Array.from({ length: N }, () => {
    const z = Math.pow(Math.random(), 0.55);
    return {
      x: Math.random() * W * 1.5 - W * 0.25,
      y: Math.random() * H,
      z,
      spd: 2.5 + z * 11,
      len: 7 + z * 58,
      a:   0.06 + z * 0.68,
      w:   0.35 + z * 2.8,
    };
  });

  const splashes = [];
  let t = 0;

  const tick = () => {
    _wxCtx.clearRect(0, 0, W, H);
    t++;

    // Légère oscillation du vent (rafales)
    const wa = baseWind + Math.sin(t * 0.007) * 0.028 + Math.sin(t * 0.022) * 0.012;
    const sx = Math.sin(wa), sy = Math.cos(wa);

    // Trier de loin à proche pour un rendu correct (painter's algorithm)
    drops.sort((a, b) => a.z - b.z);

    for (const d of drops) {
      const col = isStorm ? '190,205,255' : '165,180,252';
      const tail = 0.62;

      const grad = _wxCtx.createLinearGradient(
        d.x - sx * d.len * tail, d.y - sy * d.len * tail,
        d.x, d.y
      );
      grad.addColorStop(0, `rgba(${col},0)`);
      grad.addColorStop(1, `rgba(${col},${d.a.toFixed(2)})`);

      _wxCtx.beginPath();
      _wxCtx.moveTo(d.x - sx * d.len * tail, d.y - sy * d.len * tail);
      _wxCtx.lineTo(d.x, d.y);
      _wxCtx.strokeStyle = grad;
      _wxCtx.lineWidth  = d.w;
      _wxCtx.lineCap    = 'round';
      _wxCtx.stroke();

      d.x += sx * d.spd;
      d.y += sy * d.spd;

      if (d.y > H + d.len + 5) {
        if (d.z > 0.3) {
          splashes.push({
            x: d.x, y: H - 1,
            r: 0,
            maxR: 1.5 + d.z * 13,
            a: d.a * 0.9,
            da: d.a * 0.052,
          });
        }
        // Réinitialiser la goutte
        d.z = Math.pow(Math.random(), 0.55);
        d.x = Math.random() * W * 1.5 - W * 0.25;
        d.y = -(d.len + 5);
        d.spd = 2.5 + d.z * 11;
        d.len = 7 + d.z * 58;
        d.a   = 0.06 + d.z * 0.68;
        d.w   = 0.35 + d.z * 2.8;
      }
    }

    // Éclaboussures (demi-cercle vers le haut)
    for (let i = splashes.length - 1; i >= 0; i--) {
      const s = splashes[i];
      s.r  += 1.15;
      s.a  -= s.da;
      if (s.a <= 0.01 || s.r >= s.maxR) { splashes.splice(i, 1); continue; }
      _wxCtx.beginPath();
      _wxCtx.arc(s.x, s.y, s.r, Math.PI, Math.PI * 2);
      _wxCtx.strokeStyle = `rgba(165,180,252,${s.a.toFixed(2)})`;
      _wxCtx.lineWidth   = 0.75;
      _wxCtx.stroke();
    }

    // Éclairs aléatoires (orage)
    if (isStorm && Math.random() < 0.004) {
      _wxBolt(W, H);
      if (Math.random() < 0.5) setTimeout(() => _wxBolt(W, H), 75);
    }

    _wxRAF = requestAnimationFrame(tick);
  };
  _wxRAF = requestAnimationFrame(tick);
}

// ── ÉCLAIR DESSINÉ SUR CANVAS ─────────────────────────────
function _wxBolt(W, H) {
  if (!_wxCtx) return;
  // Flash ambiant instantané
  _wxCtx.fillStyle = 'rgba(200,215,255,0.11)';
  _wxCtx.fillRect(0, 0, W, H);

  // Générer le tracé
  const x0 = W * (0.15 + Math.random() * 0.7);
  const pts = [[x0, 0]];
  let cx = x0, cy = 0;

  while (cy < H * 0.73) {
    cx += (Math.random() - 0.44) * 55;
    cy += 13 + Math.random() * 24;
    pts.push([cx, cy]);
    // Branche secondaire probabiliste
    if (Math.random() < 0.22) {
      let bx = cx, by = cy;
      const steps = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < steps; k++) {
        bx += (Math.random() - 0.3) * 45;
        by += 11 + Math.random() * 16;
        pts.push([bx, by]);
      }
      pts.push([cx, cy]); // retour au tronc
    }
  }

  const stroke = (lw, color, blur) => {
    _wxCtx.shadowBlur   = blur;
    _wxCtx.shadowColor  = 'rgba(180,205,255,0.85)';
    _wxCtx.strokeStyle  = color;
    _wxCtx.lineWidth    = lw;
    _wxCtx.lineJoin     = 'round';
    _wxCtx.lineCap      = 'round';
    _wxCtx.beginPath();
    pts.forEach(([x, y], i) => i === 0 ? _wxCtx.moveTo(x, y) : _wxCtx.lineTo(x, y));
    _wxCtx.stroke();
    _wxCtx.shadowBlur = 0;
  };

  stroke(6,   'rgba(150,185,255,0.35)', 32); // halo externe
  stroke(2.5, 'rgba(200,225,255,0.72)', 14); // glow moyen
  stroke(0.9, 'rgba(245,252,255,0.97)',  5); // noyau blanc
}

// ── SOLEIL 3D ─────────────────────────────────────────────
function _wxSun() {
  const W = _wxW, H = _wxH;
  const cx = W / 2, cy = -22;
  let angle = 0, t = 0;

  const tick = () => {
    _wxCtx.clearRect(0, 0, W, H);
    t++;
    angle += 0.0038;

    // Trois couches d'atmosphère (gradient radial)
    [[250, 0.38], [180, 0.14], [370, 0.048]].forEach(([r, a]) => {
      const g = _wxCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0,   `rgba(250,204,21,${a})`);
      g.addColorStop(0.45,`rgba(253,186,116,${(a * 0.32).toFixed(3)})`);
      g.addColorStop(1,   'rgba(0,0,0,0)');
      _wxCtx.fillStyle = g;
      _wxCtx.beginPath();
      _wxCtx.arc(cx, cy, r, 0, Math.PI * 2);
      _wxCtx.fill();
    });

    // 16 rayons rotatifs — longueur et opacité pulsées
    for (let i = 0; i < 16; i++) {
      const a    = angle + (i / 16) * Math.PI * 2;
      const pulse = Math.sin(t * 0.033 + i * 0.65);
      const len  = 95 + pulse * 32 + (i % 4 === 0 ? 48 : 0);
      const r0   = 30;
      const alpha = 0.048 + 0.038 * Math.abs(pulse);
      const lw   = i % 3 === 0 ? 5.5 : 2;

      const rg = _wxCtx.createLinearGradient(
        cx + Math.cos(a) * r0,       cy + Math.sin(a) * r0,
        cx + Math.cos(a) * (r0+len), cy + Math.sin(a) * (r0+len)
      );
      rg.addColorStop(0,   `rgba(252,211,77,${alpha.toFixed(3)})`);
      rg.addColorStop(0.55,`rgba(250,204,21,${(alpha*0.28).toFixed(3)})`);
      rg.addColorStop(1,   'rgba(250,204,21,0)');

      _wxCtx.beginPath();
      _wxCtx.moveTo(cx + Math.cos(a)*r0,       cy + Math.sin(a)*r0);
      _wxCtx.lineTo(cx + Math.cos(a)*(r0+len), cy + Math.sin(a)*(r0+len));
      _wxCtx.strokeStyle = rg;
      _wxCtx.lineWidth   = lw;
      _wxCtx.lineCap     = 'round';
      _wxCtx.stroke();
    }

    // Disque solaire central pulsant
    const cR = 25 + Math.sin(t * 0.02) * 5;
    const cg = _wxCtx.createRadialGradient(cx, cy, 0, cx, cy, cR * 2.4);
    cg.addColorStop(0,    'rgba(255,252,190,0.95)');
    cg.addColorStop(0.3,  'rgba(253,224,71,0.76)');
    cg.addColorStop(0.72, 'rgba(250,204,21,0.28)');
    cg.addColorStop(1,    'rgba(0,0,0,0)');
    _wxCtx.fillStyle = cg;
    _wxCtx.beginPath();
    _wxCtx.arc(cx, cy, cR * 2.4, 0, Math.PI * 2);
    _wxCtx.fill();

    // Lens flares — 3 points secondaires alignés
    [[cx+58, cy+88, 13, 0.072], [cx-38, cy+130, 8, 0.052], [cx+90, cy+170, 5, 0.040]].forEach(([fx, fy, fr, fa]) => {
      const fa2 = fa * (1 + 0.5 * Math.sin(t * 0.026 + fx * 0.01));
      const fg = _wxCtx.createRadialGradient(fx, fy, 0, fx, fy, fr);
      fg.addColorStop(0, `rgba(255,255,215,${fa2.toFixed(3)})`);
      fg.addColorStop(1, 'rgba(0,0,0,0)');
      _wxCtx.fillStyle = fg;
      _wxCtx.beginPath();
      _wxCtx.arc(fx, fy, fr, 0, Math.PI * 2);
      _wxCtx.fill();
    });

    _wxRAF = requestAnimationFrame(tick);
  };
  _wxRAF = requestAnimationFrame(tick);
}

// ── NUAGES VOLUMÉTRIQUES 3D ───────────────────────────────
function _wxClouds() {
  const W = _wxW, H = _wxH;

  // [x, y, scale, speed, alpha, blur, bobPhase]
  const clouds = [
    ...Array.from({ length:5 }, (_, i) => [i*(W/3.8)-80, H*0.06+Math.random()*35, 0.52, 0.13, 0.07, 3.5, Math.random()*6.28]),
    ...Array.from({ length:3 }, (_, i) => [i*(W/2.2)-90, H*0.17+Math.random()*45, 0.88, 0.30, 0.13, 1.8, Math.random()*6.28]),
    ...Array.from({ length:2 }, (_, i) => [i*(W/1.4)-80, H*0.27+Math.random()*55, 1.28, 0.52, 0.20, 0,   Math.random()*6.28]),
  ];

  let t = 0;

  // Nuage = cluster de 7 sphères positionnées
  const puffs = [
    [0,0,36], [-44,11,29], [46,11,27], [-22,-21,23], [23,-17,21], [-5,15,17], [30,15,16],
  ];

  const drawCloud = (x, y, sc, a, blur) => {
    if (blur > 0) _wxCtx.filter = `blur(${blur}px)`;
    _wxCtx.save();
    _wxCtx.globalAlpha = a;
    _wxCtx.fillStyle = 'rgb(188,208,228)';
    puffs.forEach(([dx, dy, r]) => {
      _wxCtx.beginPath();
      _wxCtx.arc(x + dx*sc, y + dy*sc, r*sc, 0, Math.PI*2);
      _wxCtx.fill();
    });
    _wxCtx.restore();
    if (blur > 0) _wxCtx.filter = 'none';
  };

  const tick = () => {
    _wxCtx.clearRect(0, 0, W, H);
    t++;
    clouds.forEach(c => {
      const bobY = Math.sin(t * 0.006 + c[6]) * 5.5;
      drawCloud(c[0], c[1] + bobY, c[2], c[4], c[5]);
      c[0] += c[3];
      if (c[0] > W + 160) c[0] = -160;
    });
    _wxRAF = requestAnimationFrame(tick);
  };
  _wxRAF = requestAnimationFrame(tick);
}

// ===== JAUGES =====
const gaugeDefs = [
  { input:'gauge-physical', val:'val-physical' },
  { input:'gauge-mental',   val:'val-mental' },
  { input:'gauge-mood',     val:'val-mood' }
];
gaugeDefs.forEach(g => {
  const input = document.getElementById(g.input);
  const valEl = document.getElementById(g.val);
  input.addEventListener('input', () => {
    valEl.textContent = input.value;
    input.setAttribute('aria-valuetext', input.value + ' sur 10');
    buzz(5);
    updateWeather();
  });
});

// ===== TAGS =====
let selectedTags = [];
function renderTags() {
  const list = document.getElementById('tags-list');
  list.innerHTML = '';
  TAGS.forEach(tag => {
    const chip = document.createElement('button');
    chip.className = 'tag-chip' + (selectedTags.includes(tag) ? ' selected' : '');
    chip.textContent = tag;
    chip.type = 'button';
    chip.setAttribute('aria-pressed', selectedTags.includes(tag) ? 'true' : 'false');
    chip.addEventListener('click', () => {
      if (selectedTags.includes(tag)) selectedTags = selectedTags.filter(t => t !== tag);
      else selectedTags.push(tag);
      buzz();
      renderTags();
    });
    list.appendChild(chip);
  });
}

// ===== GREETING =====
function renderGreeting() {
  const h = new Date().getHours();
  let g = 'Bonjour';
  if (h >= 18 || h < 5) g = 'Bonsoir';
  else if (h >= 12) g = 'Bon après-midi';
  document.getElementById('home-greeting').textContent = g;
}
function renderDate() {
  document.getElementById('today-date').textContent =
    new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}

// ===== CHARGER L'ENTRÉE DU JOUR =====
function loadTodayEntry() {
  const data = loadData();
  const today = todayKey();
  selectedTags = [];
  if (data[today]) {
    const e = data[today];
    document.getElementById('gauge-physical').value = e.p;
    document.getElementById('gauge-mental').value = e.m;
    document.getElementById('gauge-mood').value = e.h;
    document.getElementById('val-physical').textContent = e.p;
    document.getElementById('val-mental').textContent = e.m;
    document.getElementById('val-mood').textContent = e.h;
    document.getElementById('note-input').value = e.note || '';
    selectedTags = e.tags ? [...e.tags] : [];
    document.getElementById('btn-save').textContent = 'Mettre à jour';
  }
  renderTags();
  updateWeather();
}

// ===== SAUVEGARDER =====
document.getElementById('btn-save').addEventListener('click', () => {
  const data = loadData();
  const key = editingDate || todayKey();
  const p = +document.getElementById('gauge-physical').value;
  const m = +document.getElementById('gauge-mental').value;
  const h = +document.getElementById('gauge-mood').value;
  const note = document.getElementById('note-input').value.trim();

  data[key] = { p, m, h, note, tags:[...selectedTags], date:key };
  saveData(data);
  buzz(20);

  if (editingDate) {
    showToast('Jour modifié ✓');
    editingDate = null;
    document.getElementById('btn-save').textContent = 'Enregistrer ma météo';
    goToScreen('calendar');
  } else {
    document.getElementById('btn-save').textContent = 'Mettre à jour ✓';
    showToast('Météo enregistrée 🌿');
    askAgent(p, m, h, data);
  }
});

// ===== CALENDRIER =====
function renderCalendar() {
  const data = loadData();
  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';
  const today = new Date();
  const cells = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    cells.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'));
  }
  let dow = new Date(cells[0]).getDay();
  dow = dow === 0 ? 6 : dow - 1;
  for (let i = 0; i < dow; i++) {
    const e = document.createElement('div');
    e.className = 'cal-cell cal-empty';
    e.setAttribute('aria-hidden', 'true');
    grid.appendChild(e);
  }
  cells.forEach(key => {
    const cell = document.createElement('button');
    cell.className = 'cal-cell';
    if (data[key]) {
      const score = avgScore(data[key].p, data[key].m, data[key].h);
      cell.textContent = Math.round(score);
      cell.classList.add('has-data');
      if (score >= 8) cell.classList.add('cal-super');
      else if (score >= 6) cell.classList.add('cal-good');
      else if (score >= 4) cell.classList.add('cal-ok');
      else if (score >= 2) cell.classList.add('cal-low');
      else cell.classList.add('cal-hard');
      cell.setAttribute('aria-label', formatDateLong(key) + ', score ' + score + ' sur 10');
    } else {
      cell.classList.add('cal-none');
      cell.textContent = '·';
      cell.setAttribute('aria-label', formatDateLong(key) + ', aucune donnée');
      cell.disabled = true;
    }
    grid.appendChild(cell);
  });
  renderHistory();
}

function renderHistory() {
  const data = loadData();
  const list = document.getElementById('history-list');
  list.innerHTML = '';
  const keys = Object.keys(data).sort().reverse().slice(0, 7);
  if (keys.length === 0) {
    list.innerHTML = '<p style="font-size:13px;color:#52525b;padding:10px 0;">Aucune entrée pour l\'instant.</p>';
    return;
  }
  keys.forEach(key => {
    const e = data[key];
    const score = avgScore(e.p, e.m, e.h);
    const row = document.createElement('div');
    row.className = 'history-row';
    let dot = '#22c55e';
    if (score < 6) dot = '#fbbf24';
    if (score < 4) dot = '#f87171';
    row.innerHTML =
      '<div class="history-dot" style="background:'+dot+'"></div>' +
      '<div class="history-date">'+formatDate(key)+'</div>' +
      '<div class="history-scores">Corps '+e.p+' · Mental '+e.m+' · Humeur '+e.h+'</div>' +
      '<div class="history-avg">'+score+'</div>';
    list.appendChild(row);
  });
}

// ===== MODAL JOUR =====
// ===== STATS =====
function renderStats() {
  const data = loadData();
  const keys = Object.keys(data).sort();
  const scores = keys.map(k => avgScore(data[k].p, data[k].m, data[k].h));
  document.getElementById('stat-entries').textContent = keys.length;
  if (scores.length > 0) {
    const avg = scores.reduce((a,b)=>a+b,0) / scores.length;
    document.getElementById('stat-avg').textContent = avg.toFixed(1);
    document.getElementById('stat-best').textContent = Math.max(...scores).toFixed(1);
  } else {
    document.getElementById('stat-avg').textContent = '—';
    document.getElementById('stat-best').textContent = '—';
  }
  // streak
  let streak = 0;
  const now = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    const key = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    if (data[key]) streak++; else break;
  }
  document.getElementById('stat-streak').textContent = streak;

  // bannière d'encouragement
  const banner = document.getElementById('streak-banner');
  if (streak >= 3) {
    banner.style.display = 'block';
    let msg = '🔥 ' + streak + ' jours de suite, continue comme ça !';
    if (streak >= 7) msg = '🌟 Une semaine complète ! Bravo pour ta régularité.';
    if (streak >= 30) msg = '🏆 30 jours d\'affilée — tu es incroyable !';
    banner.textContent = msg;
  } else {
    banner.style.display = 'none';
  }

  renderChart(keys);
  renderInsight(data);
}

function renderChart(keys) {
  const data = loadData();
  const bars = document.getElementById('chart-bars');
  bars.innerHTML = '';
  const last7 = keys.slice(-7);
  const days = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  if (last7.length === 0) {
    bars.innerHTML = '<p style="font-size:12px;color:#52525b;">Pas encore de données.</p>';
    return;
  }
  last7.forEach(key => {
    const score = avgScore(data[key].p, data[key].m, data[key].h);
    const height = Math.round((score / 10) * 80);
    const [y, m, d] = key.split('-');
    const dayName = days[new Date(+y, +m-1, +d).getDay()];
    let cls = 'chart-bar';
    if (score < 4) cls += ' hard'; else if (score < 6) cls += ' low';
    const col = document.createElement('div');
    col.className = 'chart-col';
    col.innerHTML = '<div class="'+cls+'" style="height:'+height+'px"></div><div class="chart-day">'+dayName+'</div>';
    bars.appendChild(col);
  });
}

function renderInsight(data) {
  const dayScores = [[],[],[],[],[],[],[]];
  const days = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  Object.keys(data).forEach(key => {
    const [y, m, d] = key.split('-');
    const idx = new Date(+y, +m-1, +d).getDay();
    dayScores[idx].push(avgScore(data[key].p, data[key].m, data[key].h));
  });
  const avgs = dayScores.map(a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0);
  const best = avgs.indexOf(Math.max(...avgs));
  document.getElementById('insight-day').textContent = avgs[best] > 0 ? days[best] : '—';
}

// ===== AGENT IA =====
async function askAgent(p, m, h, data) {
  const box = document.getElementById('agent-box');
  const txt = document.getElementById('agent-text');
  box.style.display = 'block';
  txt.textContent = 'Analyse en cours...';

  const keys = Object.keys(data).sort();
  const last7 = keys.slice(-7);
  const avg7 = last7.length ? last7.reduce((s,k)=>s+avgScore(data[k].p,data[k].m,data[k].h),0)/last7.length : null;
  const lowDays = last7.filter(k => avgScore(data[k].p,data[k].m,data[k].h) < 4).length;

  const systemPrompt = `Tu es un compagnon de bien-être bienveillant intégré dans l'application MoodCast.
Tu analyses les scores de l'utilisateur et tu donnes un conseil court, doux et concret.
Règles strictes :
- Maximum 3 phrases
- Jamais de diagnostic médical
- Si le score moyen des 7 derniers jours est inférieur à 3.5 ou si plus de 4 jours sont difficiles, recommande doucement de consulter un professionnel
- Tu n'es pas un psychologue, rappelle-le si nécessaire
- Toujours encourageant et positif`;

  const userMessage = `Voici mes scores du jour :
- Énergie physique : ${p}/10
- Énergie mentale : ${m}/10
- Humeur : ${h}/10
- Score moyen aujourd'hui : ${avgScore(p,m,h)}/10
- Moyenne sur 7 jours : ${avg7 ? avg7.toFixed(1) : 'pas encore de données'}
- Jours difficiles cette semaine : ${lowDays}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'TA_CLE_API_ICI',
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        system: systemPrompt,
        messages: [{ role:'user', content: userMessage }]
      })
    });
    const result = await response.json();
    txt.textContent = result.content[0].text;
  } catch(e) {
    txt.textContent = 'Je ne peux pas te répondre pour l\'instant. Prends soin de toi 🌿';
    console.error('Erreur agent IA', e);
  }
}

// ===== NOTIFICATIONS =====
function loadNotif() {
  try { return JSON.parse(localStorage.getItem(NOTIF_KEY) || '{"active":false,"time":"08:00"}'); }
  catch(e) { return { active:false, time:'08:00' }; }
}
function saveNotif(s) { localStorage.setItem(NOTIF_KEY, JSON.stringify(s)); }

function applyNotifUI(s) {
  setToggle('set-notif-toggle', s.active);
  const timeRow = document.getElementById('set-notif-time-row');
  const timeInput = document.getElementById('set-notif-time');
  timeRow.style.display = s.active ? 'flex' : 'none';
  timeInput.value = s.time;
}
function sendNotifToSW(s) {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready.then(reg => {
    if (!reg.active) return;
    if (s.active) {
      const [hour, minute] = s.time.split(':').map(Number);
      reg.active.postMessage({ type:'SCHEDULE_NOTIF', hour, minute });
    } else {
      reg.active.postMessage({ type:'CANCEL_NOTIF' });
    }
  });
}

// ===== INIT RÉGLAGES (toggles) =====
function bindToggle(id, key, onChange) {
  const el = document.getElementById(id);
  el.addEventListener('click', () => {
    const s = loadSettings();
    s[key] = !s[key];
    saveSettings(s);
    applySettings(s);
    buzz();
    if (onChange) onChange(s[key]);
  });
}

function initSettings() {
  const s = loadSettings();
  applySettings(s);
  bindToggle('set-anim', 'anim');
  bindToggle('set-dynamic-bg', 'dynamicBg');
  bindToggle('set-contrast', 'contrast');
  bindToggle('set-bigtext', 'bigtext');
  bindToggle('set-reduce-motion', 'reduceMotion');
  bindToggle('set-vibrate', 'vibrate');
}

function initNotif() {
  const s = loadNotif();
  applyNotifUI(s);
  document.getElementById('set-notif-toggle').addEventListener('click', async () => {
    const s = loadNotif();
    if (!s.active) {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { showToast('Notifications refusées par le navigateur'); return; }
      s.active = true;
    } else { s.active = false; }
    saveNotif(s);
    applyNotifUI(s);
    sendNotifToSW(s);
    buzz();
    showToast(s.active ? 'Rappel activé à ' + s.time : 'Rappel désactivé');
  });
  document.getElementById('set-notif-time').addEventListener('change', () => {
    const s = loadNotif();
    s.time = document.getElementById('set-notif-time').value;
    saveNotif(s);
    applyNotifUI(s);
    sendNotifToSW(s);
    showToast('Rappel réglé à ' + s.time);
  });
  if (s.active) sendNotifToSW(s);
}

// ===== EXPORT / IMPORT / EFFACER =====
document.getElementById('btn-export').addEventListener('click', () => {
  const data = loadData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'moodcast-sauvegarde-' + todayKey() + '.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Données exportées ⬇️');
});

document.getElementById('btn-import').addEventListener('click', () => {
  document.getElementById('import-file').click();
});
document.getElementById('import-file').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      const data = loadData();
      Object.assign(data, imported);
      saveData(data);
      showToast('Données importées ⬆️');
      loadTodayEntry();
    } catch(err) {
      showToast('Fichier invalide');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

document.getElementById('btn-clear-all').addEventListener('click', () => {
  if (!confirm('Effacer TOUTES tes données ? Cette action est irréversible.')) return;
  localStorage.removeItem(STORAGE_KEY);
  buzz(30);
  showToast('Toutes les données ont été effacées');
  loadTodayEntry();
  closeMenu();
});

// ===== INIT =====
function init() {
  renderGreeting();
  renderDate();
  initSettings();
  initNotif();
  loadTodayEntry();
}
init();

// ===== TILT 3D + SPECULAR GLARE SUR LES CARTES =====
document.querySelectorAll('.gauge-item, .stat-card, .chart-box, .insight-box').forEach(card => {
  card.addEventListener('mousemove', e => {
    const rect = card.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;   // 0→1
    const ny = (e.clientY - rect.top)  / rect.height;
    const rotY =  (nx - 0.5) * 20;   // max ±10°
    const rotX = -(ny - 0.5) * 14;
    card.style.transform  = `perspective(750px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateZ(10px)`;
    card.style.boxShadow  = `${-rotY*2.2}px ${rotX*1.8}px 40px rgba(0,0,0,0.55), ${-rotY*0.4}px ${rotX*0.3}px 8px rgba(0,0,0,0.25)`;
    // Reflet spéculaire qui suit la souris
    card.style.setProperty('--gx', (nx * 100).toFixed(1) + '%');
    card.style.setProperty('--gy', (ny * 100).toFixed(1) + '%');
    card.classList.add('glare');
  });
  card.addEventListener('mouseleave', () => {
    card.style.transform = '';
    card.style.boxShadow = '';
    card.classList.remove('glare');
  });
});

// ===== PARALLAXE FOND (souris desktop + gyroscope mobile) =====
(function initParallax() {
  const canvas = document.getElementById('weather-fx');
  if (!canvas) return;
  const STRENGTH = 10; // pixels max de déplacement

  function applyParallax(nx, ny) {
    // nx, ny normalisés -1..1
    const tx = nx * STRENGTH;
    const ty = ny * STRENGTH;
    canvas.style.transform = `translateX(calc(-50% + ${tx.toFixed(2)}px)) translateY(${ty.toFixed(2)}px)`;
  }

  // Desktop — souris
  let mouseActive = false;
  document.addEventListener('mousemove', e => {
    mouseActive = true;
    const nx = (e.clientX / window.innerWidth)  * 2 - 1;
    const ny = (e.clientY / window.innerHeight) * 2 - 1;
    applyParallax(nx * 0.55, ny * 0.45);
  });

  // Mobile — gyroscope
  window.addEventListener('deviceorientation', e => {
    if (mouseActive || e.beta == null || e.gamma == null) return;
    const nx = Math.max(-1, Math.min(1, e.gamma / 22));
    const ny = Math.max(-1, Math.min(1, (e.beta - 40) / 22));
    applyParallax(nx, ny);
  });
}());

});

// ===== SERVICE WORKER =====
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
    .then(() => console.log('Service Worker enregistré ✅'))
    .catch(e => console.error('Erreur SW', e));
}
