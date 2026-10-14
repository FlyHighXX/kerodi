/**
 * Client-side API for the Wellbeing Insights feature.
 *
 * Two ways to reach a model:
 *   1. analyzeNotesDirect — BYOK. The user's own key (from SecureStore) is sent
 *      straight to the provider. No server or hosting required.
 *   2. analyzeNotes — a hosted proxy at EXPO_PUBLIC_INSIGHTS_API_URL (or the
 *      relative /api/insights route) keeps the key server-side.
 *
 * This module must not import expo-secure-store; the key is passed in by the
 * caller. That keeps it safe to import from the server route as well.
 */

import {
  PROVIDERS,
  detectProviderFromKey,
  runProvider,
  type ProviderConfig,
  type ProviderId,
} from './ai-providers';
import { MAX_NOTES, buildPrompt, extractJson, normalizeInsight } from './insights-core';
import type { Note, WellbeingInsight } from './insights-types';

export type { InsightMoodLabel, InsightTheme, Note, WellbeingInsight } from './insights-types';
export type { ProviderId } from './ai-providers';

/**
 * Where the client sends notes for proxy analysis.
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

function toError(status: number, body: unknown): Error {
  const message =
    body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
      ? (body as { error: string }).error
      : `Request failed (${status})`;
  return new Error(message);
}

/**
 * Analyse notes through the hosted proxy. The key lives on the server, so
 * nothing secret is needed here.
 */
export async function analyzeNotes(notes: Note[]): Promise<WellbeingInsight> {
  const response = await fetch(insightsEndpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      notes: notes.map(({ id, text, createdAt }) => ({ id, text, createdAt })),
    }),
  });

  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // keep the generic message
    }
    throw toError(response.status, body);
  }

  return (await response.json()) as WellbeingInsight;
}

/**
 * Analyse notes directly against the provider using the user's own key (BYOK).
 * No server involved — the key goes straight from the device to the provider.
 */
export async function analyzeNotesDirect(
  notes: Note[],
  apiKey: string,
  providerId?: ProviderId | null,
): Promise<WellbeingInsight> {
  const id = providerId ?? detectProviderFromKey(apiKey) ?? 'groq';
  const meta = PROVIDERS[id];
  const config: ProviderConfig = {
    id,
    apiKey: apiKey.trim(),
    baseUrl: meta.baseUrl,
    model: meta.model,
  };

  const usable = notes
    .filter((note) => typeof note.text === 'string' && note.text.trim().length > 0)
    .slice(0, MAX_NOTES);

  if (usable.length === 0) {
    throw new Error('No notes to analyse.');
  }

  const text = await runProvider(buildPrompt(usable), config);
  const insight = normalizeInsight(extractJson(text), usable.length, id, meta.model);
  if (!insight) {
    throw new Error('The AI returned an unexpected response format.');
  }
  return insight;
}
