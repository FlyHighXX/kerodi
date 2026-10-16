import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';

export default function HomeScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.hero}>
          <ThemedText type="title" style={styles.title}>
            KeRoDi
          </ThemedText>
          <ThemedText type="subtitle" themeColor="textSecondary" style={styles.tagline}>
            Your thoughts, in one place
          </ThemedText>
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.cardLabel}>
            WELCOME
          </ThemedText>
          <ThemedText style={styles.cardText}>
            KeRoDi is your simple companion for capturing ideas, reminders, and everyday thoughts.
            Open the Notes tab to start writing — everything you save stays on your device. If you
            want, the Insights tab can use AI to look for patterns across your notes.
          </ThemedText>
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.quoteCard}>
          <ThemedText style={styles.quoteMark}>“</ThemedText>
          <ThemedText style={styles.quote}>Hi, Welcome to KeRoDi Family</ThemedText>
        </ThemedView>
      </SafeAreaView>
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
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
    maxWidth: MaxContentWidth,
  },
  hero: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  title: {
    textAlign: 'center',
  },
  tagline: {
    textAlign: 'center',
  },
  card: {
    alignSelf: 'stretch',
    gap: Spacing.two,
    padding: Spacing.four,
    borderRadius: Spacing.four,
  },
  cardLabel: {
    letterSpacing: 1,
  },
  cardText: {
    lineHeight: 24,
  },
  quoteCard: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.four,
  },
  quoteMark: {
    fontSize: 44,
    lineHeight: 40,
    opacity: 0.4,
  },
  quote: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '600',
    textAlign: 'center',
  },
});
