"use client";

import { Link as TanStackLink, useRouter, useRouterState } from "@tanstack/react-router";
import type { AnchorHTMLAttributes, ForwardedRef, ReactNode } from "react";
import { forwardRef, useCallback, useMemo } from "react";

type Primitive = string | number | boolean | null | undefined;
type SearchValue = Primitive | Primitive[];

export type LinkHrefObject = {
  pathname: string;
  query?: Record<string, SearchValue>;
  search?: string | URLSearchParams;
  hash?: string;
  locale?: string;
  preserveSearch?: boolean;
  preserveHash?: boolean;
};

type LinkSharedProps = {
  href: string | LinkHrefObject;
  external?: boolean;
  locale?: string;
  defaultLocale?: string;
  localePrefix?: "always" | "as-needed" | "never";
  disableLocale?: boolean;
  preserveSearch?: boolean;
  preserveHash?: boolean;
  className?: string;
  children: ReactNode;
};

export type LinkProps = LinkSharedProps & Record<string, unknown>;

type InternalDescriptor = Required<Pick<LinkHrefObject, "pathname">> &
  Omit<LinkHrefObject, "pathname">;

type NormalizedHref = {
  href: string;
  descriptor?: InternalDescriptor;
  isExternal: boolean;
};

const EXTERNAL_URL = /^(?:[a-z][a-z0-9+.+-]*:|\/\/)/i;

const runtimeWindow = typeof window !== "undefined" ? window : undefined;
const runtimeDocument = typeof document !== "undefined" ? document : undefined;
const runtimeNavigator = typeof navigator !== "undefined" ? navigator : undefined;

const ensurePath = (value: string): string => {
  if (!value) return "/";
  const trimmed = value.trim();
  if (!trimmed) return "/";
  const leading = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return leading.replace(/\/{2,}/g, "/") || "/";
};

const ensureHash = (value?: string): string => {
  if (!value) return "";
  return value.startsWith("#") ? value : `#${value}`;
};

const isExternal = (value: string): boolean => EXTERNAL_URL.test(value);

const inferRuntimeLocale = (): string | undefined => {
  const docLocale =
    runtimeDocument?.documentElement.getAttribute("lang") ||
    runtimeDocument?.documentElement.dataset?.locale;
  return docLocale ?? runtimeNavigator?.language ?? undefined;
};

const mergeSearchParams = (
  target: URLSearchParams,
  input?: string | URLSearchParams,
  options: { replace?: boolean } = {},
) => {
  if (!input) return;
  const replace = options.replace ?? false;
  const source =
    typeof input === "string"
      ? new URLSearchParams(input.startsWith("?") ? input.slice(1) : input)
      : input;
  if (replace) {
    for (const key of new Set(source.keys())) {
      target.delete(key);
    }
  }
  source.forEach((value, key) => {
    target.append(key, value);
  });
};

const applyQuery = (params: URLSearchParams, query?: Record<string, SearchValue>) => {
  if (!query) return;
  for (const [key, value] of Object.entries(query)) {
    params.delete(key);
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === null || item === undefined) continue;
        params.append(key, String(item));
      }
      continue;
    }
    if (value === null || value === undefined) continue;
    if (typeof value === "boolean") {
      params.append(key, value ? "true" : "false");
    } else {
      params.append(key, String(value));
    }
  }
};

const buildSearch = (descriptor: InternalDescriptor, fallbackPreserve?: boolean): string => {
  const params = new URLSearchParams();

  if (descriptor.preserveSearch ?? fallbackPreserve) {
    mergeSearchParams(params, runtimeWindow?.location.search, { replace: false });
  }

  mergeSearchParams(params, descriptor.search, { replace: true });
  applyQuery(params, descriptor.query);

  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
};

const buildHash = (descriptor: InternalDescriptor, fallbackPreserve?: boolean): string => {
  const hash = ensureHash(descriptor.hash);
  if (hash) return hash;
  if (descriptor.preserveHash ?? fallbackPreserve) {
    return ensureHash(runtimeWindow?.location.hash);
  }
  return "";
};

const pathHasLocale = (pathname: string, locale: string): boolean => {
  if (!locale) return false;
  if (!pathname.startsWith("/")) return false;
  const [segment] = pathname.slice(1).split("/");
  return (segment ?? "").toLowerCase() === locale.toLowerCase();
};

const withLocale = (
  pathname: string,
  descriptor: InternalDescriptor,
  options: {
    locale?: string;
    defaultLocale?: string;
    localePrefix: "always" | "as-needed" | "never";
    disableLocale?: boolean;
  },
): string => {
  const { localePrefix, disableLocale } = options;
  const locale = (options.locale ?? descriptor.locale)?.trim();
  if (!locale || disableLocale || localePrefix === "never") {
    return pathname;
  }

  const defaultLocale = options.defaultLocale?.toLowerCase();
  if (localePrefix === "as-needed" && defaultLocale === locale.toLowerCase()) {
    return pathname;
  }

  if (pathHasLocale(pathname, locale)) {
    return pathname;
  }

  return pathname === "/" ? `/${locale}` : `/${locale}${pathname}`;
};

type BuildHrefResult = {
  href: string;
  pathname: string;
  search: string;
  hash: string;
};

const buildInternalHref = (
  descriptor: InternalDescriptor,
  options: {
    locale?: string;
    defaultLocale?: string;
    localePrefix: "always" | "as-needed" | "never";
    disableLocale?: boolean;
    preserveSearch?: boolean;
    preserveHash?: boolean;
  },
): BuildHrefResult => {
  const pathname = withLocale(ensurePath(descriptor.pathname), descriptor, options);
  const search = buildSearch(descriptor, options.preserveSearch);
  const hash = buildHash(descriptor, options.preserveHash);
  return {
    href: `${pathname}${search}${hash}`,
    pathname,
    search,
    hash,
  };
};

const isLocaleParamSegment = (segment: string, localeParamKey: string): boolean => {
  if (!segment) return false;

  let candidate = segment;

  if (candidate.startsWith("...")) {
    candidate = candidate.slice(3);
  }

  if (!candidate.startsWith("$")) {
    return false;
  }

  candidate = candidate.slice(1);

  if (candidate.endsWith("?")) {
    candidate = candidate.slice(0, -1);
  }

  return candidate === localeParamKey;
};

const applyLocaleParamToPathname = (
  pathname: string,
  locale: string | undefined,
  localeParamKey: string,
): { pathname: string; params?: Record<string, string> } => {
  if (!locale) {
    return { pathname };
  }

  const segments = pathname.split("/");
  let replaced = false;

  const nextSegments = segments.map((segment, index) => {
    if (index === 0 && segment === "") {
      return segment;
    }

    if (isLocaleParamSegment(segment, localeParamKey)) {
      replaced = true;
      return locale;
    }

    return segment;
  });

  if (!replaced) {
    return { pathname };
  }

  const nextPath = ensurePath(nextSegments.join("/"));
  return {
    pathname: nextPath,
    params: { [localeParamKey]: locale },
  };
};

const normalizeHref = (href: string | LinkHrefObject): NormalizedHref => {
  if (typeof href === "string") {
    if (isExternal(href)) {
      return { href, isExternal: true };
    }
    const base = runtimeWindow?.location.origin ?? "http://localhost";
    let candidate: URL;
    try {
      candidate = new URL(href, base);
    } catch {
      candidate = new URL(ensurePath(href), base);
    }
    return {
      href: candidate.href,
      descriptor: {
        pathname: candidate.pathname || "/",
        search: candidate.search || "",
        hash: candidate.hash || "",
      },
      isExternal: false,
    };
  }

  if (isExternal(href.pathname)) {
    return { href: href.pathname, isExternal: true };
  }

  return {
    href: href.pathname,
    descriptor: {
      pathname: href.pathname,
      query: href.query,
      search: typeof href.search === "string" ? href.search : href.search?.toString(),
      hash: href.hash,
      locale: href.locale,
      preserveSearch: href.preserveSearch,
      preserveHash: href.preserveHash,
    },
    isExternal: false,
  };
};

export type LinkResolutionOptions = {
  href: string | LinkHrefObject;
  external?: boolean;
  locale?: string;
  defaultLocale?: string;
  localePrefix: "always" | "as-needed" | "never";
  localeParamKey: string;
  disableLocale?: boolean;
  preserveSearch?: boolean;
  preserveHash?: boolean;
};

export type ResolvedLink = {
  href: string;
  pathname?: string;
  params?: Record<string, string>;
  isExternal: boolean;
};

export const resolveLinkHref = ({
  href,
  external,
  locale,
  defaultLocale,
  localePrefix,
  localeParamKey,
  disableLocale,
  preserveSearch,
  preserveHash,
}: LinkResolutionOptions): ResolvedLink => {
  const normalized = normalizeHref(href);
  const treatAsExternal = external ?? normalized.isExternal;

  if (!normalized.descriptor) {
    return { href: normalized.href, isExternal: true };
  }

  const { pathname, params: placeholderParams } = applyLocaleParamToPathname(
    normalized.descriptor.pathname,
    disableLocale ? undefined : (locale ?? normalized.descriptor.locale),
    localeParamKey,
  );

  const descriptorForBuild: InternalDescriptor = {
    ...normalized.descriptor,
    pathname,
  };

  const { href: builtHref, pathname: builtPathname } = buildInternalHref(descriptorForBuild, {
    locale: locale ?? normalized.descriptor.locale,
    defaultLocale,
    localePrefix,
    disableLocale,
    preserveSearch,
    preserveHash,
  });

  return {
    href: builtHref,
    pathname: builtPathname,
    params: placeholderParams,
    isExternal: treatAsExternal,
  };
};

export type LinkConfig = {
  getLocale?: () => string | undefined;
  getDefaultLocale?: () => string | undefined;
  localePrefix?: "always" | "as-needed" | "never";
  localeParamKey?: string;
};

type ResolvedLinkConfig = {
  getLocale: () => string | undefined;
  getDefaultLocale: () => string | undefined;
  localePrefix: "always" | "as-needed" | "never";
  localeParamKey: string;
};

export const defaultLinkConfig: ResolvedLinkConfig = {
  getLocale: inferRuntimeLocale,
  getDefaultLocale: () => undefined,
  localePrefix: "as-needed",
  localeParamKey: "lang",
};

export function createLink(config: LinkConfig = {}) {
  const resolvedConfig: ResolvedLinkConfig = {
    getLocale: config.getLocale ?? defaultLinkConfig.getLocale,
    getDefaultLocale: config.getDefaultLocale ?? defaultLinkConfig.getDefaultLocale,
    localePrefix: config.localePrefix ?? defaultLinkConfig.localePrefix,
    localeParamKey: config.localeParamKey ?? defaultLinkConfig.localeParamKey,
  };

  const LinkComponent = forwardRef<HTMLAnchorElement, LinkProps>(
    (props, ref: ForwardedRef<HTMLAnchorElement>) => {
      const {
        href,
        external,
        className,
        children,
        locale,
        defaultLocale,
        localePrefix,
        disableLocale = false,
        preserveSearch,
        preserveHash,
        ...rest
      } = props as LinkSharedProps & Record<string, unknown>;

      const effectiveLocale = disableLocale ? undefined : (locale ?? resolvedConfig.getLocale());
      const effectiveDefaultLocale = defaultLocale ?? resolvedConfig.getDefaultLocale();
      const effectiveLocalePrefix = localePrefix ?? resolvedConfig.localePrefix;

      const restRecord = rest as Record<string, unknown>;

      const {
        href: resolvedHref,
        params: resolvedParams,
        isExternal,
      } = resolveLinkHref({
        href,
        external,
        locale: effectiveLocale,
        defaultLocale: effectiveDefaultLocale,
        localePrefix: effectiveLocalePrefix,
        localeParamKey: resolvedConfig.localeParamKey,
        disableLocale,
        preserveSearch,
        preserveHash,
      });

      if (isExternal) {
        const {
          activeOptions: _activeOptions,
          activeProps: _activeProps,
          inactiveProps: _inactiveProps,
          hashScrollIntoView: _hashScrollIntoView,
          preload: _preload,
          preloadDelay: _preloadDelay,
          resetScroll: _resetScroll,
          startTransition: _startTransition,
          viewTransition: _viewTransition,
          mask: _mask,
          params: _params,
          search: _search,
          hash: _hash,
          state: _state,
          from: _from,
          reloadDocument: _reloadDocument,
          unsafeRelative: _unsafeRelative,
          ignoreBlocker: _ignoreBlocker,
          _fromLocation,
          target: targetProp,
          rel: relProp,
          ...anchorRest
        } = restRecord;

        const anchorProps = anchorRest as AnchorHTMLAttributes<HTMLAnchorElement>;
        const target = typeof targetProp === "string" ? targetProp : "_blank";
        const rel =
          typeof relProp === "string"
            ? relProp
            : target === "_blank"
              ? "noopener noreferrer"
              : undefined;

        return (
          <a
            {...anchorProps}
            className={className}
            href={resolvedHref}
            ref={ref}
            rel={rel}
            target={target}
          >
            {children}
          </a>
        );
      }

      const { params: userParams, ...linkRest } = restRecord;
      const mergedParams =
        resolvedParams || (userParams && typeof userParams === "object")
          ? {
              ...(typeof userParams === "object" && userParams !== null
                ? (userParams as Record<string, unknown>)
                : {}),
              ...(resolvedParams ?? {}),
            }
          : undefined;

      return (
        <TanStackLink
          {...linkRest}
          className={className}
          params={mergedParams}
          ref={ref}
          to={resolvedHref}
        >
          {children}
        </TanStackLink>
      );
    },
  );

  LinkComponent.displayName = "Link";

  return LinkComponent;
}

export const Link = createLink();

type UseLocaleFn = () => string | undefined;

export type NavigationConfig = LinkConfig & {
  useLocale?: UseLocaleFn;
  useDefaultLocale?: UseLocaleFn;
};

export type NavigateOptions = {
  replace?: boolean;
  resetScroll?: boolean;
  state?: unknown;
  preserveSearch?: boolean;
  preserveHash?: boolean;
  disableLocale?: boolean;
  external?: boolean;
  locale?: string;
  defaultLocale?: string;
  localePrefix?: "always" | "as-needed" | "never";
  params?: Record<string, unknown>;
};

type RedirectOptions = Omit<NavigateOptions, "replace" | "state"> & {
  replace?: boolean;
};

const resolveNavigationHref = (
  input: LinkProps["href"],
  options: NavigateOptions | undefined,
  context: {
    locale?: string;
    defaultLocale?: string;
    localePrefix: "always" | "as-needed" | "never";
    localeParamKey: string;
  },
) =>
  resolveLinkHref({
    href: input,
    external: options?.external,
    locale: options?.disableLocale ? undefined : (options?.locale ?? context.locale),
    defaultLocale: options?.defaultLocale ?? context.defaultLocale,
    localePrefix: options?.localePrefix ?? context.localePrefix,
    localeParamKey: context.localeParamKey,
    disableLocale: options?.disableLocale,
    preserveSearch: options?.preserveSearch,
    preserveHash: options?.preserveHash,
  });

export function createNavigation(config: NavigationConfig = {}) {
  const resolvedLinkConfig: ResolvedLinkConfig = {
    getLocale: config.getLocale ?? defaultLinkConfig.getLocale,
    getDefaultLocale: config.getDefaultLocale ?? defaultLinkConfig.getDefaultLocale,
    localePrefix: config.localePrefix ?? defaultLinkConfig.localePrefix,
    localeParamKey: config.localeParamKey ?? defaultLinkConfig.localeParamKey,
  };

  const BaseLink = createLink(resolvedLinkConfig);

  const LinkWithLocale = forwardRef<HTMLAnchorElement, LinkProps>((props, ref) => {
    const localeFromHook = config.useLocale?.();
    const defaultLocaleFromHook = config.useDefaultLocale?.();

    return (
      <BaseLink
        {...props}
        defaultLocale={
          props.defaultLocale ?? defaultLocaleFromHook ?? resolvedLinkConfig.getDefaultLocale()
        }
        locale={
          props.disableLocale
            ? undefined
            : (props.locale ?? localeFromHook ?? resolvedLinkConfig.getLocale())
        }
        localePrefix={props.localePrefix ?? resolvedLinkConfig.localePrefix}
        ref={ref}
      />
    );
  });

  LinkWithLocale.displayName = "Link";

  const useNavigationRouter = () => {
    const router = useRouter();
    const localeFromHook = config.useLocale?.();
    const defaultLocaleFromHook = config.useDefaultLocale?.();

    const context = {
      locale: localeFromHook ?? resolvedLinkConfig.getLocale(),
      defaultLocale: defaultLocaleFromHook ?? resolvedLinkConfig.getDefaultLocale(),
      localePrefix: resolvedLinkConfig.localePrefix,
      localeParamKey: resolvedLinkConfig.localeParamKey,
    };

    const navigate = useCallback(
      (href: LinkProps["href"], options?: NavigateOptions) => {
        const resolved = resolveNavigationHref(href, options, context);
        if (resolved.isExternal) {
          if (typeof window === "undefined") {
            return;
          }
          if (options?.replace) {
            window.location.replace(resolved.href);
          } else {
            window.location.assign(resolved.href);
          }
          return;
        }

        const navigationOptions: Record<string, unknown> = {
          to: resolved.href,
          replace: options?.replace ?? false,
          resetScroll: options?.resetScroll,
        };

        if (options?.state !== undefined) {
          navigationOptions.state = options.state as unknown;
        }

        const mergedParams =
          resolved.params || options?.params
            ? {
                ...(options?.params ?? {}),
                ...(resolved.params ?? {}),
              }
            : undefined;

        if (mergedParams) {
          navigationOptions.params = mergedParams;
        }

        return router.navigate(navigationOptions as Parameters<typeof router.navigate>[0]);
      },
      [context, router],
    );

    const push = useCallback(
      (href: LinkProps["href"], options?: NavigateOptions) =>
        navigate(href, { ...options, replace: false }),
      [navigate],
    );

    const replace = useCallback(
      (href: LinkProps["href"], options?: NavigateOptions) =>
        navigate(href, { ...options, replace: true }),
      [navigate],
    );

    const prefetch = useCallback(
      (href: LinkProps["href"], options?: NavigateOptions) => {
        const resolved = resolveNavigationHref(href, options, context);
        if (resolved.isExternal) return;
        const preloadOptions: Record<string, unknown> = {
          to: resolved.href,
        };
        if (resolved.params || options?.params) {
          preloadOptions.params = {
            ...(options?.params ?? {}),
            ...(resolved.params ?? {}),
          };
        }
        return router.preloadRoute(preloadOptions as never);
      },
      [context, router],
    );

    const back = useCallback(() => {
      router.history.go(-1);
    }, [router]);

    return {
      push,
      replace,
      navigate,
      prefetch,
      back,
    };
  };

  const redirect = (href: LinkProps["href"], options?: RedirectOptions) => {
    const context = {
      locale: resolvedLinkConfig.getLocale(),
      defaultLocale: resolvedLinkConfig.getDefaultLocale(),
      localePrefix: resolvedLinkConfig.localePrefix,
      localeParamKey: resolvedLinkConfig.localeParamKey,
    };

    const resolved = resolveNavigationHref(href, options, context);
    if (typeof window === "undefined") {
      return;
    }

    if (resolved.isExternal) {
      if (options?.replace) {
        window.location.replace(resolved.href);
      } else {
        window.location.assign(resolved.href);
      }
      return;
    }

    window.history.replaceState(null, "", resolved.href);
  };

  const usePathname = () =>
    useRouterState({
      select: (state) => state.location.pathname,
    });

  const useSearchParams = () => {
    const searchStr = useRouterState({
      select: (state) => state.location.searchStr,
    });
    return useMemo(() => {
      if (!searchStr) return new URLSearchParams();
      return new URLSearchParams(searchStr.startsWith("?") ? searchStr.slice(1) : searchStr);
    }, [searchStr]);
  };

  const getPathname = () => runtimeWindow?.location.pathname ?? "/";

  return {
    Link: LinkWithLocale,
    useRouter: useNavigationRouter,
    usePathname,
    useSearchParams,
    getPathname,
    redirect,
    resolveHref: (href: LinkProps["href"], options?: NavigateOptions) => {
      const context = {
        locale: resolvedLinkConfig.getLocale(),
        defaultLocale: resolvedLinkConfig.getDefaultLocale(),
        localePrefix: resolvedLinkConfig.localePrefix,
        localeParamKey: resolvedLinkConfig.localeParamKey,
      };
      return resolveNavigationHref(href, options, context);
    },
  };
}
