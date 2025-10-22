import { createServerOnlyFn } from "@tanstack/react-start";
import type { I18nRequestContext } from "./types";

let cachedRequestContext: I18nRequestContext | null = null;

const loadRequestContext = async (): Promise<I18nRequestContext> => {
  const module = await import("./context");
  cachedRequestContext = module.i18nRequestContext;
  return cachedRequestContext;
};

export const ensureServerRequestContext = createServerOnlyFn(async () => {
  if (!cachedRequestContext) {
    cachedRequestContext = await loadRequestContext();
  }

  return cachedRequestContext;
});

export const getServerRequestContext = () => cachedRequestContext ?? null;
