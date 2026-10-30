import { describe, it, expect } from 'vitest';
import { CONSENT_KEY, CONSENT_VERSION, getConsent, hasDecided, aiAllowed, setConsent, clearConsent } from '../../src/consent.js';

const fakeStorage = (initial = {}) => {
  const m = { ...initial };
  return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; }, dump: () => m };
};
const NOW = new Date('2026-10-20T10:00:00Z');

describe('consentement', () => {
  it('aucun choix au départ : pas de traitement IA', () => {
    const s = fakeStorage();
    expect(getConsent(s)).toBeNull();
    expect(hasDecided(s)).toBe(false);
    expect(aiAllowed(s)).toBe(false);
  });

  it('accepter l\'IA est enregistré avec version et date', () => {
    const s = fakeStorage();
    const c = setConsent(true, s, NOW);
    expect(c).toEqual({ v: CONSENT_VERSION, ai: true, at: '2026-10-20T10:00:00.000Z' });
    expect(JSON.parse(s.getItem(CONSENT_KEY))).toEqual(c);
    expect(hasDecided(s)).toBe(true);
    expect(aiAllowed(s)).toBe(true);
  });

  it('refuser est un choix valide : on ne redemande pas, l\'IA reste coupée', () => {
    const s = fakeStorage();
    setConsent(false, s, NOW);
    expect(hasDecided(s)).toBe(true);
    expect(aiAllowed(s)).toBe(false);
  });

  it('retirer son consentement est immédiat', () => {
    const s = fakeStorage();
    setConsent(true, s, NOW);
    setConsent(false, s, NOW);
    expect(aiAllowed(s)).toBe(false);
  });

  it('un consentement d\'une ancienne version est ignoré (il faut le redonner)', () => {
    const s = fakeStorage({ [CONSENT_KEY]: JSON.stringify({ v: CONSENT_VERSION - 1, ai: true, at: NOW.toISOString() }) });
    expect(getConsent(s)).toBeNull();
    expect(aiAllowed(s)).toBe(false);
  });

  it.each([
    ['JSON invalide', '{pas du json'],
    ['valeur non booléenne', JSON.stringify({ v: CONSENT_VERSION, ai: 'oui' })],
    ['objet vide', '{}'],
    ['null', 'null']
  ])('donnée corrompue (%s) : traitée comme « pas de consentement »', (_, raw) => {
    const s = fakeStorage({ [CONSENT_KEY]: raw });
    expect(getConsent(s)).toBeNull();
    expect(aiAllowed(s)).toBe(false);
  });

  it('clearConsent efface le choix', () => {
    const s = fakeStorage();
    setConsent(true, s, NOW);
    clearConsent(s);
    expect(hasDecided(s)).toBe(false);
  });

  it('un stockage défaillant ne plante pas et ne donne jamais de consentement par défaut', () => {
    const broken = { getItem: () => { throw new Error('boom'); }, setItem: () => { throw new Error('boom'); }, removeItem: () => { throw new Error('boom'); } };
    expect(aiAllowed(broken)).toBe(false);
    expect(() => setConsent(true, broken, NOW)).not.toThrow();
    expect(() => clearConsent(broken)).not.toThrow();
  });
});
