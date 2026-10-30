// Consentement RGPD de MoodCast.
// - Les entrées (scores, notes, émotions) restent sur l'appareil : aucun consentement requis pour les stocker en local.
// - Le compagnon IA envoie des scores à un tiers (Anthropic) : traitement facultatif, soumis à un consentement
//   explicite, libre et révocable à tout moment (art. 6.1.a et 9.2.a — ce sont des données de bien-être).
import { emojiHTML } from './emoji.js';

export const CONSENT_KEY = 'moodcast-consent';
export const CONSENT_VERSION = 1; // à incrémenter si la nature des traitements change : le consentement est redemandé

const store = s => s || (typeof localStorage !== 'undefined' ? localStorage : null);

/** { v, ai, at } ou null si aucun choix valide n'a encore été fait. */
export function getConsent(storage) {
  try {
    const c = JSON.parse(store(storage).getItem(CONSENT_KEY) || 'null');
    return c && c.v === CONSENT_VERSION && typeof c.ai === 'boolean' ? c : null;
  } catch (e) { return null; }
}

export function hasDecided(storage) { return getConsent(storage) !== null; }
export function aiAllowed(storage) { return getConsent(storage)?.ai === true; }

export function setConsent(ai, storage, now = new Date()) {
  const c = { v: CONSENT_VERSION, ai: !!ai, at: now.toISOString() };
  try { store(storage).setItem(CONSENT_KEY, JSON.stringify(c)); } catch (e) { /* stockage indisponible : choix non mémorisé */ }
  return c;
}

export function clearConsent(storage) {
  try { store(storage).removeItem(CONSENT_KEY); } catch (e) { /* rien à effacer */ }
}

// ===== Fenêtre de choix (première ouverture) =====
// Les deux réponses ont le même poids visuel : refuser est aussi simple qu'accepter.
export function showConsent({ onChoice } = {}) {
  if (document.getElementById('consent')) return;
  const el = document.createElement('div');
  el.id = 'consent';
  el.className = 'consent-overlay';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'consent-title');
  el.setAttribute('aria-describedby', 'consent-desc');
  el.innerHTML =
    `<div class="consent-card glass">
      <div class="consent-ico">${emojiHTML('🔒', 54)}</div>
      <h2 id="consent-title" class="consent-title">Tes données restent chez toi</h2>
      <div id="consent-desc" class="consent-body">
        <p><span class="consent-pt">${emojiHTML('💾', 26)}</span><span>Tes scores, notes et émotions sont enregistrés <strong>uniquement sur cet appareil</strong>. MoodCast n'a ni compte ni serveur qui les conserve.</span></p>
        <p><span class="consent-pt">${emojiHTML('✨', 26)}</span><span>Le <strong>compagnon IA</strong> est facultatif. S'il est activé, tes <strong>trois scores du jour</strong> et ta moyenne sur 7 jours sont envoyés à Anthropic (États-Unis) pour écrire un conseil. Jamais ta note ni tes étiquettes.</span></p>
        <p><span class="consent-pt">${emojiHTML('🛡', 26)}</span><span>Tu peux changer d'avis à tout moment : <strong>Menu ▸ Confidentialité</strong>.</span></p>
      </div>
      <div class="consent-actions">
        <button type="button" class="consent-btn" data-choice="local">Rester 100 % local</button>
        <button type="button" class="consent-btn" data-choice="ai">Activer le compagnon IA</button>
      </div>
      <a class="consent-link" href="privacy.html">Lire la politique de confidentialité</a>
    </div>`;

  const background = document.querySelectorAll('#main-content, .bottom-nav, .side-menu');
  background.forEach(n => { n.inert = true; });
  document.body.appendChild(el);
  el.tabIndex = -1;            // focus sur la fenêtre : aucun des deux choix n'est mis en avant
  el.focus({ preventScroll: true });

  function choose(ai) {
    setConsent(ai);
    el.classList.add('consent-out');
    setTimeout(() => {
      el.remove();
      background.forEach(n => { n.inert = false; });
      if (onChoice) onChoice(ai);
    }, 350);
  }
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-choice]');
    if (b) choose(b.dataset.choice === 'ai');
  });
  // Échap = refus (le choix le plus protecteur)
  el.addEventListener('keydown', e => { if (e.key === 'Escape') choose(false); });
}
