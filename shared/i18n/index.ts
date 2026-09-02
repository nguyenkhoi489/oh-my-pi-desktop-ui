import { vi, type I18nKey } from './vi.ts';
import { en } from './en.ts';

export type Locale = 'vi' | 'en';
export const DEFAULT_LOCALE: Locale = 'vi';
export const SUPPORTED_LOCALES: readonly Locale[] = ['vi', 'en'] as const;

export { vi, en, type I18nKey };

const dictionaries: Record<Locale, Record<string, string>> = {
  vi,
  en,
};

const warnedMissingKeys = new Set<string>();

export function isLocale(value: unknown): value is Locale {
  return value === 'vi' || value === 'en';
}

export function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{([a-zA-Z0-9_-]+)\}/g, (match, key) => {
    if (key in params && params[key] !== undefined && params[key] !== null) {
      return String(params[key]);
    }
    return match;
  });
}

export function translate(
  locale: Locale,
  key: I18nKey,
  params?: Record<string, string | number>,
): string {
  const targetDict = dictionaries[locale] || dictionaries[DEFAULT_LOCALE];
  let template = targetDict ? targetDict[key] : undefined;

  if (template === undefined) {
    if (locale !== DEFAULT_LOCALE) {
      const warnId = `${locale}:${key}`;
      if (!warnedMissingKeys.has(warnId)) {
        warnedMissingKeys.add(warnId);
        console.warn(
          `[i18n] Missing translation for key "${key}" in locale "${locale}". Falling back to "${DEFAULT_LOCALE}".`,
        );
      }
    }
    template = dictionaries[DEFAULT_LOCALE] ? dictionaries[DEFAULT_LOCALE][key] : undefined;
  }

  if (template === undefined) {
    return key;
  }

  return interpolate(template, params);
}

// Module-level locale state for Electron Main process and scripts
let currentLocale: Locale = DEFAULT_LOCALE;

export function setCurrentLocale(locale: Locale): void {
  if (isLocale(locale)) {
    currentLocale = locale;
  }
}

export function getCurrentLocale(): Locale {
  return currentLocale;
}

export function tm(key: I18nKey, params?: Record<string, string | number>): string {
  return translate(currentLocale, key, params);
}
