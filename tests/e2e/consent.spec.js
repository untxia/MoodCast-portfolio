import { test, expect } from '@playwright/test';
import { openApp } from '../helpers.js';

const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('moodcast-consent') || 'null'));

/** Compte les appels à la fonction IA et liste toutes les origines contactées. */
function watchNetwork(page) {
  const seen = { coach: [], origins: new Set() };
  page.on('request', req => {
    const u = new URL(req.url());
    seen.origins.add(u.origin);
    if (u.pathname === '/.netlify/functions/coach') seen.coach.push(req.postDataJSON());
  });
  return seen;
}

test.describe('fenêtre de choix RGPD', () => {
  test('s\'affiche au premier lancement, accessible et modale', async ({ page }) => {
    await openApp(page, { consent: 'none' });
    const dialog = page.getByRole('dialog', { name: 'Tes données restent chez toi' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('uniquement sur cet appareil');
    await expect(dialog).toContainText('Anthropic');
    await expect(dialog).toContainText('Jamais ta note');
    expect(await page.locator('#main-content').evaluate(el => el.inert)).toBe(true);
    await expect(dialog.getByRole('link', { name: /politique de confidentialité/i })).toHaveAttribute('href', 'privacy.html');
  });

  test('refuser est aussi simple qu\'accepter : deux boutons, mêmes dimensions, rien de pré-coché', async ({ page }) => {
    await openApp(page, { consent: 'none' });
    const local = page.getByRole('button', { name: 'Rester 100 % local' });
    const ai = page.getByRole('button', { name: 'Activer le compagnon IA' });
    const [a, b] = [await local.boundingBox(), await ai.boundingBox()];
    expect(Math.abs(a.width - b.width)).toBeLessThan(2);
    expect(Math.abs(a.height - b.height)).toBeLessThan(2);
    expect(await stored(page)).toBeNull(); // aucun consentement avant le clic
    await expect(page.locator('#consent input[type="checkbox"]')).toHaveCount(0);
  });

  test('« Rester 100 % local » : rien n\'est envoyé, même en enregistrant', async ({ page }) => {
    const net = watchNetwork(page);
    await openApp(page, { consent: 'none' });
    await page.getByRole('button', { name: 'Rester 100 % local' }).click();
    await expect(page.locator('#consent')).toHaveCount(0);
    expect(await stored(page)).toMatchObject({ v: 1, ai: false });

    await page.locator('#btn-save').click();
    await expect(page.locator('#toast')).toContainText('Météo enregistrée');
    await expect(page.locator('#agent-off')).toBeVisible();
    await expect(page.locator('#agent-box')).toBeHidden();
    expect(net.coach).toHaveLength(0);
    expect([...net.origins]).toEqual(['http://localhost:4173']); // aucun tiers contacté
  });

  test('« Activer le compagnon IA » : consentement enregistré, conseil reçu', async ({ page }) => {
    const net = watchNetwork(page);
    await openApp(page, { consent: 'none' });
    await page.getByRole('button', { name: 'Activer le compagnon IA' }).click();
    expect(await stored(page)).toMatchObject({ v: 1, ai: true });
    await page.locator('#btn-save').click();
    await expect(page.locator('#agent-text')).toContainText('Conseil de test');
    expect(net.coach).toHaveLength(1);
    expect(net.coach[0].consent).toBe(true);
  });

  test('Échap vaut refus (le choix le plus protecteur)', async ({ page }) => {
    await openApp(page, { consent: 'none' });
    await page.keyboard.press('Escape');
    await expect(page.locator('#consent')).toHaveCount(0);
    expect(await stored(page)).toMatchObject({ ai: false });
  });

  test('le choix est mémorisé : la fenêtre ne revient pas', async ({ page }) => {
    await openApp(page, { consent: 'none' });
    await page.getByRole('button', { name: 'Rester 100 % local' }).click();
    await page.reload();
    await expect(page.locator('#home-greeting')).toBeVisible();
    await expect(page.locator('#consent')).toHaveCount(0);
  });

  test('un consentement d\'une ancienne version est redemandé', async ({ page }) => {
    await openApp(page, { consent: 'ai' });
    await page.evaluate(() => localStorage.setItem('moodcast-consent', JSON.stringify({ v: 0, ai: true, at: '2020-01-01T00:00:00.000Z' })));
    await page.reload();
    await expect(page.locator('#consent')).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('moodcast-consent')).v)).toBe(0); // l'ancien accord n'est pas réutilisé
  });

  test('s\'affiche après l\'écran d\'ouverture, jamais par-dessus', async ({ page }) => {
    await openApp(page, { consent: 'none', splash: true, path: '/?splashhold' });
    await expect(page.locator('#splash')).toBeVisible();
    await expect(page.locator('#consent')).toHaveCount(0);
    await page.keyboard.press('Escape'); // ferme le splash
    await expect(page.locator('#splash')).toHaveCount(0);
    await expect(page.locator('#consent')).toBeVisible();
  });
});

test.describe('réglage « Compagnon IA » (retrait du consentement)', () => {
  test('désactivé par défaut tant qu\'aucun choix n\'est fait', async ({ page }) => {
    await openApp(page, { consent: 'local' });
    await page.locator('#btn-menu').click();
    await expect(page.locator('#set-ai')).toHaveAttribute('aria-checked', 'false');
  });

  test('retirer le consentement coupe l\'IA immédiatement', async ({ page }) => {
    const net = watchNetwork(page);
    await openApp(page, { consent: 'ai' });
    await page.locator('#btn-menu').click();
    await expect(page.locator('#set-ai')).toHaveAttribute('aria-checked', 'true');
    await page.locator('#set-ai').click();
    expect(await stored(page)).toMatchObject({ ai: false });
    await page.locator('#btn-close-menu').click();
    await page.locator('#btn-save').click();
    await expect(page.locator('#agent-off')).toBeVisible();
    expect(net.coach).toHaveLength(0);
  });

  test('l\'activer depuis le menu puis depuis le message « désactivé »', async ({ page }) => {
    const net = watchNetwork(page);
    await openApp(page, { consent: 'local' });
    await page.locator('#btn-save').click();
    await expect(page.locator('#agent-off')).toBeVisible();
    await page.getByRole('button', { name: 'Activer', exact: true }).click();
    expect(await stored(page)).toMatchObject({ ai: true });
    await expect(page.locator('#agent-text')).toContainText('Conseil de test');
    await expect(page.locator('#agent-off')).toBeHidden();
    expect(net.coach).toHaveLength(1);
  });

  test('la note et les étiquettes ne partent jamais, même avec consentement', async ({ page }) => {
    const net = watchNetwork(page);
    await openApp(page, { consent: 'ai' });
    await page.getByRole('button', { name: 'Stressé' }).click();
    await page.locator('#note-input').fill('information très personnelle');
    await page.locator('#btn-save').click();
    await expect(page.locator('#agent-text')).toContainText('Conseil de test');
    const sent = JSON.stringify(net.coach[0]);
    expect(sent).not.toContain('personnelle');
    expect(sent).not.toContain('Stressé');
    expect(sent).not.toContain('😰');
  });

  test('l\'IA est refusée côté serveur sans consentement, même en contournant l\'interface', async ({ request }) => {
    const res = await request.post('/.netlify/functions/coach', { data: { p: 5, m: 5, h: 5, avgToday: 5, avg7: null, lowDays: 0 } });
    expect(res.status()).toBe(403);
    expect(res.headers()['cache-control']).toBe('no-store');
  });
});

test.describe('politique de confidentialité', () => {
  test('lien depuis le menu, contenu RGPD complet', async ({ page }) => {
    await openApp(page);
    await page.locator('#btn-menu').click();
    await page.locator('#link-privacy').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Politique de confidentialité');
    for (const h of ['Qui est responsable', 'Quelles données', 'Qui reçoit des données', 'Transferts hors de l\'Union européenne',
      'Combien de temps', 'Tes droits', 'Cookies, traceurs', 'Décisions automatisées', 'Sécurité', 'Mineurs', 'Avertissement santé']) {
      await expect(page.getByRole('heading', { name: new RegExp(h) })).toBeVisible();
    }
    await expect(page.getByRole('link', { name: /CNIL/ }).first()).toHaveAttribute('href', /cnil\.fr/);
    await expect(page.getByRole('link', { name: 'chrisdach64@gmail.com' }).first()).toHaveAttribute('href', /^mailto:/);
    await expect(page.getByText('3114')).toBeVisible();
  });

  test('la politique est lisible hors-ligne', async ({ page, context }) => {
    await openApp(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(async () => !!(await caches.match('./privacy.html')))).toBe(true);
  });
});

test.describe('aucun traceur', () => {
  test('aucun cookie et seules des requêtes vers l\'application elle-même', async ({ page, context }) => {
    const net = watchNetwork(page);
    await openApp(page, { consent: 'none' });
    await page.getByRole('button', { name: 'Rester 100 % local' }).click();
    await page.locator('.bottom-nav [data-screen="stats"]').click();
    await page.locator('.bottom-nav [data-screen="calendar"]').click();
    expect(await context.cookies()).toEqual([]);
    expect([...net.origins]).toEqual(['http://localhost:4173']);
  });
});
