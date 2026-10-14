import type { InsightMoodLabel, InsightTheme, Note, WellbeingInsight } from '@/lib/insights';

/**
 * Server-side proxy for the Wellbeing Insights feature.
 *
 * This file runs on the server only. Because it is a `+api.ts` route, the
 * provider API key read below is stripped from the client bundle by
 * expo/metro-config. Never move this logic into client code.
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = process.env.INSIGHTS_MODEL ?? 'claude-sonnet-5';

/** Guardrails so a huge journal can't blow past the model's context/cost. */
const MAX_NOTES = 200;
const MAX_TOTAL_CHARS = 12000;

const MOOD_LABELS: readonly InsightMoodLabel[] = ['positive', 'neutral', 'mixed', 'low'];

function jsonError(status: number, error: string) {
  return Response.json({ error }, { status });
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string').slice(0, 8);
}

function asThemes(value: unknown): InsightTheme[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): InsightTheme | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const label = asString(record.label).trim();
      if (!label) return null;
      const count = typeof record.count === 'number' && Number.isFinite(record.count)
        ? Math.max(0, Math.round(record.count))
        : 0;
      return { label, count, examples: asStringArray(record.examples).slice(0, 3) };
    })
    .filter((theme): theme is InsightTheme => theme !== null)
    .slice(0, 8);
}

/** Extract the first JSON object from a possibly fenced model response. */
function extractJson(text: string): unknown | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeInsight(raw: unknown, analyzedCount: number): WellbeingInsight | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;

  const moodRecord = (record.mood ?? {}) as Record<string, unknown>;
  const rawLabel = asString(moodRecord.label).toLowerCase() as InsightMoodLabel;
  const label: InsightMoodLabel = MOOD_LABELS.includes(rawLabel) ? rawLabel : 'neutral';
  const rawScore = typeof moodRecord.score === 'number' && Number.isFinite(moodRecord.score)
    ? moodRecord.score
    : 0;

  const summary = asString(record.summary).trim();
  if (!summary) return null;

  return {
    summary,
    mood: {
      label,
      score: Math.max(-1, Math.min(1, rawScore)),
      rationale: asString(moodRecord.rationale).trim(),
    },
    themes: asThemes(record.themes),
    positivePatterns: asStringArray(record.positivePatterns),
    concerns: asStringArray(record.concerns),
    suggestions: asStringArray(record.suggestions),
    analyzedCount,
    model: MODEL,
    generatedAt: Date.now(),
  };
}

function buildPrompt(notes: Note[]): string {
  const body = notes
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((note) => {
      const date = new Date(note.createdAt).toISOString().slice(0, 10);
      return `- [${date}] ${note.text.replace(/\s+/g, ' ').trim()}`;
    })
    .join('\n')
    .slice(0, MAX_TOTAL_CHARS);

  return [
    "You are a careful, supportive wellbeing assistant. You are given a person's private journal notes.",
    'Identify recurring themes and patterns relevant to their wellbeing. Be gentle and non-diagnostic:',
    'you are surfacing patterns, never giving medical advice.',
    '',
    'Return ONLY a single minified JSON object (no markdown, no prose) with this exact shape:',
    '{',
    '  "summary": string,                       // 1-3 sentences, warm and neutral',
    '  "mood": { "label": "positive"|"neutral"|"mixed"|"low", "score": number, "rationale": string },',
    '  "themes": [{ "label": string, "count": number, "examples": string[] }],  // max 8',
    '  "positivePatterns": string[],',
    '  "concerns": string[],                     // supportive, not alarming',
    '  "suggestions": string[]                   // practical, optional self-care ideas',
    '}',
    '',
    'NOTES:',
    body,
  ].join('\n');
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return jsonError(
      503,
      'AI insights are not configured on the server. Set ANTHROPIC_API_KEY.',
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError(400, 'Request body must be valid JSON.');
  }

  const rawNotes = (payload as { notes?: unknown } | null)?.notes;
  if (!Array.isArray(rawNotes)) {
    return jsonError(400, 'Expected a "notes" array.');
  }

  const notes: Note[] = rawNotes
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .filter((item) => typeof item.text === 'string' && item.text.trim().length > 0)
    .map((item, index) => ({
      id: asString(item.id, `note-${index}`),
      text: item.text as string,
      createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
    }))
    .slice(0, MAX_NOTES);

  if (notes.length === 0) {
    return jsonError(400, 'No notes to analyse.');
  }

  let upstream: Response;
  try {
    upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        temperature: 0.2,
        messages: [{ role: 'user', content: buildPrompt(notes) }],
      }),
    });
  } catch (error) {
    return jsonError(502, `Could not reach the AI provider: ${(error as Error).message}`);
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '');
    return jsonError(502, `AI provider error (${upstream.status}): ${detail.slice(0, 300)}`);
  }

  const data = (await upstream.json()) as { content?: { type?: string; text?: string }[] };
  const text = (data.content ?? [])
    .map((part) => (part.type === 'text' ? part.text ?? '' : ''))
    .join('')
    .trim();

  const insight = normalizeInsight(extractJson(text), notes.length);
  if (!insight) {
    return jsonError(502, 'The AI returned an unexpected response format.');
  }

  return Response.json(insight);
}
