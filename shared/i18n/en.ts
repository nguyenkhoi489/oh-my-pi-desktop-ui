import type { I18nKey } from './vi.ts';

export const en: Record<I18nKey, string> = {
  'settings.title': 'Settings',
  'settings.desc': 'Customize interface, engine, and manage LLM Providers',
  'settings.close': 'Close (ESC)',
  'settings.tab.general': 'General',
  'settings.tab.engine': 'Engine & Launch',
  'settings.tab.providers': 'Providers & Custom LLM',

  // Settings - General Tab
  'settings.theme.title': 'Appearance Theme',
  'settings.theme.light': 'Light Theme',
  'settings.theme.light.desc': 'Clean light palette with high contrast',
  'settings.theme.dark': 'Dark Theme',
  'settings.theme.dark.desc': 'Dark slate palette, Codex style',

  // Settings - Language
  'settings.language.title': 'Display Language',
  'settings.language.desc': 'Select interface language for OMP Desktop and system notifications',
  'settings.language.vi': 'Tiếng Việt (Vietnamese)',
  'settings.language.vi.desc': 'Default Vietnamese interface',
  'settings.language.en': 'English',
  'settings.language.en.desc': 'English interface for OMP Desktop',

  // Common UI actions & states
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.retry': 'Retry',
  'common.loading': 'Loading...',
  'common.success': 'Success',
  'common.error': 'Error',
  'common.error.generic': 'An unexpected error occurred',
  'common.error.timeout': 'Operation timed out ({timeout}s)',
  'common.error.network': 'Cannot connect to host ({host})',
  'common.confirm': 'Confirm',
  'common.search': 'Search...',
  'common.copy': 'Copy',
  'common.copied': 'Copied',
};
