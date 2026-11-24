import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  buildPairPatternSummary,
  formatDetectionText,
  formatHistoryClock,
  formatHistoryDateClock,
  listTopPairs,
  type RouteHistoryRecord,
} from '@/lib/freerider-history';

type Props = {
  records: RouteHistoryRecord[];
  from: string;
  to: string;
  now: number;
  onClose: () => void;
};

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function statusLabel(status: RouteHistoryRecord['status']) {
  if (status === 'unavailable') return 'UNAVAILABLE';
  if (status === 'expired') return 'EXPIRED';
  return 'ACTIVE';
}

export function FreeriderHistorySheet({ records, from, to, now, onClose }: Props) {
  const theme = useTheme();
  const [fromDraft, setFromDraft] = useState(from);
  const [toDraft, setToDraft] = useState(to);

  const summary = useMemo(
    () => buildPairPatternSummary(records, fromDraft, toDraft, now),
    [fromDraft, now, records, toDraft],
  );
  const topPairs = useMemo(() => listTopPairs(records).slice(0, 8), [records]);
  const recent = useMemo(() => records.slice(0, 10), [records]);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <ThemedView type="backgroundElement" style={styles.sheet}>
          <View style={styles.rowBetween}>
            <ThemedText type="subtitle">Route history</ThemedText>
            <Pressable onPress={onClose} hitSlop={8}>
              <ThemedText type="link">Close</ThemedText>
            </Pressable>
          </View>

          <ThemedText type="small" themeColor="textSecondary">
            Times are when Kerodi detected the route, to the minute. Routes present at first
            launch are marked Baseline because their true detection time is unknown.
          </ThemedText>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}>
            <View style={styles.inputRow}>
              <TextInput
                value={fromDraft}
                onChangeText={setFromDraft}
                placeholder="From"
                placeholderTextColor={theme.textSecondary}
                style={[styles.input, { backgroundColor: theme.background, color: theme.text }]}
              />
              <TextInput
                value={toDraft}
                onChangeText={setToDraft}
                placeholder="To"
                placeholderTextColor={theme.textSecondary}
                style={[styles.input, { backgroundColor: theme.background, color: theme.text }]}
              />
            </View>

            <ThemedView type="background" style={styles.card}>
              <ThemedText type="smallBold">
                {summary.from || 'Any'} → {summary.to || 'Any'}
              </ThemedText>
              {summary.total === 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  No detected posts for this pair yet.
                </ThemedText>
              ) : (
                <>
                  <ThemedText type="small" themeColor="textSecondary">
                    {summary.total} detected · {summary.perWeek.toFixed(1)} per week
                  </ThemedText>
                  {summary.busiestWeekday ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      Busiest day {summary.busiestWeekday.label} ·{' '}
                      {percent(summary.busiestWeekday.share)}
                    </ThemedText>
                  ) : null}
                  {summary.busiestHour ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      Busiest hour {summary.busiestHour.label} ·{' '}
                      {percent(summary.busiestHour.share)}
                    </ThemedText>
                  ) : null}
                  <ThemedText type="small" themeColor="textSecondary">
                    Last detected {formatHistoryDateClock(summary.lastAt)}
                  </ThemedText>
                </>
              )}
            </ThemedView>

            {topPairs.length > 0 ? (
              <ThemedView type="background" style={styles.card}>
                <ThemedText type="smallBold">Most seen pairs</ThemedText>
                {topPairs.map((pair) => (
                  <Pressable
                    key={`${pair.fromKey}|${pair.toKey}`}
                    onPress={() => {
                      setFromDraft(pair.from);
                      setToDraft(pair.to);
                    }}
                    style={({ pressed }) => [styles.pairRow, pressed && styles.pressed]}>
                    <ThemedText type="small">
                      {pair.from} → {pair.to}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {pair.count}
                    </ThemedText>
                  </Pressable>
                ))}
              </ThemedView>
            ) : null}

            <ThemedView type="background" style={styles.card}>
              <ThemedText type="smallBold">Recent routes</ThemedText>
              {recent.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Nothing recorded yet.
                </ThemedText>
              ) : (
                recent.map((record) => (
                  <View key={record.id} style={styles.recentRow}>
                    <View style={styles.recentCopy}>
                      <ThemedText type="small" numberOfLines={1}>
                        {record.fromCity} → {record.toCity}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {formatDetectionText(record)}
                        {record.status === 'active' || !record.disappearedAt
                          ? ''
                          : ` · ${statusLabel(record.status)} ${formatHistoryClock(record.disappearedAt)}`}
                      </ThemedText>
                    </View>
                  </View>
                ))
              )}
            </ThemedView>
          </ScrollView>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    padding: Spacing.three,
  },
  sheet: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '85%',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  scrollContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.one,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  inputRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.two,
    fontSize: 14,
  },
  card: {
    gap: Spacing.one,
    padding: Spacing.two,
    borderRadius: Spacing.two,
  },
  pairRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  recentRow: {
    paddingVertical: Spacing.one,
  },
  recentCopy: {
    gap: Spacing.half,
  },
  pressed: {
    opacity: 0.7,
  },
});
