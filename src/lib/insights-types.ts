/**
 * Shared, platform-agnostic types for the Wellbeing Insights feature.
 *
 * This module must stay free of secrets and of any Expo native imports so it can
 * be safely imported by both the client and the server route.
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
