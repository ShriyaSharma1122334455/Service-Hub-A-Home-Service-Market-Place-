import supabase from '../config/supabase.js';
import { sanitizeTaskInput, sanitizeAssessmentText } from '../utils/promptSanitizer.js';

/** Max services returned to the client after matchmaking (short list). */
export const MAX_RECOMMENDED_SERVICES = 3;

/** Max services sent to the ranking model (keeps prompt size reasonable). */
const MAX_CATALOG_FOR_AI = 100;

const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

/** @typedef {{ id: string, name: string, description: string | null, base_price: number, duration_minutes: number, category: { slug: string, name: string } | null }} MatchedService */

const SLUG_HINTS = [
  { slug: 'plumbing', patterns: [/plumb/, /pipe/, /drain/, /toilet/, /faucet/, /leak/, /water heater/, /sink/, /sewer/, /clog/] },
  { slug: 'electrical', patterns: [/electric/, /wiring/, /outlet/, /breaker/, /lighting/, /fixture/, /panel/, /circuit/] },
  { slug: 'cleaning', patterns: [/clean/, /mold/, /stain/, /sanitize/, /deep clean/, /carpet/] },
  { slug: 'pest-control', patterns: [/pest/, /rodent/, /insect/, /termite/, /bug/, /exterminat/, /ant/, /roach/] },
];

const RANK_SYSTEM_PROMPT = `You match a home-service damage assessment to catalog services.

You will receive:
- The customer's optional focus / goal
- An expert assessment and recommendation (plain text)
- A JSON array of services, each with id, name, category_slug, category_name, and a short description

Task: Pick up to 5 service ids that best help the customer book the right professional job. Order best match first. Only use ids from the provided list. If none fit well, still pick the closest options.

Reply with ONLY a JSON object in this exact shape (no markdown, no prose):
{"service_ids":["<id1>","<id2>"]}

Use at most 5 ids; you may return fewer if only a few are relevant.`;

/**
 * @param {string} corpus
 * @param {import('@supabase/supabase-js').GenericRow[]} rows
 */
function scoreRowsForHeuristic(corpus, rows) {
  return rows.map((row) => {
    const category = row.category;
    const catSlug = category?.slug ?? '';
    let score = 0;

    for (const { slug, patterns } of SLUG_HINTS) {
      if (catSlug !== slug) continue;
      if (patterns.some((p) => p.test(corpus))) score += 6;
    }

    const slugWords = catSlug.split('-');
    for (const w of slugWords) {
      if (w.length > 2 && corpus.includes(w)) score += 2;
    }

    const name = (row.name ?? '').toLowerCase();
    const desc = (row.description ?? '').toLowerCase();
    const tokens = corpus.split(/\W+/).filter((t) => t.length > 3);

    for (const t of tokens) {
      if (name.includes(t)) score += 2;
      if (desc.includes(t)) score += 0.5;
    }

    return {
      row,
      score,
      category,
    };
  });
}

/**
 * @param {import('@supabase/supabase-js').GenericRow[]} rows
 * @param {string} corpus
 * @returns {MatchedService[]}
 */
function heuristicPick(rows, corpus) {
  if (!rows?.length) return [];

  const scored = scoreRowsForHeuristic(corpus, rows);
  scored.sort((a, b) => b.score - a.score);

  const positive = scored.filter((s) => s.score > 0).slice(0, MAX_RECOMMENDED_SERVICES);
  const picked = positive.length ? positive : scored.slice(0, MAX_RECOMMENDED_SERVICES);

  return picked.map(({ row, category }) => ({
    id: String(row.id),
    name: row.name ?? '',
    description: row.description ?? null,
    base_price: Number(row.base_price ?? 0),
    duration_minutes: Number(row.duration_minutes ?? 0),
    category: category
      ? { slug: category.slug ?? '', name: category.name ?? '' }
      : null,
  }));
}

/**
 * @param {import('@supabase/supabase-js').GenericRow[]} rows
 * @param {string} corpus
 */
function topCandidatesForAi(rows, corpus) {
  if (rows.length <= MAX_CATALOG_FOR_AI) return rows;
  const scored = scoreRowsForHeuristic(corpus, rows);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_CATALOG_FOR_AI).map((s) => s.row);
}

function truncateDesc(s, maxLen) {
  if (s === null || s === undefined || s === '') return '';
  const t = String(s).replace(/\s+/g, ' ').trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1)}…`;
}

/**
 * @param {import('@supabase/supabase-js').GenericRow[]} candidateRows
 * @param {string} assessment
 * @param {string} recommendation
 * @param {string} task
 * @returns {Promise<string[] | null>}
 */
async function gemmaRankServiceIds(candidateRows, assessment, recommendation, task) {
  const apiKey =
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim();
  if (!apiKey) return null;

  const model =
    process.env.GEMMA_SERVICE_MATCH_MODEL?.trim() || 'gemma-4-26b-a4b-it';

  const catalogPayload = candidateRows.map((row) => {
    const cat = row.category;
    return {
      id: String(row.id),
      name: row.name ?? '',
      category_slug: cat?.slug ?? '',
      category_name: cat?.name ?? '',
      description: truncateDesc(row.description, 240),
    };
  });

  // Sanitize all user inputs before constructing the prompt
  const sanitizedTask = sanitizeTaskInput(task || '');
  const sanitizedAssessment = sanitizeAssessmentText(assessment || '');
  const sanitizedRecommendation = sanitizeAssessmentText(recommendation || '');

  const userBlock = [
    `Customer focus / goal:\n${sanitizedTask || '(none)'}`,
    `\nAssessment:\n${sanitizedAssessment || '(none)'}`,
    `\nRecommendation:\n${sanitizedRecommendation || '(none)'}`,
    `\nServices (JSON):\n${JSON.stringify(catalogPayload)}`,
  ].join('\n');

  let response;
  try {
    response = await fetch(`${GEMINI_API_BASE_URL}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: `${RANK_SYSTEM_PROMPT}\n\n${userBlock}` }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 512,
          responseMimeType: 'application/json',
        },
      }),
    });
  } catch (err) {
    console.error('catalogMatchmaking Gemma fetch error:', err?.message || err);
    return null;
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    console.error('catalogMatchmaking Gemma HTTP error:', response.status, errText);
    return null;
  }

  let data;
  try {
    data = await response.json();
  } catch {
    return null;
  }

  let text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
  if (!text) return null;

  if (text.startsWith('```')) {
    const lines = text.split('\n');
    if (lines[0].startsWith('```')) lines.shift();
    if (lines.length && lines[lines.length - 1].trim() === '```') lines.pop();
    text = lines.join('\n').trim();
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error('catalogMatchmaking Gemma JSON parse failed, raw:', text.slice(0, 400));
    return null;
  }

  const ids = parsed?.service_ids;
  if (!Array.isArray(ids)) return null;

  return ids.map((id) => String(id).trim()).filter(Boolean);
}

/**
 * @param {string[]} orderedIds
 * @param {Map<string, import('@supabase/supabase-js').GenericRow>} idToRow
 * @param {MatchedService[]} backfill
 */
function mapIdsToServices(orderedIds, idToRow, backfill) {
  const seen = new Set();
  /** @type {MatchedService[]} */
  const out = [];

  for (const id of orderedIds) {
    if (out.length >= MAX_RECOMMENDED_SERVICES) break;
    const row = idToRow.get(id);
    if (!row || seen.has(id)) continue;
    seen.add(id);
    const category = row.category;
    out.push({
      id: String(row.id),
      name: row.name ?? '',
      description: row.description ?? null,
      base_price: Number(row.base_price ?? 0),
      duration_minutes: Number(row.duration_minutes ?? 0),
      category: category
        ? { slug: category.slug ?? '', name: category.name ?? '' }
        : null,
    });
  }

  for (const svc of backfill) {
    if (out.length >= MAX_RECOMMENDED_SERVICES) break;
    if (seen.has(svc.id)) continue;
    seen.add(svc.id);
    out.push(svc);
  }

  return out;
}

/**
 * Rank catalog services using VDA text + optional user task (read-only Supabase).
 * Uses Gemma via Gemini API (GEMINI_API_KEY / GOOGLE_API_KEY) for AI ordering when configured;
 * otherwise heuristic only.
 * @param {{ assessment?: string, recommendation?: string }} vda
 * @param {string} [task]
 * @returns {Promise<{ recommended_services: MatchedService[] }>}
 */
export async function matchAssessmentToCatalog(vda, task = '') {
  const assessment = vda?.assessment ?? '';
  const recommendation = vda?.recommendation ?? '';
  const corpus = `${task} ${assessment} ${recommendation}`.toLowerCase();

  const { data: rows, error } = await supabase
    .from('services')
    .select('id, name, description, base_price, duration_minutes, category:categories(slug, name)')
    .eq('is_active', true)
    .limit(200);

  if (error) {
    console.error('catalogMatchmaking query error:', error.message);
    return { recommended_services: [] };
  }

  if (!rows?.length) {
    return { recommended_services: [] };
  }

  const heuristicList = heuristicPick(rows, corpus);
  const candidates = topCandidatesForAi(rows, corpus);
  const idToRow = new Map(rows.map((r) => [String(r.id), r]));

  const aiIds = await gemmaRankServiceIds(candidates, assessment, recommendation, task);
  if (aiIds?.length) {
    const merged = mapIdsToServices(aiIds, idToRow, heuristicList);
    if (merged.length > 0) {
      return { recommended_services: merged };
    }
  }

  return { recommended_services: heuristicList };
}

export default { matchAssessmentToCatalog };
