import { useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { FREERIDER_SITE_URL } from '@/lib/freerider';

type Props = {
  url: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * Opens the booking page in a persistent in-app WebView. The site's MSAL cache
 * lives in that WebView, so signing in once is enough for later routes.
 */
export function FreeriderRouteLink({ url, children, style }: Props) {
  const theme = useTheme();
  const [visible, setVisible] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(url);
  const [loading, setLoading] = useState(true);
  const redirectedAfterLogin = useRef(false);

  const open = () => {
    setCurrentUrl(url);
    redirectedAfterLogin.current = false;
    setLoading(true);
    setVisible(true);
  };

  const shouldStartLoad = (request: WebViewNavigation) => {
    // The B2C redirect points back to "/", which loses the route hash. Once
    // the session exists, bounce back to the selected route.
    const requestPath = request.url.split(/[?#]/)[0].replace(/\/$/, '');
    if (
      !redirectedAfterLogin.current &&
      requestPath === FREERIDER_SITE_URL.replace(/\/$/, '')
    ) {
      redirectedAfterLogin.current = true;
      setCurrentUrl(url);
      return false;
    }
    return true;
  };

  return (
    <>
      <Pressable
        onPress={open}
        style={({ pressed }) => [pressed && styles.pressed, style]}>
        {children}
      </Pressable>

      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setVisible(false)}>
        <ThemedView style={styles.container}>
          <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
            <View style={styles.bar}>
              <Pressable onPress={() => setVisible(false)} hitSlop={8} style={styles.close}>
                <ThemedText type="link">Close</ThemedText>
              </Pressable>
              <ThemedText type="small" themeColor="textSecondary">
                hertzfreerider.se
              </ThemedText>
            </View>

            <WebView
              source={{ uri: currentUrl }}
              style={[styles.webview, { backgroundColor: theme.background }]}
              javaScriptEnabled
              domStorageEnabled
              cacheEnabled
              incognito={false}
              onLoadStart={() => setLoading(true)}
              onLoadEnd={() => setLoading(false)}
              onShouldStartLoadWithRequest={shouldStartLoad}
            />

            {loading ? (
              <View
                pointerEvents="none"
                style={[styles.loading, { backgroundColor: theme.background }]}>
                <ActivityIndicator color={theme.textSecondary} />
              </View>
            ) : null}
          </SafeAreaView>
        </ThemedView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  close: {
    paddingVertical: Spacing.one,
  },
  webview: {
    flex: 1,
  },
  loading: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
