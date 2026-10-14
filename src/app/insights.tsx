import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { analyzeNotes, type Note, type InsightTheme, type WellbeingInsight } from '@/lib/insights';

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
  const [status, setStatus] = useState<Status>('idle');
  const [insight, setInsight] = useState<WellbeingInsight | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load persisted notes + consent whenever the tab gains focus, so notes
  // written in the Notes tab are picked up without needing a remount.
  useFocusEffect(
    useCallback(() => {
      let active = true;

      Promise.all([AsyncStorage.getItem(NOTES_KEY), AsyncStorage.getItem(CONSENT_KEY)])
        .then(([notesRaw, consentRaw]) => {
          if (!active) return;
          if (notesRaw) {
            const parsed = JSON.parse(notesRaw) as Note[];
            if (Array.isArray(parsed)) setNotes(parsed);
          }
          setConsent(consentRaw === 'true');
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

  const grantConsent = useCallback(() => {
    setConsent(true);
    AsyncStorage.setItem(CONSENT_KEY, 'true').catch(() => {});
  }, []);

  const revokeConsent = useCallback(() => {
    setConsent(false);
    setInsight(null);
    setError(null);
    setStatus('idle');
    AsyncStorage.removeItem(CONSENT_KEY).catch(() => {});
  }, []);

  const generate = useCallback(() => {
    setStatus('loading');
    setError(null);
    analyzeNotes(notes)
      .then((result) => {
        setInsight(result);
        setStatus('idle');
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Something went wrong.');
        setStatus('error');
      });
  }, [notes]);

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
            OPT-IN REQUIRED
          </ThemedText>
          <ThemedText style={styles.bodyText}>
            Insights uses an AI model to look for patterns across your notes. When you tap the button
            below, the text and dates of your {notes.length} note{notes.length === 1 ? '' : 's'} are
            sent to our server and on to an AI provider for analysis. Nothing is sent until you ask.
          </ThemedText>
          <ThemedText style={styles.bodyText} themeColor="textSecondary">
            Your notes stay on this device otherwise. You can turn this off again at any time.
          </ThemedText>
          <Pressable
            onPress={grantConsent}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: theme.backgroundSelected },
              pressed && styles.pressed,
            ]}>
            <ThemedText type="smallBold">Enable AI insights</ThemedText>
          </Pressable>
        </ThemedView>
      );
    }

    const loading = status === 'loading';

    return (
      <View style={styles.content}>
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
          style={({ pressed }) => [styles.revoke, pressed && styles.pressed]}>
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
        {formatGeneratedAt(insight.generatedAt)} · {insight.model}
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
  revoke: {
    alignSelf: 'center',
    paddingVertical: Spacing.two,
  },
  footer: {
    textAlign: 'center',
  },
});
