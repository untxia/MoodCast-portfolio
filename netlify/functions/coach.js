// Proxy serverless : la clé Anthropic reste côté serveur (variable ANTHROPIC_API_KEY).
const MODEL = 'claude-sonnet-5-5';
const API_URL = () => process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com/v1/messages';

const SYSTEM_PROMPT = `Tu es un compagnon de bien-être bienveillant intégré dans l'application MoodCast.
Tu analyses les scores de l'utilisateur et tu donnes un conseil court, doux et concret.
Règles strictes :
- Maximum 3 phrases
- Jamais de diagnostic médical
- Si le score moyen des 7 derniers jours est inférieur à 3.5 ou si plus de 4 jours sont difficiles, recommande doucement de consulter un professionnel
- Tu n'es pas un psychologue, rappelle-le si nécessaire
- Toujours encourageant et positif`;

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body)
});

const score = v => Number.isFinite(v) && v >= 1 && v <= 10;

export const handler = async event => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Méthode non autorisée' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json(500, { error: 'Service non configuré' });

  let input;
  try { input = JSON.parse(event.body || '{}'); }
  catch (e) { return json(400, { error: 'Requête invalide' }); }

  // Consentement explicite exigé (RGPD) : sans lui, rien n'est transmis à Anthropic
  if (input.consent !== true) return json(403, { error: 'Consentement requis' });

  const { p, m, h, avgToday, avg7, lowDays } = input;
  if (![p, m, h].every(score)) return json(400, { error: 'Scores invalides' });
  const avg7Ok = avg7 === null || avg7 === undefined || score(avg7);
  const lowOk = Number.isInteger(lowDays) && lowDays >= 0 && lowDays <= 7;
  if (!avg7Ok || !lowOk || !score(avgToday)) return json(400, { error: 'Données invalides' });

  const userMessage = `Voici mes scores du jour :
- Énergie physique : ${p}/10
- Énergie mentale : ${m}/10
- Humeur : ${h}/10
- Score moyen aujourd'hui : ${avgToday}/10
- Moyenne sur 7 jours : ${avg7 ? Number(avg7).toFixed(1) : 'pas encore de données'}
- Jours difficiles cette semaine : ${lowDays}`;

  try {
    const res = await fetch(API_URL(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }]
      })
    });
    if (!res.ok) {
      console.error('Erreur Anthropic', res.status, await res.text());
      return json(502, { error: 'Service IA indisponible' });
    }
    const data = await res.json();
    const text = data?.content?.[0]?.text;
    if (!text) return json(502, { error: 'Réponse vide' });
    return json(200, { text });
  } catch (e) {
    console.error('Erreur coach', e);
    return json(502, { error: 'Service IA indisponible' });
  }
};
