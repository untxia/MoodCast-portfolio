// Teste la clé Anthropic de bout en bout, par le même chemin que l'application (fonction « coach »).
// Usage : npm run check:ai   (lit ANTHROPIC_API_KEY dans .env ou dans l'environnement)
// La clé n'est jamais affichée.
const key = process.env.ANTHROPIC_API_KEY;

function stop(msg) { console.error('\n✗ ' + msg + '\n'); process.exit(1); }

if (!key) stop('ANTHROPIC_API_KEY est absente. Copie .env.example en .env, puis colle ta clé dedans.');
if (!key.startsWith('sk-ant-')) stop('La clé ne ressemble pas à une clé Anthropic (elle devrait commencer par « sk-ant- »). Vérifie le copier-coller.');
if (/\s/.test(key)) stop('La clé contient un espace ou un retour à la ligne : recolle-la sans rien autour.');
if (process.env.ANTHROPIC_API_URL) stop('ANTHROPIC_API_URL est définie : ce test viserait un faux serveur. Retire-la.');

// On capture le détail renvoyé par Anthropic (la fonction le journalise mais ne le renvoie jamais au navigateur).
const upstream = [];
const originalError = console.error;
console.error = (...args) => { upstream.push(args.map(String).join(' ')); };

const { handler } = await import('../netlify/functions/coach.js');
const res = await handler({
  httpMethod: 'POST',
  body: JSON.stringify({ consent: true, p: 6, m: 5, h: 7, avgToday: 6, avg7: 5.5, lowDays: 1 })
});
console.error = originalError;

if (res.statusCode === 200) {
  const { text } = JSON.parse(res.body);
  console.log('\n✓ La clé fonctionne. Réponse du compagnon IA :\n');
  console.log('  « ' + text + ' »\n');
} else {
  report();
}

function report() {
const detail = upstream.join(' ');
let hint = 'Réponse inattendue : regarde le détail ci-dessous.';
if (/401|authentication|invalid x-api-key/i.test(detail)) hint = 'Clé refusée (401) : elle est fausse, révoquée ou mal copiée. Crée-en une nouvelle sur console.anthropic.com.';
else if (/credit|billing|balance/i.test(detail)) hint = 'Le compte n\'a pas de crédit : ajoute-en dans Plans & Billing sur console.anthropic.com.';
else if (/403|permission/i.test(detail)) hint = 'Clé valide mais sans permission pour ce modèle ou cet espace de travail.';
else if (/404|not_found|model/i.test(detail)) hint = 'Modèle introuvable : vérifie MODEL dans netlify/functions/coach.js.';
else if (/429|rate/i.test(detail)) hint = 'Trop de requêtes (429) : réessaie dans une minute.';
else if (/ENOTFOUND|ECONN|fetch failed|Erreur coach/i.test(detail)) hint = 'Impossible de joindre l\'API : vérifie ta connexion Internet.';

console.error(`\n✗ Échec (HTTP ${res.statusCode}). ${hint}`);
if (detail) console.error('\nDétail renvoyé par Anthropic :\n  ' + detail.slice(0, 600) + '\n');
process.exitCode = 1; // pas de process.exit() : évite une assertion libuv parasite sous Windows
}
