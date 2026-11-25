import { useLocales } from 'expo-localization';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { resolveLocale, translatorFor, type AppLocale } from '@/lib/i18n';

type LocaleContextValue = {
  locale: AppLocale;
  t: (key: string, options?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue>({
  locale: 'en',
  t: translatorFor('en'),
});

/** Keeps translations in sync with the device/per-app locale selected in system settings. */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const locales = useLocales();
  const locale = resolveLocale(locales[0]?.languageCode);

  const value = useMemo<LocaleContextValue>(() => ({ locale, t: translatorFor(locale) }), [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n() {
  return useContext(LocaleContext);
}
