/**
 * Shared prompt construction and response parsing for the Wellbeing Insights
 * feature.
 *
 * Isomorphic and secret-free, so both the client BYOK path and the server route
 * use the same logic and cannot drift apart.
 */

import type { InsightMoodLabel, InsightTheme, Note, WellbeingInsight } from './insights-types';

/** Guardrails so a huge journal can't blow past the model's context/cost. */
export const MAX_NOTES = 200;
export const MAX_TOTAL_CHARS = 12000;

const MOOD_LABELS: readonly InsightMoodLabel[] = ['positive', 'neutral', 'mixed', 'low'];

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
      const count =
        typeof record.count === 'number' && Number.isFinite(record.count)
          ? Math.max(0, Math.round(record.count))
          : 0;
      return { label, count, examples: asStringArray(record.examples).slice(0, 3) };
    })
    .filter((theme): theme is InsightTheme => theme !== null)
    .slice(0, 8);
}

/** Extract the first JSON object from a possibly fenced model response. */
export function extractJson(text: string): unknown | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Coerce a model's raw JSON into a validated WellbeingInsight, or null. */
export function normalizeInsight(
  raw: unknown,
  analyzedCount: number,
  provider: string,
  model: string,
): WellbeingInsight | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;

  const moodRecord = (record.mood ?? {}) as Record<string, unknown>;
  const rawLabel = asString(moodRecord.label).toLowerCase() as InsightMoodLabel;
  const label: InsightMoodLabel = MOOD_LABELS.includes(rawLabel) ? rawLabel : 'neutral';
  const rawScore =
    typeof moodRecord.score === 'number' && Number.isFinite(moodRecord.score)
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
    provider,
    model,
    generatedAt: Date.now(),
  };
}

/** Build the analysis prompt from a list of notes. */
export function buildPrompt(notes: Note[]): string {
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
