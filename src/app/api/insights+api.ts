import { runProvider } from '@/lib/ai-providers';
import { MAX_NOTES, buildPrompt, extractJson, normalizeInsight } from '@/lib/insights-core';
import type { Note } from '@/lib/insights-types';
import { keyEnvHint, resolveProvider } from '@/server/insights-provider';

/**
 * Server-side proxy for the Wellbeing Insights feature.
 *
 * This file runs on the server only. Because it is a `+api.ts` route, the
 * provider API key read here is stripped from the client bundle by
 * expo/metro-config. Never move this logic into client code.
 */

function jsonError(status: number, error: string) {
  return Response.json({ error }, { status });
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export async function POST(request: Request) {
  const provider = resolveProvider();
  if (!provider) {
    return jsonError(503, `AI insights are not configured on the server. Set ${keyEnvHint()}.`);
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

  let text: string;
  try {
    text = await runProvider(buildPrompt(notes), provider);
  } catch (error) {
    return jsonError(502, `${provider.id} error ${(error as Error).message}`);
  }

  const insight = normalizeInsight(extractJson(text), notes.length, provider.id, provider.model);
  if (!insight) {
    return jsonError(502, 'The AI returned an unexpected response format.');
  }

  return Response.json(insight);
}
