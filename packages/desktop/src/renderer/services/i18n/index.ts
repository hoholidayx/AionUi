import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { configService } from '@/common/config/configService';
import i18nConfig from '@/common/config/i18n-config.json';
import {
  DEFAULT_LANGUAGE,
  normalizeLanguageCode,
  mergeWithFallback,
  ensureAndSwitch,
  type SupportedLanguage,
} from '@/common/config/i18n';
import { applyDocumentDirection } from './direction';

import fallbackLocale from './locales/en-US/index';
export type { I18nKey, I18nModule } from './i18n-keys';

// Re-exports
export { normalizeLanguageCode } from '@/common/config/i18n';
export type { SupportedLanguage } from '@/common/config/i18n';

export const supportedLanguages = i18nConfig.supportedLanguages;

const localeLoaders = import.meta.glob<Record<string, unknown>>(['./locales/*/index.ts', '!./locales/en-US/index.ts'], {
  import: 'default',
});
const loadedTranslations = new Map<string, Record<string, unknown>>([[DEFAULT_LANGUAGE, fallbackLocale]]);
const isWebBuild = import.meta.env.MODE === 'web';

function getLocalStorageLanguageHint(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem('i18nextLng');
}

function getInjectedLanguageHint(): string | null {
  if (typeof window === 'undefined') return null;
  const language = window.__initialLanguage;
  return typeof language === 'string' && language.trim() !== '' ? language : null;
}

function getElectronSystemLanguageHint(): string | null {
  if (typeof window === 'undefined' || !window.electronAPI) return null;
  return navigator.language || null;
}

function getInitialLanguage(): SupportedLanguage {
  const backendStartupFailed =
    typeof window !== 'undefined' && (window as Window & { __backendStartupFailed?: boolean }).__backendStartupFailed;
  const localStorageLanguage = getLocalStorageLanguageHint();
  const injectedLanguage = getInjectedLanguageHint();
  const systemLanguage = backendStartupFailed ? getElectronSystemLanguageHint() : null;
  const hint = backendStartupFailed
    ? injectedLanguage || localStorageLanguage || systemLanguage
    : localStorageLanguage || injectedLanguage;
  return normalizeLanguageCode(hint || (isWebBuild ? navigator.language : DEFAULT_LANGUAGE));
}

async function loadLocaleModules(locale: string): Promise<Record<string, unknown>> {
  const normalized = normalizeLanguageCode(locale);
  const cached = loadedTranslations.get(normalized);
  if (cached) return cached;

  const load = localeLoaders[`./locales/${normalized}/index.ts`];
  const modules = load ? mergeWithFallback(fallbackLocale, await load()) : fallbackLocale;
  loadedTranslations.set(normalized, modules);
  return modules;
}

const initialLanguage = getInitialLanguage();
export const i18nReady = i18n
  .use(initReactI18next)
  .init({
    resources: { [DEFAULT_LANGUAGE]: { translation: fallbackLocale } },
    lng: DEFAULT_LANGUAGE,
    fallbackLng: DEFAULT_LANGUAGE,
    debug: false,
    interpolation: { escapeValue: false },
  })
  .then(() => ensureAndSwitch(i18n, initialLanguage, loadLocaleModules))
  .catch((error: unknown) => {
    console.error('Failed to initialize language:', error);
  });

// Load initial language from configService (single source of truth).
// Wait until configService.whenReady() so we observe the authoritative value
// fetched from the backend rather than the empty cache that exists during
// module load.
export async function syncConfiguredLanguage(): Promise<void> {
  try {
    await i18nReady;
    await configService.whenReady();
    const savedLanguage = configService.get('language');
    const language = savedLanguage || (isWebBuild ? getInitialLanguage() : normalizeLanguageCode(navigator.language));
    await ensureAndSwitch(i18n, language, loadLocaleModules);
    // Sync to localStorage so next page load can use it as a fast hint
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('i18nextLng', normalizeLanguageCode(language));
    }
  } catch (error) {
    console.error('Failed to initialize language:', error);
  }
}

i18n.on('languageChanged', applyDocumentDirection);
applyDocumentDirection(initialLanguage);

export function subscribeToLanguageChanges(): () => void {
  let active = true;
  let unsubscribe: (() => void) | undefined;
  void import('@/common').then(({ ipcBridge }) => {
    if (!active) return;
    unsubscribe = ipcBridge.systemSettings.languageChanged.on(async ({ language }) => {
      const normalized = normalizeLanguageCode(language);
      if (i18n.language === normalized) return;
      try {
        await ensureAndSwitch(i18n, normalized, loadLocaleModules);
        localStorage.setItem('i18nextLng', normalized);
      } catch (error) {
        console.error('Failed to load language:', error);
      }
    });
  });
  return () => {
    active = false;
    unsubscribe?.();
  };
}

if (!isWebBuild) {
  void syncConfiguredLanguage();
  subscribeToLanguageChanges();
}

export async function changeLanguage(lang: string, persist = true): Promise<void> {
  const normalized = normalizeLanguageCode(lang);
  await ensureAndSwitch(i18n, normalized, loadLocaleModules);
  localStorage.setItem('i18nextLng', normalized);
  if (!persist) return;
  await configService.set('language', normalized);
  const { ipcBridge } = await import('@/common');
  ipcBridge.systemSettings.changeLanguage.invoke({ language: normalized }).catch(() => {});
}

// Clear translation cache (useful for development/testing)
export function clearTranslationCache(): void {
  loadedTranslations.clear();
}

// Get loaded languages
export function getLoadedLanguages(): string[] {
  return Array.from(loadedTranslations.keys());
}

export default i18n;
