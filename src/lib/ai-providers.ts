/**
 * Provider metadata and request adapters for the Wellbeing Insights feature.
 *
 * This module is isomorphic: it contains no secrets and no Expo imports, so it
 * is safe to use from both the client (BYOK — the user's own key) and the server
 * route (a key from the environment). The API key is always passed in at call
 * time, never read from the environment here.
 */

export type ProviderId = 'groq' | 'gemini' | 'openai' | 'anthropic';

export type ProviderConfig = {
  id: ProviderId;
  apiKey: string;
  baseUrl: string;
  model: string;
};

export type ProviderMeta = {
  id: ProviderId;
  label: string;
  baseUrl: string;
  model: string;
  /** Server env var that supplies this provider's key. */
  keyEnv: string;
  /** Where the user gets a key — used to link from the app. */
  docsUrl: string;
  /** Key prefixes used to auto-detect the provider from a pasted key. */
  keyPrefixes: string[];
  /** Whether the provider has a usable free tier. */
  free: boolean;
};

export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  groq: {
    id: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'openai/gpt-oss-120b',
    keyEnv: 'GROQ_API_KEY',
    docsUrl: 'https://console.groq.com/keys',
    keyPrefixes: ['gsk_'],
    free: true,
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-3.8-flash',
    keyEnv: 'GEMINI_API_KEY',
    docsUrl: 'https://aistudio.google.com/apikey',
    keyPrefixes: ['AIza'],
    free: true,
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    keyEnv: 'OPENAI_API_KEY',
    docsUrl: 'https://platform.openai.com/api-keys',
    keyPrefixes: ['sk-'],
    free: false,
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-5',
    keyEnv: 'ANTHROPIC_API_KEY',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    keyPrefixes: ['sk-ant-'],
    free: false,
  },
};

/** Preferred order for UI and auto-detection. */
export const PROVIDER_ORDER: ProviderId[] = ['groq', 'gemini', 'openai', 'anthropic'];

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && value in PROVIDERS;
}

/** Guess a provider from a pasted key's prefix, or null if unrecognised. */
export function detectProviderFromKey(key: string): ProviderId | null {
  const trimmed = key.trim();
  if (!trimmed) return null;
  // Check the longest/most specific prefixes first.
  for (const id of PROVIDER_ORDER) {
    if (PROVIDERS[id].keyPrefixes.some((prefix) => trimmed.startsWith(prefix))) {
      return id;
    }
  }
  return null;
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

/** Run the prompt through a provider and return the raw text response. */
export async function runProvider(prompt: string, config: ProviderConfig): Promise<string> {
  if (config.id === 'gemini') return runGemini(prompt, config);
  if (config.id === 'anthropic') return runAnthropic(prompt, config);
  return runOpenAICompatible(prompt, config);
}
