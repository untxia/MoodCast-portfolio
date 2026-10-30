# 🌤️ MoodCast — Ta météo intérieure

> Application web progressive (PWA) de suivi quotidien du bien-être émotionnel et physique.

[**🔗 Voir la démo en ligne**](https://moodcast-meteo-interieure.netlify.app)

![MoodCast](icon-512.png)

## 📖 Présentation

MoodCast permet de suivre son état au quotidien à travers trois jauges — **Corps**, **Mental** et **Humeur** — et traduit le score en une métaphore météo (du grand soleil à l'orage). L'application calcule des statistiques, affiche un calendrier de l'humeur sur 30 jours et propose un compagnon de bien-être propulsé par l'IA.

Projet personnel développé en **JavaScript vanilla**, sans framework, pour maîtriser les fondamentaux du web et les technologies PWA.

## ✨ Fonctionnalités

- **Suivi quotidien** via trois jauges interactives (1 à 10)
- **Météo dynamique** : le score global se traduit en icône et ambiance météo
- **Étiquettes d'émotion** (fatigué, motivé, stressé…) et note libre
- **Calendrier 30 jours** avec code couleur selon l'humeur
- **Statistiques** : score moyen, série de jours consécutifs, meilleur jour, graphique sur 7 jours
- **Compagnon IA** : conseils bienveillants personnalisés (API Claude d'Anthropic)
- **Rappel quotidien** configurable (heure personnalisable)
- **Mode hors-ligne** grâce au Service Worker
- **Installable** sur mobile et desktop (PWA)

## ♿ Accessibilité

L'accessibilité a été pensée dès la conception :

- Mode **contraste élevé**
- **Grand texte** (mise à l'échelle de la typographie)
- **Réduction des animations** (respecte aussi `prefers-reduced-motion`)
- Navigation **clavier** complète avec focus visible et lien d'évitement
- Attributs **ARIA** et labels pour les lecteurs d'écran
- Zones tactiles conformes (44–48px minimum)

## 🛠️ Technologies

- **HTML5** sémantique, **JavaScript ES6+** (modules, sans framework)
- **Three.js** : scène 3D météo + fenêtres de verre flottantes, parallaxe pointeur/gyroscope
- **Tailwind CSS v4** (utilitaires) par-dessus les styles historiques (`meteo.css`)
- **esbuild** pour le bundle, **PWA** (manifeste + Service Worker)
- **Netlify Functions** : proxy sécurisé vers l'API Claude (clé jamais exposée au client)
- Tests : **Vitest** (unitaires + intégration) et **Playwright** (E2E + captures visuelles)

## 📂 Structure du projet

```
src/
├── index.html, privacy.html, manifest.json, sw.js, icônes
├── meteo.js        # Interface et orchestration
├── logic.js        # Logique pure (scores, météo, séries, stats) — testée
├── scene3d.js      # Scène Three.js (soleil, nuages, pluie, éclairs, fenêtres 3D)
├── tailwind.css    # Entrée Tailwind (importe meteo.css)
└── meteo.css       # Styles historiques
netlify/functions/coach.js   # Proxy IA
scripts/build.mjs, serve.mjs # Build (-> dist/) et serveur local
tests/{unit,integration,e2e,visual}
```

## 🚀 Développement

```bash
npm install
npm start            # build + http://localhost:8000
MOCK_AI=1 npm start  # idem avec un faux serveur Anthropic (aucune clé requise)
```

> Compagnon IA : définir `ANTHROPIC_API_KEY` (Netlify : Site settings → Environment variables, ou `.env` en local). La clé n'est jamais présente dans le code client.
> Paramètres d'URL utiles : `?freeze=1` fige la scène 3D (tests visuels), `?nosplash` saute l'écran d'ouverture, `?splashhold` le maintient à l'écran.
> L'écran d'ouverture (« de l'orage au grand soleil ») joue une fois par session ; un clic sur le logo le rejoue.

## 🧪 Tests

```bash
npx playwright install chromium   # une seule fois
npm run test:unit          # logique pure
npm run test:integration   # fonction coach contre un faux serveur Anthropic
npm run test:e2e           # parcours complets dans Chromium (mobile)
npm run test:visual        # captures d'écran (npm run test:visual:update pour les régénérer)
npm test                   # unitaires + intégration + E2E
```

Les captures de référence sont propres à chaque OS (`-win32`, `-linux`…) : à régénérer sur la machine de CI avant de les y activer.

## 📱 Installation sur mobile

Ouvrir la [démo](https://moodcast-meteo-interieure.netlify.app) dans le navigateur, puis « Ajouter à l'écran d'accueil ».

## 🎯 Ce que ce projet démontre

- Conception d'une **application complète** de A à Z (UI, logique, persistance, déploiement)
- Maîtrise du **JavaScript natif** sans framework
- Intégration d'une **API d'IA** dans une application réelle
- Mise en place d'une **PWA** installable et fonctionnant hors-ligne
- Prise en compte sérieuse de l'**accessibilité** (WCAG)

## 📌 Améliorations prévues

- Sécurisation de la clé API via une fonction serverless Netlify
- Synchronisation multi-appareils
- Export des statistiques en PDF

---

Développé avec 🌿 par **[Ton Nom]** — projet de portfolio.

## 🚀 Mise en ligne (Netlify)

### 1. Clé d'API du compagnon IA
1. Crée une clé sur [console.anthropic.com](https://console.anthropic.com/settings/keys) (le compte doit avoir du crédit).
2. **En local** : copie `.env.example` en `.env`, colle la clé, puis `npm run check:ai` — le script teste la clé de bout en bout et explique l'erreur le cas échéant. `.env` est ignoré par git.
3. **En ligne** : Netlify ▸ Project configuration ▸ Environment variables ▸ `ANTHROPIC_API_KEY`, avec « Contains secret values » coché (ou `netlify env:set ANTHROPIC_API_KEY <clé> --secret`). La clé ne doit **jamais** être commitée ni collée dans le code.

### 2. Déploiement
`netlify.toml` est déjà prêt (`npm run build` → `dist/`, fonctions dans `netlify/functions`, Node 22).
- **Via Git** (recommandé) : pousse sur la branche connectée à Netlify ; chaque push redéploie.
- **Ou via la CLI** : `npx netlify login` puis `npx netlify deploy --build --prod`.

### 3. Vérifier après le déploiement
Ouvre le site dans une fenêtre privée → l'écran d'ouverture, le choix RGPD, puis active le compagnon IA et enregistre une météo : un vrai conseil doit apparaître.
Si le site ne se met pas à jour : DevTools ▸ Application ▸ Service Workers ▸ Unregister, puis Ctrl+Maj+R.

## 🎨 Crédits

Les émojis 3D sont les [Fluent Emoji](https://github.com/microsoft/fluentui-emoji) de Microsoft (licence MIT), réduits en WebP par `scripts/fetch-emoji.mjs`. Les icônes du système ne sont plus utilisées : le rendu est identique sur tous les appareils.
