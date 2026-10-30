// Aides partagées par les tests E2E et visuels.
export const FIXED_NOW = new Date('2026-10-20T10:00:00+02:00');

// Entrées de test : un jour sur deux manquant, scores variés, finissant « aujourd'hui ».
export function seedData(now = FIXED_NOW, days = 14) {
  const data = {};
  const scores = [9, 8, 7, 6, 5, 4, 3, 2, 8, 9, 6, 5, 7, 8];
  for (let i = 0; i < days; i++) {
    if (i % 5 === 3) continue;
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const s = scores[i % scores.length];
    data[key] = { p: s, m: Math.max(1, s - 1), h: Math.min(10, s + 1), note: '', tags: [], date: key };
  }
  return data;
}

/** Fige l'horloge, pré-remplit le stockage et ouvre l'app. */
// consent : 'ai' (défaut : compagnon IA accepté), 'local' (refusé) ou 'none' (aucun choix : la fenêtre RGPD s'affiche)
export async function openApp(page, { seed = null, settings = null, freeze = false, splash = false, consent = 'ai', path = '/' } = {}) {
  await page.clock.setFixedTime(FIXED_NOW);
  await page.addInitScript(([seedData, settingsData, withSplash, consentMode]) => {
    if (sessionStorage.getItem('__seeded')) return;
    if (consentMode !== 'none') localStorage.setItem('moodcast-consent', JSON.stringify({ v: 1, ai: consentMode === 'ai', at: '2026-10-20T08:00:00.000Z' }));
    if (!withSplash) sessionStorage.setItem('moodcast-splash', '1'); // écran d'ouverture sauté sauf demande explicite
    sessionStorage.setItem('__seeded', '1');
    if (seedData) localStorage.setItem('moodcast-v1', JSON.stringify(seedData));
    if (settingsData) localStorage.setItem('moodcast-settings', JSON.stringify(settingsData));
  }, [seed, settings, splash, consent]);
  await page.goto(path + (freeze ? (path.includes('?') ? '&' : '?') + 'freeze=1' : ''));
  await page.locator('#home-greeting').waitFor();
}

export const nextFrames = (page, n = 2) =>
  page.evaluate(count => new Promise(res => {
    const step = left => (left <= 0 ? res() : requestAnimationFrame(() => step(left - 1)));
    step(count);
  }), n);

export const setGauge = (page, id, value) =>
  page.locator('#' + id).evaluate((el, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
