import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useFreeriderViewSettings } from '@/hooks/use-freerider-view-settings';
import { ensureFreeriderPushToken, readStoredFreeriderPushToken } from '@/lib/freerider-push';
import {
  DURATION_PRESETS,
  formatDurationLabel,
  formatRemaining,
  loadFreeriderSessions,
  readSelectedDuration,
  startFreeriderSession,
  stopFreeriderSession,
  writeSelectedDuration,
  type FreeriderSession,
} from '@/lib/freerider-sessions';
import { useI18n } from '@/providers/locale-provider';

type Props = {
  from: string;
  to: string;
};

export function FreeriderWatchControl({ from, to }: Props) {
  const theme = useTheme();
  const { t } = useI18n();
  const { excludeNorway } = useFreeriderViewSettings();
  const syncingExclusionRef = useRef(false);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [sessions, setSessions] = useState<FreeriderSession[]>([]);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [durationVisible, setDurationVisible] = useState(false);
  const [sessionsVisible, setSessionsVisible] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async (token: string) => {
    setSessions(await loadFreeriderSessions(token));
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        const token = await readStoredFreeriderPushToken();
        if (!active) return;
        setPushToken(token);
        if (token) await load(token);
      })();
      return () => {
        active = false;
      };
    }, [load]),
  );

  useEffect(() => {
    let active = true;
    void readSelectedDuration().then((minutes) => {
      if (active) setDurationMinutes(minutes);
    });
    const timer = setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const refresh = useCallback(async () => {
    if (pushToken) await load(pushToken);
  }, [load, pushToken]);

  // Keep already-running listeners in sync when the Norway filter changes.
  useEffect(() => {
    if (!pushToken || syncingExclusionRef.current) return;
    const desired = excludeNorway ? 'NO' : '';
    const stale = sessions.filter((session) => (session.excludeCountry ?? '') !== desired);
    if (stale.length === 0) return;

    syncingExclusionRef.current = true;
    void Promise.all(
      stale.map((session) =>
        startFreeriderSession({
          token: pushToken,
          from: session.from,
          to: session.to,
          durationMinutes: session.durationMinutes,
          excludeCountry: desired,
        }),
      ),
    )
      .then(() => load(pushToken))
      .catch(() => {})
      .finally(() => {
        syncingExclusionRef.current = false;
      });
  }, [excludeNorway, load, pushToken, sessions]);

  const handleToggle = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const activeToken = pushToken ?? (await ensureFreeriderPushToken());
      if (!activeToken) {
        setError(t('Allow notifications for Kerodi in system settings to start a listener.'));
        return;
      }
      setPushToken(activeToken);

      if (sessions.length === 0) {
        await startFreeriderSession({
          token: activeToken,
          from,
          to,
          durationMinutes,
          excludeCountry: excludeNorway ? 'NO' : '',
        });
      } else {
        const ordered = [...sessions].sort((a, b) => a.createdAt - b.createdAt);
        const last = ordered[ordered.length - 1];
        if (last) await stopFreeriderSession(activeToken, last.id);
      }
      await load(activeToken);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not reach the worker.'));
    } finally {
      setBusy(false);
    }
  }, [durationMinutes, excludeNorway, from, load, pushToken, sessions, t, to]);

  const handleStopSession = useCallback(
    async (id: string) => {
      if (!pushToken) return;
      setBusy(true);
      setError(null);
      try {
        await stopFreeriderSession(pushToken, id);
        await refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : t('Could not reach the worker.'));
      } finally {
        setBusy(false);
      }
    },
    [pushToken, refresh, t],
  );

  const chooseDuration = useCallback(async (minutes: number) => {
    setDurationMinutes(minutes);
    setDurationVisible(false);
    await writeSelectedDuration(minutes);
  }, []);

  const orderedSessions = [...sessions].sort((a, b) => a.createdAt - b.createdAt);

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Pressable
          onPress={() => void handleToggle()}
          disabled={busy}
          style={({ pressed }) => [
            styles.watchButton,
            { backgroundColor: theme.backgroundSelected },
            busy && styles.disabled,
            pressed && styles.pressed,
          ]}>
          <ThemedText type="smallBold">{sessions.length > 0 ? t('Stop') : t('Start')}</ThemedText>
        </Pressable>

        <Pressable
          onPress={() => setDurationVisible(true)}
          hitSlop={8}
          style={styles.durationButton}>
          <ThemedText type="small" themeColor="textSecondary">
            {formatDurationLabel(durationMinutes)} ▾
          </ThemedText>
        </Pressable>

        {sessions.length > 0 ? (
          <Pressable onPress={() => setSessionsVisible(true)} hitSlop={8}>
            <ThemedText type="link">
              {t('{{count}} listening', { count: sessions.length })}
            </ThemedText>
          </Pressable>
        ) : null}

        {busy ? <ActivityIndicator size="small" color={theme.textSecondary} /> : null}
      </View>

      {error ? (
        <ThemedText type="small" themeColor="textSecondary">
          {error}
        </ThemedText>
      ) : null}

      <Modal
        visible={durationVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDurationVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setDurationVisible(false)}>
          <ThemedView type="backgroundElement" style={styles.sheet}>
            <ThemedText type="smallBold">{t('Listen for')}</ThemedText>
            {DURATION_PRESETS.map((minutes) => (
              <Pressable
                key={minutes}
                onPress={() => void chooseDuration(minutes)}
                style={({ pressed }) => [styles.optionRow, pressed && styles.pressed]}>
                <ThemedText type="small">{formatDurationLabel(minutes)}</ThemedText>
              </Pressable>
            ))}
          </ThemedView>
        </Pressable>
      </Modal>

      <Modal
        visible={sessionsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSessionsVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setSessionsVisible(false)}>
          <ThemedView type="backgroundElement" style={styles.sheet}>
            <ThemedText type="smallBold">{t('Active listeners')}</ThemedText>
            {orderedSessions.map((session) => (
              <View key={session.id} style={styles.sessionRow}>
                <View style={styles.sessionCopy}>
                  <ThemedText type="smallBold">
                    {session.from || t('Any')} → {session.to || t('Any')}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {formatRemaining(session.expiresAt, now)}
                  </ThemedText>
                </View>
                <Pressable
                  onPress={() => void handleStopSession(session.id)}
                  disabled={busy}
                  hitSlop={8}>
                  <ThemedText type="link">{t('Stop')}</ThemedText>
                </Pressable>
              </View>
            ))}
          </ThemedView>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  watchButton: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.five,
  },
  durationButton: {
    paddingVertical: Spacing.one,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    padding: Spacing.four,
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  optionRow: {
    paddingVertical: Spacing.two,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  sessionCopy: {
    flex: 1,
    gap: Spacing.half,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.7,
  },
});
