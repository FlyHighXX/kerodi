import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ExternalLink } from '@/components/external-link';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  clearStoredApiKey,
  clearStoredProvider,
  getStoredApiKey,
  getStoredProvider,
  setStoredApiKey,
  setStoredProvider,
} from '@/lib/ai-key';
import {
  clearStoredInstructions,
  getStoredInstructions,
  setStoredInstructions,
} from '@/lib/ai-instructions';
import {
  PROVIDERS,
  PROVIDER_ORDER,
  detectProviderFromKey,
  type ProviderId,
} from '@/lib/ai-providers';
import {
  analyzeNotes,
  analyzeNotesDirect,
  type InsightTheme,
  type Note,
  type WellbeingInsight,
} from '@/lib/insights';
import { DEFAULT_INSTRUCTIONS } from '@/lib/insights-prompt';

const NOTES_KEY = 'kerodi.notes.v1';
const CONSENT_KEY = 'kerodi.ai.consent.v1';

type Status = 'idle' | 'loading' | 'error';

function formatGeneratedAt(timestamp: number) {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function InsightsScreen() {
  const theme = useTheme();
  const [notes, setNotes] = useState<Note[]>([]);
  const [consent, setConsent] = useState(false);
  const [ready, setReady] = useState(false);
  const [storedKey, setStoredKey] = useState<string | null>(null);
  const [providerId, setProviderId] = useState<ProviderId | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [insight, setInsight] = useState<WellbeingInsight | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Key entry state.
  const [editingKey, setEditingKey] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [draftProvider, setDraftProvider] = useState<ProviderId>('groq');

  // Custom AI instructions ("persona"). null means "use the bundled default".
  const [instructions, setInstructions] = useState<string | null>(null);
  const [editingInstructions, setEditingInstructions] = useState(false);
  const [instructionsDraft, setInstructionsDraft] = useState('');

  // Reload everything whenever the tab gains focus, so notes written in the
  // Notes tab are picked up without needing a remount.
  useFocusEffect(
    useCallback(() => {
      let active = true;

      Promise.all([
        AsyncStorage.getItem(NOTES_KEY),
        AsyncStorage.getItem(CONSENT_KEY),
        getStoredApiKey(),
        getStoredProvider(),
        getStoredInstructions(),
      ])
        .then(([notesRaw, consentRaw, key, provider, custom]) => {
          if (!active) return;
          if (notesRaw) {
            const parsed = JSON.parse(notesRaw) as Note[];
            if (Array.isArray(parsed)) setNotes(parsed);
          }
          setConsent(consentRaw === 'true');
          setStoredKey(key);
          setProviderId(provider);
          if (provider) setDraftProvider(provider);
          setInstructions(custom);
        })
        .catch(() => {})
        .finally(() => {
          if (active) setReady(true);
        });

      return () => {
        active = false;
      };
    }, []),
  );

  const onChangeKey = useCallback((value: string) => {
    setKeyDraft(value);
    const detected = detectProviderFromKey(value);
    if (detected) setDraftProvider(detected);
  }, []);

  /** Persist the draft key (or reuse the saved one if the field is blank). */
  const saveKey = useCallback(
    (enable: boolean) => {
      const trimmed = keyDraft.trim();
      if (!trimmed && !storedKey) return;

      const writes: Promise<unknown>[] = [];
      if (trimmed) {
        const id = detectProviderFromKey(trimmed) ?? draftProvider;
        setStoredKey(trimmed);
        setProviderId(id);
        writes.push(setStoredApiKey(trimmed), setStoredProvider(id));
      }
      if (enable) {
        setConsent(true);
        writes.push(AsyncStorage.setItem(CONSENT_KEY, 'true'));
      }

      setEditingKey(false);
      setKeyDraft('');
      setError(null);
      Promise.all(writes).catch(() => {});
    },
    [draftProvider, keyDraft, storedKey],
  );

  const removeKey = useCallback(() => {
    setStoredKey(null);
    setProviderId(null);
    setEditingKey(false);
    setKeyDraft('');
    Promise.all([clearStoredApiKey(), clearStoredProvider()]).catch(() => {});
  }, []);

  /** Open the editor, seeding the draft with the current (or default) persona. */
  const toggleInstructions = useCallback(() => {
    if (!editingInstructions) setInstructionsDraft(instructions ?? DEFAULT_INSTRUCTIONS);
    setEditingInstructions((open) => !open);
  }, [editingInstructions, instructions]);

  /** Persist the draft. Blank (or unchanged-from-default) input clears it. */
  const saveInstructions = useCallback(() => {
    const trimmed = instructionsDraft.trim();
    const next = !trimmed || trimmed === DEFAULT_INSTRUCTIONS.trim() ? null : trimmed;
    setInstructions(next);
    setEditingInstructions(false);
    setInstructionsDraft('');
    setError(null);
    (next ? setStoredInstructions(next) : clearStoredInstructions()).catch(() => {});
  }, [instructionsDraft]);

  const resetInstructions = useCallback(() => {
    setInstructions(null);
    setInstructionsDraft('');
    clearStoredInstructions().catch(() => {});
  }, []);

  const revokeConsent = useCallback(() => {
    setConsent(false);
    setInsight(null);
    setError(null);
    setStatus('idle');
    setEditingKey(false);
    AsyncStorage.removeItem(CONSENT_KEY).catch(() => {});
  }, []);

  /** Opt in without a personal key — the notes go to a hosted proxy instead. */
  const enableProxy = useCallback(() => {
    setConsent(true);
    setError(null);
    AsyncStorage.setItem(CONSENT_KEY, 'true').catch(() => {});
  }, []);

  const generate = useCallback(() => {
    setStatus('loading');
    setError(null);
    const task = storedKey
      ? analyzeNotesDirect(notes, storedKey, providerId, instructions)
      : analyzeNotes(notes, instructions);
    task
      .then((result) => {
        setInsight(result);
        setStatus('idle');
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Something went wrong.');
        setStatus('error');
      });
  }, [instructions, notes, providerId, storedKey]);

  const providerLabel = providerId ? PROVIDERS[providerId].label : null;

  const renderKeyForm = (primaryLabel: string, enable: boolean) => (
    <>
      <TextInput
        value={keyDraft}
        onChangeText={onChangeKey}
        placeholder={storedKey ? 'Leave blank to keep your saved key' : 'Paste your API key'}
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        style={[styles.input, { backgroundColor: theme.background, color: theme.text }]}
      />
      <ProviderChips selected={draftProvider} onSelect={setDraftProvider} />
      <ThemedText type="small" themeColor="textSecondary">
        Get a {PROVIDERS[draftProvider].free ? 'free ' : ''}key from{' '}
        <ExternalLink href={PROVIDERS[draftProvider].docsUrl} style={styles.inlineLink}>
          <ThemedText type="link">{PROVIDERS[draftProvider].label}</ThemedText>
        </ExternalLink>
        . It is stored encrypted on this device.
      </ThemedText>
      <Pressable
        onPress={() => saveKey(enable)}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: theme.backgroundSelected },
          pressed && styles.pressed,
        ]}>
        <ThemedText type="smallBold">{primaryLabel}</ThemedText>
      </Pressable>
    </>
  );

  const renderBody = () => {
    if (!ready) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={theme.textSecondary} />
        </View>
      );
    }

    if (notes.length === 0) {
      return (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            NOTHING TO ANALYSE YET
          </ThemedText>
          <ThemedText style={styles.bodyText}>
            Write a few notes first, then come back here to see patterns across them.
          </ThemedText>
        </ThemedView>
      );
    }

    if (!consent) {
      return (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            SET UP AI INSIGHTS
          </ThemedText>
          <ThemedText style={styles.bodyText}>
            Insights sends your notes to an AI model to look for patterns. You bring your own API
            key — it stays on this device and is sent only to the provider you choose. Nothing is
            sent until you tap Generate.
          </ThemedText>
          {renderKeyForm('Save key & enable', true)}
          <Pressable
            onPress={storedKey ? () => saveKey(true) : enableProxy}
            hitSlop={8}
            style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
            <ThemedText type="small" themeColor="textSecondary">
              {storedKey ? 'Enable with saved key' : 'Enable without a key (use a hosted server)'}
            </ThemedText>
          </Pressable>
        </ThemedView>
      );
    }

    const loading = status === 'loading';

    return (
      <View style={styles.content}>
        <ThemedView type="backgroundElement" style={styles.card}>
          <View style={styles.keyHeader}>
            <ThemedText type="small" themeColor="textSecondary">
              {providerLabel ? `Using your ${providerLabel} key` : 'Using a hosted server'}
            </ThemedText>
            {storedKey ? (
              <View style={styles.keyActions}>
                <Pressable onPress={() => setEditingKey((v) => !v)} hitSlop={8}>
                  <ThemedText type="link">Change</ThemedText>
                </Pressable>
                <Pressable onPress={removeKey} hitSlop={8}>
                  <ThemedText type="link">Remove</ThemedText>
                </Pressable>
              </View>
            ) : null}
          </View>
          {!storedKey || editingKey ? renderKeyForm('Save key', false) : null}
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.card}>
          <View style={styles.keyHeader}>
            <ThemedText type="small" themeColor="textSecondary">
              INSTRUCTIONS TO THE AI
            </ThemedText>
            <Pressable onPress={toggleInstructions} hitSlop={8}>
              <ThemedText type="link">{editingInstructions ? 'Close' : 'Edit'}</ThemedText>
            </Pressable>
          </View>
          {editingInstructions ? (
            <>
              <TextInput
                value={instructionsDraft}
                onChangeText={setInstructionsDraft}
                placeholder={DEFAULT_INSTRUCTIONS}
                placeholderTextColor={theme.textSecondary}
                multiline
                textAlignVertical="top"
                autoCapitalize="sentences"
                autoCorrect
                style={[
                  styles.input,
                  styles.multilineInput,
                  { backgroundColor: theme.background, color: theme.text },
                ]}
              />
              <ThemedText type="small" themeColor="textSecondary">
                Tell the AI how to read your notes. The required response format is added
                automatically, so your wording can&apos;t break it.
              </ThemedText>
              <View style={styles.keyActions}>
                <Pressable onPress={saveInstructions} hitSlop={8}>
                  <ThemedText type="link">Save</ThemedText>
                </Pressable>
                <Pressable onPress={resetInstructions} hitSlop={8}>
                  <ThemedText type="link">Reset to default</ThemedText>
                </Pressable>
              </View>
            </>
          ) : (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
              {instructions
                ? 'Using your custom instructions.'
                : 'Using the default instructions.'}
            </ThemedText>
          )}
        </ThemedView>

        <Pressable
          onPress={generate}
          disabled={loading}
          style={({ pressed }) => [
            styles.button,
            styles.buttonFull,
            { backgroundColor: theme.backgroundSelected },
            loading && styles.disabled,
            pressed && styles.pressed,
          ]}>
          <ThemedText type="smallBold">
            {loading ? 'Analysing…' : insight ? 'Refresh insights' : 'Generate insights'}
          </ThemedText>
        </Pressable>

        {error ? (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              COULD NOT GENERATE
            </ThemedText>
            <ThemedText style={styles.bodyText}>{error}</ThemedText>
          </ThemedView>
        ) : null}

        {loading && !insight ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.textSecondary} />
          </View>
        ) : null}

        {insight ? <InsightView insight={insight} /> : null}

        <Pressable
          onPress={revokeConsent}
          hitSlop={8}
          style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
          <ThemedText type="small" themeColor="textSecondary">
            Turn off AI insights
          </ThemedText>
        </Pressable>
      </View>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <ThemedText type="subtitle">Insights</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {notes.length === 0
              ? 'Patterns in your wellbeing'
              : `Across ${notes.length} note${notes.length === 1 ? '' : 's'}`}
          </ThemedText>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {renderBody()}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function ProviderChips({
  selected,
  onSelect,
}: {
  selected: ProviderId;
  onSelect: (id: ProviderId) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.chipRow}>
      {PROVIDER_ORDER.map((id) => {
        const active = id === selected;
        return (
          <Pressable
            key={id}
            onPress={() => onSelect(id)}
            style={({ pressed }) => [
              styles.chip,
              { backgroundColor: active ? theme.backgroundSelected : theme.background },
              pressed && styles.pressed,
            ]}>
            <ThemedText type="small" themeColor={active ? 'text' : 'textSecondary'}>
              {PROVIDERS[id].label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

function InsightView({ insight }: { insight: WellbeingInsight }) {
  return (
    <View style={styles.content}>
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          SUMMARY
        </ThemedText>
        <ThemedText style={styles.bodyText}>{insight.summary}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Mood: {insight.mood.label} ({insight.mood.score >= 0 ? '+' : ''}
          {insight.mood.score.toFixed(2)})
          {insight.mood.rationale ? ` — ${insight.mood.rationale}` : ''}
        </ThemedText>
      </ThemedView>

      {insight.themes.length > 0 ? (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            THEMES
          </ThemedText>
          {insight.themes.map((theme) => (
            <ThemeRow key={theme.label} theme={theme} />
          ))}
        </ThemedView>
      ) : null}

      <Section title="POSITIVE PATTERNS" items={insight.positivePatterns} />
      <Section title="THINGS TO WATCH" items={insight.concerns} />
      <Section title="IDEAS" items={insight.suggestions} />

      <ThemedText type="small" themeColor="textSecondary" style={styles.footer}>
        Based on {insight.analyzedCount} note{insight.analyzedCount === 1 ? '' : 's'} ·{' '}
        {formatGeneratedAt(insight.generatedAt)} · {insight.provider}/{insight.model}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.footer}>
        This is not medical advice.
      </ThemedText>
    </View>
  );
}

function ThemeRow({ theme }: { theme: InsightTheme }) {
  return (
    <View style={styles.themeRow}>
      <View style={styles.themeHeader}>
        <ThemedText type="smallBold">{theme.label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {theme.count} note{theme.count === 1 ? '' : 's'}
        </ThemedText>
      </View>
      {theme.examples.length > 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          {theme.examples.join(' · ')}
        </ThemedText>
      ) : null}
    </View>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {title}
      </ThemedText>
      {items.map((item, index) => (
        <View key={index} style={styles.bulletRow}>
          <ThemedText themeColor="textSecondary" style={styles.bulletDot}>
            •
          </ThemedText>
          <ThemedText style={styles.bulletText}>{item}</ThemedText>
        </View>
      ))}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    maxWidth: MaxContentWidth,
  },
  header: {
    paddingTop: Spacing.four,
    gap: Spacing.half,
  },
  scrollContent: {
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
  },
  content: {
    gap: Spacing.three,
  },
  center: {
    paddingVertical: Spacing.five,
    alignItems: 'center',
  },
  card: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  bodyText: {
    lineHeight: 22,
  },
  input: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 15,
  },
  multilineInput: {
    minHeight: 120,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  keyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  keyActions: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  inlineLink: {
    verticalAlign: 'middle',
  },
  button: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.five,
  },
  buttonFull: {
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  secondary: {
    alignSelf: 'center',
    paddingVertical: Spacing.one,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.7,
  },
  themeRow: {
    gap: Spacing.half,
    paddingTop: Spacing.half,
  },
  themeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  bulletDot: {
    lineHeight: 22,
  },
  bulletText: {
    flex: 1,
    lineHeight: 22,
  },
  footer: {
    textAlign: 'center',
  },
});
