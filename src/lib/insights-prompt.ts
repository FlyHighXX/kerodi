/**
 * Prompt construction for the Wellbeing Insights feature.
 *
 * The persona ("instructions") is user-editable: DEFAULT_INSTRUCTIONS is the
 * bundled default, and the app may store an override on-device (see
 * ai-instructions.ts). The JSON output contract is fixed and appended
 * automatically by buildSystemPrompt(), so a hand-edited persona can never break
 * response parsing.
 *
 * Isomorphic and secret-free: safe to use from the client BYOK path and from a
 * self-hosted proxy alike.
 */

import { MAX_TOTAL_CHARS } from './insights-core';
import type { Note } from './insights-types';

/** Bundled default persona. Users can override this in the Insights tab. */
export const DEFAULT_INSTRUCTIONS = [
  "You are a careful, supportive wellbeing assistant. You are given a person's private journal notes.",
  '',
  'Identify recurring themes and patterns relevant to their wellbeing. Be gentle and non-diagnostic:',
  'you surface patterns, never give medical advice. Write in plain, warm, neutral language and address',
  'the reader directly as "you".',
].join('\n');

/**
 * The fixed output contract. Appended to the persona automatically and never
 * shown as editable, so every response can be parsed and validated.
 */
export const OUTPUT_CONTRACT = [
  'Return ONLY a single minified JSON object (no markdown, no prose, no code fences) with exactly this shape:',
  '{',
  '  "summary": string,                       // 1-3 sentences, warm and neutral',
  '  "mood": { "label": "positive"|"neutral"|"mixed"|"low", "score": number, "rationale": string },',
  '  "themes": [{ "label": string, "count": number, "examples": string[] }],  // max 8',
  '  "positivePatterns": string[],',
  '  "concerns": string[],                     // supportive, not alarming',
  '  "suggestions": string[]                   // practical, optional self-care ideas',
  '}',
  'The "score" is a number between -1 (low) and 1 (positive).',
].join('\n');

/**
 * Combine the user's (or default) instructions with the fixed output contract.
 * Blank or whitespace-only instructions fall back to the default.
 */
export function buildSystemPrompt(instructions?: string | null): string {
  const persona = (instructions ?? '').trim() || DEFAULT_INSTRUCTIONS;
  return `${persona}\n\n${OUTPUT_CONTRACT}`;
}

/** The per-request user message: the notes, oldest first, capped in length. */
export function buildUserPrompt(notes: Note[]): string {
  const body = notes
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((note) => {
      const date = new Date(note.createdAt).toISOString().slice(0, 10);
      return `- [${date}] ${note.text.replace(/\s+/g, ' ').trim()}`;
    })
    .join('\n')
    .slice(0, MAX_TOTAL_CHARS);

  return ['NOTES:', body].join('\n');
}
