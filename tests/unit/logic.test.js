import { describe, it, expect } from 'vitest';
import {
  dateKey, parseKey, avgScore, getWeather, sceneParams, scoreBand, computeStreak, computeStats,
  bestWeekday, streakMessage, last7Summary, last30Keys, mondayOffset, greetingFor,
  timeOfDay, TIME_ICONS, moodPrompt, gaugeState, gaugeIcon, splitTag, TAG_COLORS, rainFall
} from '../../src/logic.js';

const entry = (p, m, h) => ({ p, m, h });
const dayOffset = (base, n) => { const d = new Date(base); d.setDate(d.getDate() - n); return dateKey(d); };

describe('dates', () => {
  it('formate une clé AAAA-MM-JJ avec zéros', () => {
    expect(dateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
  it('parseKey est l\'inverse de dateKey (heure locale)', () => {
    expect(dateKey(parseKey('2026-03-09'))).toBe('2026-03-09');
  });
});

describe('avgScore', () => {
  it('arrondit à une décimale', () => {
    expect(avgScore(5, 5, 5)).toBe(5);
    expect(avgScore(7, 8, 8)).toBe(7.7);
    expect(avgScore(1, 1, 2)).toBe(1.3);
  });
});

describe('getWeather', () => {
  it.each([
    [10, 'sun', '☀️'], [8.5, 'sun', '☀️'], [8.4, 'sun', '🌤️'], [7, 'sun', '🌤️'],
    [6.9, 'cloud', '⛅'], [5, 'cloud', '⛅'], [4.9, 'rain', '🌧️'], [3.5, 'rain', '🌧️'],
    [3.4, 'rain', '⛈️'], [1, 'rain', '⛈️']
  ])('score %s -> %s %s', (score, fx, icon) => {
    const w = getWeather(score);
    expect(w.fx).toBe(fx);
    expect(w.icon).toBe(icon);
  });
});

describe('sceneParams', () => {
  it('reste dans [0, 1]', () => {
    for (let s = 1; s <= 10; s += 0.5) {
      for (const v of Object.values(sceneParams(s))) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
  it('plein soleil : soleil max, ni pluie ni orage', () => {
    const p = sceneParams(9);
    expect(p.sun).toBe(1);
    expect(p.rain).toBe(0);
    expect(p.storm).toBe(0);
  });
  it('orage : pluie et éclairs au maximum, nuages denses, pas de soleil', () => {
    const p = sceneParams(1);
    expect(p.rain).toBe(1);
    expect(p.storm).toBe(1);
    expect(p.cloud).toBe(1);
    expect(p.sun).toBe(0);
  });
  it('le vent augmente quand le temps se dégrade', () => {
    expect(sceneParams(9).wind).toBeLessThan(0.2);
    expect(sceneParams(4).wind).toBeGreaterThan(sceneParams(9).wind);
    expect(sceneParams(1).wind).toBeGreaterThan(0.9);
  });
  it('journée moyenne : nuageux sans pluie', () => {
    const p = sceneParams(5.5);
    expect(p.rain).toBe(0);
    expect(p.cloud).toBeGreaterThan(0.9);
  });
});

describe('scoreBand', () => {
  it.each([[9, 'super'], [8, 'super'], [7, 'good'], [6, 'good'], [5, 'ok'], [4, 'ok'], [3, 'low'], [2, 'low'], [1, 'hard']])(
    '%s -> %s', (s, band) => expect(scoreBand(s)).toBe(band));
});

describe('streak & stats', () => {
  const now = new Date(2026, 9, 20);

  it('compte les jours consécutifs jusqu\'à aujourd\'hui', () => {
    const data = {};
    [0, 1, 2].forEach(n => { data[dayOffset(now, n)] = entry(5, 5, 5); });
    data[dayOffset(now, 4)] = entry(5, 5, 5); // trou le jour 3
    expect(computeStreak(data, now)).toBe(3);
  });
  it('série nulle si rien aujourd\'hui', () => {
    expect(computeStreak({ [dayOffset(now, 1)]: entry(5, 5, 5) }, now)).toBe(0);
  });
  it('traverse correctement un changement de mois', () => {
    const d = new Date(2026, 2, 2); // 2 mars
    const data = { '2026-03-02': entry(5, 5, 5), '2026-03-01': entry(5, 5, 5), '2026-02-28': entry(5, 5, 5) };
    expect(computeStreak(data, d)).toBe(3);
  });
  it('computeStats sans donnée', () => {
    expect(computeStats({}, now)).toEqual({ entries: 0, avg: null, best: null, streak: 0 });
  });
  it('computeStats avec données', () => {
    const data = { [dateKey(now)]: entry(9, 9, 9), [dayOffset(now, 1)]: entry(3, 3, 3) };
    const st = computeStats(data, now);
    expect(st.entries).toBe(2);
    expect(st.avg).toBe(6);
    expect(st.best).toBe(9);
    expect(st.streak).toBe(2);
  });
  it('messages d\'encouragement par palier', () => {
    expect(streakMessage(2)).toBeNull();
    expect(streakMessage(3)).toContain('3 jours');
    expect(streakMessage(7)).toContain('semaine');
    expect(streakMessage(30)).toContain('30 jours');
  });
});

describe('bestWeekday', () => {
  it('renvoie null sans donnée', () => expect(bestWeekday({})).toBeNull());
  it('trouve le meilleur jour de la semaine', () => {
    // 2026-10-19 = lundi, 2026-10-20 = mardi
    const data = { '2026-10-19': entry(3, 3, 3), '2026-10-20': entry(9, 9, 9) };
    expect(bestWeekday(data)).toBe('Mar');
  });
});

describe('last7Summary', () => {
  it('sans donnée', () => expect(last7Summary({})).toEqual({ avg7: null, lowDays: 0 }));
  it('moyenne sur les 7 dernières entrées et jours difficiles', () => {
    const data = {};
    for (let i = 1; i <= 9; i++) data['2026-10-0' + i] = entry(i < 3 ? 2 : 8, i < 3 ? 2 : 8, i < 3 ? 2 : 8);
    const { avg7, lowDays } = last7Summary(data); // garde les 7 dernières : 03..09 (toutes à 8)
    expect(avg7).toBe(8);
    expect(lowDays).toBe(0);
  });
  it('compte les jours sous 4', () => {
    const data = { '2026-10-01': entry(2, 2, 2), '2026-10-02': entry(3, 3, 3), '2026-10-03': entry(9, 9, 9) };
    expect(last7Summary(data).lowDays).toBe(2);
  });
});

describe('calendrier', () => {
  it('last30Keys : 30 jours croissants finissant aujourd\'hui', () => {
    const now = new Date(2026, 9, 20);
    const keys = last30Keys(now);
    expect(keys).toHaveLength(30);
    expect(keys[29]).toBe('2026-10-20');
    expect(keys[0]).toBe('2026-09-21');
    expect([...keys].sort()).toEqual(keys);
  });
  it('mondayOffset : lundi = 0, dimanche = 6', () => {
    expect(mondayOffset('2026-10-19')).toBe(0);
    expect(mondayOffset('2026-10-25')).toBe(6);
  });
});

describe('greetingFor', () => {
  it.each([[3, 'Bonsoir'], [5, 'Bonjour'], [11, 'Bonjour'], [12, 'Bon après-midi'], [17, 'Bon après-midi'], [18, 'Bonsoir'], [23, 'Bonsoir']])(
    '%sh -> %s', (h, g) => expect(greetingFor(h)).toBe(g));
});

describe('moment de la journée', () => {
  it.each([[0, 'night'], [4, 'night'], [5, 'morning'], [11, 'morning'], [12, 'day'], [17, 'day'], [18, 'evening'], [21, 'evening'], [22, 'night'], [23, 'night']])(
    '%sh -> %s', (h, tod) => expect(timeOfDay(h)).toBe(tod));
  it('chaque moment a une icône et une phrase', () => {
    for (const h of [3, 8, 14, 19]) {
      expect(TIME_ICONS[timeOfDay(h)]).toBeTruthy();
      expect(moodPrompt(h).length).toBeGreaterThan(10);
    }
  });
  it('salutation cohérente avec le moment', () => {
    expect(greetingFor(19)).toBe('Bonsoir');
    expect(timeOfDay(19)).toBe('evening');
    expect(greetingFor(14)).toBe('Bon après-midi');
    expect(timeOfDay(14)).toBe('day');
  });
});

describe('jauges', () => {
  it.each([[1, 'Épuisé'], [2, 'Épuisé'], [3, 'Fatigué'], [5, 'Correct'], [7, 'En forme'], [10, 'Au top']])(
    'Corps %s -> %s', (v, word) => expect(gaugeState('physical', v)).toBe(word));
  it('chaque jauge couvre tout l\'intervalle 1..10', () => {
    for (const kind of ['physical', 'mental', 'mood']) {
      for (let v = 1; v <= 10; v++) expect(gaugeState(kind, v)).toBeTruthy();
    }
  });
  it('l\'icône exprime l\'état', () => {
    expect(gaugeIcon('physical', 2)).toBe('😴');
    expect(gaugeIcon('physical', 8)).toBe('💪');
    expect(gaugeIcon('mental', 3)).toBe('😰');
    expect(gaugeIcon('mental', 4)).toBe('🧠');
    expect(gaugeIcon('mood', 2)).toBe('😔');
    expect(gaugeIcon('mood', 5)).toBe('😌');
    expect(gaugeIcon('mood', 9)).toBe('😊');
  });
});

describe('étiquettes', () => {
  it('splitTag sépare émoji et libellé', () => {
    expect(splitTag('😴 Fatigué')).toEqual({ emoji: '😴', label: 'Fatigué' });
    expect(splitTag('🤗 Reconnaissant')).toEqual({ emoji: '🤗', label: 'Reconnaissant' });
    expect(splitTag('Sans émoji')).toEqual({ emoji: 'Sans', label: 'émoji' });
  });
  it('chaque étiquette de l\'appli a une couleur', () => {
    for (const e of ['😴', '⚡', '😰', '😌', '🎯', '😔', '🤗', '😤']) expect(TAG_COLORS[e]).toMatch(/^#/);
  });
});

describe('pluie', () => {
  it('une goutte descend : la distance de chute augmente avec le temps', () => {
    const a = rainFall(1, 0, 5, 10), b = rainFall(1, 0.2, 5, 10), c = rainFall(1, 0.4, 5, 10);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });
  it('la goutte repart du haut quand elle atteint le bas', () => {
    expect(rainFall(9.5, 0.2, 5, 10)).toBeCloseTo(0.5);
  });
  it('reste dans [0, range[ même avec un temps négatif', () => {
    for (const t of [-3, -0.1, 0, 7.3, 100]) {
      const v = rainFall(2, t, 4.5, 3.6);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(3.6);
    }
  });
});
