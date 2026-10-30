import { test, expect } from '@playwright/test';
import { openApp } from '../helpers.js';

test.describe('écran d\'ouverture', () => {
  test('s\'affiche au premier lancement avec le logo MoodCast', async ({ page }) => {
    await openApp(page, { splash: true, path: '/?splashhold' });
    const splash = page.locator('#splash');
    await expect(splash).toBeVisible();
    await expect(splash).toHaveAttribute('role', 'dialog');
    await expect(splash.locator('.sp-l')).toHaveCount(8);
    expect(await splash.locator('.sp-l').allTextContents()).toEqual(['M', 'o', 'o', 'd', 'C', 'a', 's', 't']);
    await expect(splash).toContainText('ta météo intérieure');
  });

  test('l\'appli derrière est inerte tant que l\'animation joue', async ({ page }) => {
    await openApp(page, { splash: true, path: '/?splashhold' }); // maintenue à l'écran : pas de dépendance au temps
    await expect(page.locator('#splash')).toBeVisible();
    expect(await page.locator('#main-content').evaluate(el => el.inert)).toBe(true);
    expect(await page.locator('.bottom-nav').evaluate(el => el.inert)).toBe(true);
  });

  test('« Passer » ferme l\'animation et rend la main à l\'appli', async ({ page }) => {
    await openApp(page, { splash: true, path: '/?splashhold' });
    await page.getByRole('button', { name: 'Passer' }).click({ force: true });
    await expect(page.locator('#splash')).toHaveCount(0);
    expect(await page.locator('#main-content').evaluate(el => el.inert)).toBe(false);
    await page.locator('#btn-menu').click();
    await expect(page.locator('#side-menu')).toHaveClass(/open/);
  });

  test('un clic n\'importe où ou la touche Échap la ferme', async ({ page }) => {
    await openApp(page, { splash: true, path: '/?splashhold' });
    await page.locator('#splash').click({ position: { x: 100, y: 300 }, force: true });
    await expect(page.locator('#splash')).toHaveCount(0);

    await page.locator('.logo-btn').first().click();
    await expect(page.locator('#splash')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#splash')).toHaveCount(0);
  });

  test('se ferme toute seule', async ({ page }) => {
    // témoin posé avant le chargement : on sait que l'animation a bien existé, même si la machine est lente
    await page.addInitScript(() => {
      new MutationObserver(() => { if (document.getElementById('splash')) window.__splashSeen = true; })
        .observe(document, { childList: true, subtree: true });
    });
    await openApp(page, { splash: true });
    await expect.poll(() => page.evaluate(() => window.__splashSeen === true)).toBe(true);
    await expect(page.locator('#splash')).toHaveCount(0, { timeout: 15000 });
  });

  test('ne rejoue pas après un rechargement (une fois par session)', async ({ page }) => {
    await openApp(page, { splash: true, path: '/?splashhold' });
    await page.getByRole('button', { name: 'Passer' }).click({ force: true });
    await page.reload();
    await expect(page.locator('#home-greeting')).toBeVisible();
    await expect(page.locator('#splash')).toHaveCount(0);
  });

  test('un clic sur le logo la rejoue, depuis chaque écran', async ({ page }) => {
    await openApp(page);
    for (const screen of ['home', 'calendar', 'stats']) {
      await page.locator(`.bottom-nav [data-screen="${screen}"]`).click();
      await page.locator(`#screen-${screen} .logo-btn`).click();
      await expect(page.locator('#splash')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('#splash')).toHaveCount(0);
    }
  });

  test('le logo est un vrai bouton accessible', async ({ page }) => {
    await openApp(page);
    const logo = page.locator('#screen-home .logo-btn');
    expect(await logo.evaluate(el => el.tagName)).toBe('BUTTON');
    await expect(logo).toHaveAttribute('aria-label', /rejouer l'animation/);
    await logo.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#splash')).toBeVisible();
  });

  test('mouvement réduit : version courte', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openApp(page, { splash: true });
    await expect(page.locator('#splash')).toBeVisible();
    await expect(page.locator('#splash')).toHaveCount(0, { timeout: 4000 });
  });

  test('?nosplash la désactive', async ({ page }) => {
    await page.goto('/?nosplash');
    await expect(page.locator('#home-greeting')).toBeVisible();
    await expect(page.locator('#splash')).toHaveCount(0);
  });
});

test.describe('bienvenue', () => {
  test('salutation, phrase et icône suivent l\'heure', async ({ page }) => {
    await openApp(page); // 10 h : matin
    await expect(page.locator('#home-greeting')).toHaveText('Bonjour');
    await expect(page.locator('#welcome')).toHaveAttribute('data-tod', 'morning');
    await expect(page.locator('#welcome-icon')).toHaveAttribute('data-emoji', '🌅');
    await expect(page.locator('#home-sub')).toHaveText('Comment démarre ta journée ?');
    await expect(page.locator('#today-date')).toHaveText('mardi 20 octobre 2026');
  });

  for (const [iso, greeting, tod, icon] of [
    ['2026-10-20T14:00:00+02:00', 'Bon après-midi', 'day', '☀'],
    ['2026-10-20T19:30:00+02:00', 'Bonsoir', 'evening', '🌇'],
    ['2026-10-20T23:30:00+02:00', 'Bonsoir', 'night', '🌙']
  ]) {
    test(`à ${iso.slice(11, 16)} : ${greeting} (${tod})`, async ({ page }) => {
      await page.clock.setFixedTime(new Date(iso));
      await page.addInitScript(() => sessionStorage.setItem('moodcast-splash', '1'));
      await page.goto('/');
      await expect(page.locator('#home-greeting')).toHaveText(greeting);
      await expect(page.locator('#welcome')).toHaveAttribute('data-tod', tod);
      await expect(page.locator('#welcome-icon')).toHaveAttribute('data-emoji', icon);
    });
  }
});
