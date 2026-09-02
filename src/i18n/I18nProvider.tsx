import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  DEFAULT_LOCALE,
  isLocale,
  translate,
  type Locale,
  type I18nKey,
} from '../../shared/i18n/index.ts';

export interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: I18nKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (key: I18nKey, params?: Record<string, string | number>) => translate(DEFAULT_LOCALE, key, params),
});

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const initLocale = async () => {
      try {
        if (window.electronAPI?.getSettings) {
          const settings = await window.electronAPI.getSettings();
          if (settings?.language && isLocale(settings.language)) {
            setLocaleState(settings.language);
          }
        } else {
          const raw = localStorage.getItem('omp_settings');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed?.language && isLocale(parsed.language)) {
              setLocaleState(parsed.language);
            }
          }
        }
      } catch (err) {
        console.warn('[I18nProvider] Không thể nạp ngôn ngữ ban đầu:', err);
      }
    };
    initLocale();
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    if (!isLocale(newLocale)) return;
    setLocaleState(newLocale);

    if (window.electronAPI?.setSettings) {
      window.electronAPI.setSettings({ language: newLocale }).catch((err) => {
        console.error('[I18nProvider] Lỗi lưu language vào settings-store:', err);
      });
    } else {
      try {
        const raw = localStorage.getItem('omp_settings');
        const parsed = raw ? JSON.parse(raw) : {};
        localStorage.setItem('omp_settings', JSON.stringify({ ...parsed, language: newLocale }));
      } catch {}
    }
  }, []);

  const t = useCallback(
    (key: I18nKey, params?: Record<string, string | number>) => {
      return translate(locale, key, params);
    },
    [locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t,
    }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = (): I18nContextValue => useContext(I18nContext);
export const useT = (): ((key: I18nKey, params?: Record<string, string | number>) => string) => {
  const { t } = useContext(I18nContext);
  return t;
};
