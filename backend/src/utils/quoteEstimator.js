/**
 * Build a negotiation-friendly quote from VDA output.
 * Returns a fair range and a recommended offer users can start with.
 */

const FALLBACK_MIN = 120;
const FALLBACK_MAX = 450;

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * @param {number} n
 * @returns {number}
 */
function roundToNearest5(n) {
  return Math.round(n / 5) * 5;
}

/**
 * Parse strings like "$500-$800", "$300", "1,200 - 1,800".
 * @param {string} costText
 * @returns {{ min: number, max: number, source: 'model' | 'fallback' }}
 */
function parseCostRange(costText) {
  const raw = typeof costText === 'string' ? costText : '';
  const matches = raw.match(/\d[\d,]*/g) || [];
  const nums = matches
    .map((m) => Number(m.replace(/,/g, '')))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (nums.length === 0) {
    return { min: FALLBACK_MIN, max: FALLBACK_MAX, source: 'fallback' };
  }

  if (nums.length === 1) {
    const center = nums[0];
    const min = roundToNearest5(center * 0.85);
    const max = roundToNearest5(center * 1.15);
    return { min, max, source: 'model' };
  }

  const sorted = nums.sort((a, b) => a - b);
  return {
    min: roundToNearest5(sorted[0]),
    max: roundToNearest5(sorted[sorted.length - 1]),
    source: 'model',
  };
}

/**
 * @param {string} confidence
 * @returns {{ label: 'low'|'medium'|'high', score: number }}
 */
function normalizeConfidence(confidence) {
  const t = (confidence || '').trim().toLowerCase();
  if (!t) return { label: 'medium', score: 0.7 };

  if (t === 'high') return { label: 'high', score: 0.9 };
  if (t === 'medium') return { label: 'medium', score: 0.7 };
  if (t === 'low') return { label: 'low', score: 0.5 };

  if (t.endsWith('%')) {
    const pct = Number(t.replace('%', ''));
    if (Number.isFinite(pct)) {
      const score = clamp(pct / 100, 0.35, 0.98);
      if (score >= 0.82) return { label: 'high', score };
      if (score >= 0.62) return { label: 'medium', score };
      return { label: 'low', score };
    }
  }

  const n = Number(t);
  if (Number.isFinite(n)) {
    const score = clamp(n > 1 ? n / 100 : n, 0.35, 0.98);
    if (score >= 0.82) return { label: 'high', score };
    if (score >= 0.62) return { label: 'medium', score };
    return { label: 'low', score };
  }

  return { label: 'medium', score: 0.7 };
}

/**
 * @param {{
 *  estimated_cost_usd?: string,
 *  confidence_score?: string,
 * }} input
 */
export function buildNegotiationQuote(input) {
  const parsed = parseCostRange(input?.estimated_cost_usd || '');
  const conf = normalizeConfidence(input?.confidence_score || '');

  const baseMin = Math.max(50, parsed.min);
  const baseMax = Math.max(baseMin + 20, parsed.max);
  const span = Math.max(20, baseMax - baseMin);

  // Wider guard rails when model confidence is lower.
  const lowConfidenceWiden = conf.label === 'low' ? 0.2 : conf.label === 'medium' ? 0.1 : 0.05;
  const quoteMin = roundToNearest5(baseMin * (1 - lowConfidenceWiden));
  const quoteMax = roundToNearest5(baseMax * (1 + lowConfidenceWiden));

  const midpoint = quoteMin + (quoteMax - quoteMin) * 0.5;
  const recommended = roundToNearest5(midpoint - span * 0.05);

  return {
    fair_min_usd: quoteMin,
    recommended_usd: Math.max(quoteMin, Math.min(recommended, quoteMax)),
    ceiling_usd: quoteMax,
    confidence: conf.label,
    rationale:
      parsed.source === 'model'
        ? 'Derived from model-estimated repair cost and adjusted for confidence.'
        : 'Derived from fallback market baseline because the model did not return a numeric cost.',
    negotiation_guidance:
      `Start near $${Math.max(quoteMin, recommended - 15)}, target settlement around $${Math.max(quoteMin, Math.min(recommended, quoteMax))}, and request justification for quotes above $${quoteMax}.`,
  };
}

export default { buildNegotiationQuote };
