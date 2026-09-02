/**
 * Verification Suite: i18n Foundation (Phase 1)
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  vi,
  en,
  translate,
  interpolate,
  isLocale,
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  setCurrentLocale,
  getCurrentLocale,
  tm,
} from '../shared/i18n/index.ts';
import { SettingsStore, DEFAULT_SETTINGS } from '../electron/settings-store.ts';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ FAILED: ${message}`);
    failed++;
    throw new Error(message);
  } else {
    console.log(`  ✓ PASSED: ${message}`);
    passed++;
  }
}

console.log('=== Starting i18n Foundation Verification Suite (Phase 1) ===\n');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-i18n-test-'));
const testSettingsPath = path.join(tempDir, 'settings.json');

try {
  // ----------------------------------------------------
  // Test 1: Key parity between vi and en dictionaries
  // ----------------------------------------------------
  console.log('[Test 1] Key parity between vi and en dictionaries');
  {
    const viKeys = Object.keys(vi).sort();
    const enKeys = Object.keys(en).sort();

    assert(viKeys.length > 0, `vi dictionary has keys (count: ${viKeys.length})`);
    assert(enKeys.length > 0, `en dictionary has keys (count: ${enKeys.length})`);
    assert(viKeys.length === enKeys.length, `Key counts match (${viKeys.length} vs ${enKeys.length})`);

    const missingInEn = viKeys.filter((k) => !(k in en));
    const extraInEn = enKeys.filter((k) => !(k in vi));

    assert(missingInEn.length === 0, `No keys missing in en: ${missingInEn.join(', ')}`);
    assert(extraInEn.length === 0, `No extra keys in en: ${extraInEn.join(', ')}`);

    for (const key of viKeys) {
      assert(typeof vi[key] === 'string' && vi[key].length > 0, `vi['${key}'] is non-empty string`);
      assert(typeof en[key] === 'string' && en[key].length > 0, `en['${key}'] is non-empty string`);
    }
  }

  // ----------------------------------------------------
  // Test 2: Interpolation engine
  // ----------------------------------------------------
  console.log('\n[Test 2] Interpolation engine');
  {
    assert(
      interpolate('Xin chào {name}!', { name: 'OMP' }) === 'Xin chào OMP!',
      'Single string interpolation works',
    );
    assert(
      interpolate('Thao tác quá thời gian {timeout}s trên {host}', { timeout: 30, host: 'localhost' }) ===
        'Thao tác quá thời gian 30s trên localhost',
      'Multiple string & number interpolation works',
    );
    assert(
      interpolate('Không có biến ở đây') === 'Không có biến ở đây',
      'Template without params remains unchanged',
    );
    assert(
      interpolate('Thiếu biến {missing}', { other: 123 }) === 'Thiếu biến {missing}',
      'Unsupplied variable token preserved verbatim',
    );
  }

  // ----------------------------------------------------
  // Test 3: Translation and Fallback logic
  // ----------------------------------------------------
  console.log('\n[Test 3] Translation and Fallback logic');
  {
    assert(DEFAULT_LOCALE === 'vi', 'Default locale is vi');
    assert(SUPPORTED_LOCALES.includes('vi') && SUPPORTED_LOCALES.includes('en'), 'Supported locales include vi and en');
    assert(isLocale('vi') === true, 'isLocale identifies vi');
    assert(isLocale('en') === true, 'isLocale identifies en');
    assert(isLocale('fr') === false, 'isLocale rejects fr');
    assert(isLocale(null) === false, 'isLocale rejects null');

    const viTitle = translate('vi', 'settings.title');
    assert(viTitle === 'Cài đặt', `translate vi returns Vietnamese (${viTitle})`);

    const enTitle = translate('en', 'settings.title');
    assert(enTitle === 'Settings', `translate en returns English (${enTitle})`);

    const interpolated = translate('vi', 'common.error.timeout', { timeout: 15 });
    assert(interpolated.includes('15s'), `translate applies interpolation (${interpolated})`);

    // Unknown key fallback
    const unknownKey = 'non.existent.key.xyz';
    const fallbackKey = translate('en', unknownKey);
    assert(fallbackKey === unknownKey, 'Non-existent key returns key itself');
  }

  // ----------------------------------------------------
  // Test 4: Module-level locale state & tm() helper
  // ----------------------------------------------------
  console.log('\n[Test 4] Module-level locale state & tm() helper');
  {
    setCurrentLocale('vi');
    assert(getCurrentLocale() === 'vi', 'Current locale set to vi');
    assert(tm('settings.title') === 'Cài đặt', 'tm returns vi text');

    setCurrentLocale('en');
    assert(getCurrentLocale() === 'en', 'Current locale set to en');
    assert(tm('settings.title') === 'Settings', 'tm returns en text');

    // Invalid locale should be ignored
    setCurrentLocale('invalid_locale');
    assert(getCurrentLocale() === 'en', 'Invalid locale rejected, preserved current en');

    // Reset back to vi
    setCurrentLocale('vi');
    assert(getCurrentLocale() === 'vi', 'Reset back to vi');
  }

  // ----------------------------------------------------
  // Test 5: SettingsStore language persistence & sanitization
  // ----------------------------------------------------
  console.log('\n[Test 5] SettingsStore language persistence & sanitization');
  {
    assert(DEFAULT_SETTINGS.language === 'vi', 'DEFAULT_SETTINGS has language vi');

    const store = new SettingsStore(testSettingsPath);
    const initial = store.get();
    assert(initial.language === 'vi', 'Initial store language is vi');

    // Update language to en
    const updated = store.set({ language: 'en' });
    assert(updated.language === 'en', 'store.set updated language to en');

    // Reload from disk
    const diskStore = new SettingsStore(testSettingsPath);
    assert(diskStore.get().language === 'en', 'Persisted language on disk is en');

    // Sanitize rejects invalid languages
    const sanitized1 = store.set({ language: 'invalid' });
    assert(sanitized1.language === 'en', 'Invalid language rejected, preserves en');

    const sanitized2 = store.set({ language: 'vi' });
    assert(sanitized2.language === 'vi', 'Switch back to vi succeeds');
  }

  console.log(`\n====================================================`);
  console.log(`i18n Foundation Verification: ${passed} passed, ${failed} failed.`);
  console.log(`====================================================\n`);
} finally {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}
}
