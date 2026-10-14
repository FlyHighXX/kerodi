/**
 * Server-only provider adapters for the Wellbeing Insights feature.
 *
 * This file is imported exclusively by `src/app/api/insights+api.ts`. Expo keeps
 * it out of the client bundle, so provider API keys read here never ship in the
 * app. Do not import this module from client code.
 *
 * Supported providers:
 *   - groq      OpenAI-compatible, free tier, does not retain/train on your data
 *   - gemini    Google AI Studio free tier (free tier may use data to improve
 *               Google products)
 *   - openai    OpenAI-compatible (also works for OpenRouter, Cerebras, etc.)
 *   - anthropic paid, no training on your data
 */

export type ProviderId = 'groq' | 'gemini' | 'openai' | 'anthropic';

export type ProviderConfig = {
  id: ProviderId;
  apiKey: string;
  baseUrl: string;
  model: string;
};

const DEFAULTS: Record<ProviderId, { baseUrl: string; model: string; keyEnv: string }> = {
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'openai/gpt-oss-120b',
    keyEnv: 'GROQ_API_KEY',
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-3.8-flash',
    keyEnv: 'GEMINI_API_KEY',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    keyEnv: 'OPENAI_API_KEY',
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-5',
    keyEnv: 'ANTHROPIC_API_KEY',
  },
};

/** Auto-detection order when INSIGHTS_PROVIDER is not set. */
const DETECT_ORDER: ProviderId[] = ['groq', 'gemini', 'openai', 'anthropic'];

function isProviderId(value: string | undefined): value is ProviderId {
  return !!value && value in DEFAULTS;
}

/**
 * Work out which provider to use from the environment.
 *
 * `INSIGHTS_PROVIDER` wins if set. Otherwise the first provider with an
 * available key (in DETECT_ORDER) is used. Returns null when no key is present.
 */
export function resolveProvider(): ProviderConfig | null {
  const explicit = process.env.INSIGHTS_PROVIDER?.trim().toLowerCase();
  const candidates: ProviderId[] = isProviderId(explicit) ? [explicit] : DETECT_ORDER;

  for (const id of candidates) {
    const apiKey = process.env.INSIGHTS_API_KEY || process.env[DEFAULTS[id].keyEnv];
    if (apiKey) {
      return {
        id,
        apiKey,
        baseUrl: process.env.INSIGHTS_BASE_URL?.trim() || DEFAULTS[id].baseUrl,
        model: process.env.INSIGHTS_MODEL?.trim() || DEFAULTS[id].model,
      };
    }
  }

  return null;
}

/** Hint listing the env vars an operator can set. */
export function keyEnvHint(): string {
  return 'GROQ_API_KEY (or GEMINI_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY)';
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`(${response.status}) ${detail.slice(0, 300)}`);
  }
  return (await response.json()) as Record<string, unknown>;
}

async function runAnthropic(prompt: string, config: ProviderConfig): Promise<string> {
  const response = await fetch(`${config.baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 2000,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await readJson(response);
  const content = data.content as { type?: string; text?: string }[] | undefined;
  return (content ?? []).map((part) => (part.type === 'text' ? part.text ?? '' : '')).join('');
}

async function runOpenAICompatible(prompt: string, config: ProviderConfig): Promise<string> {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 2000,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await readJson(response);
  const choices = data.choices as { message?: { content?: string } }[] | undefined;
  return choices?.[0]?.message?.content ?? '';
}

async function runGemini(prompt: string, config: ProviderConfig): Promise<string> {
  const url = `${config.baseUrl}/models/${config.model}:generateContent?key=${encodeURIComponent(
    config.apiKey,
  )}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2000,
        responseMimeType: 'application/json',
      },
    }),
  });

  const data = await readJson(response);
  const candidates = data.candidates as
    | { content?: { parts?: { text?: string }[] } }[]
    | undefined;
  return (candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? '').join('');
}

/** Run the prompt through the configured provider and return the raw text. */
export async function runInsights(prompt: string, config: ProviderConfig): Promise<string> {
  if (config.id === 'gemini') return runGemini(prompt, config);
  if (config.id === 'anthropic') return runAnthropic(prompt, config);
  return runOpenAICompatible(prompt, config);
}
