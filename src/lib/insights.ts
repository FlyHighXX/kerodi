/**
 * Shared types and client for the Wellbeing Insights feature.
 *
 * The model call itself happens on the server in `src/app/api/insights+api.ts`
 * so that the provider API key is never included in the client bundle.
 */

/** A single note, stored locally by the Notes tab. */
export type Note = {
  id: string;
  text: string;
  createdAt: number;
};

export type InsightMoodLabel = 'positive' | 'neutral' | 'mixed' | 'low';

export type InsightTheme = {
  /** Short human-readable theme label, e.g. "sleep", "work stress". */
  label: string;
  /** How many notes this theme appears in. */
  count: number;
  /** One or two short verbatim-ish examples from the notes. */
  examples: string[];
};

export type WellbeingInsight = {
  summary: string;
  mood: {
    label: InsightMoodLabel;
    /** -1 (low) .. 1 (positive). */
    score: number;
    rationale: string;
  };
  themes: InsightTheme[];
  positivePatterns: string[];
  concerns: string[];
  suggestions: string[];
  /** Number of notes that were analysed. */
  analyzedCount: number;
  /** Provider identifier that produced the analysis, e.g. "groq". */
  provider: string;
  /** Model identifier that produced the analysis. */
  model: string;
  generatedAt: number;
};

/**
 * Where the client sends notes for analysis.
 *
 * - Web and local development use the relative `/api/insights` route, which
 *   Expo serves from the dev/served origin.
 * - A production native build has no ambient origin, so set
 *   `EXPO_PUBLIC_INSIGHTS_API_URL` to the absolute endpoint, or configure the
 *   Expo Router `origin` in app.json.
 */
export function insightsEndpoint(): string {
  return process.env.EXPO_PUBLIC_INSIGHTS_API_URL ?? '/api/insights';
}

/** Ask the server to analyse the given notes. Throws on any failure. */
export async function analyzeNotes(notes: Note[]): Promise<WellbeingInsight> {
  const response = await fetch(insightsEndpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      notes: notes.map(({ id, text, createdAt }) => ({ id, text, createdAt })),
    }),
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // keep the generic message
    }
    throw new Error(message);
  }

  return (await response.json()) as WellbeingInsight;
}
