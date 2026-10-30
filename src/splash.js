// Écran d'ouverture animé (styles : splash.css). Clic, Entrée ou Échap pour passer.
const LETTERS = [['M', 'big'], ['o', 'small'], ['o', 'small'], ['d', 'small'], ['C', 'big'], ['a', 'small'], ['s', 'small'], ['t', 'small']];
const CHIPS = [['💪', '70%'], ['🧠', '85%'], ['😊', '100%']];
const SHOW_MS = 3400, QUICK_MS = 1200, EXIT_MS = 700;

export function playSplash({ quick = false, onDone } = {}) {
  if (document.getElementById('splash')) return;
  const hold = new URLSearchParams(location.search).has('splashhold'); // débogage / tests visuels

  const drops = Array.from({ length: 30 }, (_, i) =>
    `<i class="sp-drop" style="left:${(i * 37) % 100}%;animation-duration:${(0.55 + ((i * 13) % 6) / 10).toFixed(2)}s;animation-delay:${(((i * 7) % 10) / 10).toFixed(1)}s"></i>`).join('');
  const letters = LETTERS.map(([c, k], i) =>
    `<span class="sp-l logo-${k}" style="--d:${(1.5 + i * 0.07).toFixed(2)}s">${c}</span>`).join('');
  const chips = CHIPS.map(([e, v], i) =>
    `<span class="sp-chip" style="--cd:${(2.6 + i * 0.15).toFixed(2)}s;--v:${v}"><span aria-hidden="true">${e}</span><i></i></span>`).join('');

  const el = document.createElement('div');
  el.id = 'splash';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'MoodCast — animation d\'ouverture');
  el.innerHTML =
    `<div class="sp-sky"></div><div class="sp-dawn"></div>` +
    `<div class="sp-sun" aria-hidden="true"><div class="sp-rays"></div><div class="sp-orb"></div></div>` +
    `<div class="sp-cloud sp-c3"></div><div class="sp-cloud sp-c2"></div><div class="sp-cloud sp-c1"></div>` +
    `<div class="sp-rain" aria-hidden="true">${drops}</div>` +
    `<div class="sp-flash"></div>` +
    `<svg class="sp-bolt" viewBox="0 0 100 200" aria-hidden="true"><path pathLength="1" d="M62 0 L44 62 L60 66 L30 132 L50 136 L22 200" fill="none" stroke="#fff" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/></svg>` +
    `<div class="sp-logo" aria-hidden="true">${letters}<div class="sp-shine"></div></div>` +
    `<p class="sp-tag">ta météo intérieure</p>` +
    `<div class="sp-gauges" aria-hidden="true">${chips}</div>` +
    `<button type="button" class="sp-skip">Passer</button>`;

  const previous = document.activeElement;
  const background = document.querySelectorAll('#main-content, .bottom-nav, .side-menu');
  background.forEach(n => { n.inert = true; });
  document.body.appendChild(el);
  el.tabIndex = -1;          // focus sur le conteneur : Entrée/Échap fonctionnent, sans anneau de focus parasite
  el.focus({ preventScroll: true });

  let finished = false, timer = null;
  function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    el.classList.add('sp-out');
    setTimeout(() => {
      el.remove();
      background.forEach(n => { n.inert = false; });
      if (previous && previous.focus) previous.focus({ preventScroll: true });
      if (onDone) onDone();
    }, EXIT_MS);
  }
  el.addEventListener('click', finish);
  el.addEventListener('keydown', e => { if (e.key === 'Escape' || e.key === 'Enter') finish(); });
  if (!hold) timer = setTimeout(finish, quick ? QUICK_MS : SHOW_MS);
}
