import {
  dateKey, avgScore, getWeather, entryScore, scoreBand, computeStats, bestWeekday,
  streakMessage, last7Summary, last30Keys, mondayOffset, greetingFor, timeOfDay, TIME_ICONS, moodPrompt, gaugeState, gaugeIcon, splitTag, TAG_COLORS, DAY_NAMES
} from './logic.js';
import { emojiHTML, setEmoji } from './emoji.js';
import { playSplash } from './splash.js';
import { aiAllowed, hasDecided, setConsent, showConsent } from './consent.js';
import { createScene } from './scene3d.js';

document.addEventListener('DOMContentLoaded', () => {

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
function todayKey() { return dateKey(); }
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
      anim: true, dynamicBg: true, scene3d: true, contrast: false,
      bigtext: false, reduceMotion: false, vibrate: true
    }, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
  } catch(e) {
    return { anim:true, dynamicBg:true, scene3d:true, contrast:false, bigtext:false, reduceMotion:false, vibrate:true };
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
  setToggle('set-3d', s.scene3d);
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

// ===== ENTRÉE 3D DES CARTES =====
function rise3D() {
  document.querySelectorAll('.screen.active .float-panel').forEach((el, i) => {
    el.style.setProperty('--i', i);
    el.classList.remove('rise3d');
    void el.offsetWidth; // relance l'animation
    el.classList.add('rise3d');
  });
}

// ===== NAVIGATION =====
const screens = document.querySelectorAll('.screen');
const navItems = document.querySelectorAll('.nav-item');

function goToScreen(target) {
  screens.forEach(s => s.classList.remove('active'));
  navItems.forEach(n => n.classList.remove('active'));
  document.getElementById('screen-' + target).classList.add('active');
  navItems.forEach(n => { if (n.dataset.screen === target) n.classList.add('active'); });
  document.querySelectorAll('.menu-link').forEach(l => {
    const on = l.dataset.screen === target;
    l.classList.toggle('active', on);
    if (on) l.setAttribute('aria-current', 'page'); else l.removeAttribute('aria-current');
  });
  if (target === 'calendar') renderCalendar();
  if (target === 'stats') renderStats();
  window.scrollTo(0, 0);
  if (scene) scene.setScreen(target);
  rise3D();
}
navItems.forEach(btn => btn.addEventListener('click', () => { buzz(); goToScreen(btn.dataset.screen); }));

// ===== MENU BURGER =====
const sideMenu = document.getElementById('side-menu');
const menuOverlay = document.getElementById('menu-overlay');
function openMenu() {
  document.body.classList.add('menu-open');
  sideMenu.classList.add('open');
  sideMenu.setAttribute('aria-hidden', 'false');
  menuOverlay.hidden = false;
  document.getElementById('btn-menu').setAttribute('aria-expanded', 'true');
  buzz();
}
function closeMenu() {
  document.body.classList.remove('menu-open');
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

// ===== SCÈNE 3D =====
const sceneCanvas = document.getElementById('scene-canvas');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const freezeParam = new URLSearchParams(location.search).has('freeze');
let scene = null;

function motionAllowed(s) {
  return !s.reduceMotion && !prefersReducedMotion.matches && !freezeParam;
}
function sceneWanted(s) { return s.scene3d && !s.contrast; }

function syncScene(s) {
  const wanted = sceneWanted(s);
  if (wanted && !scene && sceneCanvas) {
    scene = createScene(sceneCanvas, { anchorEl: document.getElementById('weather-hero'), motion: motionAllowed(s) });
    if (scene) {
      sceneCanvas.addEventListener('scene-lost', () => { scene = null; document.documentElement.dataset.scene = 'off'; updateWeather(); });
      scene.setScreen(document.querySelector('.screen.active').id.replace('screen-', ''));
    }
  }
  if (scene) {
    scene.setActive(wanted);
    scene.setMotion(motionAllowed(s));
  }
  document.documentElement.dataset.scene = scene && wanted ? 'on' : 'off';
  const gyroBtn = document.getElementById('btn-gyro');
  if (gyroBtn) gyroBtn.hidden = !(scene && wanted && motionAllowed(s) && scene.needsGyroPermission());
}
prefersReducedMotion.addEventListener?.('change', () => syncScene(loadSettings()));
document.getElementById('btn-gyro')?.addEventListener('click', async () => {
  if (!scene) return;
  const ok = await scene.enableGyro();
  showToast(ok ? 'Effet de profondeur activé 🧭' : 'Capteurs de mouvement refusés');
  syncScene(loadSettings());
});

// ===== MÉTÉO =====
function updateWeather() {
  syncGauges();
  const p = +document.getElementById('gauge-physical').value;
  const m = +document.getElementById('gauge-mental').value;
  const h = +document.getElementById('gauge-mood').value;
  const score = avgScore(p, m, h);
  const w = getWeather(score);
  setEmoji(document.getElementById('weather-icon'), w.icon);
  document.getElementById('weather-label').textContent = w.label;

  const s = loadSettings();
  syncScene(s);
  if (scene) scene.setWeather(score, { p, m, h });
  // Fond dynamique
  if (s.dynamicBg && !s.contrast) {
    document.body.style.background = w.bg;
  } else {
    document.body.style.background = '';
  }
  // Animation météo CSS : seulement quand la scène 3D n'est pas active
  const sceneOn = document.documentElement.dataset.scene === 'on';
  renderWeatherFx(!sceneOn && s.anim && !s.reduceMotion ? w.fx : null);
}

function renderWeatherFx(type) {
  const fx = document.getElementById('weather-fx');
  fx.innerHTML = '';
  if (!type) return;
  if (type === 'rain') {
    for (let i = 0; i < 30; i++) {
      const d = document.createElement('div');
      d.className = 'fx-drop';
      d.style.left = Math.random() * 100 + '%';
      d.style.animationDuration = (0.5 + Math.random() * 0.6) + 's';
      d.style.animationDelay = Math.random() * 2 + 's';
      fx.appendChild(d);
    }
  } else if (type === 'sun') {
    const r = document.createElement('div');
    r.className = 'fx-ray';
    fx.appendChild(r);
  } else if (type === 'cloud') {
    for (let i = 0; i < 3; i++) {
      const c = document.createElement('div');
      c.className = 'fx-cloud';
      c.textContent = '☁️';
      c.style.top = (10 + i * 25) + '%';
      c.style.animationDuration = (18 + Math.random() * 12) + 's';
      c.style.animationDelay = (i * 4) + 's';
      fx.appendChild(c);
    }
  }
}

// ===== JAUGES =====
const GAUGES = [
  { kind: 'physical', input: 'gauge-physical' },
  { kind: 'mental',   input: 'gauge-mental' },
  { kind: 'mood',     input: 'gauge-mood' }
];
// Reflète la valeur dans la carte : chiffre, mot d'état, remplissage du curseur, émoji qui change d'expression
function syncGauges() {
  GAUGES.forEach(({ kind, input }) => {
    const el = document.getElementById(input);
    const v = +el.value;
    document.getElementById('val-' + kind).textContent = v;
    el.setAttribute('aria-valuetext', v + ' sur 10');
    el.style.setProperty('--p', ((v - 1) / 9).toFixed(3));
    document.getElementById('state-' + kind).textContent = gaugeState(kind, v);
    const icon = document.getElementById('icon-' + kind);
    const ch = gaugeIcon(kind, v);
    if (icon.dataset.emoji !== ch) {
      const first = !icon.dataset.emoji;
      setEmoji(icon, ch);
      if (!first) { icon.classList.remove('pop'); void icon.offsetWidth; icon.classList.add('pop'); }
    }
  });
}
GAUGES.forEach(({ input }) => {
  document.getElementById(input).addEventListener('input', () => {
    buzz(5);
    updateWeather();
  });
});

// ===== TAGS =====
let selectedTags = [];
function renderTags() {
  const list = document.getElementById('tags-list');
  list.innerHTML = '';
  TAGS.forEach((tag, i) => {
    const { emoji, label } = splitTag(tag);
    const selected = selectedTags.includes(tag);
    const chip = document.createElement('button');
    chip.className = 'tag-chip glass float-chip' + (selected ? ' selected' : '');
    chip.style.setProperty('--c', TAG_COLORS[emoji] || '#a5b4fc');
    chip.style.setProperty('--i', i);
    chip.innerHTML = emojiHTML(emoji, 30) + '<span>' + label + '</span>';
    chip.type = 'button';
    chip.setAttribute('aria-pressed', selected ? 'true' : 'false');
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
  const hour = new Date().getHours();
  const tod = timeOfDay(hour);
  document.getElementById('home-greeting').textContent = greetingFor(hour);
  document.getElementById('home-sub').textContent = moodPrompt(hour);
  document.getElementById('welcome').dataset.tod = tod;
  setEmoji(document.getElementById('welcome-icon'), TIME_ICONS[tod]);
  document.documentElement.dataset.tod = tod;
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
  const cells = last30Keys();
  for (let i = 0; i < mondayOffset(cells[0]); i++) {
    const e = document.createElement('div');
    e.className = 'cal-cell cal-empty';
    e.setAttribute('aria-hidden', 'true');
    grid.appendChild(e);
  }
  cells.forEach(key => {
    const cell = document.createElement('button');
    cell.className = 'cal-cell';
    if (data[key]) {
      const score = entryScore(data[key]);
      cell.textContent = Math.round(score);
      cell.classList.add('has-data', 'cal-' + scoreBand(score));
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
  const st = computeStats(data);
  document.getElementById('stat-entries').textContent = st.entries;
  document.getElementById('stat-avg').textContent = st.avg === null ? '—' : st.avg.toFixed(1);
  document.getElementById('stat-best').textContent = st.best === null ? '—' : st.best.toFixed(1);
  document.getElementById('stat-streak').textContent = st.streak;

  // bannière d'encouragement
  const banner = document.getElementById('streak-banner');
  const msg = streakMessage(st.streak);
  banner.style.display = msg ? 'block' : 'none';
  if (msg) banner.textContent = msg;

  renderChart(keys);
  document.getElementById('insight-day').textContent = bestWeekday(data) || '—';
}

function renderChart(keys) {
  const data = loadData();
  const bars = document.getElementById('chart-bars');
  bars.innerHTML = '';
  const last7 = keys.slice(-7);
  const days = DAY_NAMES;
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

// ===== AGENT IA =====
async function askAgent(p, m, h, data) {
  const box = document.getElementById('agent-box');
  const txt = document.getElementById('agent-text');
  const off = document.getElementById('agent-off');
  if (!aiAllowed()) {                // pas de consentement : rien n'est envoyé nulle part
    box.style.display = 'none';
    off.hidden = false;
    return;
  }
  off.hidden = true;
  box.style.display = 'block';
  txt.textContent = 'Analyse en cours...';

  const { avg7, lowDays } = last7Summary(data);

  try {
    const response = await fetch('/.netlify/functions/coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consent: true, p, m, h, avgToday: avgScore(p,m,h), avg7, lowDays })
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const result = await response.json();
    if (!result.text) throw new Error('Réponse vide');
    txt.textContent = result.text;
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

// ===== CONSENTEMENT : compagnon IA =====
function syncAiToggle() {
  setToggle('set-ai', aiAllowed());
  if (aiAllowed()) document.getElementById('agent-off').hidden = true;
}
function setAi(on) {
  setConsent(on);
  syncAiToggle();
  buzz();
  showToast(on ? 'Compagnon IA activé ✨' : 'Compagnon IA désactivé : 100 % local');
}
document.getElementById('set-ai').addEventListener('click', () => setAi(!aiAllowed()));
document.getElementById('btn-enable-ai').addEventListener('click', () => {
  setAi(true);
  const g = id => +document.getElementById(id).value;
  askAgent(g('gauge-physical'), g('gauge-mental'), g('gauge-mood'), loadData());
});
function maybeConsent() {
  const q = new URLSearchParams(location.search);
  if (hasDecided() || q.has('noconsent') || (q.has('freeze') && !q.has('showconsent'))) return;
  showConsent({ onChoice: ai => { syncAiToggle(); showToast(ai ? 'Compagnon IA activé ✨' : 'Parfait : tout reste sur ton appareil'); } });
}

function initSettings() {
  const s = loadSettings();
  applySettings(s);
  bindToggle('set-anim', 'anim');
  bindToggle('set-dynamic-bg', 'dynamicBg');
  bindToggle('set-3d', 'scene3d');
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

// ===== ÉCRAN D'OUVERTURE =====
function reducedMotionNow() {
  return prefersReducedMotion.matches || document.body.classList.contains('reduce-motion');
}
function maybeSplash() {
  const q = new URLSearchParams(location.search);
  if (q.has('nosplash') || q.has('freeze')) { maybeConsent(); return; }
  try {
    if (sessionStorage.getItem('moodcast-splash') === '1') { maybeConsent(); return; } // une fois par session
    sessionStorage.setItem('moodcast-splash', '1');
  } catch (e) { /* stockage indisponible : on joue l'animation */ }
  playSplash({ quick: reducedMotionNow(), onDone: () => { rise3D(); maybeConsent(); } });
}
// Un clic sur le logo rejoue l'animation
document.querySelectorAll('.logo-btn').forEach(btn => btn.addEventListener('click', () => {
  buzz(15);
  playSplash({ quick: reducedMotionNow(), onDone: rise3D });
}));

// ===== INIT =====
function init() {
  renderGreeting();
  renderDate();
  initSettings();
  initNotif();
  syncAiToggle();
  loadTodayEntry();
  goToScreen('home');
  maybeSplash();
}
init();

});

// ===== SERVICE WORKER =====
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
    .then(() => console.log('Service Worker enregistré ✅'))
    .catch(e => console.error('Erreur SW', e));
}
