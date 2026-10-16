/**
 * Storage for the user's custom AI instructions (the "persona").
 *
 * Unlike the API key, instructions are not secret, so they live in plain
 * AsyncStorage rather than expo-secure-store. An empty/absent value means
 * "use the bundled default" (see `DEFAULT_INSTRUCTIONS` in insights-prompt.ts).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const INSTRUCTIONS_KEY = 'kerodi.ai.instructions.v1';

/** The stored override, or null when the user is on the bundled default. */
export async function getStoredInstructions(): Promise<string | null> {
  try {
    const value = await AsyncStorage.getItem(INSTRUCTIONS_KEY);
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

/** Save an override; blank input clears it and restores the default. */
export async function setStoredInstructions(instructions: string): Promise<void> {
  const trimmed = instructions.trim();
  if (!trimmed) {
    await AsyncStorage.removeItem(INSTRUCTIONS_KEY);
    return;
  }
  await AsyncStorage.setItem(INSTRUCTIONS_KEY, trimmed);
}

/** Drop the override and fall back to the bundled default. */
export async function clearStoredInstructions(): Promise<void> {
  await AsyncStorage.removeItem(INSTRUCTIONS_KEY);
}
