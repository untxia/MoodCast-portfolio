import { test, expect } from '@playwright/test';
import { openApp, setGauge } from '../helpers.js';

const gaugeColors = page => page.evaluate(() =>
  ['physical', 'mental', 'mood'].map(k => {
    const s = getComputedStyle(document.querySelector(`.gcard[data-gauge="${k}"]`));
    return [s.getPropertyValue('--g1').trim(), s.getPropertyValue('--g2').trim()];
  }));

test.describe('cartes de jauge', () => {
  test('chaque jauge a sa couleur, aucune n\'est verte', async ({ page }) => {
    await openApp(page);
    const colors = await gaugeColors(page);
    expect(new Set(colors.map(c => c.join())).size).toBe(3);
    const isGreen = hex => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); return g > r + 30 && g > b + 30; };
    for (const [a, b] of colors) { expect(isGreen(a)).toBe(false); expect(isGreen(b)).toBe(false); }
  });

  test('le mot d\'état suit la valeur', async ({ page }) => {
    await openApp(page);
    await setGauge(page, 'gauge-physical', 1);
    await expect(page.locator('#state-physical')).toHaveText('Épuisé');
    await setGauge(page, 'gauge-physical', 10);
    await expect(page.locator('#state-physical')).toHaveText('Au top');
    await setGauge(page, 'gauge-mood', 2);
    await expect(page.locator('#state-mood')).toHaveText('Très bas');
    await setGauge(page, 'gauge-mental', 7);
    await expect(page.locator('#state-mental')).toHaveText('Clair');
  });

  test('l\'émoji change d\'expression avec la valeur', async ({ page }) => {
    await openApp(page);
    await setGauge(page, 'gauge-mood', 9);
    await expect(page.locator('#icon-mood')).toHaveAttribute('data-emoji', '😊');
    await setGauge(page, 'gauge-mood', 5);
    await expect(page.locator('#icon-mood')).toHaveAttribute('data-emoji', '😌');
    await setGauge(page, 'gauge-mood', 2);
    await expect(page.locator('#icon-mood')).toHaveAttribute('data-emoji', '😔');
    await setGauge(page, 'gauge-physical', 2);
    await expect(page.locator('#icon-physical')).toHaveAttribute('data-emoji', '😴');
    await setGauge(page, 'gauge-mental', 2);
    await expect(page.locator('#icon-mental')).toHaveAttribute('data-emoji', '😰');
  });

  test('le remplissage du curseur suit la valeur', async ({ page }) => {
    await openApp(page);
    const p = id => page.locator('#' + id).evaluate(el => el.style.getPropertyValue('--p'));
    await setGauge(page, 'gauge-mental', 1);
    expect(await p('gauge-mental')).toBe('0.000');
    await setGauge(page, 'gauge-mental', 10);
    expect(await p('gauge-mental')).toBe('1.000');
  });

  test('l\'entrée enregistrée restaure états et curseurs après rechargement', async ({ page }) => {
    await openApp(page);
    await setGauge(page, 'gauge-physical', 9);
    await page.locator('#btn-save').click();
    await page.reload();
    await expect(page.locator('#state-physical')).toHaveText('Au top');
    await expect(page.locator('#val-physical')).toHaveText('9');
    await expect(page.locator('#icon-physical')).toHaveAttribute('data-emoji', '💪');
  });
});

test.describe('émojis 3D', () => {
  test('toutes les images d\'émojis de l\'accueil se chargent', async ({ page }) => {
    await openApp(page);
    await page.waitForFunction(() => [...document.images].every(i => i.complete));
    const broken = await page.evaluate(() => [...document.images].filter(i => !i.naturalWidth).map(i => i.src));
    expect(broken).toEqual([]);
    expect(await page.locator('img.emo').count()).toBeGreaterThan(15);
  });

  test('les émojis du menu se chargent aussi', async ({ page }) => {
    await openApp(page);
    await page.locator('#btn-menu').click();
    await page.waitForFunction(() => [...document.querySelectorAll('#side-menu img')].every(i => i.complete));
    const broken = await page.evaluate(() => [...document.querySelectorAll('#side-menu img')].filter(i => !i.naturalWidth).map(i => i.src));
    expect(broken).toEqual([]);
  });

  test('les images décoratives sont masquées aux lecteurs d\'écran', async ({ page }) => {
    await openApp(page);
    const withoutEmptyAlt = await page.evaluate(() => [...document.images].filter(i => i.getAttribute('alt') !== '').length);
    expect(withoutEmptyAlt).toBe(0);
  });

  test('le fichier d\'un émoji est servi et mis en cache pour le hors-ligne', async ({ page, request }) => {
    await openApp(page);
    expect((await request.get('/emoji/biceps.webp')).ok()).toBe(true);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(async () => (await caches.keys()).length)).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(async () => !!(await caches.match('./emoji/brain.webp')))).toBe(true);
  });
});

test.describe('étiquettes d\'émotion', () => {
  test('8 pastilles avec émoji, couleur et relief', async ({ page }) => {
    await openApp(page);
    const chips = page.locator('.tag-chip');
    await expect(chips).toHaveCount(8);
    await expect(chips.first().locator('img.emo')).toHaveCount(1);
    await expect(chips.first()).toHaveClass(/glass/);
    await expect(chips.first()).toHaveClass(/float-chip/);
    const colors = await chips.evaluateAll(els => els.map(e => e.style.getPropertyValue('--c')));
    expect(new Set(colors).size).toBe(8);
  });

  test('sélection : état, couleur de l\'étiquette, enregistrement avec l\'émoji d\'origine', async ({ page }) => {
    await openApp(page);
    const chip = page.getByRole('button', { name: 'Reconnaissant' });
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect(chip).toHaveClass(/selected/);
    await page.locator('#btn-save').click();
    const data = await page.evaluate(() => JSON.parse(localStorage.getItem('moodcast-v1')));
    expect(data['2026-10-20'].tags).toEqual(['🤗 Reconnaissant']); // format de stockage inchangé
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'false');
  });
});

test.describe('menu', () => {
  test('met en évidence l\'écran actif', async ({ page }) => {
    await openApp(page);
    await page.locator('#btn-menu').click();
    const home = page.locator('.menu-link[data-screen="home"]');
    await expect(home).toHaveClass(/active/);
    await expect(home).toHaveAttribute('aria-current', 'page');
    await page.locator('.menu-link[data-screen="stats"]').click(); // ferme le menu et ouvre les stats
    await page.locator('#screen-stats .btn-menu-screen').click();
    await expect(page.locator('.menu-link[data-screen="stats"]')).toHaveAttribute('aria-current', 'page');
    await expect(home).not.toHaveAttribute('aria-current', 'page');
  });

  test('toutes les sections sont présentes', async ({ page }) => {
    await openApp(page);
    await page.locator('#btn-menu').click();
    for (const title of ['Paramètres', 'Apparence', 'Accessibilité', 'Confidentialité', 'Mes données']) {
      await expect(page.locator('.menu-section-title', { hasText: title })).toHaveCount(1);
    }
    for (const id of ['set-notif-toggle', 'set-anim', 'set-3d', 'set-dynamic-bg', 'set-contrast', 'set-bigtext', 'set-reduce-motion', 'set-vibrate', 'set-ai']) {
      await expect(page.locator('#' + id)).toHaveAttribute('role', 'switch');
    }
  });

  test('l\'interrupteur bascule visuellement et reste accessible', async ({ page }) => {
    await openApp(page);
    await page.locator('#btn-menu').click();
    const t = page.locator('#set-vibrate');
    await expect(t).toHaveAttribute('aria-checked', 'true');
    await t.click();
    await expect(t).toHaveAttribute('aria-checked', 'false');
    await expect(t).toHaveClass(/off/);
    await expect(page.getByLabel('Vibrations', { exact: false }).first()).toBeVisible();
  });

  test('le menu suit le moment de la journée', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('html')).toHaveAttribute('data-tod', 'morning');
  });
});

test.describe('burger', () => {
  test('trois barres aux couleurs des trois jauges, bouton accessible', async ({ page }) => {
    await openApp(page);
    const btn = page.locator('#btn-menu');
    await expect(btn).toHaveAttribute('aria-label', 'Ouvrir le menu');
    await expect(btn.locator('.burger i')).toHaveCount(3);
    const bg = await btn.locator('.burger i').evaluateAll(els => els.map(e => getComputedStyle(e).backgroundImage));
    expect(new Set(bg).size).toBe(3);
    expect(bg[0]).toContain('251, 113, 133'); // corail (Corps)
    expect(bg[1]).toContain('129, 140, 248'); // indigo (Mental)
    expect(bg[2]).toContain('253, 224, 71');  // or (Humeur)
  });

  test('les trois écrans ont le même burger', async ({ page }) => {
    await openApp(page);
    expect(await page.locator('.burger-btn').count()).toBe(3);
    expect(await page.locator('.burger-btn .burger i').count()).toBe(9);
  });

  test('ouvert : les barres se croisent en X ; fermé : elles reviennent', async ({ page }) => {
    await openApp(page);
    const middle = page.locator('#btn-menu .burger i:nth-child(2)');
    await expect(page.locator('body')).not.toHaveClass(/menu-open/);
    await page.locator('#btn-menu').click();
    await expect(page.locator('body')).toHaveClass(/menu-open/);
    await expect(middle).toHaveCSS('opacity', '0');
    const top = await page.locator('#btn-menu .burger i:nth-child(1)').evaluate(e => getComputedStyle(e).transform);
    expect(top).not.toBe('none'); // pivoté de 45°
    await page.locator('#btn-close-menu').click();
    await expect(page.locator('body')).not.toHaveClass(/menu-open/);
    await expect(middle).not.toHaveCSS('opacity', '0');
  });

  test('zone tactile confortable (≥ 44 px)', async ({ page }) => {
    await openApp(page);
    const box = await page.locator('#btn-menu').boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  });

  test('contraste élevé : barres blanches fixes', async ({ page }) => {
    await openApp(page, { settings: { contrast: true } });
    const colors = await page.locator('#btn-menu .burger i').evaluateAll(els => els.map(e => getComputedStyle(e).backgroundColor));
    expect(new Set(colors)).toEqual(new Set(['rgb(255, 255, 255)']));
  });
});
