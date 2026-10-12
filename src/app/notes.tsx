import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const STORAGE_KEY = 'kerodi.notes.v1';

type Note = {
  id: string;
  text: string;
  createdAt: number;
};

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function NotesScreen() {
  const theme = useTheme();
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState('');
  const [hydrated, setHydrated] = useState(false);

  // Load persisted notes once, when the screen first mounts.
  useEffect(() => {
    let active = true;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!active || !raw) return;
        const parsed = JSON.parse(raw) as Note[];
        if (Array.isArray(parsed)) {
          setNotes(parsed);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setHydrated(true);
      });

    return () => {
      active = false;
    };
  }, []);

  // Persist changes, but only after the initial load so we never overwrite with [].
  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(notes)).catch(() => {});
  }, [notes, hydrated]);

  const addNote = () => {
    const text = draft.trim();
    if (!text) return;
    setNotes((previous) => [{ id: createId(), text, createdAt: Date.now() }, ...previous]);
    setDraft('');
  };

  const deleteNote = (id: string) => {
    setNotes((previous) => previous.filter((note) => note.id !== id));
  };

  const canAdd = draft.trim().length > 0;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <ThemedText type="subtitle">Notes</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {notes.length === 0
              ? 'Your notepad is empty'
              : `${notes.length} note${notes.length === 1 ? '' : 's'}`}
          </ThemedText>
        </View>

        <ThemedView type="backgroundElement" style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Write a note…"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text }]}
            multiline
            textAlignVertical="top"
            maxLength={2000}
          />
          <Pressable
            onPress={addNote}
            disabled={!canAdd}
            style={({ pressed }) => [
              styles.addButton,
              { backgroundColor: theme.backgroundSelected },
              !canAdd && styles.disabled,
              pressed && styles.pressed,
            ]}>
            <ThemedText type="smallBold">Add note</ThemedText>
          </Pressable>
        </ThemedView>

        <FlatList
          data={notes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <ThemedView type="backgroundElement" style={styles.noteCard}>
              <ThemedText style={styles.noteText}>{item.text}</ThemedText>
              <View style={styles.noteFooter}>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatTimestamp(item.createdAt)}
                </ThemedText>
                <Pressable
                  onPress={() => deleteNote(item.id)}
                  hitSlop={8}
                  style={({ pressed }) => pressed && styles.pressed}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Delete
                  </ThemedText>
                </Pressable>
              </View>
            </ThemedView>
          )}
          ListEmptyComponent={
            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
              Nothing here yet. Write your first note above.
            </ThemedText>
          }
        />
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
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    maxWidth: MaxContentWidth,
  },
  header: {
    paddingTop: Spacing.four,
    gap: Spacing.half,
  },
  composer: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.four,
  },
  input: {
    minHeight: 72,
    fontSize: 16,
    lineHeight: 22,
    padding: 0,
  },
  addButton: {
    alignSelf: 'flex-end',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.five,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.7,
  },
  listContent: {
    gap: Spacing.two,
    paddingTop: Spacing.one,
    paddingBottom: BottomTabInset + Spacing.four,
  },
  noteCard: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  noteText: {
    lineHeight: 22,
  },
  noteFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  empty: {
    textAlign: 'center',
    paddingTop: Spacing.five,
  },
});
