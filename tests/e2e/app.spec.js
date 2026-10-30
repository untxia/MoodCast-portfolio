import { test, expect } from '@playwright/test';
import { openApp, setGauge, seedData } from '../helpers.js';

const store = page => page.evaluate(() => JSON.parse(localStorage.getItem('moodcast-v1') || '{}'));

test.describe('accueil & scène 3D', () => {
  test('charge l\'app avec la scène 3D active', async ({ page }) => {
    await openApp(page);
    await expect(page).toHaveTitle(/MoodCast/);
    await expect(page.locator('html')).toHaveAttribute('data-scene', 'on');
    await expect(page.locator('#scene-canvas')).toBeVisible();
    await expect(page.locator('#home-greeting')).toHaveText('Bonjour');
    await expect(page.locator('#today-date')).toHaveText('mardi 20 octobre 2026');
  });

  test('les jauges changent la météo (soleil → orage)', async ({ page }) => {
    await openApp(page);
    await setGauge(page, 'gauge-physical', 10);
    await setGauge(page, 'gauge-mental', 10);
    await setGauge(page, 'gauge-mood', 10);
    await expect(page.locator('#weather-label')).toContainText('Plein soleil');
    await expect(page.locator('#val-mood')).toHaveText('10');
    await setGauge(page, 'gauge-physical', 1);
    await setGauge(page, 'gauge-mental', 1);
    await setGauge(page, 'gauge-mood', 1);
    await expect(page.locator('#weather-label')).toContainText('Orage');
    await expect(page.locator('#gauge-mood')).toHaveAttribute('aria-valuetext', '1 sur 10');
  });

  test('l\'icône emoji reste accessible mais masquée visuellement quand la 3D est active', async ({ page }) => {
    await openApp(page);
    const icon = page.locator('#weather-icon');
    await expect(icon).toHaveAttribute('role', 'img');
    const box = await icon.boundingBox();
    expect(box.width).toBeLessThanOrEqual(1);
  });

  test('repli sans WebGL : emoji visible, pas de scène', async ({ page }) => {
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        if (/webgl/i.test(type)) return null;
        return orig.call(this, type, ...rest);
      };
    });
    await openApp(page);
    await expect(page.locator('html')).toHaveAttribute('data-scene', 'off');
    await expect(page.locator('#weather-icon')).toBeVisible();
    await expect(page.locator('#weather-icon')).toHaveAttribute('data-emoji', '⛅');
  });

  test('aucune erreur JavaScript au chargement', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await openApp(page);
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
  });
});

test.describe('enregistrer sa météo', () => {
  test('sauvegarde, compagnon IA, persistance après rechargement', async ({ page }) => {
    await openApp(page);
    await setGauge(page, 'gauge-physical', 7);
    await setGauge(page, 'gauge-mental', 8);
    await setGauge(page, 'gauge-mood', 9);
    await page.getByRole('button', { name: 'Motivé' }).click();
    await page.locator('#note-input').fill('Belle journée');
    await page.locator('#btn-save').click();

    await expect(page.locator('#toast')).toContainText('Météo enregistrée');
    await expect(page.locator('#agent-text')).toContainText('Conseil de test');
    await expect(page.locator('#btn-save')).toHaveText('Mettre à jour ✓');

    const data = await store(page);
    expect(data['2026-10-20']).toMatchObject({ p: 7, m: 8, h: 9, note: 'Belle journée', tags: ['🎯 Motivé'] });

    await page.reload();
    await expect(page.locator('#gauge-mood')).toHaveValue('9');
    await expect(page.locator('#note-input')).toHaveValue('Belle journée');
    await expect(page.locator('#btn-save')).toHaveText('Mettre à jour');
    await expect(page.getByRole('button', { name: 'Motivé' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('envoie uniquement les scores à la fonction IA (pas la note)', async ({ page }) => {
    let payload;
    await page.route('**/.netlify/functions/coach', route => {
      payload = route.request().postDataJSON();
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"text":"ok"}' });
    });
    await openApp(page);
    await page.locator('#note-input').fill('secret très perso');
    await page.locator('#btn-save').click();
    await expect(page.locator('#agent-text')).toHaveText('ok');
    expect(Object.keys(payload).sort()).toEqual(['avg7', 'avgToday', 'consent', 'h', 'lowDays', 'm', 'p']);
    expect(payload.consent).toBe(true);
    expect(JSON.stringify(payload)).not.toContain('secret');
  });

  test('message de repli si l\'IA échoue', async ({ page }) => {
    await page.route('**/.netlify/functions/coach', route => route.fulfill({ status: 502, body: '{"error":"x"}' }));
    await openApp(page);
    await page.locator('#btn-save').click();
    await expect(page.locator('#agent-text')).toContainText('Je ne peux pas te répondre');
  });
});

test.describe('calendrier & statistiques', () => {
  test('affiche les 30 jours, les couleurs et l\'historique', async ({ page }) => {
    await openApp(page, { seed: seedData() });
    await page.locator('.bottom-nav [data-screen="calendar"]').click();
    await expect(page.locator('#cal-title')).toBeVisible();
    await expect(page.locator('#calendar-grid .cal-cell.has-data').first()).toBeVisible();
    expect(await page.locator('#calendar-grid .cal-cell:not(.cal-empty)').count()).toBe(30);
    await expect(page.locator('#calendar-grid .cal-super').first()).toBeVisible();
    await expect(page.locator('#history-list .history-row')).toHaveCount(7);
  });

  test('statistiques cohérentes avec les données', async ({ page }) => {
    const seed = seedData();
    await openApp(page, { seed });
    await page.locator('.bottom-nav [data-screen="stats"]').click();
    await expect(page.locator('#stat-entries')).toHaveText(String(Object.keys(seed).length));
    await expect(page.locator('#stat-streak')).toHaveText('3');
    await expect(page.locator('#streak-banner')).toContainText('3 jours de suite');
    await expect(page.locator('#chart-bars .chart-col')).toHaveCount(7);
    await expect(page.locator('#insight-day')).not.toHaveText('—');
  });

  test('états vides', async ({ page }) => {
    await openApp(page);
    await page.locator('.bottom-nav [data-screen="stats"]').click();
    await expect(page.locator('#stat-avg')).toHaveText('—');
    await expect(page.locator('#streak-banner')).toBeHidden();
    await page.locator('.bottom-nav [data-screen="calendar"]').click();
    await expect(page.locator('#history-list')).toContainText('Aucune entrée');
  });
});

test.describe('menu & réglages', () => {
  test('ouvre/ferme le menu (bouton, Échap, fond) et navigue', async ({ page }) => {
    await openApp(page);
    const menu = page.locator('#side-menu');
    await page.locator('#btn-menu').click();
    await expect(menu).toHaveClass(/open/);
    await expect(page.locator('#btn-menu')).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(menu).not.toHaveClass(/open/);

    await page.locator('#btn-menu').click();
    await menu.getByRole('button', { name: /Statistiques/ }).click();
    await expect(page.locator('#screen-stats')).toHaveClass(/active/);
    await expect(menu).not.toHaveClass(/open/);
  });

  test('désactiver la scène 3D rétablit l\'emoji et persiste', async ({ page }) => {
    await openApp(page);
    await page.locator('#btn-menu').click();
    const toggle = page.locator('#set-3d');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('html')).toHaveAttribute('data-scene', 'off');
    await expect(page.locator('#scene-canvas')).toBeHidden();
    await expect(page.locator('#weather-icon')).toBeVisible();

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-scene', 'off');
  });

  test('contraste élevé coupe la scène 3D', async ({ page }) => {
    await openApp(page);
    await page.locator('#btn-menu').click();
    await page.locator('#set-contrast').click();
    await expect(page.locator('body')).toHaveClass(/contrast/);
    await expect(page.locator('html')).toHaveAttribute('data-scene', 'off');
  });

  test('grand texte et réduction des animations', async ({ page }) => {
    await openApp(page);
    await page.locator('#btn-menu').click();
    await page.locator('#set-bigtext').click();
    await expect(page.locator('body')).toHaveClass(/bigtext/);
    await page.locator('#set-reduce-motion').click();
    await expect(page.locator('body')).toHaveClass(/reduce-motion/);
    await expect(page.locator('html')).toHaveAttribute('data-scene', 'on'); // 3D figée, pas supprimée
  });

  test('prefers-reduced-motion est respecté', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await openApp(page);
    await expect(page.locator('html')).toHaveAttribute('data-scene', 'on');
    expect(errors).toEqual([]);
  });
});

test.describe('données', () => {
  test('exporter', async ({ page }) => {
    await openApp(page, { seed: seedData() });
    await page.locator('#btn-menu').click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-export').click()]);
    expect(download.suggestedFilename()).toBe('moodcast-sauvegarde-2026-10-20.json');
    const content = JSON.parse(await (await import('node:fs/promises')).readFile(await download.path(), 'utf8'));
    expect(content['2026-10-20']).toBeDefined();
  });

  test('importer un fichier valide puis invalide', async ({ page }) => {
    await openApp(page);
    await page.locator('#btn-menu').click();
    const good = { '2026-10-20': { p: 4, m: 4, h: 4, note: 'importé', tags: [], date: '2026-10-20' } };
    await page.locator('#import-file').setInputFiles({ name: 'ok.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(good)) });
    await expect(page.locator('#toast')).toContainText('Données importées');
    expect((await store(page))['2026-10-20'].note).toBe('importé');
    await expect(page.locator('#gauge-physical')).toHaveValue('4');

    await page.locator('#import-file').setInputFiles({ name: 'ko.json', mimeType: 'application/json', buffer: Buffer.from('pas du json') });
    await expect(page.locator('#toast')).toContainText('Fichier invalide');
  });

  test('tout effacer demande confirmation', async ({ page }) => {
    await openApp(page, { seed: seedData() });
    await page.locator('#btn-menu').click();
    page.once('dialog', d => d.dismiss());
    await page.locator('#btn-clear-all').click();
    expect(Object.keys(await store(page)).length).toBeGreaterThan(0);

    page.once('dialog', d => d.accept());
    await page.locator('#btn-clear-all').click();
    await expect.poll(async () => Object.keys(await store(page)).length).toBe(0);
  });
});

test.describe('PWA', () => {
  test('manifeste valide et icônes accessibles', async ({ page, request }) => {
    await openApp(page);
    const manifest = await (await request.get('/manifest.json')).json();
    expect(manifest.display).toBe('standalone');
    for (const icon of manifest.icons) expect((await request.get('/' + icon.src)).ok()).toBe(true);
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  });

  test('fonctionne hors-ligne après la première visite', async ({ page, context }) => {
    await openApp(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload(); // la page est maintenant contrôlée par le service worker
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

    // précache terminé (appli + émojis) avant de couper le réseau
    await expect.poll(() => page.evaluate(async () =>
      (await Promise.all(['./meteo.js', './app.css', './emoji/brain.webp', './emoji/sun.webp'].map(u => caches.match(u)))).every(Boolean)
    ), { timeout: 20000 }).toBe(true);

    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#home-greeting')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-scene', 'on');
    await setGauge(page, 'gauge-mood', 8);
    await page.locator('#btn-save').click();
    await expect(page.locator('#toast')).toContainText('Météo enregistrée');
    await expect(page.locator('#agent-text')).toContainText('Je ne peux pas te répondre'); // IA hors-ligne : repli propre
  });

  test('page de confidentialité accessible depuis le menu', async ({ page }) => {
    await openApp(page);
    await page.locator('#btn-menu').click();
    await page.locator('#link-privacy').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Politique de confidentialité');
    await expect(page.getByText('3114')).toBeVisible();
  });
});

test.describe('accessibilité de base', () => {
  test('lien d\'évitement, labels et rôles', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Aller au contenu principal' })).toBeFocused();
    await expect(page.getByLabel('Corps', { exact: true })).toBeVisible();
    await expect(page.locator('[role="switch"]').first()).toHaveAttribute('aria-checked', /true|false/);
    await expect(page.locator('canvas#scene-canvas')).toHaveAttribute('aria-hidden', 'true');
  });
});
