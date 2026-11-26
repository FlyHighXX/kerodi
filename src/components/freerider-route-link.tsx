import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { useI18n } from '@/providers/locale-provider';

export type FreeriderRouteLinkRoute = {
  pickupName: string;
  returnName: string;
  carModel?: string | null;
};

type Props = {
  url: string;
  pickupName?: string | null;
  returnName?: string | null;
  carModel?: string | null;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

const SITE_ROOT = FREERIDER_SITE_URL.replace(/\/$/, '');

// MSAL opens the B2C sign-in page with window.open(). A plain Android WebView
// puts that popup in a window nobody renders, so the login appears frozen.
// Redirecting popups into this WebView keeps the session and makes the buttons
// usable. The guard makes the patch safe to inject on every navigation.
const SAME_WINDOW_POPUP_PATCH = `
(function () {
  if (window.__kerodiSameWindowPopup) return true;
  window.__kerodiSameWindowPopup = true;
  window.open = function (url) {
    if (url) {
      // MSAL sets an "interaction in progress" marker before opening the
      // popup. Since this tab becomes the popup, clear the marker so the
      // redirect response can be processed on return.
      for (var i = sessionStorage.length - 1; i >= 0; i -= 1) {
        var key = sessionStorage.key(i);
        if (key && (key.indexOf('msal') !== -1 || key.toLowerCase().indexOf('interaction') !== -1)) {
          sessionStorage.removeItem(key);
        }
      }
      window.location.assign(String(url));
    }
    return window;
  };
  return true;
})();
`;

/**
 * The site's own Book button is the only supported way to enter the booking
 * flow without a preset pickup time: it sets the selected route in Redux, then
 * navigates to the flow. Replicate that by selecting the matching card and
 * pressing the same button inside the WebView.
 */
function buildAutoSelectScript(route: FreeriderRouteLinkRoute) {
  const target = JSON.stringify({
    pickupName: route.pickupName,
    returnName: route.returnName,
    carModel: route.carModel ?? '',
  });

  return `
(function () {
  if (window.__kerodiRouteLinkAutoSelect) return true;
  window.__kerodiRouteLinkAutoSelect = true;
  var target = ${target};
  var deadline = Date.now() + 10000;
  function normalized(value) {
    return String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
  }
  function findCard() {
    var cards = document.querySelectorAll('.route-card');
    for (var i = 0; i < cards.length; i += 1) {
      var text = normalized(cards[i].textContent);
      if (
        text.indexOf(normalized(target.pickupName)) !== -1 &&
        text.indexOf(normalized(target.returnName)) !== -1 &&
        (!target.carModel || text.indexOf(normalized(target.carModel)) !== -1)
      ) {
        return cards[i];
      }
    }
    return null;
  }
  function clickBook() {
    var button = document.getElementById('start-booking-flow-button');
    if (!button) return false;
    button.click();
    return true;
  }
  function step() {
    if (clickBook()) return;
    var card = findCard();
    if (card) {
      card.click();
      setTimeout(function () {
        if (!clickBook() && Date.now() < deadline) setTimeout(step, 200);
      }, 300);
      return;
    }
    if (Date.now() < deadline) setTimeout(step, 200);
  }
  step();
  return true;
})();
`;
}

function isSiteRoot(url: string) {
  return url.split(/[?#]/)[0].replace(/\/$/, '') === SITE_ROOT;
}

function hasMsalResponse(url: string) {
  return /[#&](?:code|id_token|error|state)=/i.test(url);
}

/**
 * Opens the booking page in a persistent in-app WebView. The site's MSAL cache
 * lives in that WebView, so signing in once is enough for later routes.
 */
export function FreeriderRouteLink({
  url,
  pickupName,
  returnName,
  carModel,
  children,
  style,
}: Props) {
  const theme = useTheme();
  const { t } = useI18n();
  const injectedJavaScript = useMemo(() => {
    if (!pickupName || !returnName) return SAME_WINDOW_POPUP_PATCH;
    return `${SAME_WINDOW_POPUP_PATCH}\n${buildAutoSelectScript({
      pickupName,
      returnName,
      carModel,
    })}`;
  }, [pickupName, returnName, carModel]);
  const [visible, setVisible] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(url);
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const webViewRef = useRef<WebView | null>(null);
  const authReturnPending = useRef(false);
  const restoreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRestoreTimer = useCallback(() => {
    if (restoreTimer.current) {
      clearTimeout(restoreTimer.current);
      restoreTimer.current = null;
    }
  }, []);

  useEffect(() => clearRestoreTimer, [clearRestoreTimer]);

  const close = useCallback(() => {
    clearRestoreTimer();
    authReturnPending.current = false;
    setVisible(false);
  }, [clearRestoreTimer]);

  const open = () => {
    clearRestoreTimer();
    setCurrentUrl(url);
    authReturnPending.current = false;
    setCanGoBack(false);
    setCanGoForward(false);
    setLoading(true);
    setVisible(true);
  };

  const shouldStartLoad = useCallback((request: WebViewNavigation) => {
    // B2C returns to "/" with the MSAL response in the hash. Remember that so
    // we can restore the selected route after MSAL has consumed the response.
    if (isSiteRoot(request.url) && hasMsalResponse(request.url)) {
      authReturnPending.current = true;
    }
    return true;
  }, []);

  const handleLoadEnd = useCallback(
    (event: { nativeEvent: { url: string } }) => {
      setLoading(false);
      if (!authReturnPending.current || !isSiteRoot(event.nativeEvent.url)) return;

      authReturnPending.current = false;
      clearRestoreTimer();
      restoreTimer.current = setTimeout(() => {
        restoreTimer.current = null;
        webViewRef.current?.reload();
      }, 1200);
    },
    [clearRestoreTimer],
  );

  const handleNavigationStateChange = useCallback((nav: WebViewNavigation) => {
    setCanGoBack(nav.canGoBack);
    setCanGoForward(nav.canGoForward);
  }, []);

  const handleOpenWindow = useCallback((event: { nativeEvent: { targetUrl?: string } }) => {
    const targetUrl = event.nativeEvent.targetUrl;
    if (!targetUrl) return;
    if (isSiteRoot(targetUrl) && hasMsalResponse(targetUrl)) {
      authReturnPending.current = true;
    }
    setCurrentUrl(targetUrl);
  }, []);

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
        onRequestClose={() => {
          if (canGoBack) webViewRef.current?.goBack();
          else close();
        }}>
        <ThemedView style={styles.container}>
          <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
            <View style={styles.bar}>
              <Pressable onPress={close} hitSlop={8}>
                <ThemedText type="link">{t('Close')}</ThemedText>
              </Pressable>
              <View style={styles.navGroup}>
                <Pressable
                  onPress={() => webViewRef.current?.goBack()}
                  disabled={!canGoBack}
                  hitSlop={8}
                  style={!canGoBack && styles.disabled}>
                  <ThemedText type="small">{t('← Back')}</ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => webViewRef.current?.goForward()}
                  disabled={!canGoForward}
                  hitSlop={8}
                  style={!canGoForward && styles.disabled}>
                  <ThemedText type="small">{t('Forward →')}</ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => webViewRef.current?.reload()}
                  hitSlop={8}>
                  <ThemedText type="small">{t('Reload')}</ThemedText>
                </Pressable>
                <Pressable onPress={() => webViewRef.current?.reload()} hitSlop={8}>
                  <ThemedText type="small">{t('Route')}</ThemedText>
                </Pressable>
              </View>
            </View>

            <WebView
              ref={webViewRef}
              source={{ uri: currentUrl }}
              style={[styles.webview, { backgroundColor: theme.background }]}
              javaScriptEnabled
              domStorageEnabled
              cacheEnabled
              incognito={false}
              sharedCookiesEnabled
              thirdPartyCookiesEnabled
              allowsFullscreenVideo
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              setSupportMultipleWindows={false}
              injectedJavaScriptBeforeContentLoaded={SAME_WINDOW_POPUP_PATCH}
              injectedJavaScript={injectedJavaScript}
              onMessage={() => {}}
              onLoadStart={() => setLoading(true)}
              onLoadEnd={handleLoadEnd}
              onShouldStartLoadWithRequest={shouldStartLoad}
              onNavigationStateChange={handleNavigationStateChange}
              onOpenWindow={handleOpenWindow}
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
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  navGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: Spacing.three,
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
  disabled: {
    opacity: 0.35,
  },
  pressed: {
    opacity: 0.7,
  },
});
