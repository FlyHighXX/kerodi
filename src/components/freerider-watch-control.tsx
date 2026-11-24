import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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

type Props = {
  from: string;
  to: string;
};

export function FreeriderWatchControl({ from, to }: Props) {
  const theme = useTheme();
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

  const handleToggle = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const activeToken = pushToken ?? (await ensureFreeriderPushToken());
      if (!activeToken) {
        setError('Allow notifications for Kerodi in system settings to start a listener.');
        return;
      }
      setPushToken(activeToken);

      if (sessions.length === 0) {
        await startFreeriderSession({ token: activeToken, from, to, durationMinutes });
      } else {
        const ordered = [...sessions].sort((a, b) => a.createdAt - b.createdAt);
        const last = ordered[ordered.length - 1];
        if (last) await stopFreeriderSession(activeToken, last.id);
      }
      await load(activeToken);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not reach the worker.');
    } finally {
      setBusy(false);
    }
  }, [durationMinutes, from, load, pushToken, sessions, to]);

  const handleStopSession = useCallback(
    async (id: string) => {
      if (!pushToken) return;
      setBusy(true);
      setError(null);
      try {
        await stopFreeriderSession(pushToken, id);
        await refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not reach the worker.');
      } finally {
        setBusy(false);
      }
    },
    [pushToken, refresh],
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
          <ThemedText type="smallBold">{sessions.length > 0 ? 'Stop' : 'Start'}</ThemedText>
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
            <ThemedText type="link">{sessions.length} listening</ThemedText>
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
            <ThemedText type="smallBold">Listen for</ThemedText>
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
            <ThemedText type="smallBold">Active listeners</ThemedText>
            {orderedSessions.map((session) => (
              <View key={session.id} style={styles.sessionRow}>
                <View style={styles.sessionCopy}>
                  <ThemedText type="smallBold">
                    {session.from || 'Any'} → {session.to || 'Any'}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {formatRemaining(session.expiresAt, now)}
                  </ThemedText>
                </View>
                <Pressable
                  onPress={() => void handleStopSession(session.id)}
                  disabled={busy}
                  hitSlop={8}>
                  <ThemedText type="link">Stop</ThemedText>
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
