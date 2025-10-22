import type { i18n as I18nInstance, InitOptions, ResourceKey } from "i18next";
import i18next, { createInstance } from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import resourcesToBackend from "i18next-resources-to-backend";
import { initReactI18next } from "react-i18next";
import type { JsonValue, Promisable, Simplify } from "type-fest";

/**
 * Translation resolver function type
 * Dynamically loads translation files based on language and namespace
 * @param language - The language code (e.g., 'en', 'zh')
 * @param namespace - The namespace (e.g., 'common', 'home')
 * @returns A promise that resolves to the translation data
 */
export type TranslationResolver = (language: string, namespace: string) => Promise<JsonValue>;

/**
 * Callback function to sync language changes with external libraries
 * Can be synchronous or asynchronous
 * @param langKey - The language key that was changed to
 */
export type LanguageSyncCallback = (langKey: string) => Promisable<void>;

/**
 * Initialize i18n for client-side usage
 * @param config - i18next configuration
 * @param resolver - Optional resolver function for lazy loading translations
 * @param syncCallback - Optional callback to sync language changes (e.g., with dayjs)
 * @returns The initialized i18n instance
 */
type InitializeI18nOptions = Simplify<{
  /**
   * Target i18n instance. Defaults to the shared singleton.
   */
  instance?: I18nInstance;
  /**
   * Whether to register the browser language detector.
   * Defaults to true in the browser and false on the server.
   */
  enableBrowserLanguageDetection?: boolean;
}>;

const BACKEND_ATTACHED = Symbol.for("raypx.i18n.backendAttached");
const DETECTOR_ATTACHED = Symbol.for("raypx.i18n.detectorAttached");
const REACT_ATTACHED = Symbol.for("raypx.i18n.reactAttached");
const SYNC_HANDLER = Symbol.for("raypx.i18n.syncHandler");

const isBrowser = typeof window !== "undefined";

function attachResolver(instance: I18nInstance, resolver: TranslationResolver | undefined) {
  if (!resolver) return;
  const marker = instance as unknown as Record<symbol, boolean>;
  if (marker[BACKEND_ATTACHED]) return;

  instance.use(
    resourcesToBackend(async (language, namespace, callback) => {
      try {
        const data = await resolver(language, namespace);
        callback(null, data as ResourceKey);
      } catch (error) {
        console.error(`Error loading translation: ${language}/${namespace}`, error);
        callback(error as Error, null);
      }
    }),
  );

  marker[BACKEND_ATTACHED] = true;
}

function attachLanguageDetector(instance: I18nInstance, shouldAttach: boolean) {
  if (!shouldAttach) return;
  const marker = instance as unknown as Record<symbol, boolean>;
  if (marker[DETECTOR_ATTACHED]) return;

  instance.use(LanguageDetector);
  marker[DETECTOR_ATTACHED] = true;
}

function attachReactPlugin(instance: I18nInstance) {
  const marker = instance as unknown as Record<symbol, boolean>;
  if (marker[REACT_ATTACHED]) return;

  instance.use(initReactI18next);
  marker[REACT_ATTACHED] = true;
}

function applyLanguageSync(instance: I18nInstance, syncCallback?: LanguageSyncCallback) {
  if (!syncCallback) return;

  const marker = instance as unknown as Record<symbol, ((lang: string) => void) | undefined>;
  const handler = (langKey: string) => {
    try {
      const result = syncCallback(langKey);
      if (result instanceof Promise) {
        result.catch((error) => {
          console.error("Error in sync callback:", error);
        });
      }
    } catch (error) {
      console.error("Error in sync callback:", error);
    }
  };

  if (marker[SYNC_HANDLER]) {
    instance.off("languageChanged", marker[SYNC_HANDLER]);
  }

  instance.on("languageChanged", handler);
  marker[SYNC_HANDLER] = handler;

  const initialLanguage = instance.language || instance.options.lng;
  if (initialLanguage) {
    handler(initialLanguage);
  } else {
    instance.on("initialized", () => {
      if (instance.language) {
        handler(instance.language);
      }
    });
  }
}

async function setupInstance(
  instance: I18nInstance,
  config: InitOptions,
  resolver?: TranslationResolver,
  syncCallback?: LanguageSyncCallback,
  enableBrowserLanguageDetection = isBrowser,
) {
  attachResolver(instance, resolver);
  attachLanguageDetector(instance, enableBrowserLanguageDetection && isBrowser);
  attachReactPlugin(instance);
  applyLanguageSync(instance, syncCallback);

  if (!instance.isInitialized) {
    await instance.init(config);
    return instance;
  }

  if (config.lng && instance.language !== config.lng) {
    await instance.changeLanguage(config.lng);
  }

  return instance;
}

export function initializeI18n(
  config: InitOptions,
  resolver?: TranslationResolver,
  syncCallback?: LanguageSyncCallback,
  options?: InitializeI18nOptions,
) {
  const instance = options?.instance ?? i18next;
  const enableDetector = options?.enableBrowserLanguageDetection ?? isBrowser;

  void setupInstance(instance, config, resolver, syncCallback, enableDetector).catch((error) => {
    console.error("Failed to initialize i18n instance:", error);
  });

  return instance;
}

export async function createI18nInstance(
  config: InitOptions,
  resolver?: TranslationResolver,
  syncCallback?: LanguageSyncCallback,
  options?: Omit<InitializeI18nOptions, "instance">,
): Promise<I18nInstance> {
  const instance = createInstance();
  await setupInstance(
    instance,
    config,
    resolver,
    syncCallback,
    options?.enableBrowserLanguageDetection ?? false,
  );
  return instance;
}

export type CreateScopedI18nOptions = Simplify<{
  config: InitOptions;
  language: string;
  namespaces?: string[];
  resolver?: TranslationResolver;
  syncCallback?: LanguageSyncCallback;
  enableBrowserLanguageDetection?: boolean;
}>;

export async function createScopedI18n({
  config,
  language,
  namespaces = [],
  resolver,
  syncCallback,
  enableBrowserLanguageDetection = false,
}: CreateScopedI18nOptions): Promise<I18nInstance> {
  const instance = await createI18nInstance({ ...config, lng: language }, resolver, syncCallback, {
    enableBrowserLanguageDetection,
  });

  if (namespaces.length > 0) {
    await instance.loadNamespaces(namespaces);
  }

  return instance;
}

export default i18next;
