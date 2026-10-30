// Régression visuelle. Mode ?freeze=1 : scène 3D figée et déterministe (graine fixe, horloge figée).
// Les captures de référence sont propres à chaque OS : `npm run test:visual:update` pour les régénérer.
import { test, expect } from '@playwright/test';
import { openApp, nextFrames, setGauge, seedData } from '../helpers.js';

async function ready(page) {
  await expect(page.locator('html')).toHaveAttribute('data-scene', /on|off/);
  // émojis 3D des fenêtres de verre chargés et dessinés avant la capture
  await page.waitForFunction(() => document.documentElement.dataset.scene !== 'on' || document.getElementById('scene-canvas').dataset.assets === 'ready');
  await page.waitForFunction(() => [...document.images].every(i => i.complete));
  await nextFrames(page, 3);
}

test.describe('captures', () => {
  test('accueil — nuageux (défaut)', async ({ page }) => {
    await openApp(page, { freeze: true });
    await ready(page);
    await expect(page).toHaveScreenshot('home-cloudy.png');
  });

  test('accueil — plein soleil', async ({ page }) => {
    await openApp(page, { freeze: true });
    for (const id of ['gauge-physical', 'gauge-mental', 'gauge-mood']) await setGauge(page, id, 10);
    await ready(page);
    await expect(page).toHaveScreenshot('home-sunny.png');
  });

  test('accueil — orage', async ({ page }) => {
    await openApp(page, { freeze: true });
    for (const id of ['gauge-physical', 'gauge-mental', 'gauge-mood']) await setGauge(page, id, 1);
    await ready(page);
    await expect(page).toHaveScreenshot('home-storm.png');
  });

  test('accueil — sans scène 3D (repli emoji)', async ({ page }) => {
    await openApp(page, { freeze: true, settings: { scene3d: false } });
    await ready(page);
    await expect(page).toHaveScreenshot('home-no3d.png');
  });

  test('calendrier', async ({ page }) => {
    await openApp(page, { freeze: true, seed: seedData() });
    await page.locator('.bottom-nav [data-screen="calendar"]').click();
    await ready(page);
    await expect(page).toHaveScreenshot('calendar.png');
  });

  test('statistiques', async ({ page }) => {
    await openApp(page, { freeze: true, seed: seedData() });
    await page.locator('.bottom-nav [data-screen="stats"]').click();
    await ready(page);
    await expect(page).toHaveScreenshot('stats.png');
  });

  test('menu des réglages', async ({ page }) => {
    await openApp(page, { freeze: true });
    await page.locator('#btn-menu').click();
    await ready(page);
    await expect(page).toHaveScreenshot('menu.png');
  });

  test('contraste élevé', async ({ page }) => {
    await openApp(page, { freeze: true, settings: { contrast: true } });
    await ready(page);
    await expect(page).toHaveScreenshot('home-contrast.png');
  });
});

test.describe('écran d\'ouverture', () => {
  // Animations avancées à des instants précis : rendu déterministe, indépendant de la vitesse de la machine.
  for (const t of [420, 2100, 3300]) {
    test(`à ${t} ms`, async ({ page }) => {
      await openApp(page, { splash: true, path: '/?splashhold' });
      await page.locator('#splash').waitFor();
      await page.evaluate(async ms => {
        const anims = document.getAnimations();
        await Promise.all(anims.map(a => a.ready)); // toutes démarrées avant de figer le temps
        anims.forEach(a => { a.pause(); a.currentTime = ms; });
      }, t);
      await nextFrames(page, 3);
      await page.waitForTimeout(600); // laisse le compositeur rattraper la mise en pause (machine chargée)
      await expect(page).toHaveScreenshot(`splash-${t}.png`, { animations: 'allow', maxDiffPixelRatio: 0.04 });
    });
  }
});

test.describe('confidentialité', () => {
  test('fenêtre de choix RGPD', async ({ page }) => {
    await openApp(page, { freeze: true, consent: 'none', path: '/?showconsent' });
    await page.locator('#consent').waitFor();
    await ready(page);
    await expect(page).toHaveScreenshot('consent.png');
  });
});
