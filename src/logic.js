// Logique pure de MoodCast (sans DOM) — testée dans tests/unit.

export function dateKey(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function parseKey(key) {
  const [y, m, d] = key.split('-');
  return new Date(+y, +m - 1, +d);
}

export function avgScore(p, m, h) {
  return Math.round((p + m + h) / 3 * 10) / 10;
}

export function getWeather(score) {
  if (score >= 8.5) return { icon: '☀️', label: 'Plein soleil — tu rayonnes !', fx: 'sun', bg: '#1a2e1a' };
  if (score >= 7)   return { icon: '🌤️', label: 'Beau temps — bonne énergie', fx: 'sun', bg: '#16241a' };
  if (score >= 5)   return { icon: '⛅', label: 'Nuageux — journée correcte', fx: 'cloud', bg: '#14141c' };
  if (score >= 3.5) return { icon: '🌧️', label: 'Pluie — un peu difficile', fx: 'rain', bg: '#0f1420' };
  return { icon: '⛈️', label: 'Orage — journée éprouvante', fx: 'rain', bg: '#14101a' };
}

const clamp01 = v => Math.min(1, Math.max(0, v));

// Paramètres continus (0..1) pour la scène 3D, déduits du score moyen.
export function sceneParams(score) {
  return {
    sun: clamp01((score - 4.5) / 4),     // 0 sous 4.5, 1 à partir de 8.5
    cloud: clamp01(Math.max(1 - Math.abs(score - 5.5) / 4.5 + 0.25, (5 - score) / 3)),
    rain: clamp01((5 - score) / 3),      // commence sous 5, plein à 2
    storm: clamp01((3.5 - score) / 2),   // éclairs sous 3.5
    wind: clamp01(0.12 + clamp01((5 - score) / 3) * 0.45 + clamp01((3.5 - score) / 2) * 0.5)
  };
}

export function scoreBand(score) {
  if (score >= 8) return 'super';
  if (score >= 6) return 'good';
  if (score >= 4) return 'ok';
  if (score >= 2) return 'low';
  return 'hard';
}

export function entryScore(e) {
  return avgScore(e.p, e.m, e.h);
}

// Série de jours consécutifs jusqu'à `now` (inclus).
export function computeStreak(data, now = new Date()) {
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    if (data[dateKey(d)]) streak++; else break;
  }
  return streak;
}

export function computeStats(data, now = new Date()) {
  const keys = Object.keys(data).sort();
  const scores = keys.map(k => entryScore(data[k]));
  return {
    entries: keys.length,
    avg: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    best: scores.length ? Math.max(...scores) : null,
    streak: computeStreak(data, now)
  };
}

export const DAY_NAMES = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

export function bestWeekday(data) {
  const buckets = [[], [], [], [], [], [], []];
  Object.keys(data).forEach(k => buckets[parseKey(k).getDay()].push(entryScore(data[k])));
  const avgs = buckets.map(a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const best = avgs.indexOf(Math.max(...avgs));
  return avgs[best] > 0 ? DAY_NAMES[best] : null;
}

export function streakMessage(streak) {
  if (streak >= 30) return '🏆 30 jours d\'affilée — tu es incroyable !';
  if (streak >= 7) return '🌟 Une semaine complète ! Bravo pour ta régularité.';
  if (streak >= 3) return '🔥 ' + streak + ' jours de suite, continue comme ça !';
  return null;
}

// Moyenne sur les 7 dernières entrées + nombre de jours difficiles (score < 4).
export function last7Summary(data) {
  const last7 = Object.keys(data).sort().slice(-7);
  const scores = last7.map(k => entryScore(data[k]));
  return {
    avg7: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    lowDays: scores.filter(s => s < 4).length
  };
}

// Les 30 derniers jours (clé de date), du plus ancien au plus récent.
export function last30Keys(now = new Date()) {
  const keys = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    keys.push(dateKey(d));
  }
  return keys;
}

// Décalage (lundi = 0) pour aligner le premier jour dans la grille du calendrier.
export function mondayOffset(key) {
  const dow = parseKey(key).getDay();
  return dow === 0 ? 6 : dow - 1;
}

export function greetingFor(hour) {
  if (hour >= 18 || hour < 5) return 'Bonsoir';
  if (hour >= 12) return 'Bon après-midi';
  return 'Bonjour';
}

// Moment de la journée : pilote l'icône, les couleurs et la phrase d'accueil.
export function timeOfDay(hour) {
  if (hour < 5 || hour >= 22) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'day';
  return 'evening';
}

export const TIME_ICONS = { morning: '🌅', day: '☀️', evening: '🌇', night: '🌙' };

export function moodPrompt(hour) {
  switch (timeOfDay(hour)) {
    case 'morning': return 'Comment démarre ta journée ?';
    case 'day': return 'Quelle météo à l\'intérieur, là maintenant ?';
    case 'evening': return 'Comment s\'est passée ta journée ?';
    default: return 'Prends un instant avant de dormir.';
  }
}

// ===== Jauges : mots d'état, icône qui change avec la valeur, couleurs =====
const STATES = {
  physical: ['Épuisé', 'Fatigué', 'Correct', 'En forme', 'Au top'],
  mental: ['Saturé', 'Embrouillé', 'Stable', 'Clair', 'Affûté'],
  mood: ['Très bas', 'Morose', 'Neutre', 'Joyeux', 'Radieux']
};
export const GAUGE_SCALE = {
  physical: ['Épuisé', 'Au top'],
  mental: ['Saturé', 'Affûté'],
  mood: ['Très bas', 'Radieux']
};

export function gaugeState(kind, value) {
  const i = Math.min(4, Math.max(0, Math.ceil(value / 2) - 1));
  return STATES[kind][i];
}

/** Émoji de la jauge : exprime l'état (😴 / 💪, 😰 / 🧠, 😔 / 😌 / 😊). */
export function gaugeIcon(kind, value) {
  if (kind === 'physical') return value <= 3 ? '😴' : '💪';
  if (kind === 'mental') return value <= 3 ? '😰' : '🧠';
  return value <= 3 ? '😔' : value <= 6 ? '😌' : '😊';
}

// Étiquettes d'émotion : couleur de chaque pastille
export const TAG_COLORS = {
  '😴': '#818cf8', '⚡': '#fde047', '😰': '#fb7185', '😌': '#5eead4',
  '🎯': '#fb923c', '😔': '#60a5fa', '🤗': '#f472b6', '😤': '#f87171'
};

/** "😴 Fatigué" -> { emoji: "😴", label: "Fatigué" } */
export function splitTag(tag) {
  const m = /^(\S+)\s+(.*)$/u.exec(tag);
  return m ? { emoji: m[1], label: m[2] } : { emoji: '', label: tag };
}

// Distance parcourue par une goutte depuis le haut du nuage : elle AUGMENTE avec le temps (la goutte descend),
// puis revient à 0 (nouvelle goutte). Même formule que le vertex shader de la pluie (scene3d.js).
export function rainFall(phase, t, speed, range) {
  return (((phase + t * speed) % range) + range) % range;
}
