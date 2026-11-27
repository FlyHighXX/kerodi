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
  formatDurationMs,
  formatHistoryDateTime,
  formatTransitionText,
  listTopPairs,
  type RouteHistoryRecord,
} from '@/lib/freerider-history';
import { useI18n } from '@/providers/locale-provider';

type Props = {
  records: RouteHistoryRecord[];
  from: string;
  to: string;
  now: number;
  focusRecordId?: number | null;
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

export function FreeriderHistorySheet({
  records,
  from,
  to,
  now,
  focusRecordId,
  onClose,
}: Props) {
  const theme = useTheme();
  const { t } = useI18n();
  const focusedRecord =
    focusRecordId == null ? undefined : records.find((record) => record.id === focusRecordId);
  const focusMode = focusedRecord != null;
  const [fromDraft, setFromDraft] = useState(focusedRecord?.fromCity ?? from);
  const [toDraft, setToDraft] = useState(focusedRecord?.toCity ?? to);
  const [expandedId, setExpandedId] = useState<number | null>(focusRecordId ?? null);

  const summary = useMemo(
    () => buildPairPatternSummary(records, fromDraft, toDraft, now),
    [fromDraft, now, records, toDraft],
  );
  const topPairs = useMemo(() => listTopPairs(records).slice(0, 8), [records]);
  const recent = useMemo(
    () => (focusedRecord ? [focusedRecord] : records.slice(0, 10)),
    [focusedRecord, records],
  );

  const recentCard = (
    <ThemedView type="background" style={styles.card}>
      <ThemedText type="smallBold">
        {focusedRecord ? `${focusedRecord.fromCity} → ${focusedRecord.toCity}` : t('Recent routes')}
      </ThemedText>
      {focusedRecord ? null : (
        <ThemedText type="small" themeColor="textSecondary">
          {t('Tap a route to see its state changes.')}
        </ThemedText>
      )}
      {recent.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('Nothing recorded yet.')}
        </ThemedText>
      ) : (
        recent.map((record) => {
          const transitions = [...(record.transitions ?? [])].reverse();
          const expanded = expandedId === record.id;
          return (
            <Pressable
              key={record.id}
              onPress={() => setExpandedId(expanded ? null : record.id)}
              style={({ pressed }) => [styles.recentRow, pressed && styles.pressed]}>
              <View style={styles.recentCopy}>
                <ThemedText type="small" numberOfLines={1}>
                  {record.fromCity} → {record.toCity}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatDetectionText(record)}
                  {record.status === 'active' || !record.disappearedAt
                    ? ''
                    : ` · ${t(statusLabel(record.status))} ${formatHistoryDateTime(record.disappearedAt)}`}
                </ThemedText>
                {record.reappearanceCount ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('Seen again {{count}}×', { count: record.reappearanceCount })}
                    {record.lastReappearedAt
                      ? t(' · Last {{time}}', {
                          time: formatHistoryDateTime(record.lastReappearedAt),
                        })
                      : ''}
                  </ThemedText>
                ) : null}
              </View>
              {expanded ? (
                <View style={[styles.timeline, { borderLeftColor: theme.backgroundSelected }]}>
                  {transitions.length === 0 ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      {t('No state changes recorded yet.')}
                    </ThemedText>
                  ) : (
                    transitions.map((transition, index) => (
                      <ThemedText
                        key={`${record.id}-${transition.at}-${index}`}
                        type="small"
                        themeColor="textSecondary">
                        {formatTransitionText(transition)}
                      </ThemedText>
                    ))
                  )}
                  {record.totalUnavailableMs ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      {t('Total unavailable {{duration}}', {
                        duration: formatDurationMs(record.totalUnavailableMs),
                      })}
                    </ThemedText>
                  ) : null}
                </View>
              ) : null}
            </Pressable>
          );
        })
      )}
    </ThemedView>
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <ThemedView type="backgroundElement" style={styles.sheet}>
          <View style={styles.rowBetween}>
            <ThemedText type="subtitle">{t('Route history')}</ThemedText>
            <Pressable onPress={onClose} hitSlop={8}>
              <ThemedText type="link">{t('Close')}</ThemedText>
            </Pressable>
          </View>

          <ThemedText type="small" themeColor="textSecondary">
            {t(
              'Dates and times are when Kerodi detected the route. Routes present at first launch are marked Baseline because their true detection time is unknown.',
            )}
          </ThemedText>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}>
            {focusMode ? recentCard : null}
            {focusMode ? null : (
              <>
                <View style={styles.inputRow}>
              <TextInput
                value={fromDraft}
                onChangeText={setFromDraft}
                placeholder={t('From')}
                placeholderTextColor={theme.textSecondary}
                style={[styles.input, { backgroundColor: theme.background, color: theme.text }]}
              />
              <TextInput
                value={toDraft}
                onChangeText={setToDraft}
                placeholder={t('To')}
                placeholderTextColor={theme.textSecondary}
                style={[styles.input, { backgroundColor: theme.background, color: theme.text }]}
              />
            </View>

            <ThemedView type="background" style={styles.card}>
              <ThemedText type="smallBold">
                {summary.from || t('Any')} → {summary.to || t('Any')}
              </ThemedText>
              {summary.total === 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {t('No detected posts for this pair yet.')}
                </ThemedText>
              ) : (
                <>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('{{count}} detected · {{rate}} per week', {
                      count: summary.total,
                      rate: summary.perWeek.toFixed(1),
                    })}
                  </ThemedText>
                  {summary.reappearances > 0 ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      {t('{{count}} reappearances recorded', { count: summary.reappearances })}
                    </ThemedText>
                  ) : null}
                  {summary.busiestWeekday ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      {t('Busiest day {{day}} · {{percent}}', {
                        day: summary.busiestWeekday.label,
                        percent: percent(summary.busiestWeekday.share),
                      })}
                    </ThemedText>
                  ) : null}
                  {summary.busiestHour ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      {t('Busiest hour {{hour}} · {{percent}}', {
                        hour: summary.busiestHour.label,
                        percent: percent(summary.busiestHour.share),
                      })}
                    </ThemedText>
                  ) : null}
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('Last detected {{time}}', {
                      time: formatHistoryDateTime(summary.lastAt),
                    })}
                  </ThemedText>
                </>
              )}
            </ThemedView>

            {topPairs.length > 0 ? (
              <ThemedView type="background" style={styles.card}>
                <ThemedText type="smallBold">{t('Most seen pairs')}</ThemedText>
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

                {recentCard}
              </>
            )}
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
  timeline: {
    gap: Spacing.half,
    marginTop: Spacing.one,
    paddingLeft: Spacing.two,
    borderLeftWidth: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});
