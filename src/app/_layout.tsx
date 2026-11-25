import { DarkTheme, DefaultTheme, router, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { addFreeriderNotificationOpenListener } from '@/lib/freerider-push';
import { LocaleProvider } from '@/providers/locale-provider';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();

  useEffect(
    () =>
      addFreeriderNotificationOpenListener(() => {
        router.push('/freerider');
      }),
    [],
  );

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <LocaleProvider>
        <AnimatedSplashOverlay />
        <AppTabs />
      </LocaleProvider>
    </ThemeProvider>
  );
}
