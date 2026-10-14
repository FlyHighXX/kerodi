/**
 * Server-only provider resolution for the Wellbeing Insights proxy.
 *
 * This file is imported exclusively by `src/app/api/insights+api.ts`. It reads
 * provider keys from the environment, so Expo keeps it out of the client bundle.
 * Do not import this module from client code.
 */

import {
  PROVIDERS,
  PROVIDER_ORDER,
  isProviderId,
  type ProviderConfig,
  type ProviderId,
} from '@/lib/ai-providers';

/**
 * Determine the provider config from the environment.
 *
 * `INSIGHTS_PROVIDER` wins if set. Otherwise the first provider with an
 * available key (in PROVIDER_ORDER) is used. Returns null when no key is set.
 */
export function resolveProvider(): ProviderConfig | null {
  const explicit = process.env.INSIGHTS_PROVIDER?.trim().toLowerCase();
  const candidates: ProviderId[] = isProviderId(explicit) ? [explicit] : PROVIDER_ORDER;

  for (const id of candidates) {
    const apiKey = process.env.INSIGHTS_API_KEY || process.env[PROVIDERS[id].keyEnv];
    if (apiKey) {
      return {
        id,
        apiKey,
        baseUrl: process.env.INSIGHTS_BASE_URL?.trim() || PROVIDERS[id].baseUrl,
        model: process.env.INSIGHTS_MODEL?.trim() || PROVIDERS[id].model,
      };
    }
  }

  return null;
}

/** Hint listing the env vars an operator can set to enable the proxy. */
export function keyEnvHint(): string {
  return 'GROQ_API_KEY (or GEMINI_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY)';
}
