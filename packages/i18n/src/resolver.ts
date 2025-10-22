import type { JsonValue, Simplify } from "type-fest";
import type { TranslationResolver } from "./client";

type TranslationModule = { default?: JsonValue } & Record<string, JsonValue>;
type TranslationLoader = () => Promise<TranslationModule>;

type CreateTranslationResolverOptions = Simplify<{
  /**
   * Custom path matcher to extract language/namespace from module path.
   * Must provide two capture groups for language and namespace respectively.
   */
  pathMatcher?: RegExp;
  /**
   * Callback invoked when translation file is missing.
   */
  onMissing?(language: string, namespace: string): void;
  /**
   * Callback invoked when translation file fails to load.
   */
  onLoadError?(language: string, namespace: string, error: unknown): void;
}>;

type TranslationManifest = Record<string, Record<string, TranslationLoader>>;

function buildManifest(
  modules: Record<string, TranslationLoader>,
  matcher: RegExp,
): TranslationManifest {
  return Object.entries(modules).reduce<TranslationManifest>((acc, [path, loader]) => {
    const match = matcher.exec(path);
    if (!match) return acc;

    const [, language, namespace] = match;
    if (!language || !namespace) return acc;

    const languageAcc = acc[language];
    if (languageAcc) {
      languageAcc[namespace] = loader;
    } else {
      acc[language] = { [namespace]: loader };
    }
    return acc;
  }, {});
}

export function createTranslationResolver(
  modules: Record<string, TranslationLoader>,
  options: CreateTranslationResolverOptions = {},
): TranslationResolver {
  const matcher = options.pathMatcher ?? /locales\/([^/]+)\/([^/]+)\.json$/;
  const manifest = buildManifest(modules, matcher);

  return async (language, namespace) => {
    const loader = manifest[language]?.[namespace];

    if (!loader) {
      options.onMissing?.(language, namespace);
      return {};
    }

    try {
      const data = await loader();
      return data.default ?? (data as JsonValue);
    } catch (error) {
      options.onLoadError?.(language, namespace, error);
      return {};
    }
  };
}
